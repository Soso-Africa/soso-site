import { db, siteContentTable, siteContentRevisionsTable, auditLogsTable } from "@workspace/db";
import { GetStaffCatalogueHistoryCapacityResponse } from "@workspace/api-zod";
import type { CatalogueHistoryAllocation, CatalogueHistoryCapacity } from "@workspace/api-zod";
import { eq, getTableName, sql } from "drizzle-orm";
import { z } from "zod/v4";

export const HISTORY_CAPACITY_KEY = "catalogue_history_capacity_private";
export const HISTORY_MEASUREMENT_MS = 24 * 60 * 60_000;
export const HISTORY_BUDGET_BYTES = 100 * 1024 * 1024;
const allocation = z.object({
  measuredAt: z.string().refine(value => Number.isFinite(Date.parse(value))),
  revisionBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  auditBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
const cacheSchema = z.object({
  version: z.literal(1),
  nextRefreshAt: z.string().refine(value => Number.isFinite(Date.parse(value))),
  sample: allocation.nullable(),
  previous: allocation.nullable(),
  message: z.string().max(300).nullable(),
});
type CapacityCache = z.infer<typeof cacheSchema>;

export function historyCapacityView(cache: CapacityCache, now: number): CatalogueHistoryCapacity {
  const { sample, previous } = cache;
  const total = sample ? sample.revisionBytes + sample.auditBytes : null;
  const interval = sample && previous ? Date.parse(sample.measuredAt) - Date.parse(previous.measuredAt) : 0;
  // No extrapolation from a short/invalid interval or from just one observation.
  const revisionBytesPerDay = sample && previous && interval >= HISTORY_MEASUREMENT_MS
    ? (sample.revisionBytes - previous.revisionBytes) * HISTORY_MEASUREMENT_MS / interval : null;
  const auditBytesPerDay = sample && previous && interval >= HISTORY_MEASUREMENT_MS
    ? (sample.auditBytes - previous.auditBytes) * HISTORY_MEASUREMENT_MS / interval : null;
  const growth = revisionBytesPerDay !== null && auditBytesPerDay !== null
    ? revisionBytesPerDay + auditBytesPerDay : null;
  const stale = Boolean(cache.message) || Boolean(sample && now - Date.parse(sample.measuredAt) >= 2 * HISTORY_MEASUREMENT_MS);
  return GetStaffCatalogueHistoryCapacityResponse.parse({
    status: !sample ? "unavailable" : stale ? "stale" : "available",
    level: total === null ? "unknown" : total >= HISTORY_BUDGET_BYTES ? "exceeded"
      : total >= 90 * 1024 * 1024 ? "urgent" : total >= 70 * 1024 * 1024 ? "warning" : "normal",
    budgetBytes: HISTORY_BUDGET_BYTES,
    warningBytes: 70 * 1024 * 1024,
    urgentBytes: 90 * 1024 * 1024,
    sample, previous, revisionBytesPerDay, auditBytesPerDay,
    daysToBudget: total !== null && total < HISTORY_BUDGET_BYTES && growth !== null && growth > 0
      ? (HISTORY_BUDGET_BYTES - total) / growth : null,
    nextRefreshAt: cache.nextRefreshAt,
    message: cache.message ?? (stale ? "This measurement is old. Do not treat it as current capacity." : null),
  });
}

// O(1) relation metadata: no count/sum, JSONB detoasting, history scan, or
// catalogue-sized network payload. Shared audit allocation includes mapping
// evidence AND unrelated audit events; it is deliberately an upper envelope.
export const historyAllocationQuery = sql`
  select pg_total_relation_size(${getTableName(siteContentRevisionsTable)}::regclass)::text as "revisionBytes",
         pg_total_relation_size(${getTableName(auditLogsTable)}::regclass)::text as "auditBytes"
`;

export async function getCatalogueHistoryCapacity(): Promise<CatalogueHistoryCapacity> {
  // The key is an operational cache, like cloudinary_usage_private. It is never
  // published and never produces content revisions or mapping audit entries.
  const claim = await db.transaction(async tx => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${HISTORY_CAPACITY_KEY})) as acquired`);
    if (!lock.rows[0]?.acquired) return null;
    const [row] = await tx.select({ draft: siteContentTable.draft }).from(siteContentTable)
      .where(eq(siteContentTable.key, HISTORY_CAPACITY_KEY)).limit(1);
    const parsed = cacheSchema.safeParse(row?.draft);
    const previous = parsed.success ? parsed.data : null;
    // Database time coordinates different processes and serverless instances.
    const clock = await tx.execute<{ now: string }>(sql`select clock_timestamp()::text as now`);
    const now = Date.parse(clock.rows[0]!.now);
    if (previous && Date.parse(previous.nextRefreshAt) > now) return { refresh: false, cache: previous };
    const cache: CapacityCache = {
      version: 1, sample: previous?.sample ?? null, previous: previous?.previous ?? null,
      nextRefreshAt: new Date(now + HISTORY_MEASUREMENT_MS).toISOString(),
      message: "A measurement is in progress. Any displayed figures are the last successful report.",
    };
    // Commit the daily claim BEFORE measuring. Failures and crashes must not
    // trigger a new attempt on every page load. No force-refresh bypass exists.
    await tx.insert(siteContentTable).values({ key: HISTORY_CAPACITY_KEY, draft: cache, published: {} })
      .onConflictDoUpdate({ target: siteContentTable.key, set: { draft: cache } });
    return { refresh: true, cache };
  });
  if (!claim) {
    const [row] = await db.select({ draft: siteContentTable.draft }).from(siteContentTable)
      .where(eq(siteContentTable.key, HISTORY_CAPACITY_KEY)).limit(1);
    const parsed = cacheSchema.safeParse(row?.draft);
    if (parsed.success) return historyCapacityView(parsed.data, Date.now());
    return historyCapacityView({
      version: 1, sample: null, previous: null, nextRefreshAt: new Date(Date.now() + HISTORY_MEASUREMENT_MS).toISOString(),
      message: "Another owner request is preparing the measurement. Try again shortly.",
    }, Date.now());
  }
  if (!claim.refresh) return historyCapacityView(claim.cache, Date.now());
  const cache = claim.cache;
  const leaseUntil = cache.nextRefreshAt;
  try {
    const sample = await db.transaction(async tx => {
      await tx.execute(sql`set local statement_timeout = '2000ms'`);
      await tx.execute(sql`set local lock_timeout = '250ms'`);
      const result = await tx.execute<{ revisionBytes: string; auditBytes: string }>(historyAllocationQuery);
      const clock = await tx.execute<{ now: string }>(sql`select clock_timestamp()::text as now`);
      return allocation.parse({
        measuredAt: new Date(clock.rows[0]!.now).toISOString(),
        revisionBytes: Number(result.rows[0]?.revisionBytes),
        auditBytes: Number(result.rows[0]?.auditBytes),
      }) satisfies CatalogueHistoryAllocation;
    });
    cache.previous = cache.sample;
    cache.sample = sample;
    cache.nextRefreshAt = new Date(Date.parse(sample.measuredAt) + HISTORY_MEASUREMENT_MS).toISOString();
    cache.message = null;
  } catch {
    cache.message = "Storage measurement failed or timed out. Previous figures are retained; the next attempt is after the daily refresh time.";
  }
  await db.update(siteContentTable).set({ draft: cache }).where(sql`${siteContentTable.key} = ${HISTORY_CAPACITY_KEY}
    and ${siteContentTable.draft}->>'nextRefreshAt' = ${leaseUntil}`);
  return historyCapacityView(cache, Date.now());
}
