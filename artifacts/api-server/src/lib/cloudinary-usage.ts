import { db, siteContentTable } from "@workspace/db";
import { GetStaffCloudinaryUsageResponse } from "@workspace/api-zod";
import type { CloudinaryUsageMetric, CloudinaryUsageSnapshot, CloudinaryUsageView } from "@workspace/api-zod";
import { eq, sql } from "drizzle-orm";
import { cloudinaryUsageConfigFingerprint, requestCloudinaryUsage } from "./cloudinary-storage";

export const USAGE_REFRESH_MS = 15 * 60_000;
const CACHE_KEY = "cloudinary_usage_private";
const STALE_CACHE_MS = 30 * 60_000;
const STALE_REPORT_MS = 48 * 60 * 60_000;
type UsageCache = { fingerprint: string; nextRefreshAt: string; snapshot: CloudinaryUsageSnapshot | null; message: string | null };

const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function usageMetric(value: unknown): CloudinaryUsageMetric {
  const source = record(value);
  const usage = number(source.usage);
  const limit = number(source.limit);
  // Do not infer pooled credit consumption from bytes/transformations.
  return {
    usage, limit,
    usedPercent: usage === null ? null : number(source.used_percent)
      ?? (limit !== null && limit > 0 ? usage / limit * 100 : null),
  };
}

export function normalizeCloudinaryUsage(body: unknown, headers: Headers, now: number): CloudinaryUsageSnapshot {
  const source = record(body);
  const providerUpdatedAt = timestamp(source.last_updated);
  const windowEnd = providerUpdatedAt?.slice(0, 10) ?? null;
  const windowStart = providerUpdatedAt
    ? new Date(Date.parse(providerUpdatedAt) - 29 * 24 * 60 * 60_000).toISOString().slice(0, 10) : null;
  const headerNumber = (name: string) => {
    const raw = headers.get(name);
    return raw !== null && raw.trim() !== "" ? number(Number(raw)) : null;
  };
  const rawReset = headers.get("x-featureratelimit-reset");
  const reset = rawReset ? Date.parse(rawReset) : NaN;
  const snapshot: CloudinaryUsageSnapshot = {
    plan: typeof source.plan === "string" ? source.plan.slice(0, 100) : null,
    fetchedAt: new Date(now).toISOString(),
    providerUpdatedAt,
    dateRequested: timestamp(source.date_requested),
    windowStart, windowEnd,
    credits: usageMetric(source.credits),
    storage: usageMetric(source.storage),
    bandwidth: usageMetric(source.bandwidth),
    transformations: usageMetric(source.transformations),
    adminLimit: headerNumber("x-featureratelimit-limit"),
    adminRemaining: headerNumber("x-featureratelimit-remaining"),
    adminResetAt: Number.isFinite(reset) ? new Date(reset).toISOString() : null,
  };
  if (![snapshot.credits, snapshot.storage, snapshot.bandwidth, snapshot.transformations].some(metric => metric.usage !== null)) {
    throw new Error("Usage report has no valid metrics");
  }
  return snapshot;
}

export function usageView(cache: UsageCache, now: number): CloudinaryUsageView {
  const snapshot = cache.snapshot;
  const reportTime = snapshot?.providerUpdatedAt ? Date.parse(snapshot.providerUpdatedAt) : NaN;
  const stale = snapshot && (Boolean(cache.message)
    || now - Date.parse(snapshot.fetchedAt) >= STALE_CACHE_MS
    || !Number.isFinite(reportTime) || now - reportTime >= STALE_REPORT_MS);
  return {
    status: !snapshot ? "unavailable" : stale ? "stale" : "available",
    snapshot, nextRefreshAt: cache.nextRefreshAt,
    message: cache.message ?? (stale ? "This report is old or its reporting date is unavailable. Do not treat it as live usage." : null),
  };
}

export function usageRetryAt(headers: Headers, now: number): number {
  const reset = Date.parse(headers.get("x-featureratelimit-reset") ?? "");
  const rawRetry = headers.get("retry-after");
  const retry = rawRetry && /^\d+$/.test(rawRetry) ? now + Number(rawRetry) * 1000 : Date.parse(rawRetry ?? "");
  return Math.max(now + USAGE_REFRESH_MS, Number.isFinite(reset) ? reset : 0, Number.isFinite(retry) ? retry : 0);
}

function readCache(value: unknown, fingerprint: string): UsageCache | null {
  const source = record(value);
  if (source.fingerprint !== fingerprint || !timestamp(source.nextRefreshAt)) return null;
  const parsed = GetStaffCloudinaryUsageResponse.safeParse({
    status: source.snapshot ? "available" : "unavailable",
    snapshot: source.snapshot ?? null,
    message: source.message ?? null,
    nextRefreshAt: source.nextRefreshAt,
  });
  return parsed.success ? { ...parsed.data, fingerprint } : null;
}

// A committed lease BEFORE the external call bounds requests across serverless
// instances, restarts, tabs, and concurrent Staff. A crash leaves the lease intact.
// No force-refresh path bypasses it; database failure must not fall back to fetch.
export async function getCloudinaryUsage(): Promise<CloudinaryUsageView> {
  const now = Date.now();
  let fingerprint: string;
  try { fingerprint = cloudinaryUsageConfigFingerprint(); }
  catch {
    return { status: "unavailable", snapshot: null, message: "Cloudinary usage is unavailable: server-side media configuration is missing or invalid.", nextRefreshAt: new Date(now + USAGE_REFRESH_MS).toISOString() };
  }
  const claim = await db.transaction(async tx => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${CACHE_KEY})) as acquired`);
    if (!lock.rows[0]?.acquired) return null;
    const [row] = await tx.select({ draft: siteContentTable.draft }).from(siteContentTable).where(eq(siteContentTable.key, CACHE_KEY)).limit(1);
    const previous = readCache(row?.draft, fingerprint);
    if (previous && Date.parse(previous.nextRefreshAt) > now) return { refresh: false, cache: previous };
    const cache: UsageCache = {
      fingerprint, snapshot: previous?.snapshot ?? null,
      nextRefreshAt: new Date(now + USAGE_REFRESH_MS).toISOString(),
      message: "A usage refresh is in progress; any displayed figures are the last successful report.",
    };
    await tx.insert(siteContentTable).values({ key: CACHE_KEY, draft: cache, published: {} })
      .onConflictDoUpdate({ target: siteContentTable.key, set: { draft: cache } });
    return { refresh: true, cache };
  });
  if (!claim) {
    return { status: "unavailable", snapshot: null, message: "Another Staff usage request is being prepared. Try again shortly.", nextRefreshAt: new Date(now + 5000).toISOString() };
  }
  if (!claim.refresh) return usageView(claim.cache, now);
  const cache = claim.cache;
  const leaseUntil = cache.nextRefreshAt;
  try {
    const response = await requestCloudinaryUsage();
    if (!response.ok) {
      // Provider error bodies can contain account details: never return or log them.
      cache.message = response.status === 429
        ? "Cloudinary's Admin request limit was reached. Refresh is paused until the retry window."
        : response.status === 401 || response.status === 403
          ? "Cloudinary denied usage access. An owner should check server-side Admin API permissions."
          : "Cloudinary usage is temporarily unavailable. Any displayed figures are the last successful report.";
      if (response.status === 429) cache.nextRefreshAt = new Date(usageRetryAt(response.headers, now)).toISOString();
    } else {
      cache.snapshot = normalizeCloudinaryUsage(await response.json(), response.headers, Date.now());
      cache.message = null;
      if (cache.snapshot.adminRemaining !== null && cache.snapshot.adminRemaining <= 10) {
        cache.nextRefreshAt = new Date(usageRetryAt(response.headers, now)).toISOString();
      }
    }
  } catch {
    cache.message = "Cloudinary usage could not be read (connection, timeout or invalid report). Any displayed figures are the last successful report.";
  }
  // Compare the lease so a late response cannot overwrite a newer claim.
  await db.update(siteContentTable).set({ draft: cache }).where(sql`${siteContentTable.key} = ${CACHE_KEY}
    and ${siteContentTable.draft}->>'fingerprint' = ${fingerprint}
    and ${siteContentTable.draft}->>'nextRefreshAt' = ${leaseUntil}`);
  return usageView(cache, Date.now());
}
