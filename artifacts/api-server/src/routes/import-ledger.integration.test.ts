import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, catalogueImportUploadsTable as uploads, catalogueImportSessionsTable as sessions,
  staffSessionsTable, staffUsersTable, siteContentTable, siteContentRevisionsTable, auditLogsTable } from "@workspace/db";
import app from "../app";
import { createMediaStorageService } from "../lib/media-storage";
import { MediaNotFoundError } from "../lib/cloudinary-storage";
import { reviewSchema } from "../lib/catalogue-import-ledger";
import { processPendingCollectionCoverCleanup } from "../lib/collection-cover-cleanup";

test("durable import receipts survive lost responses, isolate Staff, and permit only fresh scoped cleanup", async () => {
  const storage = createMediaStorageService();
  const originals = {
    createMediaUpload: storage.createMediaUpload, resumeMediaUpload: storage.resumeMediaUpload,
    inspectUploadedMedia: storage.inspectUploadedMedia, readUploadedImageBytes: storage.readUploadedImageBytes,
    verifyFinalization: storage.verifyFinalization, finalizeRenditions: storage.finalizeRenditions,
    deleteUploadedMedia: storage.deleteUploadedMedia, deleteUnreferencedUploadedMedia: storage.deleteUnreferencedUploadedMedia,
  };
  const bytes = Buffer.from("synthetic-photo-bytes");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const files = new Set<string>();
  const deleted: string[] = [];
  let created = 0;
  storage.createMediaUpload = async () => {
    created++;
    return { objectPath: `/api/storage/objects/uploads/${randomUUID()}.jpg`,
      uploadURL: "https://signed.invalid/DO_NOT_PERSIST", uploadMethod: "PUT", uploadFields: {},
      finalizeToken: "DO_NOT_PERSIST_FINALIZE" };
  };
  storage.resumeMediaUpload = async (objectPath) => ({
    objectPath, uploadURL: "https://signed.invalid/REISSUED", uploadMethod: "PUT", uploadFields: {},
  });
  storage.inspectUploadedMedia = async (p) => {
    if (!files.has(p)) throw new MediaNotFoundError();
    return { size: bytes.length, contentType: "image/jpeg", declaredContentType: "image/jpeg", animated: false } as any;
  };
  storage.readUploadedImageBytes = async () => bytes;
  storage.verifyFinalization = async () => undefined;
  storage.finalizeRenditions = async () => undefined;
  storage.deleteUploadedMedia = storage.deleteUnreferencedUploadedMedia = async (p) => { deleted.push(p); files.delete(p); };
  const actors: Array<{ id: string; token: string }> = [];
  const server = app.listen(0);
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (actor: number, path: string, method = "GET", body?: unknown) => {
    const response = await fetch(`${base}/api${path}`, {
      method, headers: { origin: base, "content-type": "application/json",
        cookie: actors[actor] ? `soso_staff_session=${actors[actor]!.token}` : "" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as any, cache: response.headers.get("cache-control") };
  };
  const review = {
    sheet: { sheetName: "Stock", rows: [], warnings: [] }, groups: {}, selected: [],
  };
  try {
    for (const role of ["owner", "editor", "analyst"] as const) {
      const [actor] = await db.insert(staffUsersTable).values({
        clerkUserId: `ledger-${randomUUID()}`, email: `ledger-${randomUUID()}@example.test`, role, isActive: true,
      }).returning();
      const token = randomBytes(32).toString("hex");
      actors.push({ id: actor!.id, token });
      await db.insert(staffSessionsTable).values({
        staffUserId: actor!.id, tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 300_000),
      });
    }
    assert.equal((await api(9, "/storage/import-ledger")).status, 401);
    for (const route of ["/storage/import-ledger", "/storage/import-review"]) {
      assert.equal((await api(2, route)).status, 403);
    }
    const input = { name: "photo.jpg", size: bytes.length, contentType: "image/jpeg",
      importSource: { sourceIdentity: "drive:fixture-file", sourceVersion: hash, hash } };
    const requested = await api(0, "/storage/uploads/request-url", "POST", input);
    assert.equal(requested.status, 200);
    const path = requested.body.objectPath;
    // Simulate losing the request-url response, with no browser receipt at all.
    const ledger = await api(0, "/storage/import-ledger");
    assert.equal(ledger.status, 200);
    assert.equal(ledger.cache, "private, no-store");
    assert.equal(ledger.body.length, 1);
    assert.equal(ledger.body[0].path, path);
    assert.equal(ledger.body[0].sourceIdentity, "drive:fixture-file");
    assert.equal(ledger.body[0].sourceVersion, hash);
    assert.equal(ledger.body[0].status, "pending");
    assert.equal(JSON.stringify(ledger.body).includes("DO_NOT_PERSIST"), false);
    const [stored] = await db.select().from(uploads).where(eq(uploads.path, path));
    assert.equal(stored!.ownerId, actors[0]!.id);
    assert.equal(JSON.stringify(stored).includes("DO_NOT_PERSIST"), false);
    assert.deepEqual((await api(1, "/storage/import-ledger")).body, []);
    assert.equal((await api(1, `/storage/import-ledger/${stored!.id}/cleanup`, "POST")).status, 409);
    const resumed = await api(0, "/storage/uploads/request-url", "POST", input);
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.objectPath, path);
    assert.equal(created, 1);
    files.add(path.slice("/api/storage/objects/".length));
    const finalize = { objectPath: path, finalizeToken: "not-stored" };
    assert.equal((await api(0, "/storage/uploads/finalize", "POST", finalize)).status, 200);
    // A successful finalize whose response is lost can be repeated without an
    // old credential, and the next device receives the same completed path.
    assert.equal((await api(0, "/storage/uploads/finalize", "POST", { objectPath: path })).status, 200);
    const reused = await api(0, "/storage/uploads/request-url", "POST", input);
    assert.equal(reused.status, 200);
    assert.equal(reused.body.completed, true);
    assert.equal(reused.body.objectPath, path);
    assert.equal(created, 1);
    assert.equal((await api(0, `/storage/import-ledger/${stored!.id}/cleanup`, "POST")).status, 409);
    assert.equal(deleted.length, 0, "live upload grants prevent deletion");
    await db.insert(auditLogsTable).values({
      actorClerkUserId: "synthetic-cover-cleanup", action: "platform_media.cleanup_queued",
      entityType: "platform_media", entityId: path.slice("/api/storage/objects/".length), metadata: { path },
    });
    const coverStorage = { provider: "cloudinary", deleteUploadedMedia: storage.deleteUploadedMedia };
    assert.equal((await processPendingCollectionCoverCleanup(coverStorage)).deferred, 1);
    assert.equal(deleted.length, 0, "cover cleanup cannot bypass an import grant's expiry");
    assert.equal((await db.select().from(uploads).where(eq(uploads.id, stored!.id)))[0]!.status, "complete");

    assert.equal((await api(0, "/storage/import-review", "PUT", { version: 0, review })).status, 200);
    assert.deepEqual((await api(0, "/storage/import-review")).body.review, review);
    assert.equal((await api(0, "/storage/import-review", "PUT", { version: 0, review })).status, 409);
    assert.equal((await api(1, "/storage/import-review")).body.review, null);
    assert.equal((await api(0, "/storage/import-review", "PUT", { version: 1, review: null })).status, 200);
    assert.equal((await api(0, "/storage/import-review")).body.review, null);

    // Only synthetic authorization timestamps are expired; no external grants
    // or storage calls are used anywhere in this integration test.
    await db.update(uploads).set({ authorizedAt: new Date(0) }).where(eq(uploads.id, stored!.id));
    const key = `ledger-ref-${randomUUID()}`;
    await db.insert(siteContentTable).values({ key, draft: { media: path } });
    assert.equal((await api(0, `/storage/import-ledger/${stored!.id}/cleanup`, "POST")).status, 409);
    await db.update(siteContentTable).set({ draft: {} }).where(eq(siteContentTable.key, key));
    // Retained revisions are references too, even on non-R2 storage.
    await db.insert(siteContentRevisionsTable).values({
      contentKey: key, event: "saved_draft", snapshot: { body: `URL: ${path}?w=640` },
      createdByClerkUserId: "synthetic-ledger", contentHash: "synthetic",
    });
    assert.equal((await processPendingCollectionCoverCleanup(coverStorage)).deferred, 1);
    assert.equal(deleted.length, 0, "Cloudinary cover cleanup must retain imported media referenced by history");
    assert.equal((await db.select().from(uploads).where(eq(uploads.id, stored!.id)))[0]!.status, "complete");
    assert.equal((await api(0, `/storage/import-ledger/${stored!.id}/cleanup`, "POST")).status, 409);
    await db.delete(siteContentRevisionsTable).where(eq(siteContentRevisionsTable.contentKey, key));
    await db.delete(siteContentTable).where(eq(siteContentTable.key, key));
    assert.equal((await api(0, `/storage/import-ledger/${stored!.id}/cleanup`, "POST")).body.status, "deleted");
    assert.equal(deleted.length, 1);
    assert.equal((await api(0, `/storage/import-ledger/${stored!.id}/cleanup`, "POST")).body.status, "deleted");
    assert.equal(deleted.length, 1, "cleanup is repeat-safe");
    assert.deepEqual((await api(0, "/storage/import-ledger")).body, []);
    assert.equal((await api(0, "/storage/uploads/finalize", "POST", finalize)).status, 400);
    const next = await api(0, "/storage/uploads/request-url", "POST", input);
    assert.equal(next.status, 200);
    assert.notEqual(next.body.objectPath, path, "reclaimed receipts cannot be reused");
  } finally {
    Object.assign(storage, originals);
    await db.delete(auditLogsTable).where(eq(auditLogsTable.actorClerkUserId, "synthetic-cover-cleanup"));
    const ids = actors.map((a) => a.id);
    if (ids.length) {
      await db.delete(uploads).where(inArray(uploads.ownerId, ids));
      await db.delete(sessions).where(inArray(sessions.ownerId, ids));
      await db.delete(staffSessionsTable).where(inArray(staffSessionsTable.staffUserId, ids));
      await db.delete(staffUsersTable).where(inArray(staffUsersTable.id, ids));
    }
    server.close();
    await once(server, "close");
  }
});

test("review metadata allow-list excludes authorizations, URLs, bytes and unknown future fields", () => {
  const safe = reviewSchema.parse({
    sheet: { sheetName: "Stock", rows: [{
      rowNumber: 2, slug: "fixture", name: "Fixture", department: "men", category: "Kaftans",
      driveUrl: "https://drive.google.com/drive/folders/fixture",
      fields: { "Photo Folder Link": "https://drive.google.com/drive/folders/fixture?token=never-store", Description: "Merchant wording" },
      warnings: [], photoNames: [],
    }], warnings: [], token: "never-store" },
    groups: {}, selected: [], finalizeToken: "never-store", uploadURL: "https://signed.invalid/secret",
  });
  assert.equal(JSON.stringify(safe).includes("never-store"), false);
  assert.equal(JSON.stringify(safe).includes("signed.invalid"), false);
  assert.deepEqual(safe.sheet.rows[0]!.fields, { Description: "Merchant wording" });
  assert.equal(reviewSchema.safeParse({ ...safe, sheet: { ...safe.sheet, sheetName: "https://signed.invalid/?token=secret" } }).success, false);
});
