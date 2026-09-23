import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PNG } from "pngjs";
import {
  auditLogsTable,
  db,
  siteContentTable,
  staffSessionsTable,
  staffUsersTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import app from "../app";
import {
  DEFAULT_PLATFORM_CONTENT,
  type PlatformContent,
} from "../lib/platform-content";
import {
  PLATFORM_CONTENT_MEDIA_LOCK,
  processPendingCollectionCoverCleanup,
} from "../lib/collection-cover-cleanup";
import { sql } from "drizzle-orm";

type ApiResponse = {
  status: number;
  body: any;
};

async function listen(): Promise<{ server: Server; baseUrl: string }> {
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function request(
  baseUrl: string,
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {},
): Promise<ApiResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      cookie: `soso_staff_session=${token}`,
      ...(["POST", "PUT", "PATCH", "DELETE"].includes(options.method ?? "GET")
        ? { origin: baseUrl }
        : {}),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

function publishableContent(): PlatformContent {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  for (const product of content.products) {
    product.fulfilmentState = "unavailable";
    product.readyNowSizes = [];
    product.unavailableMessage = "Unavailable during this isolated publishing check";
    delete product.commerceProductId;
    delete product.commerceVariantIds;
    delete product.commerceMappingConfirmation;
  }
  for (const group of content.site.megaMenu) group.visible = false;
  for (const item of content.homepage.categories.items) item.active = false;
  return content;
}

function pngBytes(red: number): Buffer {
  const png = new PNG({ width: 2, height: 1, colorType: 6 });
  png.data.set([red, 30, 60, 255, red, 30, 60, 255]);
  return PNG.sync.write(png, { colorType: 6 });
}

test("staff collection cover upload, persistence, publishing, replacement and removal work through the API", async () => {
  const originalFetch = globalThis.fetch;
  const originalPlatformRows = await db.select().from(siteContentTable)
    .where(eq(siteContentTable.key, "platform"));
  const token = randomBytes(32).toString("hex");
  const clerkUserId = `collection-cover-check-${randomBytes(8).toString("hex")}`;
  let staffUserId: string | undefined;
  let server: Server | undefined;
  let currentUpload = pngBytes(180);
  const deletedUploads: string[] = [];
  let watchedInspectionPath: string | undefined;
  let resolveWatchedInspection: (() => void) | undefined;

  globalThis.fetch = async (input, init): Promise<Response> => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    if (url.startsWith("http://127.0.0.1:")) return originalFetch(input, init);
    if (url.includes("/upload_presets/")) return new Response(null, { status: 200 });
    if (url.includes("api.cloudinary.com") && url.endsWith("/image/upload")) {
      return Response.json({ public_id: "soso-store/uploads/collection-cover" });
    }
    if (url.includes("api.cloudinary.com") && url.endsWith("/image/destroy")) {
      const body = init?.body;
      if (body instanceof FormData) deletedUploads.push(String(body.get("public_id")));
      return Response.json({ result: "ok" });
    }
    if (url.includes("res.cloudinary.com")) {
      const decodedUrl = decodeURIComponent(url);
      if (watchedInspectionPath && decodedUrl.includes(watchedInspectionPath)) {
        resolveWatchedInspection?.();
      }
      if (deletedUploads.some((publicId) => decodedUrl.includes(`${publicId}.png`))) {
        return new Response(null, { status: 404 });
      }
      return new Response(currentUpload, {
        status: 206,
        headers: {
          "content-type": "image/png",
          "content-length": String(currentUpload.length),
          "content-range": `bytes 0-${currentUpload.length - 1}/${currentUpload.length}`,
        },
      });
    }
    return originalFetch(input, init);
  };

  try {
    const [staff] = await db.insert(staffUsersTable).values({
      clerkUserId,
      email: `${clerkUserId}@example.com`,
      role: "owner",
      isActive: true,
    }).returning({ id: staffUsersTable.id });
    staffUserId = staff!.id;
    await db.insert(staffSessionsTable).values({
      staffUserId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const running = await listen();
    server = running.server;

    const initial = await request(running.baseUrl, "/api/staff/content/platform", token);
    assert.equal(initial.status, 200);

    const upload = async (name: string): Promise<string> => {
      const authorization = await request(
        running.baseUrl,
        "/api/storage/uploads/request-url",
        token,
        { method: "POST", body: { name, size: currentUpload.length, contentType: "image/png" } },
      );
      assert.equal(authorization.status, 200);
      const form = new FormData();
      for (const [key, value] of Object.entries(authorization.body.uploadFields as Record<string, string>)) {
        form.append(key, value);
      }
      form.append("file", new Blob([Uint8Array.from(currentUpload)], { type: "image/png" }), name);
      const uploaded = await fetch(authorization.body.uploadURL, {
        method: authorization.body.uploadMethod,
        body: form,
      });
      assert.equal(uploaded.status, 200);
      const finalized = await request(
        running.baseUrl,
        "/api/storage/uploads/finalize",
        token,
        { method: "POST", body: { objectPath: authorization.body.objectPath } },
      );
      assert.equal(finalized.status, 200);
      return finalized.body.objectPath;
    };

    const firstPath = await upload("collection-cover-one.png");
    const firstContent = publishableContent();
    firstContent.collections[0]!.showCover = true;
    firstContent.collections[0]!.cover = {
      src: firstPath,
      alt: "Model wearing a black SOSO kaftan",
      provenance: {
        source: "SOSO Africa studio",
        rights: "SOSO Africa owned photography approved for storefront use",
      },
    };
    const firstSave = await request(running.baseUrl, "/api/staff/content/platform", token, {
      method: "PUT",
      body: { content: firstContent, expectedDraftUpdatedAt: initial.body.draftUpdatedAt },
    });
    assert.equal(firstSave.status, 200);

    const firstReload = await request(running.baseUrl, "/api/staff/content/platform", token);
    assert.equal(firstReload.status, 200);
    assert.deepEqual(firstReload.body.draft.collections[0].cover, firstContent.collections[0]!.cover);
    assert.equal(firstReload.body.draft.collections[0].showCover, true);

    const corruptDraft = structuredClone(firstReload.body.draft);
    corruptDraft.collections[0].cover = { src: firstPath };
    const corruptDate = new Date(Date.now() + 2_000);
    await db.update(siteContentTable).set({
      draft: corruptDraft,
      draftUpdatedAt: corruptDate,
    }).where(eq(siteContentTable.key, "platform"));
    const rejectedPublish = await request(
      running.baseUrl,
      "/api/staff/content/platform/publish",
      token,
      { method: "POST", body: { expectedDraftUpdatedAt: corruptDate.toISOString() } },
    );
    assert.equal(rejectedPublish.status, 400);
    assert.equal(rejectedPublish.body.error, "The current draft is invalid");
    assert.ok(rejectedPublish.body.issues.some((issue: { path: Array<string | number> }) =>
      issue.path.join(".").startsWith("collections.0.cover.")));

    const restored = await request(running.baseUrl, "/api/staff/content/platform", token, {
      method: "PUT",
      body: { content: firstContent, expectedDraftUpdatedAt: corruptDate.toISOString() },
    });
    assert.equal(restored.status, 200);
    const published = await request(
      running.baseUrl,
      "/api/staff/content/platform/publish",
      token,
      { method: "POST", body: { expectedDraftUpdatedAt: restored.body.draftUpdatedAt } },
    );
    assert.equal(published.status, 200);
    assert.deepEqual(published.body.published.collections[0].cover, firstContent.collections[0]!.cover);

    currentUpload = pngBytes(70);
    const replacementPath = await upload("collection-cover-two.png");
    const replacementContent = structuredClone(published.body.draft) as PlatformContent;
    replacementContent.collections[0]!.cover!.src = replacementPath;
    const replaced = await request(running.baseUrl, "/api/staff/content/platform", token, {
      method: "PUT",
      body: { content: replacementContent, expectedDraftUpdatedAt: published.body.draftUpdatedAt },
    });
    assert.equal(replaced.status, 200);
    const replacementReload = await request(running.baseUrl, "/api/staff/content/platform", token);
    assert.equal(replacementReload.body.draft.collections[0].cover.src, replacementPath);
    assert.notEqual(replacementPath, firstPath);
    assert.deepEqual(deletedUploads, []);

    const removedContent = structuredClone(replacementReload.body.draft) as PlatformContent;
    removedContent.collections[0]!.showCover = false;
    delete removedContent.collections[0]!.cover;
    const rejectedRemoval = await request(running.baseUrl, "/api/staff/content/platform", token, {
      method: "PUT",
      body: { content: removedContent, expectedDraftUpdatedAt: published.body.draftUpdatedAt },
    });
    assert.equal(rejectedRemoval.status, 409);
    assert.deepEqual(deletedUploads, []);

    const removed = await request(running.baseUrl, "/api/staff/content/platform", token, {
      method: "PUT",
      body: { content: removedContent, expectedDraftUpdatedAt: replacementReload.body.draftUpdatedAt },
    });
    assert.equal(removed.status, 200);
    const removalReload = await request(running.baseUrl, "/api/staff/content/platform", token);
    assert.equal(removalReload.body.draft.collections[0].showCover, false);
    assert.equal(removalReload.body.draft.collections[0].cover, undefined);
    assert.deepEqual(deletedUploads, [
      `soso-store/${replacementPath.slice("/api/storage/objects/".length).replace(/\.[^.]+$/, "")}`,
    ]);

    const removalPublished = await request(
      running.baseUrl,
      "/api/staff/content/platform/publish",
      token,
      { method: "POST", body: { expectedDraftUpdatedAt: removed.body.draftUpdatedAt } },
    );
    assert.equal(removalPublished.status, 200);
    assert.deepEqual(new Set(deletedUploads), new Set([
      `soso-store/${firstPath.slice("/api/storage/objects/".length).replace(/\.[^.]+$/, "")}`,
      `soso-store/${replacementPath.slice("/api/storage/objects/".length).replace(/\.[^.]+$/, "")}`,
    ]));

    const cleanupAudits = await db.select({
      action: auditLogsTable.action,
      path: auditLogsTable.entityId,
    }).from(auditLogsTable).where(and(
      eq(auditLogsTable.actorClerkUserId, clerkUserId),
      eq(auditLogsTable.entityType, "platform_media"),
    ));
    assert.ok(cleanupAudits.some(({ action, path }) =>
      action === "platform_media.cleanup_deferred"
      && path === firstPath.slice("/api/storage/objects/".length)));
    assert.equal(cleanupAudits.filter(({ action }) => action === "platform_media.cleanup_deleted").length, 2);

    const racePath = await upload("collection-cover-race.png");
    const raceRelativePath = racePath.slice("/api/storage/objects/".length);
    await db.insert(auditLogsTable).values({
      actorClerkUserId: clerkUserId,
      action: "platform_media.cleanup_queued",
      entityType: "platform_media",
      entityId: raceRelativePath,
      metadata: { path: raceRelativePath, source: "collection_cover_replaced" },
    });
    const listedCleanup = await request(
      running.baseUrl,
      "/api/storage/uploads/cleanup-pending",
      token,
    );
    assert.equal(listedCleanup.status, 200);
    assert.deepEqual(listedCleanup.body.find((item: { path: string }) => item.path === raceRelativePath), {
      path: raceRelativePath,
      status: "queued",
      updatedAt: listedCleanup.body.find((item: { path: string }) => item.path === raceRelativePath)?.updatedAt,
      reason: null,
    });

    let releaseLock!: () => void;
    let confirmLock!: () => void;
    const lockHeld = new Promise<void>((resolve) => { confirmLock = resolve; });
    const lockRelease = new Promise<void>((resolve) => { releaseLock = resolve; });
    const lockHolder = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
      confirmLock();
      await lockRelease;
    });
    await lockHeld;
    const cleanup = processPendingCollectionCoverCleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const inspected = new Promise<void>((resolve) => { resolveWatchedInspection = resolve; });
    watchedInspectionPath = raceRelativePath;
    const reuseContent = structuredClone(removalPublished.body.draft) as PlatformContent;
    reuseContent.collections[0]!.showCover = true;
    reuseContent.collections[0]!.cover = {
      src: racePath,
      alt: "Model wearing a black SOSO kaftan",
      provenance: {
        source: "SOSO Africa studio",
        rights: "SOSO Africa owned photography approved for storefront use",
      },
    };
    const reuseSave = request(running.baseUrl, "/api/staff/content/platform", token, {
      method: "PUT",
      body: { content: reuseContent, expectedDraftUpdatedAt: removalPublished.body.draftUpdatedAt },
    });
    await inspected;
    releaseLock();
    await lockHolder;
    await cleanup;
    const rejectedReuse = await reuseSave;
    watchedInspectionPath = undefined;
    assert.equal(rejectedReuse.status, 400);
    assert.equal(rejectedReuse.body.error, "Storefront media changed before the draft could be saved");
    const afterRejectedReuse = await request(running.baseUrl, "/api/staff/content/platform", token);
    assert.equal(afterRejectedReuse.body.draft.collections[0].cover, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (server) {
      server.close();
      await once(server, "close");
    }
    if (staffUserId) {
      await db.delete(staffUsersTable).where(eq(staffUsersTable.id, staffUserId));
    }
    await db.delete(auditLogsTable).where(eq(auditLogsTable.actorClerkUserId, clerkUserId));
    await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
    if (originalPlatformRows[0]) await db.insert(siteContentTable).values(originalPlatformRows[0]);
  }
});