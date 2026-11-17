import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { db } from "@workspace/db";
import { DEFAULT_PLATFORM_CONTENT, ensurePlatformContent } from "./platform-content";
import { needsPlatformUpgrade, type PlatformUpgradeState } from "./platform-upgrade-gate";

const current = (): NonNullable<PlatformUpgradeState> => ({
  draftVersion: "21", publishedVersion: "21",
  publishedEmpty: false, hasLegacyFaqItems: false,
});

test("current catalogues skip full-document compatibility work on every cold start", () => {
  for (let i = 0; i < 100; i++) assert.equal(needsPlatformUpgrade(current(), 21), false);
});

test("a withdrawn publication stays withdrawn without loading or seeding documents", () => {
  assert.equal(needsPlatformUpgrade({ ...current(), publishedEmpty: true, publishedVersion: null }, 21), false);
});

test("fresh databases and old or unknown versions still take the complete migration path", () => {
  assert.equal(needsPlatformUpgrade(undefined, 21), true);
  for (const version of [null, "20", "22", "invalid"]) {
    assert.equal(needsPlatformUpgrade({ ...current(), draftVersion: version }, 21), true);
    assert.equal(needsPlatformUpgrade({ ...current(), publishedVersion: version }, 21), true);
  }
  assert.equal(needsPlatformUpgrade(current(), 22), true, "a new release version must run compatibility work");
});

test("legacy published FAQs are never skipped even on a current catalogue", () => {
  assert.equal(needsPlatformUpgrade({ ...current(), hasLegacyFaqItems: true }, 21), true);
});

test("real initializer transfers only metadata for 100 current-document cold/change checks", async (t) => {
  const select = db.select;
  const insert = db.insert;
  const transaction = db.transaction;
  const fields: string[][] = [];
  let generation = 0;
  db.select = ((projection: Record<string, unknown>) => {
    assert.ok(projection, "must not select the complete catalogue row");
    const keys = Object.keys(projection);
    fields.push(keys);
    const row = keys.includes("version")
      ? { version: `simulated-new-process-or-save-${generation++}` }
      : { ...current(), draftVersion: String(DEFAULT_PLATFORM_CONTENT.contentVersion),
          publishedVersion: String(DEFAULT_PLATFORM_CONTENT.contentVersion) };
    return { from: () => ({ where: () => ({ limit: async () => [row] }) }) };
  }) as unknown as typeof db.select;
  db.insert = (() => { throw new Error("current catalogues must not seed or rewrite content"); }) as unknown as typeof db.insert;
  db.transaction = (() => { throw new Error("current catalogues must not run compatibility transactions"); }) as unknown as typeof db.transaction;
  try {
    for (let i = 0; i < 100; i++) await ensurePlatformContent();
    assert.equal(fields.length, 200);
    assert.equal(fields.some((keys) => keys.includes("draft") || keys.includes("published")), false);
    assert.deepEqual(fields[1], ["draftVersion", "publishedVersion", "publishedEmpty", "hasLegacyFaqItems"]);
    t.diagnostic("100 initialization checks: zero full catalogue reads, inserts, compatibility merges or migration transactions.");
  } finally {
    db.select = select;
    db.insert = insert;
    db.transaction = transaction;
  }
});

test("Staff readiness does not download the unused published catalogue", async () => {
  const source = await readFile(new URL("../routes/staff-content.ts", import.meta.url), "utf8");
  const route = source.slice(source.indexOf('router.get("/staff/content/platform/catalogue/readiness"'),
    source.indexOf('router.post(\n  "/staff/content/platform/products/:slug/availability"'));
  assert.ok(route.length > 0);
  assert.match(route, /draft: siteContentTable\.draft/);
  assert.match(route, /draftUpdatedAt: siteContentTable\.draftUpdatedAt/);
  assert.match(route, /publishedAt: siteContentTable\.publishedAt/);
  assert.doesNotMatch(route, /published: siteContentTable\.published|db\.select\(\)/);
});
