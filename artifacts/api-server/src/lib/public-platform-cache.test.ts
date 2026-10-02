import assert from "node:assert/strict";
import test from "node:test";
import { db } from "@workspace/db";
import { DEFAULT_PLATFORM_CONTENT } from "./platform-content";
import { readPublicPlatformSnapshot } from "./public-platform-cache";

test("public routes transfer the large document only on fingerprint changes; failures fail closed", async () => {
  const originalSelect = db.select;
  const selections: string[][] = [];
  let hash = "initial";
  let publishedAt: Date | null = new Date("2026-10-01T00:00:00Z");
  let unavailable = false;
  db.select = ((selection: Record<string, unknown>) => {
    selections.push(Object.keys(selection));
    return { from: () => ({ where: () => ({ limit: async () => {
      if (unavailable) throw new Error("quota blocked");
      return [{ fingerprint: hash, publishedAt, content: structuredClone(DEFAULT_PLATFORM_CONTENT) }];
    } }) }) };
  }) as unknown as typeof db.select;
  try {
    assert.ok(await readPublicPlatformSnapshot());
    assert.ok(await readPublicPlatformSnapshot());
    assert.deepEqual(selections, [
      ["fingerprint", "publishedAt"], ["fingerprint", "content", "publishedAt"],
      ["fingerprint", "publishedAt"],
    ]);
    hash = "webhook-change-without-new-published-at";
    assert.ok(await readPublicPlatformSnapshot());
    assert.equal(selections.filter((fields) => fields.includes("content")).length, 2);
    unavailable = true;
    await assert.rejects(readPublicPlatformSnapshot(), /quota blocked/);
    unavailable = false;
    publishedAt = null;
    assert.equal(await readPublicPlatformSnapshot(), null);
  } finally {
    db.select = originalSelect;
  }
});