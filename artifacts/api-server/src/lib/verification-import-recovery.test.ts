import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, catalogueImportUploadsTable as uploads, catalogueImportSessionsTable as sessions,
  siteContentTable, siteContentRevisionsTable, staffUsersTable } from "@workspace/db";
import { recoverVerificationImports } from "./verification-import-recovery";
import { createMediaStorageService } from "./media-storage";

test("deferred verification recovery waits, preserves references, then reclaims only exact owned records", async () => {
  // A retained recovery manifest describes the whole disposable schema. Keep
  // this test separate from other files' concurrent synthetic upload ledgers.
  if (process.env.SOSO_RECOVERY_TEST_CHILD !== "1") {
    const root = fileURLToPath(new URL("../../../../", import.meta.url));
    const env: NodeJS.ProcessEnv = { ...process.env, SOSO_RECOVERY_TEST_CHILD: "1" };
    // Node's parent test context otherwise suppresses a nested runner's output.
    delete env.NODE_TEST_CONTEXT;
    const result = await promisify(execFile)(process.execPath, [
      resolve(root, "lib/db/scripts/run-in-isolated-soso-schema.mjs"),
      "pnpm", "--dir", resolve(root, "scripts"), "exec", "node", "--import", "tsx", "--test", fileURLToPath(import.meta.url),
    ], { cwd: root, env, encoding: "utf8", timeout: 120_000, maxBuffer: 1_000_000 });
    assert.match(result.stdout, /pass 1/);
    return;
  }
  const storage = createMediaStorageService();
  const originalDelete = storage.deleteUploadedMedia;
  const originalDeleteR2 = storage.deleteUnreferencedUploadedMedia;
  const deleted: string[] = [];
  storage.deleteUploadedMedia = storage.deleteUnreferencedUploadedMedia = async (p) => { deleted.push(p); };
  const [actor] = await db.insert(staffUsersTable).values({
    clerkUserId: `recovery-${randomUUID()}`, email: `recovery-${randomUUID()}@example.test`, role: "editor", isActive: true,
  }).returning();
  const [original] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform"));
  const referenceKey = `verification-reference-${randomUUID()}`;
  const path = `/api/storage/objects/uploads/${randomUUID()}.jpg`;
  const [upload] = await db.insert(uploads).values({
    ownerId: actor!.id, hash: "a".repeat(64), sourceIdentity: "drive:synthetic", sourceVersion: "b".repeat(64),
    path, name: "synthetic.jpg", size: 10,
  }).returning();
  const schema = (await db.execute<{ name: string }>(sql`select current_schema() as name`)).rows[0]!.name;
  const runId = (await db.execute<{ run_id: string }>(sql`select run_id from import_verification_guard`)).rows[0]!.run_id;
  if (!original) await db.insert(siteContentTable).values({ key: "platform", draft: {} });
  await db.insert(siteContentTable).values({ key: referenceKey, draft: {}, published: { path } });
  const [revision] = await db.insert(siteContentRevisionsTable).values({
    contentKey: "platform", event: "draft_saved", snapshot: { path }, contentHash: "synthetic-hash",
    createdByClerkUserId: actor!.clerkUserId,
  }).returning();
  await db.insert(sessions).values({ ownerId: actor!.id, review: { path } });
  const manifest = {
    schema, runId, uploads: [{
      id: upload!.id, owner_id: actor!.id, hash: upload!.hash, source_identity: upload!.sourceIdentity,
      source_version: upload!.sourceVersion, path,
    }], draftRevisions: [{ id: revision!.id, content_hash: revision!.contentHash }],
  };
  try {
    const waiting = await recoverVerificationImports(manifest, storage, true);
    assert.equal(waiting.state, "waiting");
    assert.equal(deleted.length, 0);
    assert.equal((await db.select().from(siteContentRevisionsTable).where(eq(siteContentRevisionsTable.id, revision!.id))).length, 1);
    await assert.rejects(recoverVerificationImports({ ...manifest, runId: randomUUID() }, storage, true), /identity does not match/);
    await assert.rejects(recoverVerificationImports({ ...manifest, schema: "public" }, storage, true));
    await assert.rejects(recoverVerificationImports({
      ...manifest, uploads: [{ ...manifest.uploads[0], path: "/api/storage/objects/uploads/not-owned.jpg" }],
    }, storage, true), /identity changed/);
    // These are mock authorizations and mock storage, not live expired grants.
    await db.update(uploads).set({ authorizedAt: new Date(0) }).where(eq(uploads.id, upload!.id));
    assert.equal((await recoverVerificationImports(manifest, storage, false)).state, "blocked");
    assert.equal(deleted.length, 0, "review and retained draft history remain references without explicit discard");
    assert.equal((await recoverVerificationImports(manifest, storage, true)).state, "blocked");
    assert.equal(deleted.length, 0, "published content is never discarded by verification recovery");
    await db.update(siteContentTable).set({ published: {} }).where(eq(siteContentTable.key, referenceKey));
    assert.equal((await recoverVerificationImports(manifest, storage, true)).state, "complete");
    assert.deepEqual(deleted, [path.slice("/api/storage/objects/".length)]);
    assert.equal((await recoverVerificationImports(manifest, storage, true)).state, "complete");
    assert.equal(deleted.length, 1);
  } finally {
    storage.deleteUploadedMedia = originalDelete;
    storage.deleteUnreferencedUploadedMedia = originalDeleteR2;
    await db.delete(siteContentRevisionsTable).where(eq(siteContentRevisionsTable.id, revision!.id));
    await db.delete(siteContentTable).where(eq(siteContentTable.key, referenceKey));
    if (!original) await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
    await db.delete(sessions).where(eq(sessions.ownerId, actor!.id));
    await db.delete(uploads).where(eq(uploads.id, upload!.id));
    await db.delete(staffUsersTable).where(eq(staffUsersTable.id, actor!.id));
  }
});
