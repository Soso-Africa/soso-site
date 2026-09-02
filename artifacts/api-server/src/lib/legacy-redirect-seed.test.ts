import assert from "node:assert/strict";
import test from "node:test";
import {
  auditLogsTable,
  db,
  redirectRevisionsTable,
  redirectsTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

const redirectSeed = await (new Function("url", "return import(url)")(
  new URL("../../../../lib/db/scripts/seed-soso-legacy-redirects.mjs", import.meta.url).href,
) as Promise<{
  LEGACY_REDIRECT_SEED_ACTOR: string;
  legacyRedirects: Array<{ fromPath: string; toPath: string; statusCode: 301 }>;
  seedSosoLegacyRedirects(input: { databaseUrl?: string }): Promise<{
    createdPaths: string[];
    skippedPaths: string[];
  }>;
}>);
const { LEGACY_REDIRECT_SEED_ACTOR, legacyRedirects, seedSosoLegacyRedirects } = redirectSeed;
const legacyPaths = legacyRedirects.map((redirect) => redirect.fromPath);

async function removeLegacySeedRows() {
  const rows = await db.select({ id: redirectsTable.id })
    .from(redirectsTable)
    .where(inArray(redirectsTable.fromPath, legacyPaths));
  const ids = rows.map((row) => row.id);
  if (ids.length) {
    await db.delete(redirectRevisionsTable)
      .where(inArray(redirectRevisionsTable.redirectId, ids));
    await db.delete(auditLogsTable).where(and(
      eq(auditLogsTable.entityType, "redirect"),
      inArray(auditLogsTable.entityId, ids),
    ));
  }
  await db.delete(redirectsTable).where(inArray(redirectsTable.fromPath, legacyPaths));
}

test("legacy redirect seed inserts missing published permanent redirects and records their creation", async () => {
  await removeLegacySeedRows();
  const result = await seedSosoLegacyRedirects({ databaseUrl: process.env.DATABASE_URL });
  assert.deepEqual(result.createdPaths, legacyPaths);
  assert.deepEqual(result.skippedPaths, []);

  const rows = await db.select().from(redirectsTable)
    .where(inArray(redirectsTable.fromPath, legacyPaths));
  assert.equal(rows.length, legacyRedirects.length);
  for (const redirect of legacyRedirects) {
    const row = rows.find((candidate) => candidate.fromPath === redirect.fromPath);
    assert.equal(row?.toPath, redirect.toPath);
    assert.equal(row?.statusCode, 301);
    assert.equal(row?.isPublished, true);
    assert.equal(row?.updatedByClerkUserId, LEGACY_REDIRECT_SEED_ACTOR);
  }

  const ids = rows.map((row) => row.id);
  const revisions = await db.select().from(redirectRevisionsTable)
    .where(inArray(redirectRevisionsTable.redirectId, ids));
  assert.equal(revisions.length, legacyRedirects.length);
  assert.ok(revisions.every((revision) => (
    revision.event === "created"
    && revision.createdByClerkUserId === LEGACY_REDIRECT_SEED_ACTOR
  )));
  const audits = await db.select().from(auditLogsTable).where(and(
    eq(auditLogsTable.action, "redirect.created"),
    inArray(auditLogsTable.entityId, ids),
  ));
  assert.equal(audits.length, legacyRedirects.length);
  assert.ok(audits.every((audit) => (
    audit.actorClerkUserId === LEGACY_REDIRECT_SEED_ACTOR
    && (audit.metadata as { source?: string }).source === "approved_legacy_redirect_seed_v1"
  )));
});

test("legacy redirect seed is a no-op on rerun and preserves merchant redirects byte-for-byte", async () => {
  await removeLegacySeedRows();
  const existingDefinitions = legacyRedirects.slice(0, 2);
  const merchantRedirects = await db.insert(redirectsTable).values([
    {
      fromPath: existingDefinitions[0]!.fromPath,
      toPath: "/merchant-selected-target?edition=one",
      statusCode: 302,
      isPublished: false,
      updatedByClerkUserId: "merchant:redirect-editor",
    },
    {
      fromPath: existingDefinitions[1]!.fromPath,
      toPath: "/merchant-published-target#details",
      statusCode: 308,
      isPublished: true,
      updatedByClerkUserId: "merchant:publisher",
    },
  ]).returning();

  const first = await seedSosoLegacyRedirects({ databaseUrl: process.env.DATABASE_URL });
  assert.equal(first.createdPaths.length, legacyRedirects.length - merchantRedirects.length);
  assert.deepEqual(first.skippedPaths, existingDefinitions.map((redirect) => redirect.fromPath));
  const preservedAfterFirst = await db.select().from(redirectsTable)
    .where(inArray(redirectsTable.id, merchantRedirects.map((redirect) => redirect.id)));
  assert.deepEqual(
    preservedAfterFirst.sort((left, right) => left.id.localeCompare(right.id)),
    [...merchantRedirects].sort((left, right) => left.id.localeCompare(right.id)),
  );

  const revisionsBefore = await db.select({ count: sql<number>`count(*)::int` })
    .from(redirectRevisionsTable)
    .where(eq(redirectRevisionsTable.createdByClerkUserId, LEGACY_REDIRECT_SEED_ACTOR));
  const auditsBefore = await db.select({ count: sql<number>`count(*)::int` })
    .from(auditLogsTable)
    .where(eq(auditLogsTable.actorClerkUserId, LEGACY_REDIRECT_SEED_ACTOR));
  const rerun = await seedSosoLegacyRedirects({ databaseUrl: process.env.DATABASE_URL });
  assert.deepEqual(rerun.createdPaths, []);
  assert.deepEqual(rerun.skippedPaths, legacyPaths);
  const preservedAfterRerun = await db.select().from(redirectsTable)
    .where(inArray(redirectsTable.id, merchantRedirects.map((redirect) => redirect.id)));
  assert.deepEqual(
    preservedAfterRerun.sort((left, right) => left.id.localeCompare(right.id)),
    [...merchantRedirects].sort((left, right) => left.id.localeCompare(right.id)),
  );

  const revisionsAfter = await db.select({ count: sql<number>`count(*)::int` })
    .from(redirectRevisionsTable)
    .where(eq(redirectRevisionsTable.createdByClerkUserId, LEGACY_REDIRECT_SEED_ACTOR));
  const auditsAfter = await db.select({ count: sql<number>`count(*)::int` })
    .from(auditLogsTable)
    .where(eq(auditLogsTable.actorClerkUserId, LEGACY_REDIRECT_SEED_ACTOR));
  assert.equal(revisionsAfter[0]?.count, revisionsBefore[0]?.count);
  assert.equal(auditsAfter[0]?.count, auditsBefore[0]?.count);
});