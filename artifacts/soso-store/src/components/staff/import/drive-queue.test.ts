import assert from "node:assert/strict";
import test from "node:test";
import { StaleTaskError, createSerialQueue } from "./drive-queue";

test("queue runs one task at a time, waits for failures to settle, and skips stale tasks before running", async () => {
  const q = createSerialQueue();
  let active = 0; let maxActive = 0; const ran: string[] = [];
  const job = (id: string, fail = false) => async () => {
    active++; maxActive = Math.max(maxActive, active); ran.push(id);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    if (fail) throw new Error("429");
    return id;
  };
  let gen = 1;
  const a = q.run(job("a", true));
  const b = q.run(job("b"), () => gen === 1);
  gen = 2;
  const c = q.run(job("c"));
  await assert.rejects(a, /429/);
  await assert.rejects(b, StaleTaskError);
  assert.equal(await c, "c");
  assert.deepEqual(ran, ["a", "c"]);
  assert.equal(maxActive, 1);
});
