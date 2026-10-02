import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PNG } from "pngjs";
import {
  auditLogsTable,
  db,
  journalPostsTable,
  siteContentTable,
  siteContentRevisionsTable,
  staffSessionsTable,
  staffUsersTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import app from "../app";
import { platformProductReferences } from "../lib/platform-product-references";
import {
  DEFAULT_PLATFORM_CONTENT,
  type PlatformContent,
} from "../lib/platform-content";
import {
  PLATFORM_CONTENT_MEDIA_LOCK,
  processPendingCollectionCoverCleanup,
} from "../lib/collection-cover-cleanup";
import { sql } from "drizzle-orm";
import {
  CATALOGUE_BUSINESS_APPROVALS_KEY,
  productBusinessFingerprint,
  validBusinessApprovalSlugs,
} from "../lib/catalogue-business-approvals";
import { buildConfirmedCatalogueCandidate } from "./staff-content";

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
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
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
    signal: options.signal,
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

test("scoped saves accept a large catalogue, reject stale and unsafe writes, and roll back a failed revision", async () => {
  const originalRows = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform"));
  const token = randomBytes(32).toString("hex");
  const clerkUserId = `scoped-draft-check-${randomBytes(8).toString("hex")}`;
  let server: Server | undefined;
  let staffUserId: string | undefined;
  try {
    const [staff] = await db.insert(staffUsersTable).values({
      clerkUserId, email: `${clerkUserId}@example.com`, role: "editor", isActive: true,
    }).returning({ id: staffUsersTable.id });
    staffUserId = staff!.id;
    await db.insert(staffSessionsTable).values({
      staffUserId, tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const initial = publishableContent();
    const template = initial.products[0]!;
    initial.products.push(...Array.from({ length: 125 }, (_, index) => ({
      ...structuredClone(template),
      slug: `large-catalogue-${index}`, name: `Piece ${index} ${"x".repeat(8_800)}`,
    })));
    initial.homepage.featured.productSlugs[0] = "large-catalogue-0";
    initial.site.megaMenu[0]!.href = "/product/large-catalogue-0";
    initial.products[1]!.relatedProductSlugs = ["large-catalogue-0"];
    assert.ok(Buffer.byteLength(JSON.stringify(initial)) > 1_048_576);
    const now = new Date();
    await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
    await db.insert(siteContentTable).values({ key: "platform", draft: initial, draftUpdatedAt: now, published: initial, publishedAt: now, updatedByClerkUserId: clerkUserId });
    const running = await listen();
    server = running.server;
    const productUrl = "/api/staff/content/platform/products/large-catalogue-0/draft";
    const firstProduct = { ...initial.products.find((product) => product.slug === "large-catalogue-0")!, name: "Saved without sending the catalogue" };
    const first = await request(running.baseUrl, productUrl, token, {
      method: "PUT", body: { expectedDraftUpdatedAt: now.toISOString(), product: firstProduct },
    });
    assert.equal(first.status, 200, JSON.stringify(first.body).slice(0, 400));
    assert.equal(first.body.draft.products.length, initial.products.length);
    assert.equal(first.body.draft.products[1].name, initial.products[1]!.name);
    const stale = await request(running.baseUrl, productUrl, token, {
      method: "PUT", body: { expectedDraftUpdatedAt: now.toISOString(), product: firstProduct },
    });
    assert.equal(stale.status, 409);
    const invalid = await request(running.baseUrl, productUrl, token, {
      method: "PUT",
      body: { expectedDraftUpdatedAt: first.body.draftUpdatedAt, product: { ...firstProduct, img: "/images/soso/missing-image.png", images: [{ src: "/images/soso/missing-image.png", alt: "Missing", provenance: { source: "Studio", rights: "Owned" } }] } },
    });
    assert.equal(invalid.status, 400);
    assert.match(JSON.stringify(invalid.body), /verified bundled or SOSO Cloudinary asset/i);
    const section = await request(running.baseUrl, "/api/staff/content/platform/sections/productCopy", token, {
      method: "PATCH", body: { expectedDraftUpdatedAt: first.body.draftUpdatedAt, value: { ...initial.productCopy, title: "Unexpected field" } },
    });
    assert.equal(section.status, 400);
    const validSection = await request(running.baseUrl, "/api/staff/content/platform/sections/interfaceCopy", token, {
      method: "PATCH", body: { expectedDraftUpdatedAt: first.body.draftUpdatedAt, value: {
        ...initial.interfaceCopy, navigation: { ...initial.interfaceCopy.navigation, shopAllLabel: "Browse every piece" },
      } },
    });
    assert.equal(validSection.status, 200, JSON.stringify(validSection.body).slice(0, 400));
    assert.equal(validSection.body.draft.products.find((product: { slug: string }) => product.slug === firstProduct.slug).name, firstProduct.name);
    assert.equal(validSection.body.draft.interfaceCopy.navigation.shopAllLabel, "Browse every piece");
    const newCollection = { ...structuredClone(initial.collections[0]!), slug: "new-category-collection", category: "New category" };
    const newProduct = { ...firstProduct, slug: "first-new-category-product", category: "New category" };
    const coupled = await request(running.baseUrl, "/api/staff/content/platform/catalogue/draft", token, {
      method: "PATCH", body: {
        expectedDraftUpdatedAt: validSection.body.draftUpdatedAt,
        collections: [...initial.collections, newCollection],
        upserts: [{ slug: newProduct.slug, product: newProduct }],
        deletions: [],
      },
    });
    assert.equal(coupled.status, 200, JSON.stringify(coupled.body).slice(0, 800));
    assert.equal(coupled.body.draft.products.find((product: { slug: string }) => product.slug === newProduct.slug).category, newCollection.category);
    const moved = await request(running.baseUrl, "/api/staff/content/platform/catalogue/draft", token, {
      method: "PATCH", body: {
        expectedDraftUpdatedAt: coupled.body.draftUpdatedAt,
        collections: [...initial.collections, { ...newCollection, category: "Renamed category" }],
        upserts: [{ slug: newProduct.slug, product: { ...newProduct, category: "Renamed category" } }],
        deletions: [],
      },
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body).slice(0, 800));
    const deleted = await request(running.baseUrl, productUrl, token, {
      method: "DELETE", body: { expectedDraftUpdatedAt: moved.body.draftUpdatedAt },
    });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body).slice(0, 500));
    assert.equal(deleted.body.draft.products.some((product: { slug: string }) => product.slug === firstProduct.slug), false);
    assert.equal(deleted.body.draft.products.some((product: { slug: string }) => product.slug === newProduct.slug), true);
    assert.equal(deleted.body.draft.homepage.featured.productSlugs.includes(firstProduct.slug), false);
    assert.equal(deleted.body.draft.site.megaMenu[0].href, "/shop");
    assert.deepEqual(deleted.body.draft.products[1].relatedProductSlugs, []);
    assert.equal(deleted.body.published.products.some((product: { slug: string }) => product.slug === firstProduct.slug), true);
    assert.equal(deleted.body.published.site.megaMenu[0].href, `/product/${firstProduct.slug}`);
    const staleDelete = await request(running.baseUrl, productUrl, token, {
      method: "DELETE", body: { expectedDraftUpdatedAt: moved.body.draftUpdatedAt },
    });
    assert.equal(staleDelete.status, 409);

    // Simulate an insert failure after the draft row update: the transaction
    // must roll back the row as well as its revision and audit.
    await db.execute(sql.raw(`CREATE FUNCTION fail_scoped_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced revision failure'; END $$`));
    await db.execute(sql.raw(`CREATE TRIGGER fail_scoped_revision_trigger BEFORE INSERT ON soso_site_content_revisions FOR EACH ROW EXECUTE FUNCTION fail_scoped_revision()`));
    const failedProduct = { ...firstProduct, name: "Should never persist" };
    const response = await fetch(`${running.baseUrl}${productUrl}`, {
      method: "PUT",
      headers: { cookie: `soso_staff_session=${token}`, origin: running.baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ expectedDraftUpdatedAt: deleted.body.draftUpdatedAt, product: failedProduct }),
    });
    assert.equal(response.status, 500);
    await db.execute(sql.raw("DROP TRIGGER fail_scoped_revision_trigger ON soso_site_content_revisions"));
    await db.execute(sql.raw("DROP FUNCTION fail_scoped_revision()"));
    const after = await request(running.baseUrl, "/api/staff/content/platform", token);
    assert.equal(after.body.draftUpdatedAt, deleted.body.draftUpdatedAt);
    assert.equal(after.body.draft.products.some((product: { slug: string }) => product.slug === firstProduct.slug), false);
    assert.equal(after.body.published.products.some((product: { slug: string }) => product.slug === firstProduct.slug), true);
    assert.equal(after.body.draft.interfaceCopy.navigation.shopAllLabel, "Browse every piece");
    const revisions = await db.select().from(siteContentRevisionsTable)
      .where(and(eq(siteContentRevisionsTable.contentKey, "platform"), eq(siteContentRevisionsTable.createdByClerkUserId, clerkUserId)));
    assert.equal(revisions.length, 5);
    const audits = await db.select().from(auditLogsTable).where(eq(auditLogsTable.actorClerkUserId, clerkUserId));
    assert.equal(audits.filter((audit) => audit.action === "platform_content.draft_saved").length, 5);
  } finally {
    await db.execute(sql.raw("DROP TRIGGER IF EXISTS fail_scoped_revision_trigger ON soso_site_content_revisions"));
    await db.execute(sql.raw("DROP FUNCTION IF EXISTS fail_scoped_revision()"));
    if (server) { server.close(); await once(server, "close"); }
    if (staffUserId) await db.delete(staffUsersTable).where(eq(staffUsersTable.id, staffUserId));
    await db.delete(auditLogsTable).where(eq(auditLogsTable.actorClerkUserId, clerkUserId));
    await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
    if (originalRows[0]) await db.insert(siteContentTable).values(originalRows[0]);
  }
});

test("Staff can publish only a complete browse-only product while preserving unrelated catalogue and checkout state", async () => {
  const originalRows = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform"));
  const token = randomBytes(32).toString("hex");
  const clerkUserId = `product-publish-check-${randomBytes(8).toString("hex")}`;
  const journalSlug = `product-removal-reference-${randomBytes(4).toString("hex")}`;
  let server: Server | undefined;
  let staffUserId: string | undefined;
  try {
    const [staff] = await db.insert(staffUsersTable).values({
      clerkUserId, email: `${clerkUserId}@example.com`, role: "owner", isActive: true,
    }).returning({ id: staffUsersTable.id });
    staffUserId = staff!.id;
    await db.insert(staffSessionsTable).values({
      staffUserId, tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const published = publishableContent();
    const draft = structuredClone(published);
    draft.products[0]!.fulfilmentState = "made_immediately";
    draft.products[0]!.unavailableMessage = undefined;
    const newProduct = { ...structuredClone(published.products[0]!), slug: "new-browse-only-test", name: "Browse-only test", releaseState: "placeholder" as const };
    draft.products.unshift(newProduct);
    const now = new Date();
    await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
    await db.insert(siteContentTable).values({
      key: "platform", draft, published, draftUpdatedAt: now, publishedAt: now,
      updatedByClerkUserId: clerkUserId, publishedByClerkUserId: clerkUserId,
    });
    const running = await listen();
    server = running.server;
    const url = `/api/staff/content/platform/products/${newProduct.slug}/publish`;
    const body = { expectedDraftUpdatedAt: now.toISOString(), expectedPublishedAt: now.toISOString() };

    const publishedProduct = await request(running.baseUrl, url, token, { method: "POST", body });
    assert.equal(publishedProduct.status, 200, JSON.stringify(publishedProduct.body));
    assert.equal(publishedProduct.body.published.products[0].slug, newProduct.slug);
    assert.deepEqual(publishedProduct.body.published.products.slice(1), JSON.parse(JSON.stringify(published.products)));
    assert.deepEqual(publishedProduct.body.published.homepage, JSON.parse(JSON.stringify(published.homepage)));
    assert.equal(publishedProduct.body.draft.products[1].fulfilmentState, "made_immediately");
    const available = await request(running.baseUrl, `/api/staff/content/platform/products/${draft.products[1]!.slug}/publish`, token, {
      method: "POST",
      body: { expectedDraftUpdatedAt: publishedProduct.body.draftUpdatedAt, expectedPublishedAt: publishedProduct.body.publishedAt },
    });
    assert.equal(available.status, 400);
    assert.match(available.body.error, /available products require full catalogue publication/i);
    const stale = await request(running.baseUrl, url, token, { method: "POST", body });
    assert.equal(stale.status, 409);

    const incomplete = structuredClone(publishedProduct.body.draft) as PlatformContent;
    incomplete.products[0]!.images[0]!.alt = "";
    const savedIncomplete = await request(running.baseUrl, "/api/staff/content/platform", token, {
      method: "PUT", body: { content: incomplete, expectedDraftUpdatedAt: publishedProduct.body.draftUpdatedAt },
    });
    assert.equal(savedIncomplete.status, 200, JSON.stringify(savedIncomplete.body));
    const rejected = await request(running.baseUrl, url, token, {
      method: "POST",
      body: { expectedDraftUpdatedAt: savedIncomplete.body.draftUpdatedAt, expectedPublishedAt: publishedProduct.body.publishedAt },
    });
    assert.equal(rejected.status, 400);
    assert.match(rejected.body.error, /images/i);
    assert.ok(rejected.body.issues.some((issue: { message: string }) => issue.message.includes(newProduct.slug)));
    const afterRejection = await request(running.baseUrl, "/api/staff/content/platform", token);
    assert.equal(afterRejection.body.publishedAt, publishedProduct.body.publishedAt);
    assert.equal(afterRejection.body.published.products[0].images[0].alt, newProduct.images[0]!.alt);

    const removalUrl = `/api/staff/content/platform/products/${newProduct.slug}/unpublish`;
    const stillInDraft = await request(running.baseUrl, removalUrl, token, {
      method: "POST",
      body: { expectedDraftUpdatedAt: savedIncomplete.body.draftUpdatedAt, expectedPublishedAt: publishedProduct.body.publishedAt },
    });
    assert.equal(stillInDraft.status, 400);
    assert.match(stillInDraft.body.error, /remove this product from the draft/i);

    const withoutProduct = structuredClone(savedIncomplete.body.draft) as PlatformContent;
    withoutProduct.products = withoutProduct.products.filter((item) => item.slug !== newProduct.slug);
    const savedRemoval = await request(running.baseUrl, "/api/staff/content/platform", token, {
      method: "PUT",
      body: { content: withoutProduct, expectedDraftUpdatedAt: savedIncomplete.body.draftUpdatedAt },
    });
    assert.equal(savedRemoval.status, 200, JSON.stringify(savedRemoval.body));

    await db.insert(journalPostsTable).values({
      slug: journalSlug, title: "Reference check", excerpt: "Reference check",
      body: `See [this product](/product/${newProduct.slug}) for details.`,
      authorName: "Staff", status: "published", publishedAt: new Date(),
    });
    const withJournalReference = await request(running.baseUrl, removalUrl, token, {
      method: "POST",
      body: { expectedDraftUpdatedAt: savedRemoval.body.draftUpdatedAt, expectedPublishedAt: savedRemoval.body.publishedAt },
    });
    assert.equal(withJournalReference.status, 400);
    assert.match(JSON.stringify(withJournalReference.body), new RegExp(journalSlug));
    await db.update(journalPostsTable).set({
      body: "Reference check", relatedProductSlugs: [newProduct.slug],
    }).where(eq(journalPostsTable.slug, journalSlug));
    const withRelatedProduct = await request(running.baseUrl, removalUrl, token, {
      method: "POST",
      body: { expectedDraftUpdatedAt: savedRemoval.body.draftUpdatedAt, expectedPublishedAt: savedRemoval.body.publishedAt },
    });
    assert.equal(withRelatedProduct.status, 400);
    assert.match(JSON.stringify(withRelatedProduct.body), new RegExp(journalSlug));
    await db.delete(journalPostsTable).where(eq(journalPostsTable.slug, journalSlug));

    const referencedPublic = structuredClone(savedRemoval.body.published) as PlatformContent;
    referencedPublic.site.megaMenu[0]!.href = `/product/${newProduct.slug}`;
    const referenceTimestamp = new Date(Date.parse(savedRemoval.body.publishedAt) + 1000);
    await db.update(siteContentTable).set({ published: referencedPublic, publishedAt: referenceTimestamp })
      .where(eq(siteContentTable.key, "platform"));
    const withStorefrontReference = await request(running.baseUrl, removalUrl, token, {
      method: "POST",
      body: { expectedDraftUpdatedAt: savedRemoval.body.draftUpdatedAt, expectedPublishedAt: referenceTimestamp.toISOString() },
    });
    assert.equal(withStorefrontReference.status, 400);
    assert.match(JSON.stringify(withStorefrontReference.body), /site\.megaMenu\[0\]\.href/);

    const clearedTimestamp = new Date(referenceTimestamp.getTime() + 1000);
    await db.update(siteContentTable).set({ published: savedRemoval.body.published, publishedAt: clearedTimestamp })
      .where(eq(siteContentTable.key, "platform"));
    const availablePublic = structuredClone(savedRemoval.body.published) as PlatformContent;
    availablePublic.products[0]!.fulfilmentState = "made_immediately";
    availablePublic.products[0]!.releaseState = "approved";
    availablePublic.products[0]!.unavailableMessage = undefined;
    const availableTimestamp = new Date(clearedTimestamp.getTime() + 1000);
    await db.update(siteContentTable).set({ published: availablePublic, publishedAt: availableTimestamp })
      .where(eq(siteContentTable.key, "platform"));
    const availableRemoval = await request(running.baseUrl, removalUrl, token, {
      method: "POST",
      body: { expectedDraftUpdatedAt: savedRemoval.body.draftUpdatedAt, expectedPublishedAt: availableTimestamp.toISOString() },
    });
    assert.equal(availableRemoval.status, 400);
    assert.match(availableRemoval.body.error, /only unavailable products/i);
    const restoredTimestamp = new Date(availableTimestamp.getTime() + 1000);
    await db.update(siteContentTable).set({ published: savedRemoval.body.published, publishedAt: restoredTimestamp })
      .where(eq(siteContentTable.key, "platform"));
    const removedPublic = await request(running.baseUrl, removalUrl, token, {
      method: "POST",
      body: { expectedDraftUpdatedAt: savedRemoval.body.draftUpdatedAt, expectedPublishedAt: restoredTimestamp.toISOString() },
    });
    assert.equal(removedPublic.status, 200, JSON.stringify(removedPublic.body));
    assert.deepEqual(removedPublic.body.published.products, JSON.parse(JSON.stringify(published.products)));
    assert.deepEqual(removedPublic.body.published.homepage, JSON.parse(JSON.stringify(published.homepage)));
    assert.deepEqual(removedPublic.body.draft, savedRemoval.body.draft);
    const staleRemoval = await request(running.baseUrl, removalUrl, token, {
      method: "POST",
      body: { expectedDraftUpdatedAt: savedRemoval.body.draftUpdatedAt, expectedPublishedAt: restoredTimestamp.toISOString() },
    });
    assert.equal(staleRemoval.status, 409);
    const invalidJournal = await request(running.baseUrl, "/api/staff/journal", token, {
      method: "POST",
      body: {
        slug: journalSlug, title: "Link to a removed product", excerpt: "Check the related product link",
        body: `The catalogue link in this article points to a product that was removed: [browse now](/product/${newProduct.slug}). This article should not be published until the destination is restored.`,
        authorName: "SOSO Staff", status: "published", relatedProductSlugs: [newProduct.slug],
      },
    });
    assert.equal(invalidJournal.status, 400);
    assert.match(invalidJournal.body.error, /published products/i);
    const removalAudits = await db.select({ action: auditLogsTable.action }).from(auditLogsTable)
      .where(eq(auditLogsTable.actorClerkUserId, clerkUserId));
    assert.equal(removalAudits.filter(({ action }) => action === "platform_content.product_unpublished").length, 1);
  } finally {
    if (server) { server.close(); await once(server, "close"); }
    await db.delete(journalPostsTable).where(eq(journalPostsTable.slug, journalSlug));
    if (staffUserId) await db.delete(staffUsersTable).where(eq(staffUsersTable.id, staffUserId));
    await db.delete(auditLogsTable).where(eq(auditLogsTable.actorClerkUserId, clerkUserId));
    await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
    if (originalRows[0]) await db.insert(siteContentTable).values(originalRows[0]);
  }
});

test("staff collection cover upload, persistence, publishing, replacement and removal work through the API", async () => {
  const originalFetch = globalThis.fetch;
  const originalCloudinaryEnv = new Map([
    ["CLOUDINARY_CLOUD_NAME", process.env.CLOUDINARY_CLOUD_NAME],
    ["CLOUDINARY_API_KEY", process.env.CLOUDINARY_API_KEY],
    ["CLOUDINARY_API_SECRET", process.env.CLOUDINARY_API_SECRET],
  ]);
  const originalPlatformRows = await db.select().from(siteContentTable)
    .where(eq(siteContentTable.key, "platform"));
  process.env.CLOUDINARY_CLOUD_NAME = "cleanup-regression-test";
  process.env.CLOUDINARY_API_KEY = "cleanup-regression-key";
  process.env.CLOUDINARY_API_SECRET = "cleanup-regression-secret";
  const token = randomBytes(32).toString("hex");
  const clerkUserId = `collection-cover-check-${randomBytes(8).toString("hex")}`;
  let staffUserId: string | undefined;
  let server: Server | undefined;
  let currentUpload = pngBytes(180);
  const deletedUploads: string[] = [];
  let stalledCleanupPublicId: string | undefined;
  const stalledCleanupAttempts: string[] = [];
  let releaseStalledCleanup: (() => void) | undefined;
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
      if (body instanceof FormData) {
        const publicId = String(body.get("public_id"));
        if (publicId === stalledCleanupPublicId) {
          stalledCleanupAttempts.push(publicId);
          return new Promise<Response>((resolve) => {
            releaseStalledCleanup = () => resolve(Response.json({ result: "ok" }));
          });
        }
        deletedUploads.push(publicId);
      }
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
    const requestWithCleanupTimeout = async (
      path: string,
      options: { method: string; body: unknown },
    ): Promise<ApiResponse> => {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 5_000);
      try {
        return await request(running.baseUrl, path, token, { ...options, signal: abort.signal });
      } finally {
        clearTimeout(timeout);
      }
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
    const replaced = await request(running.baseUrl, "/api/staff/content/platform/sections/collections", token, {
      method: "PATCH",
      body: { value: replacementContent.collections, expectedDraftUpdatedAt: published.body.draftUpdatedAt },
    });
    assert.equal(replaced.status, 200);
    const replacementReload = await request(running.baseUrl, "/api/staff/content/platform", token);
    assert.equal(replacementReload.body.draft.collections[0].cover.src, replacementPath);
    assert.notEqual(replacementPath, firstPath);
    assert.deepEqual(deletedUploads, []);

    const removedContent = structuredClone(replacementReload.body.draft) as PlatformContent;
    removedContent.collections[0]!.showCover = false;
    delete removedContent.collections[0]!.cover;
    const rejectedRemoval = await request(running.baseUrl, "/api/staff/content/platform/sections/collections", token, {
      method: "PATCH",
      body: { value: removedContent.collections, expectedDraftUpdatedAt: published.body.draftUpdatedAt },
    });
    assert.equal(rejectedRemoval.status, 409);
    assert.deepEqual(deletedUploads, []);

    const removed = await request(running.baseUrl, "/api/staff/content/platform/sections/collections", token, {
      method: "PATCH",
      body: { value: removedContent.collections, expectedDraftUpdatedAt: replacementReload.body.draftUpdatedAt },
    });
    assert.equal(removed.status, 200);
    const removalReload = await request(running.baseUrl, "/api/staff/content/platform", token);
    assert.equal(removalReload.body.draft.collections[0].showCover, false);
    assert.equal(removalReload.body.draft.collections[0].cover, undefined);
    const replacementRelativePath = replacementPath.slice("/api/storage/objects/".length);
    const queuedReplacementCleanup = await request(
      running.baseUrl,
      "/api/storage/uploads/cleanup-pending",
      token,
    );
    assert.equal(queuedReplacementCleanup.status, 200);
    assert.ok(queuedReplacementCleanup.body.some((item: { path: string; status: string }) =>
      item.path === replacementRelativePath && item.status === "queued"));
    assert.deepEqual(deletedUploads, []);
    const retriedReplacementCleanup = await request(
      running.baseUrl,
      "/api/storage/uploads/cleanup-pending",
      token,
      { method: "POST" },
    );
    assert.equal(retriedReplacementCleanup.status, 200);
    assert.deepEqual(deletedUploads, [
      `soso-store/${replacementRelativePath.replace(/\.[^.]+$/, "")}`,
    ]);

    const firstPublicId = `soso-store/${firstPath.slice("/api/storage/objects/".length).replace(/\.[^.]+$/, "")}`;
    stalledCleanupPublicId = firstPublicId;
    const publishAbort = new AbortController();
    const publishTimeout = setTimeout(() => publishAbort.abort(), 2_000);
    let removalPublished: ApiResponse;
    try {
      removalPublished = await request(
        running.baseUrl,
        "/api/staff/content/platform/publish",
        token,
        { method: "POST", body: { expectedDraftUpdatedAt: removed.body.draftUpdatedAt }, signal: publishAbort.signal },
      );
    } finally {
      clearTimeout(publishTimeout);
    }
    assert.equal(removalPublished.status, 200);
    assert.deepEqual(stalledCleanupAttempts, []);

    const scopedCover = structuredClone(removalPublished.body.draft) as PlatformContent;
    scopedCover.collections[0]!.showCover = true;
    scopedCover.collections[0]!.cover = { ...firstContent.collections[0]!.cover!, src: firstPath };
    const scopedCoverSave = await requestWithCleanupTimeout(
      "/api/staff/content/platform/sections/collections",
      {
        method: "PATCH",
        body: { value: scopedCover.collections, expectedDraftUpdatedAt: removalPublished.body.draftUpdatedAt },
      },
    );
    assert.equal(scopedCoverSave.status, 200);
    const scopedCoverRemoval = structuredClone(scopedCoverSave.body.draft) as PlatformContent;
    scopedCoverRemoval.collections[0]!.showCover = false;
    delete scopedCoverRemoval.collections[0]!.cover;
    const scopedRemovalSave = await requestWithCleanupTimeout(
      "/api/staff/content/platform/sections/collections",
      {
        method: "PATCH",
        body: { value: scopedCoverRemoval.collections, expectedDraftUpdatedAt: scopedCoverSave.body.draftUpdatedAt },
      },
    );
    assert.equal(scopedRemovalSave.status, 200);
    assert.deepEqual(stalledCleanupAttempts, []);

    const fullCover = structuredClone(scopedRemovalSave.body.draft) as PlatformContent;
    fullCover.collections[0]!.showCover = true;
    fullCover.collections[0]!.cover = { ...firstContent.collections[0]!.cover!, src: firstPath };
    const fullCoverSave = await requestWithCleanupTimeout(
      "/api/staff/content/platform",
      {
        method: "PUT",
        body: { content: fullCover, expectedDraftUpdatedAt: scopedRemovalSave.body.draftUpdatedAt },
      },
    );
    assert.equal(fullCoverSave.status, 200);
    const fullCoverRemoval = structuredClone(fullCoverSave.body.draft) as PlatformContent;
    fullCoverRemoval.collections[0]!.showCover = false;
    delete fullCoverRemoval.collections[0]!.cover;
    const fullRemovalSave = await requestWithCleanupTimeout(
      "/api/staff/content/platform",
      {
        method: "PUT",
        body: { content: fullCoverRemoval, expectedDraftUpdatedAt: fullCoverSave.body.draftUpdatedAt },
      },
    );
    assert.equal(fullRemovalSave.status, 200);
    assert.deepEqual(stalledCleanupAttempts, []);

    const pendingCleanup = await request(running.baseUrl, "/api/storage/uploads/cleanup-pending", token);
    assert.equal(pendingCleanup.status, 200);
    assert.ok(pendingCleanup.body.some((item: { path: string }) => item.path === firstPath.slice("/api/storage/objects/".length)));
    stalledCleanupPublicId = undefined;
    const retriedCleanup = await request(running.baseUrl, "/api/storage/uploads/cleanup-pending", token, { method: "POST" });
    assert.equal(retriedCleanup.status, 200);
    assert.deepEqual(new Set(deletedUploads), new Set([
      firstPublicId,
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
    const reuseContent = structuredClone(fullRemovalSave.body.draft) as PlatformContent;
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
      body: { content: reuseContent, expectedDraftUpdatedAt: fullRemovalSave.body.draftUpdatedAt },
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
    releaseStalledCleanup?.();
    globalThis.fetch = originalFetch;
    for (const [key, value] of originalCloudinaryEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
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

test("business approval is stale after a saved product edit and cannot be forged through platform PUT", async () => {
  const originalPlatformRows = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform"));
  const originalApprovalRows = await db.select().from(siteContentTable)
    .where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY));
  const token = randomBytes(32).toString("hex");
  const clerkUserId = `catalogue-approval-check-${randomBytes(8).toString("hex")}`;
  let staffUserId: string | undefined;
  let server: Server | undefined;
  try {
    const [staff] = await db.insert(staffUsersTable).values({
      clerkUserId, email: `${clerkUserId}@example.com`, role: "owner", isActive: true,
    }).returning({ id: staffUsersTable.id });
    staffUserId = staff!.id;
    await db.insert(staffSessionsTable).values({
      staffUserId, tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const draft = publishableContent();
    const product = draft.products[0]!;
    const now = new Date();
    await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
    await db.delete(siteContentTable).where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY));
    await db.insert(siteContentTable).values({
      key: "platform", draft, published: draft, draftUpdatedAt: now, publishedAt: now,
      updatedByClerkUserId: clerkUserId,
    });
    const fingerprint = productBusinessFingerprint(product);
    const seededLedger = {
      version: 1,
      approvals: {
        [product.slug]: {
          fingerprint, actorClerkUserId: clerkUserId, approvedAt: now.toISOString(),
        },
      },
    };
    await db.insert(siteContentTable).values({
      key: CATALOGUE_BUSINESS_APPROVALS_KEY, draft: seededLedger, published: {},
      draftUpdatedAt: now, updatedByClerkUserId: clerkUserId,
    });
    assert.deepEqual([...validBusinessApprovalSlugs(draft, seededLedger)], [product.slug]);

    const running = await listen();
    server = running.server;
    const edited = structuredClone(draft);
    edited.products[0]!.name = "Edited after business approval";
    const saved = await request(running.baseUrl, "/api/staff/content/platform", token, {
      method: "PUT", body: { content: edited, expectedDraftUpdatedAt: now.toISOString() },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body).slice(0, 400));
    assert.deepEqual([...validBusinessApprovalSlugs(saved.body.draft, seededLedger)], []);

    const forged = structuredClone(saved.body.draft) as PlatformContent;
    (forged.products[0] as unknown as Record<string, unknown>).businessApproval = {
      approved: true, actorClerkUserId: clerkUserId, approvedAt: now.toISOString(),
    };
    const rejectedForge = await request(running.baseUrl, "/api/staff/content/platform", token, {
      method: "PUT", body: { content: forged, expectedDraftUpdatedAt: saved.body.draftUpdatedAt },
    });
    assert.equal(rejectedForge.status, 400);
    const [storedLedger] = await db.select({ draft: siteContentTable.draft }).from(siteContentTable)
      .where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY));
    assert.deepEqual(storedLedger?.draft, seededLedger);
  } finally {
    if (server) { server.close(); await once(server, "close"); }
    if (staffUserId) await db.delete(staffUsersTable).where(eq(staffUsersTable.id, staffUserId));
    await db.delete(auditLogsTable).where(eq(auditLogsTable.actorClerkUserId, clerkUserId));
    await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
    if (originalPlatformRows[0]) await db.insert(siteContentTable).values(originalPlatformRows[0]);
    await db.delete(siteContentTable).where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY));
    if (originalApprovalRows[0]) await db.insert(siteContentTable).values(originalApprovalRows[0]);
  }
});

test("owner business approval persists against a mapped saved snapshot and becomes stale after an edit", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = new Map([
    ["JUSTICESURE_COMMERCE_API_BASE_URL", process.env.JUSTICESURE_COMMERCE_API_BASE_URL],
    ["JUSTICESURE_COMMERCE_BASE_URL", process.env.JUSTICESURE_COMMERCE_BASE_URL],
    ["JUSTICESURE_COMMERCE_TEST_API_KEY", process.env.JUSTICESURE_COMMERCE_TEST_API_KEY],
  ]);
  const originalPlatformRows = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform"));
  const originalApprovalRows = await db.select().from(siteContentTable)
    .where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY));
  process.env.JUSTICESURE_COMMERCE_API_BASE_URL = "https://commerce.test.invalid";
  process.env.JUSTICESURE_COMMERCE_BASE_URL = "https://commerce.test.invalid";
  process.env.JUSTICESURE_COMMERCE_TEST_API_KEY = "jsk_test_catalogue_approval";
  const clerkUserId = `catalogue-approval-owner-${randomBytes(8).toString("hex")}`;
  const token = randomBytes(32).toString("hex");
  const parentId = randomUUID();
  const variantIds = new Map<string, string>();
  const draft = publishableContent();
  const product = draft.products[0]!;
  const choiceSizes = [
    ...(product.standardEligible ? product.standardSizes : []),
    ...(product.customEligible ? ["Custom"] : []),
  ];
  const variants = choiceSizes.map((size) => {
    const id = randomUUID();
    variantIds.set(size, id);
    return {
      id, name: size, attributes: { size }, price: { amountKobo: product.price * 100 },
      availability: { inStock: true },
    };
  });
  const catalogueProduct = {
    id: parentId, name: product.name, description: null, images: [],
    price: { currency: "NGN", amountKobo: product.price * 100 },
    availability: { inStock: true }, variants,
  };
  globalThis.fetch = async (input, init): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("http://127.0.0.1:")) return originalFetch(input, init);
    if (url.startsWith("https://commerce.test.invalid/products")) {
      return Response.json({ data: [catalogueProduct] });
    }
    return new Response(null, { status: 404 });
  };
  let staffUserId: string | undefined;
  let server: Server | undefined;
  try {
    const [staff] = await db.insert(staffUsersTable).values({
      clerkUserId, email: `${clerkUserId}@example.com`, role: "owner", isActive: true,
    }).returning({ id: staffUsersTable.id });
    staffUserId = staff!.id;
    await db.insert(staffSessionsTable).values({
      staffUserId, tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
    });
    product.commerceProductId = parentId;
    const now = new Date();
    await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
    await db.delete(siteContentTable).where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY));
    await db.insert(siteContentTable).values({
      key: "platform", draft, published: draft, draftUpdatedAt: now, publishedAt: now,
      updatedByClerkUserId: clerkUserId,
    });
    const running = await listen();
    server = running.server;
    const preview = await request(running.baseUrl, "/api/staff/commerce/catalogue-mapping/preview", token, {
      method: "POST",
      body: { products: [{
        slug: product.slug, name: product.name, price: product.price,
        standardEligible: product.standardEligible, customEligible: product.customEligible,
        standardSizes: product.standardSizes, fulfilmentState: product.fulfilmentState,
        commerceProductId: parentId,
      }] },
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const suggestion = preview.body.suggestions[0];
    product.commerceVariantIds = Object.fromEntries(Object.keys(suggestion.variantIds).map((key) => [
      key, variantIds.get(key)!,
    ]));
    product.commerceMappingConfirmation = {
      productHash: suggestion.productHash,
      localHash: suggestion.localHash,
      snapshotHash: preview.body.snapshotHash,
      snapshotFetchedAt: preview.body.fetchedAt,
      confirmedAt: now.toISOString(),
      confidence: suggestion.confidence,
      source: "manual",
      evidence: suggestion.evidence,
      choiceLabels: suggestion.choiceLabels,
    };
    const saved = await request(running.baseUrl, "/api/staff/content/platform", token, {
      method: "PUT", body: { content: draft, expectedDraftUpdatedAt: now.toISOString() },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body).slice(0, 500));
    const mismatchedSelection = await request(
      running.baseUrl,
      "/api/staff/content/platform/catalogue/publish-confirmed",
      token,
      {
        method: "POST",
        body: {
          slugs: [draft.products[1]!.slug],
          expectedDraftUpdatedAt: saved.body.draftUpdatedAt,
          expectedPublishedAt: saved.body.publishedAt,
        },
      },
    );
    assert.equal(mismatchedSelection.status, 400);
    assert.match(mismatchedSelection.body.error, /every saved confirmed non-accessory product exactly once/i);
    const approved = await request(running.baseUrl, "/api/staff/content/platform/catalogue/approve", token, {
      method: "POST",
      body: { slugs: [product.slug], expectedDraftUpdatedAt: saved.body.draftUpdatedAt, acknowledged: true },
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.deepEqual(approved.body.approvedSlugs, [product.slug]);
    const readiness = await request(running.baseUrl, "/api/staff/content/platform/catalogue/readiness", token);
    assert.equal(readiness.status, 200, JSON.stringify(readiness.body).slice(0, 500));
    assert.equal(readiness.body.products.find((item: { slug: string }) => item.slug === product.slug).approved, true);

    const changed = structuredClone(saved.body.draft) as PlatformContent;
    changed.products[0]!.name = `${changed.products[0]!.name} revised`;
    const edited = await request(running.baseUrl, "/api/staff/content/platform", token, {
      method: "PUT", body: { content: changed, expectedDraftUpdatedAt: saved.body.draftUpdatedAt },
    });
    assert.equal(edited.status, 200);
    const staleReadiness = await request(running.baseUrl, "/api/staff/content/platform/catalogue/readiness", token);
    assert.equal(staleReadiness.status, 200);
    assert.equal(staleReadiness.body.products.find((item: { slug: string }) => item.slug === product.slug).approved, false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (server) { server.close(); await once(server, "close"); }
    if (staffUserId) await db.delete(staffUsersTable).where(eq(staffUsersTable.id, staffUserId));
    await db.delete(auditLogsTable).where(eq(auditLogsTable.actorClerkUserId, clerkUserId));
    await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
    if (originalPlatformRows[0]) await db.insert(siteContentTable).values(originalPlatformRows[0]);
    await db.delete(siteContentTable).where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY));
    if (originalApprovalRows[0]) await db.insert(siteContentTable).values(originalApprovalRows[0]);
  }
});

test("availability control blocks upstream stock failures and confirms only the selected product on activation", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = new Map([
    ["JUSTICESURE_COMMERCE_API_BASE_URL", process.env.JUSTICESURE_COMMERCE_API_BASE_URL],
    ["JUSTICESURE_COMMERCE_BASE_URL", process.env.JUSTICESURE_COMMERCE_BASE_URL],
    ["JUSTICESURE_COMMERCE_TEST_API_KEY", process.env.JUSTICESURE_COMMERCE_TEST_API_KEY],
  ]);
  const originalPlatformRows = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform"));
  process.env.JUSTICESURE_COMMERCE_API_BASE_URL = "https://commerce.test.invalid";
  process.env.JUSTICESURE_COMMERCE_BASE_URL = "https://commerce.test.invalid";
  process.env.JUSTICESURE_COMMERCE_TEST_API_KEY = "jsk_test_catalogue_availability";
  const clerkUserId = `catalogue-availability-owner-${randomBytes(8).toString("hex")}`;
  const token = randomBytes(32).toString("hex");
  const parentId = randomUUID();
  let providerInStock = false;
  let catalogueFetches = 0;
  const draft = publishableContent();
  const product = draft.products[0]!;
  const otherProductsBefore = JSON.parse(JSON.stringify(draft.products.slice(1)));
  const variants = [
    ...(product.standardEligible ? product.standardSizes : []),
    ...(product.customEligible ? ["Custom"] : []),
  ].map((size) => ({
    id: randomUUID(),
    name: size,
    attributes: { size },
    price: { amountKobo: product.price * 100 },
    availability: { inStock: true },
  }));
  const variantIds = Object.fromEntries(variants.map((variant) => [
    String(variant.attributes.size),
    variant.id,
  ]));
  product.commerceProductId = parentId;
  product.commerceVariantIds = variantIds;
  const catalogueProduct = {
    id: parentId,
    name: product.name,
    description: null,
    images: [],
    price: { currency: "NGN", amountKobo: product.price * 100 },
    get availability() { return { inStock: providerInStock }; },
    variants,
  };
  globalThis.fetch = async (input, init): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("http://127.0.0.1:")) return originalFetch(input, init);
    if (url.startsWith("https://commerce.test.invalid/products")) {
      catalogueFetches += 1;
      return Response.json({ data: [catalogueProduct] });
    }
    return new Response(null, { status: 404 });
  };
  let staffUserId: string | undefined;
  let server: Server | undefined;
  try {
    const [staff] = await db.insert(staffUsersTable).values({
      clerkUserId, email: `${clerkUserId}@example.com`, role: "owner", isActive: true,
    }).returning({ id: staffUsersTable.id });
    staffUserId = staff!.id;
    await db.insert(staffSessionsTable).values({
      staffUserId, tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const now = new Date();
    await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
    await db.insert(siteContentTable).values({
      key: "platform", draft, published: draft, draftUpdatedAt: now, publishedAt: now,
      updatedByClerkUserId: clerkUserId,
    });
    const running = await listen();
    server = running.server;
    const path = `/api/staff/content/platform/products/${product.slug}/availability`;
    const readiness = await request(running.baseUrl, "/api/staff/content/platform/catalogue/readiness", token);
    assert.equal(readiness.status, 200);
    const availability = readiness.body.products.find((entry: { slug: string }) => entry.slug === product.slug).availability;
    assert.equal(availability.localState, "unavailable");
    assert.equal(availability.providerStock, "out_of_stock");
    assert.equal(availability.canMakeAvailable, false);
    assert.ok(availability.reasons.some((reason: string) => reason.includes("Local fulfilment is unavailable")));
    assert.ok(availability.reasons.some((reason: string) => reason.includes(`JusticeSure product ${parentId} is out of stock`)));
    assert.equal(catalogueFetches, 1);
    const body = {
      expectedDraftUpdatedAt: now.toISOString(),
      fulfilmentState: "made_immediately",
      acknowledged: true,
    };
    const blocked = await request(running.baseUrl, path, token, { method: "POST", body });
    assert.equal(blocked.status, 400, JSON.stringify(blocked.body));
    assert.ok(blocked.body.issues.some((issue: string) => issue.includes(`JusticeSure product ${parentId} is out of stock`)));
    const [unchanged] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform"));
    assert.equal((unchanged!.draft as PlatformContent).products[0]!.fulfilmentState, "unavailable");
    assert.equal(unchanged!.draftUpdatedAt!.toISOString(), now.toISOString());

    providerInStock = true;
    const activated = await request(running.baseUrl, path, token, { method: "POST", body });
    assert.equal(activated.status, 200, JSON.stringify(activated.body).slice(0, 1000));
    const saved = activated.body.draft as PlatformContent;
    assert.equal(saved.products[0]!.fulfilmentState, "made_immediately");
    assert.equal(saved.products[0]!.unavailableMessage, undefined);
    assert.equal(saved.products[0]!.commerceMappingConfirmation?.confidence! >= 95, true);
    assert.equal(saved.products[0]!.commerceMappingConfirmation?.localHash.length, 64);
    assert.deepEqual(saved.products.slice(1), otherProductsBefore);
    assert.notEqual(activated.body.draftUpdatedAt, now.toISOString());
    const revisions = await db.select().from(siteContentRevisionsTable)
      .where(eq(siteContentRevisionsTable.createdByClerkUserId, clerkUserId));
    assert.equal(revisions.length, 1);
    const audits = await db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.actorClerkUserId, clerkUserId));
    assert.ok(audits.some((audit) => audit.action === "platform_content.product_availability_changed"));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (server) { server.close(); await once(server, "close"); }
    if (staffUserId) await db.delete(staffUsersTable).where(eq(staffUsersTable.id, staffUserId));
    await db.delete(auditLogsTable).where(eq(auditLogsTable.actorClerkUserId, clerkUserId));
    await db.delete(siteContentRevisionsTable).where(eq(siteContentRevisionsTable.createdByClerkUserId, clerkUserId));
    await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
    if (originalPlatformRows[0]) await db.insert(siteContentTable).values(originalPlatformRows[0]);
  }
});

test("confirmed publication candidate prunes only omitted mega-menu product placements for an exact 42-product set", () => {
  const published = publishableContent();
  const publishedMen = published.site.megaMenu.find((group) => group.id === "men")!;
  publishedMen.featuredProductSlugs = ["sovereign-agbada", "varen"];
  published.site.megaMenu.find((group) => group.id === "accessories")!.visible = true;
  const selected = published.products.filter((product) =>
    product.department !== "accessories" && product.slug !== "varen");
  while (selected.length < 42) {
    const template = selected[0]!;
    selected.push({
      ...structuredClone(template),
      slug: `confirmed-catalogue-test-${selected.length}`,
      name: `Confirmed catalogue test ${selected.length}`,
    });
  }
  if (selected.length > 42) selected.length = 42;
  const { candidate, prunedReferences } = buildConfirmedCatalogueCandidate(published, selected);
  assert.equal(candidate.products.length, 42);
  assert.ok(prunedReferences.some((reference) =>
    reference === "site.megaMenu[men].featuredProductSlugs removed omitted product varen"));
  assert.ok(prunedReferences.some((reference) =>
    reference === "site.megaMenu[accessories].featuredProductSlugs removed omitted product soso-bag-coming-soon"));
  assert.ok(prunedReferences.some((reference) =>
    reference === "site.megaMenu[accessories].featuredProductSlugs removed omitted product igbo-cap-coming-soon"));
  assert.ok(prunedReferences.some((reference) =>
    reference === "site.megaMenu[accessories].visible set false because the selected catalogue has no accessory products"));

  const originalMen = published.site.megaMenu.find((group) => group.id === "men")!;
  const candidateMen = candidate.site.megaMenu.find((group) => group.id === "men")!;
  assert.equal(candidateMen.label, originalMen.label);
  assert.equal(candidateMen.href, originalMen.href);
  assert.deepEqual(candidateMen.columns, originalMen.columns);
  assert.deepEqual(candidateMen.featuredProductSlugs, ["sovereign-agbada"]);
  assert.equal(candidate.site.announcement, published.site.announcement);
  assert.deepEqual(candidate.homepage, published.homepage);
  assert.deepEqual(candidate.productCopy, published.productCopy);
  for (const omitted of ["varen", "soso-bag-coming-soon", "igbo-cap-coming-soon"]) {
    assert.ok(!platformProductReferences(candidate, omitted).some((path) => path.startsWith("site.megaMenu[")));
  }
});