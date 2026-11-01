import assert from "node:assert/strict";
import test from "node:test";
import { createVersionCheckedInitializer } from "./version-checked-initializer";

test("unchanged documents use only the compact version check", async () => {
  let reads = 0;
  let loads = 0;
  const initialize = createVersionCheckedInitializer({
    readVersion: async () => { reads++; return "a"; },
    initialize: async () => { loads++; },
  });
  await initialize();
  await initialize();
  await initialize();
  assert.equal(reads, 3);
  assert.equal(loads, 1);
});

test("source changes, withdrawal and missing rows cannot reuse completion", async () => {
  let version: string | null = "a";
  let loads = 0;
  const initialize = createVersionCheckedInitializer({
    readVersion: async () => version,
    initialize: async () => { loads++; },
  });
  await initialize();
  version = "b";
  await initialize();
  version = null;
  await initialize();
  await initialize();
  assert.equal(loads, 4);
});

test("failed version checks reject instead of using previous success", async () => {
  let fail = false;
  const initialize = createVersionCheckedInitializer({
    readVersion: async () => { if (fail) throw new Error("database offline"); return "a"; },
    initialize: async () => {},
  });
  await initialize();
  fail = true;
  await assert.rejects(initialize(), /database offline/);
  fail = false;
  await initialize();
});

test("initialization failures remain retryable", async () => {
  let loads = 0;
  const initialize = createVersionCheckedInitializer({
    readVersion: async () => "a",
    initialize: async () => { if (++loads === 1) throw new Error("retry"); },
  });
  await assert.rejects(initialize(), /retry/);
  await initialize();
  await initialize();
  assert.equal(loads, 2);
});

test("parallel requests initialize one unchanged version only once", async () => {
  let loads = 0;
  const initialize = createVersionCheckedInitializer({
    readVersion: async () => "a",
    initialize: async () => { loads++; await new Promise((resolve) => setImmediate(resolve)); },
  });
  await Promise.all(Array.from({ length: 15 }, () => initialize()));
  assert.equal(loads, 1);
});

test("a write during initialization is rechecked, not marked migrated unseen", async () => {
  let version = "a";
  let loads = 0;
  const initialize = createVersionCheckedInitializer({
    readVersion: async () => version,
    initialize: async () => { loads++; version = "b"; },
  });
  await initialize();
  await initialize();
  await initialize();
  assert.equal(loads, 2);
});
