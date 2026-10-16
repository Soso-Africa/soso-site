import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type Request } from "express";
import { db } from "@workspace/db";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { GetStaffCloudinaryUsageResponse } from "@workspace/api-zod";
import { getCloudinaryUsage, normalizeCloudinaryUsage, usageMetric, usageRetryAt, usageView, USAGE_REFRESH_MS } from "./cloudinary-usage";
import storageRouter from "../routes/storage";

const now = Date.parse("2026-10-14T12:00:00Z");
const body = {
  plan: "Free", last_updated: "2026-10-14", date_requested: "2026-10-14T00:00:00Z",
  credits: { usage: 24, limit: 25, used_percent: 96 },
  storage: { usage: 2_000_000_000, limit: 25_000_000_000, used_percent: 8 },
  bandwidth: { usage: 20_000_000_000, limit: 25_000_000_000, used_percent: 80 },
  transformations: { usage: 22500, limit: 25000, used_percent: 90 },
  api_secret: "provider-should-not-forward-this",
};
const headers = new Headers({
  "x-featureratelimit-limit": "500", "x-featureratelimit-remaining": "499",
  "x-featureratelimit-reset": "Wed, 14 Oct 2026 13:00:00 GMT",
});

test("usage normalization preserves actual metrics, provider dates and only safe fields", () => {
  const snapshot = normalizeCloudinaryUsage(body, headers, now);
  assert.equal(snapshot.credits.usage, 24);
  assert.equal(snapshot.bandwidth.usage, 20_000_000_000);
  assert.equal(snapshot.windowStart, "2026-09-15");
  assert.equal(snapshot.windowEnd, "2026-10-14");
  assert.equal(snapshot.adminRemaining, 499);
  assert.doesNotMatch(JSON.stringify(snapshot), /api_secret|provider-should-not/);
  assert.equal(GetStaffCloudinaryUsageResponse.safeParse(usageView({
    fingerprint: "test", snapshot, message: null, nextRefreshAt: new Date(now + USAGE_REFRESH_MS).toISOString(),
  }, now)).success, true);
});

test("missing credits/limits are never silently converted into zero or guessed from other usage", () => {
  assert.deepEqual(usageMetric(undefined), { usage: null, limit: null, usedPercent: null });
  assert.deepEqual(usageMetric({ usage: 0 }), { usage: 0, limit: null, usedPercent: null });
  assert.deepEqual(usageMetric({ usage: 10, limit: 0 }), { usage: 10, limit: 0, usedPercent: null });
  assert.ok(Math.abs(usageMetric({ usage: 110, limit: 100 }).usedPercent! - 110) < 0.00001);
  assert.deepEqual(usageMetric({ usage: "10", limit: -1, used_percent: Infinity }), { usage: null, limit: null, usedPercent: null });
  assert.throws(() => normalizeCloudinaryUsage({}, new Headers(), now));
});

test("report age, missing reporting dates and failed refreshes are explicitly stale", () => {
  const snapshot = normalizeCloudinaryUsage(body, headers, now);
  const cache = { fingerprint: "test", snapshot, message: null, nextRefreshAt: new Date(now + USAGE_REFRESH_MS).toISOString() };
  assert.equal(usageView(cache, now).status, "available");
  assert.equal(usageView(cache, now + 30 * 60_000).status, "stale");
  assert.equal(usageView({ ...cache, message: "Refresh failed" }, now).status, "stale");
  assert.equal(usageView({ ...cache, snapshot: { ...snapshot, providerUpdatedAt: null } }, now).status, "stale");
  assert.equal(usageView({ ...cache, snapshot: normalizeCloudinaryUsage({ ...body, last_updated: "2026-10-10" }, headers, now) }, now).status, "stale");
  assert.equal(usageView({ ...cache, snapshot: null }, now).status, "unavailable");
});

test("retry windows honor provider reset and Retry-After without reducing the minimum interval", () => {
  assert.equal(usageRetryAt(new Headers(), now), now + USAGE_REFRESH_MS);
  assert.equal(usageRetryAt(new Headers({ "retry-after": "3600" }), now), now + 3600_000);
  assert.equal(usageRetryAt(headers, now), Date.parse("2026-10-14T13:00:00Z"));
});

test("shared durable lease bounds concurrent reads, preserves failed reports and survives new callers", async t => {
  // All database and provider IO is synthetic. No live media or cache is touched.
  let stored: Record<string, unknown> | undefined;
  let serialized = Promise.resolve();
  const select = () => ({ from: () => ({ where: () => ({ limit: async () => stored ? [{ draft: structuredClone(stored) }] : [] }) }) });
  t.mock.method(db, "transaction", (callback: (tx: unknown) => Promise<unknown>) => {
    const result = serialized.then(() => callback({
      execute: async () => ({ rows: [{ acquired: true }] }),
      select,
      insert: () => ({ values: (value: { draft: Record<string, unknown> }) => ({
        onConflictDoUpdate: async () => { stored = structuredClone(value.draft); },
      }) }),
    }));
    serialized = result.then(() => undefined);
    return result;
  });
  t.mock.method(db, "update", () => ({
    set: (value: { draft: Record<string, unknown> }) => ({
      where: async (condition: SQL) => {
        const params = new PgDialect().sqlToQuery(condition).params;
        assert.ok(params.includes(stored?.nextRefreshAt), "update must fence using the originally committed lease, not the extended retry time");
        assert.ok(params.includes(stored?.fingerprint));
        stored = structuredClone(value.draft);
      },
    }),
  }));
  let fetches = 0;
  let response: () => Promise<Response> = async () => new Response(JSON.stringify({ ...body, last_updated: new Date().toISOString().slice(0, 10) }), { status: 200, headers });
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.match(url, /^https:\/\/api.cloudinary.com\/v1_1\/[^/]+\/usage$/);
    assert.equal(options.redirect, "error");
    assert.ok(options.headers);
    fetches++;
    return response();
  });
  const views = await Promise.all(Array.from({ length: 8 }, () => getCloudinaryUsage()));
  assert.equal(fetches, 1);
  assert.ok(views.some(view => view.snapshot?.credits.usage === 24));
  assert.equal((await getCloudinaryUsage()).snapshot?.credits.usage, 24);
  assert.equal(fetches, 1);

  stored!.nextRefreshAt = new Date(0).toISOString();
  response = async () => new Response(JSON.stringify({ error: { message: "private-provider-detail" } }), { status: 429, headers: { "retry-after": "3600" } });
  const rateLimited = await getCloudinaryUsage();
  assert.equal(rateLimited.status, "stale");
  assert.equal(rateLimited.snapshot?.credits.usage, 24);
  assert.ok(Date.parse(rateLimited.nextRefreshAt) > Date.now() + 3500_000);
  assert.doesNotMatch(JSON.stringify(rateLimited), /private-provider-detail/);
  await getCloudinaryUsage();
  assert.equal(fetches, 2);

  stored!.nextRefreshAt = new Date(0).toISOString();
  response = async () => { throw new Error("secret-in-exception"); };
  const failed = await getCloudinaryUsage();
  assert.equal(failed.status, "stale");
  assert.doesNotMatch(JSON.stringify(failed), /secret-in-exception/);
  await getCloudinaryUsage();
  assert.equal(fetches, 3);

  stored!.nextRefreshAt = new Date(0).toISOString();
  response = async () => new Response(JSON.stringify(body), { status: 200, headers: { "x-featureratelimit-remaining": "2", "x-featureratelimit-reset": new Date(Date.now() + 3600_000).toUTCString() } });
  const lowAdminQuota = await getCloudinaryUsage();
  assert.ok(Date.parse(lowAdminQuota.nextRefreshAt) > Date.now() + 3500_000);
  await getCloudinaryUsage();
  assert.equal(fetches, 4);
});

test("usage endpoint rejects unauthenticated and non-editorial roles before any provider/cache access", async t => {
  let cacheRequests = 0;
  t.mock.method(db, "transaction", async () => { cacheRequests++; throw new Error("cache unavailable"); });
  const httpFetch = globalThis.fetch;
  let providerRequests = 0;
  t.mock.method(globalThis, "fetch", async () => { providerRequests++; throw new Error("unexpected provider request"); });
  const app = express();
  app.use((req, _res, next) => {
    const role = req.get("x-test-role");
    if (role) req.staff = { role } as NonNullable<Request["staff"]>;
    req.log = { warn() {} } as unknown as typeof req.log;
    next();
  });
  app.use(storageRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/storage/usage`;
  try {
    assert.equal((await httpFetch(url)).status, 401);
    for (const role of ["operations", "stylist", "analyst"]) {
      assert.equal((await httpFetch(url, { headers: { "x-test-role": role } })).status, 403);
    }
    assert.equal(cacheRequests, 0);
    for (const role of ["owner", "administrator", "editor"]) {
      const result = await httpFetch(url, { headers: { "x-test-role": role } });
      assert.equal(result.status, 503);
      assert.equal(result.headers.get("cache-control"), "private, no-store");
    }
    assert.equal(cacheRequests, 3);
    assert.equal(providerRequests, 0, "database coordination failure must not fall back to an unbounded provider fetch");
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
});
