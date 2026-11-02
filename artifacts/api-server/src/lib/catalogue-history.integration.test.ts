import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db, siteContentTable, siteContentRevisionsTable, staffUsersTable, catalogueImportUploadsTable, auditLogsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { cleanupImportUpload } from "./catalogue-import-cleanup";
import { queueCollectionCoverCleanup, processPendingCollectionCoverCleanup } from "./collection-cover-cleanup";
import { recoverVerificationImports } from "./verification-import-recovery";
import type { MediaStorage } from "./media-storage-types";

test("mixed history protects historical media on both providers and refuses dependent recovery discard", async () => {
  const guard = await db.execute<{ run_id: string; schema: string }>(sql`
    select run_id, current_schema() as schema from import_verification_guard`);
  assert.equal(guard.rows.length, 1, "Use the isolated-schema runner");
  const actor = `history-${randomUUID()}`;
  const [owner] = await db.insert(staffUsersTable).values({
    clerkUserId: actor, email: `${actor}@example.com`, role: "editor", isActive: true,
  }).returning();
  const path = `/api/storage/objects/uploads/history-${randomUUID()}.jpg`;
  const relative = path.slice("/api/storage/objects/".length);
  const [upload] = await db.insert(catalogueImportUploadsTable).values({
    ownerId: owner!.id, sourceIdentity: "isolated-history", sourceVersion: "v1",
    hash: "a".repeat(64), name: "fixture.jpg", size: 100, path, status: "complete",
    authorizedAt: new Date(Date.now() - 3 * 60 * 60_000),
  }).returning();
  const content = { products: Array.from({ length: 10 }, (_, i) => ({
    slug: `fixture-${i}`, description: "evidence".repeat(100), photos: i === 0 ? [path] : [],
    commerceMappingConfirmation: { productHash: `exact-${i}`, confirmedAt: "2026-01-01" },
  })) };
  await db.insert(siteContentTable).values({ key: "platform", draft: {}, published: {} }).onConflictDoNothing();
  await db.execute(sql`update soso_catalogue_history_writer set enabled=true,qualification=${"q".repeat(64)}`);
  const add = async (snapshot: unknown) => {
    const result = await db.execute<{ id: string; history_format: string }>(sql`
      insert into soso_site_content_revisions(content_key,event,snapshot,content_hash,created_by_clerk_user_id)
      values ('platform','draft_saved',${JSON.stringify(snapshot)}::jsonb,'exact-audit-hash',${actor}) returning id,history_format`);
    return result.rows[0]!;
  };
  const base = await add(content);
  // Force the first row to be independent regardless of earlier test fixtures.
  // Non-product structure change guarantees the same full checkpoint behavior.
  const next = structuredClone(content);
  next.products[0]!.description = "one changed product";
  const delta = await add(next);
  assert.equal(delta.history_format, "products-v1");
  next.products[0]!.photos = [];
  delete (next.products[0] as { commerceMappingConfirmation?: unknown }).commerceMappingConfirmation;
  const removed = await add(next);
  assert.equal(removed.history_format, "products-v1");
  const restored = await db.execute<{ snapshot: unknown }>(sql`select soso_history_restore(${delta.id}::uuid) as snapshot`);
  const expected = structuredClone(content);
  expected.products[0]!.description = "one changed product";
  assert.deepEqual(restored.rows[0]!.snapshot, expected);
  await db.update(siteContentTable).set({ draft: {}, published: {} }).where(eq(siteContentTable.key, "platform"));
  let deletions = 0;
  for (const provider of ["cloudinary", "r2"] as const) {
    const storage = {
      provider, deleteUploadedMedia: async () => { deletions++; },
      deleteUnreferencedUploadedMedia: async () => { deletions++; },
    } as unknown as MediaStorage;
    await assert.rejects(cleanupImportUpload(owner!.id, upload!.id, storage), /still referenced/);
    await db.transaction(async (tx) => queueCollectionCoverCleanup(tx, [relative], actor));
    const summary = await processPendingCollectionCoverCleanup(storage);
    assert.ok(summary.deferred >= 1);
    assert.equal(deletions, 0);
    const manifest = {
      schema: guard.rows[0]!.schema, runId: guard.rows[0]!.run_id,
      uploads: [{
        id: upload!.id, owner_id: owner!.id, source_identity: upload!.sourceIdentity,
        source_version: upload!.sourceVersion, hash: upload!.hash, path,
      }],
      draftRevisions: [{ id: base.id, content_hash: "exact-audit-hash" }],
    };
    await assert.rejects(recoverVerificationImports(manifest, storage, true), /depend on this verification base/);
    assert.equal(deletions, 0);
  }
  // A corrupt dependency makes even an otherwise-unused object undeletable,
  // and the queue records the explicit refusal rather than losing the job.
  await db.transaction(async (tx) => {
    await tx.execute(sql`alter table soso_site_content_revisions disable trigger soso_history_immutable`);
    await tx.execute(sql`update soso_site_content_revisions set base_hash=${"b".repeat(64)} where id=${delta.id}::uuid`);
    await tx.execute(sql`alter table soso_site_content_revisions enable trigger soso_history_immutable`);
  });
  const unusedRelative = `uploads/history-unused-${randomUUID()}.jpg`;
  await db.transaction(async (tx) => queueCollectionCoverCleanup(tx, [unusedRelative], actor));
  const result = await processPendingCollectionCoverCleanup({
    provider: "cloudinary", deleteUploadedMedia: async () => { deletions++; },
  });
  assert.ok(result.deferred >= 1);
  assert.equal(deletions, 0);
  const deferred = await db.select().from(auditLogsTable).where(eq(auditLogsTable.entityId, unusedRelative));
  assert.ok(deferred.some((r) => (r.metadata as { reason?: string })?.reason === "history_verification_failed"));
  // Restore only the deliberate synthetic corruption, never production data.
  await db.transaction(async (tx) => {
    await tx.execute(sql`alter table soso_site_content_revisions disable trigger soso_history_immutable`);
    await tx.execute(sql`update soso_site_content_revisions r set base_hash=(select b.integrity_hash from soso_site_content_revisions b where b.id=r.base_id) where r.id=${delta.id}::uuid`);
    await tx.execute(sql`alter table soso_site_content_revisions enable trigger soso_history_immutable`);
  });
  // Remove this test's exact disposable identities in reverse dependency order,
  // leaving no external ledger object for the schema runner to retain.
  for (const id of [removed.id, delta.id, base.id]) {
    await db.delete(siteContentRevisionsTable).where(eq(siteContentRevisionsTable.id, id));
  }
  await db.delete(catalogueImportUploadsTable).where(eq(catalogueImportUploadsTable.id, upload!.id));
  await db.delete(auditLogsTable).where(eq(auditLogsTable.actorClerkUserId, actor));
  await db.delete(staffUsersTable).where(eq(staffUsersTable.id, owner!.id));
  await db.execute(sql`update soso_catalogue_history_writer set enabled=false`);
});
