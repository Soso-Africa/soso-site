import assert from "node:assert/strict";
import test from "node:test";
import { createVersionCheckedCache } from "./version-checked-cache";

test("stable versions reuse the large value but check the source on every read", async () => {
  let checks = 0;
  let loads = 0;
  const read = createVersionCheckedCache({
    readVersion: async () => { checks++; return "v1"; },
    load: async () => { loads++; return { version: "v1", value: { title: "Published" } }; },
  });
  const first = await read();
  for (let i = 0; i < 20; i++) assert.equal(await read(), first);
  assert.equal(checks, 21);
  assert.equal(loads, 1);
});

test("a content fingerprint change reloads even when the publication time is unchanged", async () => {
  let hash = "hash-one";
  let loads = 0;
  const read = createVersionCheckedCache({
    readVersion: async () => `${hash}:same-published-at`,
    load: async () => { loads++; return { version: `${hash}:same-published-at`, value: hash }; },
  });
  assert.equal(await read(), "hash-one");
  hash = "hash-two";
  assert.equal(await read(), "hash-two");
  assert.equal(loads, 2);
});

test("withdrawn publication clears cached content", async () => {
  let version: string | null = "v1";
  const read = createVersionCheckedCache({
    readVersion: async () => version,
    load: async () => ({ version: "v1", value: "published" }),
  });
  assert.equal(await read(), "published");
  version = null;
  assert.equal(await read(), null);
});

test("failed source checks never fall back to previously cached content", async () => {
  let unavailable = false;
  const read = createVersionCheckedCache({
    readVersion: async () => {
      if (unavailable) throw new Error("source unavailable");
      return "v1";
    },
    load: async () => ({ version: "v1", value: "published" }),
  });
  assert.equal(await read(), "published");
  unavailable = true;
  await assert.rejects(read(), /source unavailable/);
});

test("concurrent misses share one large read", async () => {
  let loads = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  const read = createVersionCheckedCache({
    readVersion: async () => "v1",
    load: async () => { loads++; await ready; return { version: "v1", value: "value" }; },
  });
  const results = [read(), read(), read()];
  await Promise.resolve();
  assert.equal(loads, 1);
  release();
  assert.deepEqual(await Promise.all(results), ["value", "value", "value"]);
});

test("publication between queries is tagged with the loaded snapshot's own version", async () => {
  let version = "v1";
  let loads = 0;
  const read = createVersionCheckedCache({
    readVersion: async () => version,
    load: async () => { loads++; version = "v2"; return { version, value: "new publication" }; },
  });
  assert.equal(await read(), "new publication");
  assert.equal(await read(), "new publication");
  assert.equal(loads, 1);
});

test("invalid/failed loads are not cached and can be retried", async () => {
  let failing = true;
  const read = createVersionCheckedCache({
    readVersion: async () => "v1",
    load: async () => {
      if (failing) throw new Error("invalid document");
      return { version: "v1", value: "repaired" };
    },
  });
  await assert.rejects(read(), /invalid document/);
  failing = false;
  assert.equal(await read(), "repaired");
});

test("the retention bound reloads unchanged content", async () => {
  let now = 0;
  let loads = 0;
  const read = createVersionCheckedCache({
    now: () => now,
    maxAgeMs: 100,
    readVersion: async () => "v1",
    load: async () => ({ version: "v1", value: ++loads }),
  });
  assert.equal(await read(), 1);
  now = 99;
  assert.equal(await read(), 1);
  now = 100;
  assert.equal(await read(), 2);
});