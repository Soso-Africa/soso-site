import assert from "node:assert/strict";
import test from "node:test";
import { db } from "@workspace/db";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  getCatalogueHistoryCapacity, historyCapacityView, historyAllocationQuery,
  HISTORY_MEASUREMENT_MS as DAY, HISTORY_CAPACITY_KEY,
} from "./catalogue-history-capacity";

const MiB = 1048576;
const now = Date.parse("2026-11-02T12:00:00Z");
const iso = (time: number) => new Date(time).toISOString();
const sample = { measuredAt: iso(now), revisionBytes: 60 * MiB, auditBytes: 10 * MiB };
const cache = { version: 1 as const, sample, previous: null, nextRefreshAt: iso(now + DAY), message: null };

test("approved combined budget boundaries include the independent mapping-audit cost", () => {
  for (const [total, level] of [[0, "normal"], [70 * MiB - 1, "normal"], [70 * MiB, "warning"],
    [90 * MiB - 1, "warning"], [90 * MiB, "urgent"], [100 * MiB, "exceeded"], [200 * MiB, "exceeded"]] as const) {
    assert.equal(historyCapacityView({ ...cache, sample: { ...sample, revisionBytes: total, auditBytes: 0 } }, now).level, level);
  }
  assert.equal(historyCapacityView(cache, now).level, "warning");
  assert.equal(historyCapacityView({ ...cache, sample: null }, now).level, "unknown");
});

test("growth is separate by evidence type and no missing baseline becomes zero", () => {
  assert.equal(historyCapacityView(cache, now).revisionBytesPerDay, null);
  const previous = { ...sample, measuredAt: iso(now - 2 * DAY), revisionBytes: 56 * MiB, auditBytes: 8 * MiB };
  const view = historyCapacityView({ ...cache, previous }, now);
  assert.equal(view.revisionBytesPerDay, 2 * MiB);
  assert.equal(view.auditBytesPerDay, MiB);
  assert.equal(view.daysToBudget, 10);
  assert.equal(historyCapacityView({ ...cache, previous: sample }, now).daysToBudget, null);
  assert.equal(historyCapacityView({ ...cache, previous: { ...previous, revisionBytes: 100 * MiB } }, now).daysToBudget, null);
});

test("stale and unavailable cannot be mistaken for a healthy current reading", () => {
  assert.equal(historyCapacityView(cache, now + 2 * DAY).status, "stale");
  assert.equal(historyCapacityView({ ...cache, message: "Failed" }, now).status, "stale");
  assert.equal(historyCapacityView({ ...cache, sample: null }, now).status, "unavailable");
  assert.equal(historyCapacityView({ ...cache, message: "Failed" }, now).level, "warning");
});

test("measurement uses only two relation metadata calls, no history reads or payload downloads", () => {
  const query = new PgDialect().sqlToQuery(historyAllocationQuery);
  assert.equal((query.sql.match(/pg_total_relation_size/g) ?? []).length, 2);
  assert.deepEqual(query.params, ["soso_site_content_revisions", "soso_audit_logs"]);
  assert.doesNotMatch(query.sql, /\bfrom\b|snapshot|metadata|jsonb|count|sum|delete|update/i);
});

test("durable daily claims serialize owners, survive new callers, preserve failed baselines and bound retries", async t => {
  let stored: Record<string, unknown> | undefined;
  let clock = now;
  let measurements = 0;
  let fail = false;
  let chain = Promise.resolve();
  const read = () => ({ from: () => ({ where: () => ({ limit: async () => stored ? [{ draft: structuredClone(stored) }] : [] }) }) });
  t.mock.method(db, "transaction", (callback: (tx: unknown) => Promise<unknown>) => {
    const result = chain.then(() => callback({
      execute: async (statement: SQL) => {
        const text = new PgDialect().sqlToQuery(statement).sql;
        if (text.includes("pg_try_advisory")) return { rows: [{ acquired: true }] };
        if (text.includes("clock_timestamp")) return { rows: [{ now: iso(clock) }] };
        if (text.includes("pg_total_relation_size")) {
          assert.ok(stored, "claim is durable before measurement");
          assert.ok(Date.parse(String(stored.nextRefreshAt)) > clock);
          measurements++;
          if (fail) throw new Error("simulated timeout");
          return { rows: [{ revisionBytes: String(60 * MiB + measurements * MiB), auditBytes: String(10 * MiB) }] };
        }
        assert.match(text, /^set local (statement_timeout|lock_timeout)/);
        return { rows: [] };
      },
      select: read,
      insert: () => ({ values: (value: { key: string; draft: Record<string, unknown>; published: object }) => {
        assert.equal(value.key, HISTORY_CAPACITY_KEY);
        assert.deepEqual(value.published, {});
        return { onConflictDoUpdate: async () => { stored = structuredClone(value.draft); } };
      } }),
    }));
    chain = result.then(() => undefined, () => undefined);
    return result;
  });
  t.mock.method(db, "update", () => ({
    set: (value: { draft: Record<string, unknown> }) => ({
      where: async (condition: SQL) => {
        const params = new PgDialect().sqlToQuery(condition).params;
        assert.ok(params.includes(stored?.nextRefreshAt), "late responses are fenced by their original lease");
        stored = structuredClone(value.draft);
      },
    }),
  }) as never);
  await Promise.all(Array.from({ length: 12 }, () => getCatalogueHistoryCapacity()));
  assert.equal(measurements, 1);
  await getCatalogueHistoryCapacity();
  assert.equal(measurements, 1);
  clock += DAY;
  const second = await getCatalogueHistoryCapacity();
  assert.equal(second.revisionBytesPerDay, MiB);
  const baseline = structuredClone(stored?.sample);
  clock += DAY;
  fail = true;
  const failed = await getCatalogueHistoryCapacity();
  assert.equal(failed.status, "stale");
  assert.deepEqual(stored?.sample, baseline);
  assert.equal(measurements, 3);
  await getCatalogueHistoryCapacity();
  assert.equal(measurements, 3, "failure is cached for the full daily interval");
  clock += DAY;
  fail = false;
  const recovered = await getCatalogueHistoryCapacity();
  assert.equal(measurements, 4);
  assert.deepEqual(recovered.previous, baseline);
  assert.equal(recovered.revisionBytesPerDay, MiB);
});

test("cache/database failure never falls back to unleased measurement", async t => {
  t.mock.method(db, "transaction", async () => { throw new Error("database unavailable"); });
  await assert.rejects(getCatalogueHistoryCapacity(), /database unavailable/);
});
