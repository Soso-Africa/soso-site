import { createHash } from "node:crypto";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { db, siteContentTable } from "@workspace/db";
import { GetStaffMediaStorageStatusResponse, type R2StorageSnapshot, type R2StorageUsage } from "@workspace/api-zod";
import { eq, sql } from "drizzle-orm";
import type { R2StorageService } from "./r2-storage";

const KEY = "r2_media_usage_private";
const REFRESH_MS = 60 * 60_000;
type Cache = { fingerprint: string; nextRefreshAt: string; snapshot: R2StorageSnapshot | null; message: string | null };

function view(cache: Cache, now: number): R2StorageUsage {
  return {
    status: !cache.snapshot ? "unavailable" : cache.message || now - Date.parse(cache.snapshot.fetchedAt) >= REFRESH_MS ? "stale" : "available",
    snapshot: cache.snapshot, nextRefreshAt: cache.nextRefreshAt, message: cache.message,
  };
}
function readCache(value: unknown, fingerprint: string): Cache | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Cache;
  if (raw.fingerprint !== fingerprint || !Number.isFinite(Date.parse(raw.nextRefreshAt))) return null;
  const parsed = GetStaffMediaStorageStatusResponse.safeParse({ provider: "r2", r2Usage: view(raw, Date.now()) });
  return parsed.success ? raw : null;
}
export async function inventoryR2StorageBucket(storage: R2StorageService, bucket: string): Promise<{ bytes: number; objects: number }> {
  let bytes = 0;
  let objects = 0;
  let cursor: string | undefined;
  const cursors = new Set<string>();
  const deadline = Date.now() + 20_000;
  for (let page = 0; page < 50; page++) {
    if (Date.now() >= deadline) throw new Error("R2 inventory exceeded its total time budget");
    const response = await storage.io.client.send(new ListObjectsV2Command({
      Bucket: bucket, MaxKeys: 1000, ContinuationToken: cursor,
      ...(storage.config.namespace ? { Prefix: `${storage.config.namespace}/` } : {}),
    }), { abortSignal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
    for (const object of response.Contents ?? []) {
      if (!Number.isSafeInteger(object.Size) || object.Size! < 0) throw new Error("R2 inventory did not return bounded object sizes");
      bytes += object.Size!;
      objects++;
    }
    if (!Number.isSafeInteger(bytes)) throw new Error("R2 inventory exceeds the numeric reporting budget");
    if (!response.IsTruncated) return { bytes, objects };
    cursor = response.NextContinuationToken;
    if (!cursor || cursors.has(cursor)) throw new Error("R2 inventory pagination could not be verified");
    cursors.add(cursor);
  }
  throw new Error("R2 inventory exceeds the bounded 50-page reporting budget");
}

/** Account requests/billing and the independently scoped backup are not visible here. */
export async function getR2StorageUsage(storage: R2StorageService): Promise<R2StorageUsage> {
  const now = Date.now();
  const fingerprint = createHash("sha256").update(JSON.stringify([
    storage.config.accountId, storage.config.privateBucket, storage.config.publicBucket, storage.config.namespace,
  ])).digest("hex");
  const claim = await db.transaction(async (tx) => {
    const lock = await tx.execute<{ acquired: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext(${KEY})) as acquired`);
    if (!lock.rows[0]?.acquired) return null;
    const [row] = await tx.select({ draft: siteContentTable.draft }).from(siteContentTable).where(eq(siteContentTable.key, KEY)).limit(1);
    const previous = readCache(row?.draft, fingerprint);
    if (previous && Date.parse(previous.nextRefreshAt) > now) return { refresh: false, cache: previous };
    const cache: Cache = {
      fingerprint, nextRefreshAt: new Date(now + REFRESH_MS).toISOString(), snapshot: previous?.snapshot ?? null,
      message: "A bounded storage inventory is being refreshed. Any displayed figures are the last successful snapshot.",
    };
    await tx.insert(siteContentTable).values({ key: KEY, draft: cache, published: {} })
      .onConflictDoUpdate({ target: siteContentTable.key, set: { draft: cache } });
    return { refresh: true, cache };
  });
  if (!claim) return {
    status: "unavailable", snapshot: null, nextRefreshAt: new Date(now + 5000).toISOString(),
    message: "Another Staff inventory request is being prepared. Try again shortly.",
  };
  if (!claim.refresh) return view(claim.cache, now);
  const cache = claim.cache;
  const lease = cache.nextRefreshAt;
  // Settle both requests before releasing the claim's result, including failures.
  const results = await Promise.allSettled([
    inventoryR2StorageBucket(storage, storage.config.privateBucket), inventoryR2StorageBucket(storage, storage.config.publicBucket),
  ]);
  if (results[0].status === "fulfilled" && results[1].status === "fulfilled") {
    cache.snapshot = {
      fetchedAt: new Date().toISOString(),
      privateBytes: results[0].value.bytes, privateObjects: results[0].value.objects,
      publicBytes: results[1].value.bytes, publicObjects: results[1].value.objects,
    };
    cache.message = null;
  } else cache.message = "R2 application storage could not be inventoried completely. Any displayed figures are stale; check Cloudflare before relying on capacity.";
  await db.update(siteContentTable).set({ draft: cache }).where(sql`${siteContentTable.key} = ${KEY}
    and ${siteContentTable.draft}->>'fingerprint' = ${fingerprint}
    and ${siteContentTable.draft}->>'nextRefreshAt' = ${lease}`);
  return view(cache, Date.now());
}
