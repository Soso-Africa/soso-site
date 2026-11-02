import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  db, siteContentTable, siteContentRevisionsTable, staffUsersTable, staffSessionsTable, auditLogsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import app from "../app";
import { DEFAULT_PLATFORM_CONTENT, PlatformContentSchema, type PlatformContent } from "../lib/platform-content";
import { productCandidate, productReferenceChecks, productFromDocument, productVersionProjection, productEditorProjection } from "../lib/product-editor-transport";
import { PLATFORM_CONTENT_MEDIA_LOCK } from "../lib/collection-cover-cleanup";

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
function fixture(extra: number): PlatformContent {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  content.products.forEach((p) => {
    p.fulfilmentState = "unavailable";
    p.readyNowSizes = [];
    p.unavailableMessage = "Synthetic draft";
    delete p.commerceProductId;
    delete p.commerceVariantIds;
    delete p.commerceMappingConfirmation;
  });
  content.site.megaMenu.forEach((g) => { g.visible = false; });
  content.homepage.categories.items.forEach((tile) => { tile.active = false; });
  if (content.homepage.hero.campaignCta) content.homepage.hero.campaignCta.enabled = false;
  const template = content.products[0]!;
  content.products.push(...Array.from({ length: extra }, (_, i) => ({
    ...structuredClone(template), slug: `synthetic-piece-${i.toString().padStart(4, "0")}`,
    name: `Synthetic ${i}`, description: "x".repeat(9000),
  })));
  return JSON.parse(JSON.stringify(PlatformContentSchema.parse(content))) as PlatformContent;
}

test("product editor uses bounded database results, enforces conflicts and leaves published content and other edits alone", async () => {
  // This test must run through the isolated-schema runner (never a live database).
  const guard = await db.execute(sql`select to_regclass('import_verification_guard') as guard`);
  assert.ok(guard.rows[0]?.guard, "Use run-in-isolated-soso-schema.mjs");
  const token = randomBytes(32).toString("hex");
  const actor = `synthetic-product-${randomBytes(8).toString("hex")}`;
  const [staff] = await db.insert(staffUsersTable).values({
    clerkUserId: actor, email: `${actor}@example.com`, role: "editor", isActive: true,
  }).returning();
  await db.insert(staffSessionsTable).values({
    staffUserId: staff!.id, tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 600_000),
  });
  const server = app.listen(0);
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = async (path: string, body?: unknown, cookie = token) => {
    const response = await fetch(`${base}/api/staff/content/platform${path}`, {
      method: body ? "PUT" : "GET",
      headers: { cookie: `soso_staff_session=${cookie}`, origin: base, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    return { status: response.status, body: text.startsWith("{") ? JSON.parse(text) : { error: text.slice(0, 400) } };
  };
  try {
    const measurements: Record<string, number>[] = [];
    for (const count of [5, 400]) {
      const content = fixture(count);
      const now = new Date();
      await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
      await db.insert(siteContentTable).values({
        key: "platform", draft: content, published: content, draftUpdatedAt: now, publishedAt: now,
      });
      const selected = content.products[0]!;
      const path = `/products/${selected.slug}/editor`;
      assert.equal((await request(path, undefined, "")).status, 401);
      const index = await request("/product-index?limit=2");
      assert.equal(index.status, 200);
      assert.equal(index.body.items.length, 2);
      assert.ok(index.body.nextCursor);
      const page = await request(`/product-index?limit=2&after=${index.body.nextCursor}`);
      assert.ok(!page.body.items.some((p: { slug: string }) => index.body.items.some((old: { slug: string }) => old.slug === p.slug)));
      assert.equal((await request("/product-index?limit=9999")).status, 400);
      assert.equal((await request("/product-index?q=not-a-real-product")).body.items.length, 0);
      const read = await request(path);
      assert.equal(read.status, 200);
      assert.deepEqual(read.body.product, selected);
      assert.deepEqual(read.body.publishedProduct, selected);
      assert.equal(read.body.draft, undefined);

      const changed = { ...selected, name: "Only this item changed" };
      const [validation] = await db.select({
        checks: productReferenceChecks(productCandidate(selected.slug, changed), selected.slug),
      }).from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
      assert.ok(Object.values(validation!.checks as object).every(Boolean));
      const [readProjection] = await db.select({
        ...productVersionProjection,
        product: productFromDocument(sql`${siteContentTable.draft}`, selected.slug),
      }).from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
      const [editorProjection] = await db.select(productEditorProjection(selected.slug))
        .from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
      const [legacy] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
      measurements.push({
        products: content.products.length, legacyDatabaseBytes: bytes(legacy),
        productDatabaseBytes: bytes(readProjection), editorDatabaseBytes: bytes(editorProjection),
        validationDatabaseBytes: bytes(validation),
      });
      const saved = await request(path, { product: changed, expectedDraftUpdatedAt: read.body.draftUpdatedAt });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      assert.deepEqual(saved.body.product, changed);
      assert.equal(saved.body.draft, undefined);
      assert.equal(saved.body.published, undefined);
      assert.notEqual(saved.body.draftUpdatedAt, read.body.draftUpdatedAt);
      assert.equal((await request(path, { product: changed, expectedDraftUpdatedAt: read.body.draftUpdatedAt })).status, 409);
      const after = await request(path);
      assert.deepEqual(after.body.publishedProduct, selected);
      const [stored] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
      const expected = structuredClone(content);
      expected.products[0] = changed;
      assert.deepEqual(stored!.draft, expected);
      assert.deepEqual(stored!.published, content);
      const [revision] = await db.select().from(siteContentRevisionsTable)
        .where(and(eq(siteContentRevisionsTable.contentKey, "platform"), eq(siteContentRevisionsTable.createdByClerkUserId, actor))).limit(1);
      assert.deepEqual(revision!.snapshot, expected);
      assert.match(revision!.contentHash, /^[a-f0-9]{64}$/);

      const invalidCases = [
        { ...changed, slug: "renamed-slug" },
        { ...changed, category: "Unknown collection" },
        { ...changed, relatedProductSlugs: ["missing-product"] },
        { ...changed, relatedProductSlugs: [changed.slug] },
        { ...changed, images: [...changed.images, changed.images[0]] },
        { ...changed, price: -1 },
        { ...changed, img: "/images/soso/missing.png", images: [{
          src: "/images/soso/missing.png", alt: "Missing",
          provenance: { source: "Synthetic", rights: "Synthetic" },
        }] },
      ];
      for (const invalid of invalidCases) {
        const denied = await request(path, { product: invalid, expectedDraftUpdatedAt: saved.body.draftUpdatedAt });
        assert.equal(denied.status, 400, JSON.stringify(denied.body));
      }
      assert.equal((await request("/products/missing-product/editor")).status, 404);
      assert.equal((await request("/products/missing-product/editor", {
        product: { ...changed, slug: "missing-product" }, expectedDraftUpdatedAt: saved.body.draftUpdatedAt,
      })).status, 404);

      // Metadata/revision failure must roll back the product and global version.
      await db.execute(sql.raw(`CREATE FUNCTION fail_product_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic revision failure'; END $$`));
      await db.execute(sql.raw(`CREATE TRIGGER fail_product_revision BEFORE INSERT ON soso_site_content_revisions FOR EACH ROW EXECUTE FUNCTION fail_product_revision()`));
      assert.equal((await request(path, {
        product: { ...changed, name: "Must roll back" }, expectedDraftUpdatedAt: saved.body.draftUpdatedAt,
      })).status, 500);
      await db.execute(sql.raw("DROP TRIGGER fail_product_revision ON soso_site_content_revisions"));
      await db.execute(sql.raw("DROP FUNCTION fail_product_revision()"));
      const rolledBack = await request(path);
      assert.equal(rolledBack.body.draftUpdatedAt, saved.body.draftUpdatedAt);
      assert.equal(rolledBack.body.product.name, changed.name);

      // A writer in another section shares the same media/cleanup lock. The
      // product writer must wait, then recheck its expected version under it.
      let release!: () => void;
      let locked!: () => void;
      const acquired = new Promise<void>((resolve) => { locked = resolve; });
      const hold = new Promise<void>((resolve) => { release = resolve; });
      const blocking = db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
        locked();
        await hold;
        await tx.update(siteContentTable).set({ draftUpdatedAt: new Date(Date.now() + 1000) })
          .where(eq(siteContentTable.key, "platform"));
      });
      await acquired;
      let finished = false;
      const waiting = request(path, { product: changed, expectedDraftUpdatedAt: saved.body.draftUpdatedAt })
        .then((response) => { finished = true; return response; });
      try {
        await new Promise((resolve) => setTimeout(resolve, 40));
        assert.equal(finished, false, "Product validation must serialize with cleanup/content mutations");
      } finally { release(); }
      await blocking;
      assert.equal((await waiting).status, 409);
      const fresh = await request(path);
      const parallel = await Promise.all([0, 1].map((i) => request(path, {
        product: { ...changed, name: `Concurrent writer ${i}` }, expectedDraftUpdatedAt: fresh.body.draftUpdatedAt,
      })));
      assert.deepEqual(parallel.map((r) => r.status).sort(), [200, 409]);

      const current = await request(path);
      const duplicateId = randomUUID();
      const [withMapping] = await db.select({ draft: siteContentTable.draft }).from(siteContentTable)
        .where(eq(siteContentTable.key, "platform"));
      const mappingContent = withMapping!.draft as PlatformContent;
      mappingContent.products[1]!.commerceProductId = duplicateId;
      await db.update(siteContentTable).set({ draft: mappingContent }).where(eq(siteContentTable.key, "platform"));
      const mappingRejected = await request(path, {
        product: { ...current.body.product, commerceProductId: duplicateId },
        expectedDraftUpdatedAt: current.body.draftUpdatedAt,
      });
      assert.equal(mappingRejected.status, 400, JSON.stringify(mappingRejected.body));
      assert.match(JSON.stringify(mappingRejected.body), /mappingOwnership/);
      await db.update(staffUsersTable).set({ role: "operations" }).where(eq(staffUsersTable.id, staff!.id));
      assert.equal((await request(path)).status, 403);
      await db.update(staffUsersTable).set({ role: "editor" }).where(eq(staffUsersTable.id, staff!.id));
    }
    assert.ok(measurements[1]!.legacyDatabaseBytes > measurements[0]!.legacyDatabaseBytes * 10);
    assert.equal(measurements[1]!.productDatabaseBytes, measurements[0]!.productDatabaseBytes);
    assert.equal(measurements[1]!.editorDatabaseBytes, measurements[0]!.editorDatabaseBytes);
    assert.equal(measurements[1]!.validationDatabaseBytes, measurements[0]!.validationDatabaseBytes);
    process.stdout.write(`Serialized database results (uncompressed): ${JSON.stringify(measurements)}\n`);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("product replacement reference checks agree with the full schema for changed departments and availability", async () => {
  const guard = await db.execute(sql`select to_regclass('import_verification_guard') as guard`);
  assert.ok(guard.rows[0]?.guard, "Use run-in-isolated-soso-schema.mjs");
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  await db.delete(siteContentTable).where(eq(siteContentTable.key, "platform"));
  await db.insert(siteContentTable).values({ key: "platform", draft: content });
  for (const product of content.products) {
    for (const change of [
      { fulfilmentState: "unavailable", readyNowSizes: [], unavailableMessage: "Synthetic" },
      { department: "women", category: "Unknown category", customEligible: false },
      { relatedProductSlugs: ["not-a-product"] },
      { department: "accessories", customEligible: false },
      { category: "Unknown category" },
    ]) {
      const replacement = { ...product, ...change };
      const candidate = { ...content, products: content.products.map((p) => p.slug === product.slug ? replacement : p) };
      const issues = PlatformContentSchema.safeParse(candidate);
      const crossIssues = issues.success ? [] : issues.error.issues.filter((i) =>
        // Product field-level schema rules are checked independently.
        !(i.path[0] === "products" && i.path.length > 2 && !["category", "relatedProductSlugs"].includes(String(i.path[2]))));
      const [row] = await db.select({
        checks: productReferenceChecks(productCandidate(product.slug, replacement), product.slug),
      }).from(siteContentTable).where(eq(siteContentTable.key, "platform"));
      assert.equal(Object.values(row!.checks as object).every(Boolean), crossIssues.length === 0,
        JSON.stringify({ slug: product.slug, change, checks: row!.checks, issues: crossIssues }));
    }
  }
});
