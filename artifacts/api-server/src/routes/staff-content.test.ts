import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { PNG } from "pngjs";
import { auditLogsTable, db, faqItemsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireStaffRoles } from "../middlewares/staff";
import {
  buildFaqCreateAuditMetadata,
  buildFaqDeleteAuditMetadata,
  buildFaqHistoryPage,
  buildFaqUpdateAuditMetadata,
  decodeFaqHistoryCursor,
  encodeFaqHistoryCursor,
  queryFaqHistoryEvents,
  default as staffContentRouter,
  preservesLegacySparseFeaturedProvenance,
  PolicyInputSchema,
} from "./staff-content";
import publicContentRouter, { createFaqReadHandler } from "./faq";
import {
  DEFAULT_PLATFORM_CONTENT,
  isProductUnavailable,
  mergePlatformContentDefaults,
  mergePublishedPlatformContentDefaults,
  PlatformContentSchema,
  platformContentHash,
  readLegacyPublishedFaqItems,
  reconcileLegacyPublishedFaqItems,
} from "../lib/platform-content";
import { validateHomepageHeroMediaAssets } from "../lib/hero-media-validation";
import { validateProductMediaAssets } from "../lib/product-media-validation";
import { validateHomepageMerchandisingMediaAssets } from "../lib/homepage-media-validation";

function validProductMediaInspection(path: string, size = 250_000) {
  const contentType = path.endsWith(".png")
    ? "image/png"
    : path.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  const inspection = {
    contentType,
    declaredContentType: contentType,
    size,
    width: 2,
    height: 1,
  };
  if (!path.endsWith(".png")) return inspection;
  const png = new PNG({ width: 2, height: 1, colorType: 6 });
  png.data.set([255, 255, 255, 0, 255, 255, 255, 255]);
  return { ...inspection, bytes: PNG.sync.write(png, { colorType: 6 }) };
}

test("colour option migration preserves merchant products and creates unique palettes", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT) as unknown as Record<string, unknown>;
  legacy.contentVersion = 14;
  const products = legacy.products as Array<Record<string, unknown>>;
  products[0]!.colour = "Merchant Aubergine";
  delete products[0]!.colourOptions;
  delete products[0]!.allowCustomColour;
  const upgraded = mergePlatformContentDefaults(legacy);
  const parsed = PlatformContentSchema.safeParse(upgraded);
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.products[0]!.colour, "Merchant Aubergine");
  assert.equal(parsed.data.products[0]!.colourOptions[0]!.label, "Merchant Aubergine");
  assert.equal(parsed.data.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
  const options = parsed.data.products[0]!.colourOptions;
  assert.equal(new Set(options.map(({ id }) => id)).size, options.length);
  assert.equal(new Set(options.map(({ label }) => label.toLowerCase())).size, options.length);
  assert.equal(new Set(options.map(({ hex }) => hex.toUpperCase())).size, options.length);
});

test("material turn set migration preserves merchant content without inferring gallery pairs", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT) as unknown as Record<string, unknown>;
  legacy.contentVersion = 15;
  const products = legacy.products as Array<Record<string, unknown>>;
  const originalGallery = structuredClone(products[0]!.images);
  delete products[0]!.materialTurnSets;
  const merchantSets = [{
    id: "merchant-brocade",
    label: "Merchant brocade",
    front: {
      src: "/images/soso/merchant-brocade-front.jpg",
      alt: "Merchant brocade front",
      provenance: { source: "Merchant upload", rights: "Approved storefront use" },
    },
    back: {
      src: "/images/soso/merchant-brocade-back.jpg",
      alt: "Merchant brocade back",
      provenance: { source: "Merchant upload", rights: "Approved storefront use" },
    },
  }];
  products[1]!.materialTurnSets = structuredClone(merchantSets);

  const parsed = PlatformContentSchema.safeParse(mergePlatformContentDefaults(legacy));
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
  assert.deepEqual(parsed.data.products[0]!.materialTurnSets, []);
  assert.deepEqual(parsed.data.products[0]!.images, originalGallery);
  assert.deepEqual(parsed.data.products[1]!.materialTurnSets, merchantSets);
});

test("version 19 retires only the shipped Dashiki visualizer and preserves merchant replacements", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT);
  legacy.contentVersion = 18;
  const dashiki = legacy.products.find((product) => product.slug === "heritage-dashiki")!;
  dashiki.colourVisualizer = {
    baseImageSrc: "/images/soso/dashiki.jpg",
    garmentMaskSrc: "/images/soso/dashiki-outer-mask.png",
  };

  const upgraded = mergePlatformContentDefaults(legacy) as typeof DEFAULT_PLATFORM_CONTENT;
  const upgradedDashiki = upgraded.products.find((product) => product.slug === "heritage-dashiki")!;
  assert.equal(upgradedDashiki.colourVisualizer, undefined);
  assert.equal(upgraded.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);

  const merchantMask = structuredClone(legacy);
  const merchantMaskDashiki = merchantMask.products.find((product) => product.slug === "heritage-dashiki")!;
  merchantMaskDashiki.colourVisualizer = {
    baseImageSrc: "/api/storage/objects/uploads/merchant-base.jpg",
    garmentMaskSrc: "/api/storage/objects/uploads/merchant-mask.png",
  };
  const upgradedMerchantMask = mergePlatformContentDefaults(merchantMask) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.deepEqual(
    upgradedMerchantMask.products.find((product) => product.slug === "heritage-dashiki")?.colourVisualizer,
    merchantMaskDashiki.colourVisualizer,
  );
});

test("colour visualizers require verified stored preview, base, and garment mask images", async () => {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  content.products[0]!.colourOptions[0]!.previewImageSrc = "/api/storage/objects/uploads/colour-preview.png";
  content.products[0]!.colourVisualizer = {
    baseImageSrc: "/api/storage/objects/uploads/colour-base.png",
    garmentMaskSrc: "/api/storage/objects/uploads/colour-mask.png",
  };
  assert.equal(PlatformContentSchema.safeParse(content).success, true);
  const png = new PNG({ width: 2, height: 1, colorType: 6 });
  png.data.set([255, 255, 255, 0, 255, 255, 255, 255]);
  const maskBytes = PNG.sync.write(png, { colorType: 6 });
  const inspection = (path: string) => ({
    contentType: path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg",
    declaredContentType: path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg",
    size: 100,
    width: 2,
    height: 1,
    ...(path.endsWith("colour-mask.png") ? { bytes: maskBytes } : {}),
  });
  const valid = await validateProductMediaAssets(content, async (path) => inspection(path));
  assert.deepEqual(valid, []);
  const missingMask = await validateProductMediaAssets(content, async (path) => path.endsWith("colour-mask.png") ? null : inspection(path));
  assert.equal(missingMask.some((issue) => issue.path.join(".") === "products.0.colourVisualizer.garmentMaskSrc"), true);
});

test("garment mask publishing rejects JPEG, opaque, and transparent masks but accepts mixed PNG alpha", async () => {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  content.products[0]!.colourVisualizer = {
    baseImageSrc: "/api/storage/objects/uploads/base.png",
    garmentMaskSrc: "/api/storage/objects/uploads/mask.png",
  };
  const png = (alpha: number[]) => {
    const image = new PNG({ width: alpha.length, height: 1, colorType: 6 });
    alpha.forEach((value, index) => image.data.set([255, 255, 255, value], index * 4));
    return PNG.sync.write(image, { colorType: 6 });
  };
  const inspect = (bytes: Buffer, contentType = "image/png") => async (path: string) => ({
    contentType: path.endsWith("mask.png") ? contentType : path.endsWith(".webp") ? "image/webp" : path.endsWith(".png") ? "image/png" : "image/jpeg",
    declaredContentType: path.endsWith("mask.png") ? contentType : path.endsWith(".webp") ? "image/webp" : path.endsWith(".png") ? "image/png" : "image/jpeg",
    size: bytes.length,
    width: PNG.sync.read(bytes).width,
    height: 1,
    ...(path.endsWith("mask.png") ? { bytes } : {}),
  });
  assert.ok((await validateProductMediaAssets(content, inspect(png([0, 255]), "image/jpeg"))).some((issue) => issue.path.at(-1) === "garmentMaskSrc"));
  assert.ok((await validateProductMediaAssets(content, inspect(png([255, 255])))).some((issue) => issue.message.includes("transparent background")));
  assert.ok((await validateProductMediaAssets(content, inspect(png([0, 0])))).some((issue) => issue.message.includes("transparent background")));
  assert.deepEqual(await validateProductMediaAssets(content, inspect(png([0, 255]))), []);
});

test("garment mask publishing rejects token mixed-alpha pixels that are not review-usable", async () => {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  content.products[0]!.colourVisualizer = {
    baseImageSrc: "/api/storage/objects/uploads/base.png",
    garmentMaskSrc: "/api/storage/objects/uploads/mask.png",
  };
  const image = new PNG({ width: 1001, height: 1, colorType: 6 });
  for (let index = 0; index < 1001; index += 1) {
    image.data.set([255, 255, 255, index === 0 ? 0 : 255], index * 4);
  }
  const bytes = PNG.sync.write(image, { colorType: 6 });
  const issues = await validateProductMediaAssets(content, async (path) => ({
    contentType: "image/png",
    declaredContentType: "image/png",
    size: bytes.length,
    width: 1001,
    height: 1,
    ...(path.endsWith("mask.png") ? { bytes } : {}),
  }));
  assert.ok(issues.some((issue) => issue.message.includes("transparent background")));
});

test("garment mask publishing requires dimensions that exactly match the base photo", async () => {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  content.products[0]!.colourVisualizer = {
    baseImageSrc: "/api/storage/objects/uploads/base.png",
    garmentMaskSrc: "/api/storage/objects/uploads/mask.png",
  };
  const image = new PNG({ width: 2, height: 1, colorType: 6 });
  image.data.set([255, 255, 255, 0, 255, 255, 255, 255]);
  const bytes = PNG.sync.write(image, { colorType: 6 });
  const issues = await validateProductMediaAssets(content, async (path) => ({
    contentType: "image/png",
    declaredContentType: "image/png",
    size: bytes.length,
    width: path.endsWith("base.png") ? 3 : 2,
    height: 1,
    ...(path.endsWith("mask.png") ? { bytes } : {}),
  }));
  assert.ok(issues.some((issue) => issue.message.includes("dimensions must exactly match")));
});

test("garment mask publishing rejects excessive decoded pixel dimensions before decoding", async () => {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  content.products[0]!.colourVisualizer = {
    baseImageSrc: "/api/storage/objects/uploads/base.png",
    garmentMaskSrc: "/api/storage/objects/uploads/mask.png",
  };
  const image = new PNG({ width: 2, height: 1, colorType: 6 });
  image.data.set([255, 255, 255, 0, 255, 255, 255, 255]);
  const bytes = PNG.sync.write(image, { colorType: 6 });
  bytes.writeUInt32BE(20_000_000, 16);
  const issues = await validateProductMediaAssets(content, async (path) => ({
    contentType: "image/png",
    declaredContentType: "image/png",
    size: bytes.length,
    width: 20_000_000,
    height: 1,
    ...(path.endsWith("mask.png") ? { bytes } : {}),
  }));
  assert.ok(issues.some((issue) => issue.message.includes("decoded pixels")));
});

test("garment mask checks cannot be bypassed by reusing the opaque base image path", async () => {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  const sharedPath = "/api/storage/objects/uploads/shared.png";
  content.products[0]!.colourVisualizer = {
    baseImageSrc: sharedPath,
    garmentMaskSrc: sharedPath,
  };
  const image = new PNG({ width: 2, height: 1, colorType: 6 });
  image.data.set([255, 255, 255, 255, 255, 255, 255, 255]);
  const bytes = PNG.sync.write(image, { colorType: 6 });
  const issues = await validateProductMediaAssets(content, async () => ({
    contentType: "image/png",
    declaredContentType: "image/png",
    size: bytes.length,
    width: 2,
    height: 1,
    bytes,
  }));
  assert.ok(issues.some((issue) => (
    issue.path.join(".") === "products.0.colourVisualizer.garmentMaskSrc"
    && issue.message.includes("transparent background")
  )));
});

const actor = "clerk_staff_editor";
const draft = {
  id: "faq-001",
  question: "How long does delivery take?",
  answer: "Delivery takes five business days.",
  category: "Delivery",
  sortOrder: 2,
  isPublished: false,
  createdAt: new Date("2026-08-24T10:00:00.000Z"),
  updatedAt: new Date("2026-08-24T10:00:00.000Z"),
};
const published = {
  ...draft,
  answer: "Delivery takes three to five business days.",
  isPublished: true,
  updatedAt: new Date("2026-08-24T10:02:00.000Z"),
};

test("FAQ create audit metadata captures the complete draft snapshot and transition", () => {
  assert.deepEqual(buildFaqCreateAuditMetadata(draft), {
    snapshot: {
      question: draft.question,
      answer: draft.answer,
      category: draft.category,
      sortOrder: draft.sortOrder,
      isPublished: false,
    },
    transition: { from: null, to: "draft" },
  });
  assert.equal(actor, "clerk_staff_editor");
});

test("FAQ update audit metadata captures previous and current snapshots, including publish transition", () => {
  assert.deepEqual(buildFaqUpdateAuditMetadata(draft, published), {
    previousSnapshot: {
      question: draft.question,
      answer: draft.answer,
      category: draft.category,
      sortOrder: draft.sortOrder,
      isPublished: false,
    },
    snapshot: {
      question: published.question,
      answer: published.answer,
      category: published.category,
      sortOrder: published.sortOrder,
      isPublished: true,
    },
    transition: { from: "draft", to: "published" },
  });
  assert.deepEqual(buildFaqUpdateAuditMetadata(published, draft).transition, {
    from: "published",
    to: "draft",
  });
});

test("FAQ delete audit metadata preserves the last snapshot and records deletion", () => {
  assert.deepEqual(buildFaqDeleteAuditMetadata(published), {
    previousSnapshot: {
      question: published.question,
      answer: published.answer,
      category: published.category,
      sortOrder: published.sortOrder,
      isPublished: true,
    },
    transition: { from: "published", to: "deleted" },
  });
});

test("FAQ history pages are bounded and use a stable opaque cursor", () => {
  const oldest = {
    id: "00000000-0000-4000-8000-000000000001",
    actorClerkUserId: actor,
    action: "faq.created",
    metadata: buildFaqCreateAuditMetadata(draft),
    createdAt: new Date("2026-08-24T10:00:00.000Z"),
  };
  const newest = {
    id: "00000000-0000-4000-8000-000000000002",
    actorClerkUserId: "clerk_staff_owner",
    action: "faq.deleted",
    metadata: buildFaqDeleteAuditMetadata(published),
    createdAt: new Date("2026-08-24T10:04:00.000Z"),
  };
  const page = buildFaqHistoryPage([newest, oldest], 1);
  const cursor = decodeFaqHistoryCursor(page.nextCursor!);

  assert.deepEqual(page.items.map((event) => event.id), [newest.id]);
  assert.deepEqual(cursor, { id: newest.id });
  assert.equal(encodeFaqHistoryCursor(cursor), page.nextCursor);
  assert.throws(() => decodeFaqHistoryCursor("not-a-valid-cursor"), /Invalid FAQ history cursor/);
});

test("FAQ cursor pagination preserves equal microsecond timestamps across page boundaries", async () => {
  const entityId = randomUUID();
  const ids = [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003",
  ];
  const createdAt = "2026-08-25 12:34:56.123456+00";

  try {
    for (const id of ids) {
      await db.execute(sql`
        insert into "soso_audit_logs"
          ("id", "actor_clerk_user_id", "action", "entity_type", "entity_id", "metadata", "created_at")
        values
          (${id}::uuid, ${actor}, 'faq.updated', 'faq_item', ${entityId}, '{}'::jsonb,
           ${createdAt}::timestamptz)
      `);
    }

    const firstRows = await queryFaqHistoryEvents(entityId, 2);
    const firstPage = buildFaqHistoryPage(firstRows, 2);
    const secondRows = await queryFaqHistoryEvents(entityId, 2, decodeFaqHistoryCursor(firstPage.nextCursor!));
    const secondPage = buildFaqHistoryPage(secondRows, 2);
    const combined = [...firstPage.items, ...secondPage.items].map((event) => event.id);

    assert.deepEqual(combined, [...ids].sort().reverse());
    assert.equal(new Set(combined).size, 3);
    assert.equal(secondPage.nextCursor, null);
  } finally {
    await db.delete(auditLogsTable).where(eq(auditLogsTable.entityId, entityId));
  }
});

test("FAQ history is registered as read-only and limited to owner/editor staff", () => {
  const routerStack = (staffContentRouter as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
  }).stack;
  const historyRoute = routerStack
    .map((layer) => layer.route)
    .find((route) => route?.path === "/staff/faq-history");

  assert.ok(historyRoute);
  assert.deepEqual(Object.keys(historyRoute.methods), ["get"]);

  const denied = requireStaffRoles("operations");
  let status: number | undefined;
  let continued = false;
  denied(
    { staff: { role: "editor" }, log: { warn() {} } } as never,
    {
      status(code: number) {
        status = code;
        return { json() {} };
      },
    } as never,
    () => { continued = true; },
  );
  assert.equal(status, 403);
  assert.equal(continued, false);
});

test("deleting the last FAQ remains empty across subsequent public reads", async () => {
  let rows = [{
    id: "faq-last",
    category: "Ordering",
    question: "Last question?",
    answer: "Last answer.",
  }];
  const responses: unknown[] = [];
  const handler = createFaqReadHandler(async () => rows);
  const response = { json(body: unknown) { responses.push(body); } };

  await handler({} as never, response as never);
  rows = [];
  await handler({} as never, response as never);
  await handler({} as never, response as never);

  assert.equal((responses[0] as unknown[]).length, 1);
  assert.deepEqual(responses[1], []);
  assert.deepEqual(responses[2], []);
});

test("legacy FAQ extraction only accepts the published PlatformContent location", () => {
  const item = { id: "legacy-delivery", category: "Delivery", question: "When?", answer: "Soon." };
  assert.deepEqual(readLegacyPublishedFaqItems({ pages: { faq: { items: [item] } } }), [item]);
  assert.deepEqual(readLegacyPublishedFaqItems({ faq: { items: [item] } }), []);
  assert.deepEqual(readLegacyPublishedFaqItems({ pages: { faq: { items: [{ ...item, id: "Not a slug" }] } } }), []);
});

test("legacy published FAQs reconcile once without replacing staff-managed questions", async () => {
  const unique = randomUUID();
  const retainedQuestion = `How is this staff answer retained ${unique}?`;
  const importedQuestion = `How is this legacy answer imported ${unique}?`;
  const markerId = "platform-pages-faq-items-v1";
  const [staffRow] = await db.insert(faqItemsTable).values({
    question: `  ${retainedQuestion.toLocaleUpperCase()}  `,
    answer: "A staff-edited answer",
    category: "Staff category",
    sortOrder: 91,
    isPublished: false,
  }).returning();
  const legacy = {
    pages: {
      faq: {
        items: [
          { id: "staff-owned-question", category: "Legacy", question: retainedQuestion, answer: "Must not overwrite staff" },
          { id: "legacy-import-question", category: "Ordering", question: importedQuestion, answer: "The preserved public answer" },
        ],
      },
    },
  };

  try {
    await db.delete(auditLogsTable).where(and(
      eq(auditLogsTable.entityType, "faq_reconciliation"),
      eq(auditLogsTable.entityId, markerId),
    ));

    const first = await reconcileLegacyPublishedFaqItems(legacy);
    assert.deepEqual(first, { importedCount: 1, skippedCount: 1, alreadyReconciled: false });
    const rows = await db.select().from(faqItemsTable).where(inArray(
      faqItemsTable.question,
      [`  ${retainedQuestion.toLocaleUpperCase()}  `, importedQuestion],
    ));
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.id === staffRow!.id)?.answer, "A staff-edited answer");
    const imported = rows.find((row) => row.question === importedQuestion);
    assert.equal(imported?.answer, "The preserved public answer");
    assert.equal(imported?.category, "Ordering");
    assert.equal(imported?.sortOrder, 1);
    assert.equal(imported?.isPublished, true);

    assert.deepEqual(await reconcileLegacyPublishedFaqItems(legacy), {
      importedCount: 0, skippedCount: 0, alreadyReconciled: true,
    });
    await db.delete(faqItemsTable).where(eq(faqItemsTable.id, imported!.id));
    assert.deepEqual(await reconcileLegacyPublishedFaqItems(legacy), {
      importedCount: 0, skippedCount: 0, alreadyReconciled: true,
    });
    const [resurrected] = await db.select({ id: faqItemsTable.id }).from(faqItemsTable)
      .where(eq(faqItemsTable.question, importedQuestion)).limit(1);
    assert.equal(resurrected, undefined);
  } finally {
    await db.delete(auditLogsTable).where(and(
      eq(auditLogsTable.entityType, "faq_reconciliation"),
      eq(auditLogsTable.entityId, markerId),
    ));
    await db.delete(faqItemsTable).where(inArray(faqItemsTable.id, [
      staffRow!.id,
      ...((await db.select({ id: faqItemsTable.id }).from(faqItemsTable)
        .where(eq(faqItemsTable.question, importedQuestion))).map((row) => row.id)),
    ]));
  }
});

test("staff FAQ list is a database-backed read endpoint", () => {
  const routerStack = (staffContentRouter as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
  }).stack;
  const routes = routerStack.map((layer) => layer.route).filter((route) => route?.path === "/staff/faq");
  assert.ok(routes.some((route) => route?.methods.get));
  assert.ok(routes.some((route) => route?.methods.post));
});

test("platform content validates the complete seeded document and hashes deterministically", () => {
  assert.equal(PlatformContentSchema.safeParse(DEFAULT_PLATFORM_CONTENT).success, true);
  assert.equal(platformContentHash(DEFAULT_PLATFORM_CONTENT), platformContentHash(structuredClone(DEFAULT_PLATFORM_CONTENT)));
});

test("homepage merchandising defaults are explicit and have exact ordered cardinalities", () => {
  const { categories, newArrival, featured, occasions } = DEFAULT_PLATFORM_CONTENT.homepage;
  assert.equal(categories.items.length, 5);
  assert.deepEqual(categories.items.map((item) => item.title), ["Kaftan", "Agbada", "Shirts", "Dashiki", "Two-Piece Sets"]);
  assert.ok(categories.heading && categories.accessibleLabel && categories.ctaLabel);
  assert.ok(categories.items.every((item) => item.eyebrow && item.title && item.imageUrl && item.imageAlt && item.href));
  assert.ok(newArrival.productSlug);
  assert.ok(newArrival.editorial.imageUrl && newArrival.editorial.imageAlt && newArrival.editorial.body);
  assert.equal(featured.productSlugs.length, 4);
  assert.equal(featured.legacySparseCompatibility, undefined);
  assert.equal(occasions.items.length, 2);
  assert.ok(occasions.items.every((item) => item.imageAlt));
});

test("legacy homepage merchandising upgrades without replacing merchant edits", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  legacy.contentVersion = 4;
  delete legacy.homepage.categories;
  delete legacy.homepage.newArrival;
  legacy.homepage.featured.title = "Merchant featured edit";
  legacy.homepage.featured.productSlugs = [
    DEFAULT_PLATFORM_CONTENT.products[2]!.slug,
    DEFAULT_PLATFORM_CONTENT.products[1]!.slug,
    ...DEFAULT_PLATFORM_CONTENT.homepage.featured.productSlugs,
  ];
  legacy.homepage.occasions.title = "Merchant occasions edit";
  legacy.homepage.occasions.items = [
    { title: "Merchant panel", body: "Merchant body", imageUrl: "/images/soso/agbada.jpg", href: "/shop", linkLabel: "Browse" },
    ...structuredClone(DEFAULT_PLATFORM_CONTENT.homepage.occasions.items),
  ];
  const upgraded = mergePlatformContentDefaults(legacy) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(PlatformContentSchema.safeParse(upgraded).success, true);
  assert.equal(upgraded.homepage.featured.title, "Merchant featured edit");
  assert.deepEqual(upgraded.homepage.featured.productSlugs.slice(0, 2), [DEFAULT_PLATFORM_CONTENT.products[2]!.slug, DEFAULT_PLATFORM_CONTENT.products[1]!.slug]);
  assert.equal(upgraded.homepage.occasions.title, "Merchant occasions edit");
  assert.equal(upgraded.homepage.occasions.items[0]!.title, "Merchant panel");
  assert.equal(upgraded.homepage.occasions.items[0]!.imageAlt, DEFAULT_PLATFORM_CONTENT.homepage.occasions.items[0]!.imageAlt);
});

test("v9 homepage category fields upgrade by canonical target without changing merchant order", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  legacy.contentVersion = 9;
  const categories = legacy.homepage.categories.items;
  const kaftan = categories.shift();
  categories.push(kaftan);
  categories.forEach((item: Record<string, unknown>) => {
    delete item.description;
    delete item.active;
    delete item.imageMode;
    delete item.rotationMs;
  });
  const upgraded = mergePlatformContentDefaults(legacy) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(upgraded.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
  assert.deepEqual(upgraded.homepage.categories.items.map((item) => item.href), categories.map((item: { href: string }) => item.href));
  assert.ok(upgraded.homepage.categories.items.every((item) => item.description && item.rotationMs));
  assert.deepEqual(upgraded.homepage.hero.primaryCta, { label: "Shop New Arrivals", href: "/collections/new-arrivals" });
});

test("v9 incompatible category records migrate to canonical public slots for drafts and published content", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  legacy.contentVersion = 9;
  legacy.homepage.categories.items = [
    { eyebrow: "Merchant", title: "Private edit", imageUrl: "/images/soso/vault-black.jpg", imageAlt: "Merchant supplied garment image", href: "/shop?search=private" },
    ...legacy.homepage.categories.items.slice(0, 4),
  ];
  legacy.homepage.categories.items[1]!.title = "Merchant Kaftan";
  const expected = [
    "/collections/kaftans", "/collections/agbadas", "/collections/shirts", "/collections/dashikis", "/collections/two-piece",
  ];
  const draft = mergePlatformContentDefaults(legacy) as typeof DEFAULT_PLATFORM_CONTENT;
  const published = mergePublishedPlatformContentDefaults(legacy, new Date()) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.deepEqual(draft.homepage.categories.items.map((item) => item.href).sort(), expected.sort());
  assert.deepEqual(published.homepage.categories.items.map((item) => item.href).sort(), expected.sort());
  assert.equal(draft.homepage.categories.items.find((item) => item.href === "/collections/kaftans")!.title, "Merchant Kaftan");
  assert.equal(PlatformContentSchema.safeParse(draft).success, true);
  assert.deepEqual(mergePlatformContentDefaults(draft), draft);
});

test("v10 appends the required New Arrivals collection without replacing merchant collections", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  legacy.contentVersion = 10;
  legacy.collections = legacy.collections.filter((item: { slug: string }) => item.slug !== "new-arrivals");
  legacy.collections[0]!.intro = "Merchant collection introduction";

  const upgraded = mergePlatformContentDefaults(legacy) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(upgraded.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
  assert.equal(upgraded.collections[0]!.intro, "Merchant collection introduction");
  assert.equal(upgraded.collections.filter((item) => item.slug === "new-arrivals").length, 1);
  assert.equal(PlatformContentSchema.safeParse(upgraded).success, true);
  assert.deepEqual(mergePlatformContentDefaults(upgraded), upgraded);
});

test("the approved category campaign activates only untouched static category media", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  legacy.contentVersion = 13;
  legacy.homepage.categories.items.forEach((item: Record<string, any>) => {
    item.imageUrls = [item.imageUrl];
    item.imageMode = "static";
    item.rotationMs = 5000;
  });
  legacy.homepage.categories.items[0].imageAlt = "Merchant-approved accessible kaftan description";

  const upgraded = mergePlatformContentDefaults(legacy) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(upgraded.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
  assert.ok(upgraded.homepage.categories.items.every((item) => item.imageMode === "crossfade"));
  assert.ok(upgraded.homepage.categories.items.every((item) => item.imageUrls?.length === 3));
  assert.equal(upgraded.homepage.categories.items[0]!.imageAlt, "Merchant-approved accessible kaftan description");
  assert.equal(PlatformContentSchema.safeParse(upgraded).success, true);
  assert.deepEqual(mergePlatformContentDefaults(upgraded), upgraded);

  const merchant = structuredClone(legacy);
  merchant.homepage.categories.items[0].imageUrls.push("/images/soso/kaftan-white.jpg");
  merchant.homepage.categories.items[1].rotationMs = 9000;
  const merchantUpgrade = mergePlatformContentDefaults(merchant) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.deepEqual(merchantUpgrade.homepage.categories.items[0].imageUrls, [
    "/images/soso/vault-black.jpg",
    "/images/soso/kaftan-white.jpg",
  ]);
  assert.equal(merchantUpgrade.homepage.categories.items[0].imageMode, "static");
  assert.equal(merchantUpgrade.homepage.categories.items[1].rotationMs, 9000);
  assert.equal(merchantUpgrade.homepage.categories.items[1].imageMode, "static");
});

test("version 19 repairs the partial crossfade state without replacing merchant category media", () => {
  const partial = structuredClone(DEFAULT_PLATFORM_CONTENT);
  partial.contentVersion = 18;
  partial.homepage.categories.items.slice(0, 4).forEach((item) => {
    delete item.imageUrls;
    item.imageMode = "crossfade";
  });
  const merchant = partial.homepage.categories.items[1]!;
  merchant.imageUrl = "/api/storage/objects/uploads/merchant-agbada.jpg";
  delete merchant.imageUrls;

  const upgraded = mergePlatformContentDefaults(partial) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(upgraded.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
  assert.ok(upgraded.homepage.categories.items[0]!.imageUrls?.length === 3);
  assert.equal(upgraded.homepage.categories.items[0]!.imageMode, "crossfade");
  assert.equal(upgraded.homepage.categories.items[1]!.imageUrl, merchant.imageUrl);
  assert.equal(upgraded.homepage.categories.items[1]!.imageUrls, undefined);
  assert.ok(upgraded.homepage.categories.items[2]!.imageUrls?.length === 3);
  assert.ok(upgraded.homepage.categories.items[3]!.imageUrls?.length === 3);
  assert.ok(upgraded.homepage.categories.items[4]!.imageUrls?.length === 3);
});

test("the exact shipped sparse footer is repaired even after a partial version upgrade", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  legacy.contentVersion = DEFAULT_PLATFORM_CONTENT.contentVersion;
  legacy.site.footer.columns = [
    { heading: "Explore", links: [{ label: "Shop", href: "/shop" }, { label: "Journal", href: "/journal" }, { label: "FAQ", href: "/faq" }] },
    { heading: "Collections", links: [{ label: "Kaftans", href: "/collections/kaftans" }, { label: "Agbadas", href: "/collections/agbadas" }, { label: "Shirts", href: "/collections/shirts" }] },
  ];
  legacy.site.footer.legalLinks = [{ label: "Privacy", href: "/policies/privacy" }, { label: "Terms", href: "/policies/terms" }];

  const upgraded = mergePlatformContentDefaults(legacy) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(upgraded.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
  assert.deepEqual(upgraded.site.footer, DEFAULT_PLATFORM_CONTENT.site.footer);
  assert.equal(PlatformContentSchema.safeParse(upgraded).success, true);
  assert.deepEqual(mergePlatformContentDefaults(upgraded), upgraded);

  const merchant = structuredClone(legacy);
  merchant.site.footer.columns[0].heading = "Visit";
  merchant.site.footer.legalLinks[0].label = "Privacy notice";
  const merchantUpgrade = mergePlatformContentDefaults(merchant) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(merchantUpgrade.site.footer.columns[0].heading, "Visit");
  assert.equal(merchantUpgrade.site.footer.legalLinks[0].label, "Privacy notice");
});

test("scheduled campaign CTA requires valid dates and a useful collection when enabled", () => {
  const invalid = structuredClone(DEFAULT_PLATFORM_CONTENT);
  invalid.homepage.hero.campaignCta = {
    enabled: true, label: "Shop campaign", href: "/collections/new-arrivals",
    startsAt: "2026-02-01T00:00:00.000Z", endsAt: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(PlatformContentSchema.safeParse(invalid).success, false);
  invalid.homepage.hero.campaignCta.endsAt = "2026-03-01T00:00:00.000Z";
  assert.equal(PlatformContentSchema.safeParse(invalid).success, true);
});

test("homepage migration replaces removed collection targets and keeps sparse catalogues renderable", () => {
  const renamedCollections = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  renamedCollections.contentVersion = 4;
  delete renamedCollections.homepage.categories;
  renamedCollections.collections.forEach((collection: { slug: string }) => { collection.slug = `retired-${collection.slug}`; });
  renamedCollections.site.megaMenu.forEach((group: any) => {
    group.href = "/shop";
    group.columns = [{ heading: "Shop", links: [{ label: "Shop", href: "/shop" }] }];
  });
  renamedCollections.site.header.searchSuggestions = [{ label: "Shop", href: "/shop" }];
  const renamed = mergePlatformContentDefaults(renamedCollections) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(PlatformContentSchema.safeParse(renamed).success, true);
  assert.equal(renamed.homepage.categories.items.length, 5);
  assert.ok(renamed.homepage.categories.items.every((item) => item.href.startsWith("/shop?search=")));

  const sparse = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  // Mainline reached version 5 with hero motion but without structured
  // merchandising; version 6 must still apply the homepage migration.
  sparse.contentVersion = 5;
  const onlyProduct = sparse.products[0];
  onlyProduct.relatedProductSlugs = [];
  sparse.products = [onlyProduct];
  sparse.collections = sparse.collections.filter((collection: { department: string; category: string }) =>
    collection.department === onlyProduct.department && collection.category === onlyProduct.category);
  sparse.site.megaMenu.forEach((group: any) => {
    group.visible = false; group.href = "/shop"; group.featuredProductSlugs = [];
    group.columns = [{ heading: "Shop", links: [{ label: "Shop", href: "/shop" }] }];
  });
  sparse.site.header.searchSuggestions = [{ label: "Shop", href: "/shop" }];
  delete sparse.homepage.categories;
  delete sparse.homepage.newArrival;
  const upgradedSparse = mergePlatformContentDefaults(sparse) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(PlatformContentSchema.safeParse(upgradedSparse).success, true);
  assert.deepEqual(upgradedSparse.homepage.featured.productSlugs, [onlyProduct.slug, onlyProduct.slug, onlyProduct.slug, onlyProduct.slug]);
  assert.equal(upgradedSparse.homepage.featured.legacySparseCompatibility, true);
  assert.equal(upgradedSparse.homepage.newArrival.productSlug, onlyProduct.slug);
  assert.equal(upgradedSparse.products.length, 1);
  const unrelatedCopyEdit = structuredClone(upgradedSparse);
  unrelatedCopyEdit.homepage.hero.title = "Updated campaign title";
  assert.equal(preservesLegacySparseFeaturedProvenance(upgradedSparse, unrelatedCopyEdit), true);
  assert.equal(preservesLegacySparseFeaturedProvenance(DEFAULT_PLATFORM_CONTENT, upgradedSparse), false);

  const ordinarySparseDraft = structuredClone(upgradedSparse);
  ordinarySparseDraft.contentVersion = 6;
  delete ordinarySparseDraft.homepage.featured.legacySparseCompatibility;
  assert.equal(PlatformContentSchema.safeParse(ordinarySparseDraft).success, false);

  const markerOnNormalCatalogue = structuredClone(DEFAULT_PLATFORM_CONTENT);
  markerOnNormalCatalogue.homepage.featured.legacySparseCompatibility = true;
  assert.equal(PlatformContentSchema.safeParse(markerOnNormalCatalogue).success, false);

  const changedCatalogue = structuredClone(upgradedSparse);
  changedCatalogue.products.push(structuredClone(DEFAULT_PLATFORM_CONTENT.products[1]!));
  assert.equal(preservesLegacySparseFeaturedProvenance(upgradedSparse, changedCatalogue), false);

  const twoPieceSparse = structuredClone(upgradedSparse);
  const secondProduct = structuredClone(DEFAULT_PLATFORM_CONTENT.products[1]!);
  secondProduct.relatedProductSlugs = [];
  twoPieceSparse.products.push(secondProduct);
  twoPieceSparse.homepage.featured.productSlugs = [onlyProduct.slug, secondProduct.slug, onlyProduct.slug, onlyProduct.slug];
  assert.equal(PlatformContentSchema.safeParse(twoPieceSparse).success, true);
  const reorderedSparse = structuredClone(twoPieceSparse);
  reorderedSparse.homepage.featured.productSlugs = [secondProduct.slug, onlyProduct.slug, onlyProduct.slug, onlyProduct.slug];
  assert.equal(PlatformContentSchema.safeParse(reorderedSparse).success, true);
  assert.equal(preservesLegacySparseFeaturedProvenance(twoPieceSparse, reorderedSparse), false);
});

test("homepage merchandising rejects wrong cardinalities and unknown or duplicate product references", () => {
  const invalid = structuredClone(DEFAULT_PLATFORM_CONTENT);
  invalid.homepage.categories.items.pop();
  invalid.homepage.categories.items[1]!.href = invalid.homepage.categories.items[0]!.href;
  invalid.homepage.occasions.items.push(structuredClone(invalid.homepage.occasions.items[0]!));
  invalid.homepage.occasions.items[0]!.href = "/checkout";
  invalid.homepage.featured.productSlugs = [
    invalid.products[0]!.slug,
    invalid.products[0]!.slug,
    invalid.products[1]!.slug,
    "unknown-homepage-piece",
  ];
  invalid.homepage.newArrival.productSlug = "unknown-arrival";
  const parsed = PlatformContentSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => issue.message);
    assert.ok(messages.some((message) => message.includes("exactly 5")));
    assert.ok(messages.some((message) => message.includes("exactly 2")));
    assert.ok(messages.some((message) => message.includes("Duplicate featured product")));
    assert.ok(messages.some((message) => message.includes("Unknown featured product")));
    assert.ok(messages.some((message) => message.includes("Unknown new-arrival product")));
    assert.ok(messages.some((message) => message.includes("Duplicate homepage category target")));
    assert.ok(messages.some((message) => message.includes("Unsafe or unknown homepage target")));
  }
});

test("platform hashes ignore object key order but preserve merchandising order", () => {
  const first = { homepage: { categories: [{ title: "Kaftans" }, { title: "Agbadas" }] }, version: 1 };
  const reorderedKeys = { version: 1, homepage: { categories: [{ title: "Kaftans" }, { title: "Agbadas" }] } };
  const reorderedMerchandising = { version: 1, homepage: { categories: [{ title: "Agbadas" }, { title: "Kaftans" }] } };

  assert.equal(platformContentHash(first), platformContentHash(reorderedKeys));
  assert.notEqual(platformContentHash(first), platformContentHash(reorderedMerchandising));
});

test("women launches as a visible ready-to-wear department with governed catalogue imagery", () => {
  const womenProducts = DEFAULT_PLATFORM_CONTENT.products.filter((product) => product.department === "women");
  const womenMenu = DEFAULT_PLATFORM_CONTENT.site.megaMenu.find((group) => group.department === "women");

  assert.equal(womenProducts.length, 6);
  assert.ok(womenProducts.every((product) =>
    product.standardEligible
    && !product.customEligible
    && !product.sizes.includes("Custom")
    && product.images.every((image) => image.provenance.sourceUrl?.startsWith("https://shopsoso.co/product/"))));
  assert.equal(DEFAULT_PLATFORM_CONTENT.collections.some((collection) =>
    collection.department === "women" && collection.category === "Women's Ready-to-Wear"), true);
  assert.equal(womenMenu?.visible, true);
  assert.deepEqual(womenMenu?.featuredProductSlugs, ["canvas", "varen"]);
});

test("platform content includes complete public shell, journal, checkout, and privacy copy groups", () => {
  const { site, pages } = DEFAULT_PLATFORM_CONTENT;
  assert.ok(site.header.openMenuLabel);
  assert.ok(site.header.searchLabel);
  assert.ok(site.header.searchSuggestions.length > 0);
  assert.ok(site.skipLinkLabel);
  assert.ok(site.platformState.loadingMessage);
  assert.ok(site.platformState.unavailableMessage);
  assert.ok(site.cart.checkoutCta.href);
  assert.ok(site.floatingCta.label);
  assert.ok(site.consent.privacyLink.href);
  assert.ok(site.footer.instagramAriaLabel);
  assert.ok(pages.journal.loadingSeo.title);
  assert.ok(pages.journal.notFoundMessage);
  assert.ok(pages.policies.privacyRequest.submitLabel);
  assert.ok(pages.policies.privacyRequest.invalidEmailMessage);
  assert.ok(pages.faq.listAriaLabel);
  assert.ok(pages.checkout.legalLinks.every((link) => link.label && link.href));
  assert.ok(pages.paymentReturn.paidBody);
  assert.ok(pages.paymentReturn.missingAttemptMessage);
  assert.ok(pages.paymentReturn.statusUnavailableMessage);
  assert.ok(pages.paymentReturn.measurementSyncError);
  assert.ok(pages.paymentReturn.measurementRangeErrorTemplate.includes("{label}"));
  assert.ok(Object.values(pages.paymentReturn.measurementStatusLabels).every(Boolean));
  assert.ok(Object.values(DEFAULT_PLATFORM_CONTENT.supportCopy.stylistDialog).every((value) => value.length > 0));
  assert.ok(DEFAULT_PLATFORM_CONTENT.productCopy.detailImageAltSuffix);
  assert.ok(DEFAULT_PLATFORM_CONTENT.productCopy.sizeGuideCloseLabel);
  assert.ok(pages.notFound.cta.href);
});

test("hybrid catalogue defaults expose governed discovery, eligibility, fulfilment, and provenance", () => {
  const product = DEFAULT_PLATFORM_CONTENT.products[0]!;
  assert.ok(product.colour);
  assert.ok(product.fabric);
  assert.ok(product.fit);
  assert.ok(product.searchableTerms.length > 0);
  assert.equal(typeof product.merchandising.isNew, "boolean");
  assert.equal(product.standardEligible, true);
  assert.equal(product.customEligible, true);
  assert.ok(product.standardSizes.length > 0);
  assert.deepEqual(product.readyNowSizes, []);
  assert.equal(product.fulfilmentState, "made_immediately");
  assert.equal(product.dispatchMessage, "Dispatch within five days");
  assert.match(DEFAULT_PLATFORM_CONTENT.productCopy.dispatchNotDeliveryMessage, /not a guarantee of delivery within five days/i);
  assert.ok(product.images.every((item) => item.provenance.source && item.provenance.rights));
});

test("only explicit unavailable fulfilment state makes a catalogue product unavailable", () => {
  assert.equal(isProductUnavailable({ fulfilmentState: "made_immediately" }), false);
  assert.equal(isProductUnavailable({ fulfilmentState: "ready_now" }), false);
  assert.equal(isProductUnavailable({ fulfilmentState: "unavailable" }), true);

  const makeableWithNoReadyStock = structuredClone(DEFAULT_PLATFORM_CONTENT);
  makeableWithNoReadyStock.products[0]!.readyNowSizes = [];
  makeableWithNoReadyStock.products[0]!.fulfilmentState = "made_immediately";
  assert.equal(PlatformContentSchema.safeParse(makeableWithNoReadyStock).success, true);
});

test("hybrid catalogue schema validates honest explicit fulfilment combinations", () => {
  const readyNowWithoutSizes = structuredClone(DEFAULT_PLATFORM_CONTENT);
  readyNowWithoutSizes.products[0]!.fulfilmentState = "ready_now";
  readyNowWithoutSizes.products[0]!.readyNowSizes = [];
  assert.equal(PlatformContentSchema.safeParse(readyNowWithoutSizes).success, false);

  const trulyUnavailable = structuredClone(DEFAULT_PLATFORM_CONTENT);
  trulyUnavailable.products[0]!.fulfilmentState = "unavailable";
  assert.equal(PlatformContentSchema.safeParse(trulyUnavailable).success, false);
  trulyUnavailable.products[0]!.unavailableMessage = "This piece is not currently available.";
  assert.equal(PlatformContentSchema.safeParse(trulyUnavailable).success, true);

  trulyUnavailable.products[0]!.readyNowSizes = ["S"];
  assert.equal(PlatformContentSchema.safeParse(trulyUnavailable).success, false);

  const makeableWithoutPurchaseRoute = structuredClone(DEFAULT_PLATFORM_CONTENT);
  makeableWithoutPurchaseRoute.products[0]!.standardEligible = false;
  makeableWithoutPurchaseRoute.products[0]!.standardSizes = [];
  makeableWithoutPurchaseRoute.products[0]!.customEligible = false;
  assert.equal(PlatformContentSchema.safeParse(makeableWithoutPurchaseRoute).success, false);

  const customInStandardSizes = structuredClone(DEFAULT_PLATFORM_CONTENT);
  customInStandardSizes.products[0]!.standardSizes.push("Custom");
  assert.equal(PlatformContentSchema.safeParse(customInStandardSizes).success, false);

  const incompleteCommerceMapping = structuredClone(DEFAULT_PLATFORM_CONTENT);
  incompleteCommerceMapping.products[0]!.commerceProductId = "0efebec6-2687-4d2f-9350-f67282534d30";
  incompleteCommerceMapping.products[0]!.commerceVariantIds = {
    S: "a725a2f5-5cdd-46e7-a36d-c0c5beef6a31",
  };
  assert.equal(PlatformContentSchema.safeParse(incompleteCommerceMapping).success, false);

  incompleteCommerceMapping.products[0]!.standardSizes = ["S"];
  incompleteCommerceMapping.products[0]!.commerceVariantIds.Custom = "618626e6-f359-4167-853c-2370df34c686";
  assert.equal(PlatformContentSchema.safeParse(incompleteCommerceMapping).success, true);
});

test("catalogue governance validates selectable sizes, variant keys, approved imagery, and relationships", () => {
  const invalid = structuredClone(DEFAULT_PLATFORM_CONTENT);
  const first = invalid.products[0]!;
  first.standardSizes.push(first.standardSizes[0]!);
  first.sizes = first.sizes.filter((size) => size !== "M");
  first.images.push(structuredClone(first.images[0]!));
  first.img = "/images/soso/not-approved.jpg";
  first.relatedProductSlugs = [invalid.products[1]!.slug, invalid.products[1]!.slug, "unknown-piece"];
  first.commerceProductId = "0efebec6-2687-4d2f-9350-f67282534d30";
  first.commerceVariantIds = Object.fromEntries([
    ...first.standardSizes.map((size) => [size, "a725a2f5-5cdd-46e7-a36d-c0c5beef6a31"]),
    ["Custom", "618626e6-f359-4167-853c-2370df34c686"],
    ["Not a size", "85295825-896a-481f-bb47-5db698168739"],
  ]);

  const parsed = PlatformContentSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => issue.message);
    assert.ok(messages.some((message) => message.includes("Duplicate standardSizes")));
    assert.ok(messages.some((message) => message.includes("selectable sizes")));
    assert.ok(messages.some((message) => message.includes("approved images")));
    assert.ok(messages.some((message) => message.includes("Duplicate approved product image")));
    assert.ok(messages.some((message) => message.includes("Duplicate related product")));
    assert.ok(messages.some((message) => message.includes("Invalid related product")));
    assert.ok(messages.some((message) => message.includes("ineligible size")));
  }
});

test("material turn sets require complete ordered pairs with stable unique identities and sources", () => {
  const valid = structuredClone(DEFAULT_PLATFORM_CONTENT);
  const image = (src: string, alt: string) => ({
    src,
    alt,
    provenance: { source: "SOSO Africa supplied asset", rights: "Approved for SOSO storefront use" },
  });
  valid.products[0]!.materialTurnSets = [
    {
      id: "midnight-wool",
      label: "Midnight wool",
      front: image("/images/soso/midnight-wool-front.jpg", "Midnight wool front"),
      back: image("/images/soso/midnight-wool-back.jpg", "Midnight wool back"),
    },
    {
      id: "ivory-linen",
      label: "Ivory linen",
      front: image("/images/soso/ivory-linen-front.jpg", "Ivory linen front"),
      back: image("/images/soso/ivory-linen-back.jpg", "Ivory linen back"),
    },
  ];
  assert.equal(PlatformContentSchema.safeParse(valid).success, true);

  const invalid = structuredClone(valid);
  invalid.products[0]!.materialTurnSets[1]!.id = "midnight-wool";
  invalid.products[0]!.materialTurnSets[1]!.label = " ";
  invalid.products[0]!.materialTurnSets[1]!.front.src = invalid.products[0]!.materialTurnSets[0]!.front.src;
  invalid.products[0]!.materialTurnSets[1]!.back.src = invalid.products[0]!.materialTurnSets[1]!.front.src;
  const parsed = PlatformContentSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((issue) =>
      issue.path.join(".") === "products.0.materialTurnSets.1.id"
      && issue.message.includes("Duplicate material turn set ID")));
    assert.ok(parsed.error.issues.some((issue) =>
      issue.path.join(".") === "products.0.materialTurnSets.1.label"));
    assert.ok(parsed.error.issues.some((issue) =>
      issue.path.join(".") === "products.0.materialTurnSets.1.back.src"
      && issue.message.includes("must be distinct")));
    assert.ok(parsed.error.issues.some((issue) => issue.message.includes("Duplicate material turn image source")));
  }

  const incomplete = structuredClone(valid) as unknown as {
    products: Array<{ materialTurnSets: Array<Record<string, unknown>> }>;
  };
  delete incomplete.products[0]!.materialTurnSets[0]!.back;
  const incompleteResult = PlatformContentSchema.safeParse(incomplete);
  assert.equal(incompleteResult.success, false);
  if (!incompleteResult.success) {
    assert.ok(incompleteResult.error.issues.some((issue) =>
      issue.path.join(".") === "products.0.materialTurnSets.0.back"));
  }

  const tooMany = structuredClone(valid);
  tooMany.products[0]!.materialTurnSets = Array.from({ length: 9 }, (_, index) => ({
    id: `material-${index}`,
    label: `Material ${index}`,
    front: image(`/images/soso/material-${index}-front.jpg`, `Material ${index} front`),
    back: image(`/images/soso/material-${index}-back.jpg`, `Material ${index} back`),
  }));
  assert.equal(PlatformContentSchema.safeParse(tooMany).success, false);
});

test("product image publishing checks verify existence, image identity, extension, and budget", async () => {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  content.products[0]!.images = [
    content.products[0]!.images[0]!,
    {
      src: "/api/storage/objects/uploads/vault-alternate.webp",
      alt: "Alternate view of the Vault kaftan",
      provenance: { source: "SOSO Africa supplied asset", rights: "Approved for SOSO storefront use" },
    },
  ];

  const validIssues = await validateProductMediaAssets(content, async (path) =>
    validProductMediaInspection(path, 350_000));
  assert.deepEqual(validIssues, []);

  const missingIssues = await validateProductMediaAssets(content, async () => null);
  const configuredLocations = content.products.reduce((total, product) => (
    total
    + product.images.length
    + product.materialTurnSets.length * 2
    + product.colourOptions.filter((option) => option.previewImageSrc).length
    + (product.colourVisualizer ? 2 : 0)
  ), 0);
  assert.ok(missingIssues.length >= configuredLocations);
  assert.ok(missingIssues.every((issue) =>
    issue.message.includes("verified bundled or SOSO Cloudinary")
    || issue.message.includes("could not be verified")));

  const invalidIssues = await validateProductMediaAssets(content, async (path) => ({
    contentType: "video/mp4",
    declaredContentType: "application/octet-stream",
    size: path.endsWith(".webp") ? 13 * 1024 * 1024 : 350_000,
  }));
  assert.ok(invalidIssues.some((issue) => issue.message.includes("publishing budget")));
  assert.ok(invalidIssues.some((issue) => issue.message.includes("bytes, MIME type")));

  const unreadableIssues = await validateProductMediaAssets(content, async () => {
    throw new Error("Object not found");
  });
  assert.ok(unreadableIssues.every((issue) => issue.message.includes("could not be verified")));
});

test("material turn publication checks govern front and back images at their exact paths", async () => {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  const provenance = { source: "SOSO Africa supplied asset", rights: "Approved for SOSO storefront use" };
  content.products[0]!.materialTurnSets = [{
    id: "woven-silk",
    label: "Woven silk",
    front: { src: "/images/soso/woven-silk-front.jpg", alt: "Woven silk front", provenance },
    back: { src: "/images/soso/woven-silk-back.webp", alt: "Woven silk back", provenance },
  }];
  const inspected: string[] = [];
  const validIssues = await validateProductMediaAssets(content, async (path) => {
    inspected.push(path);
    return validProductMediaInspection(path);
  });
  assert.deepEqual(validIssues, []);
  assert.ok(inspected.includes("/images/soso/woven-silk-front.jpg"));
  assert.ok(inspected.includes("/images/soso/woven-silk-back.webp"));

  const issues = await validateProductMediaAssets(content, async (path) =>
    path.includes("woven-silk") ? null : {
      contentType: "image/jpeg",
      declaredContentType: "image/jpeg",
      size: 250_000,
    });
  assert.ok(issues.some((issue) =>
    issue.path.join(".") === "products.0.materialTurnSets.0.front.src"));
  assert.ok(issues.some((issue) =>
    issue.path.join(".") === "products.0.materialTurnSets.0.back.src"));
});

test("homepage merchandising image checks inspect unique configured images and report their fields", async () => {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  assert.deepEqual(await validateHomepageMerchandisingMediaAssets(content), []);
  content.homepage.newArrival.editorial.imageUrl = "/images/soso/twopiece.jpg";
  content.homepage.fit.imageUrl = content.homepage.categories.items[0]!.imageUrl;
  const inspected: string[] = [];
  const validIssues = await validateHomepageMerchandisingMediaAssets(content, async (path) => {
    inspected.push(path);
    return { contentType: "image/jpeg", declaredContentType: "image/jpeg", size: 200_000 };
  });
  assert.deepEqual(validIssues, []);
  const configured = [
    ...content.homepage.categories.items.map((item) => item.imageUrl),
    ...content.homepage.categories.items.flatMap((item) => item.imageUrls ?? []),
    content.homepage.newArrival.editorial.imageUrl,
    ...content.homepage.occasions.items.map((item) => item.imageUrl),
    content.homepage.fit.imageUrl,
  ];
  assert.equal(inspected.length, new Set(configured).size);
  const invalid = await validateHomepageMerchandisingMediaAssets(content, async () => null);
  assert.equal(invalid.length, configured.length);
  assert.ok(invalid.some((issue) => issue.path.join(".") === "homepage.newArrival.editorial.imageUrl"));
});

test("header search suggestions only publish unique safe catalogue targets", () => {
  const valid = structuredClone(DEFAULT_PLATFORM_CONTENT);
  valid.site.header.searchSuggestions = [
    { label: "All pieces", href: "/shop?search=occasion" },
    { label: "Vault", href: `/product/${valid.products[0]!.slug}` },
    { label: "Kaftans", href: `/collections/${valid.collections[0]!.slug}` },
  ];
  assert.equal(PlatformContentSchema.safeParse(valid).success, true);

  valid.site.header.searchSuggestions.push(
    { label: "Duplicate Vault", href: `/product/${valid.products[0]!.slug}` },
    { label: "Unknown product", href: "/product/not-published" },
    { label: "Unrelated internal route", href: "/checkout" },
  );
  const parsed = PlatformContentSchema.safeParse(valid);
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((issue) => issue.message.includes("Duplicate search suggestion target")));
    assert.ok(parsed.error.issues.filter((issue) => issue.message.includes("Unsafe or unknown")).length >= 2);
  }
});

test("mega menus reject unsafe links, empty visible departments, and mismatched featured products", () => {
  const invalid = structuredClone(DEFAULT_PLATFORM_CONTENT);
  invalid.site.megaMenu[0]!.columns[0]!.links[0]!.href = "/checkout";
  invalid.products = invalid.products.filter((product) => product.department !== "women");
  invalid.site.megaMenu[1]!.visible = true;
  invalid.site.megaMenu[1]!.featuredProductSlugs = [invalid.products[0]!.slug];

  const parsed = PlatformContentSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => issue.message);
    assert.ok(messages.some((message) => message.includes("Unsafe or unknown mega-menu link")));
    assert.ok(messages.some((message) => message.includes("requires at least one available product")));
    assert.ok(messages.some((message) => message.includes("does not belong to women")));
  }
});

test("site settings validate governed ticker, address, and social links", () => {
  const valid = structuredClone(DEFAULT_PLATFORM_CONTENT);
  assert.equal(PlatformContentSchema.safeParse(valid).success, true);
  assert.equal(
    valid.site.megaMenu.find((group) => group.id === "men")?.columns
      .flatMap((column) => column.links)
      .some((link) => link.href === "/shop?department=men&sort=newest"),
    true,
  );

  valid.site.announcementItems = [""];
  valid.site.hqAddress = "";
  valid.site.socialLinks.facebookUrl = "http://facebook.com/soso";
  valid.site.contactPhone = "call SOSO";
  const parsed = PlatformContentSchema.safeParse(valid);
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((issue) => issue.path.join(".") === "site.announcementItems.0"));
    assert.ok(parsed.error.issues.some((issue) => issue.path.join(".") === "site.hqAddress"));
    assert.ok(parsed.error.issues.some((issue) => issue.path.join(".") === "site.socialLinks.facebookUrl"));
    assert.ok(parsed.error.issues.some((issue) => issue.path.join(".") === "site.contactPhone"));
  }

  const validContacts = structuredClone(DEFAULT_PLATFORM_CONTENT);
  validContacts.site.contactEmail = "hello@shopsoso.co";
  validContacts.site.contactPhone = "+234 (0) 800 123 4567";
  assert.equal(PlatformContentSchema.safeParse(validContacts).success, true);
});

test("the women launch upgrade appends missing catalogue content without replacing men edits", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT);
  legacy.contentVersion = 1;
  legacy.products = legacy.products.filter((product) => product.department === "men");
  legacy.collections = legacy.collections.filter((collection) => collection.department === "men");
  legacy.products[0]!.price = 275000;
  legacy.site.megaMenu[1] = {
    id: "women",
    label: "Women",
    href: "/shop?department=women",
    department: "women",
    visible: false,
    columns: [{ heading: "Shop", links: [{ label: "Women’s collection", href: "/shop?department=women" }] }],
    featuredProductSlugs: [],
  };

  const upgraded = mergePlatformContentDefaults(legacy);
  const parsed = PlatformContentSchema.safeParse(upgraded);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.products[0]!.price, 275000);
    assert.equal(parsed.data.products.filter((product) => product.department === "women").length, 6);
    assert.equal(parsed.data.collections.some((collection) => collection.slug === "women-ready-to-wear"), true);
    assert.equal(parsed.data.site.megaMenu.find((group) => group.id === "women")?.visible, true);
    assert.deepEqual(parsed.data.site.megaMenu.find((group) => group.id === "women")?.featuredProductSlugs, ["canvas", "varen"]);
  }
});

test("the women launch upgrade does not restore products or collections after staff changes", () => {
  const retired = structuredClone(DEFAULT_PLATFORM_CONTENT);
  retired.products = retired.products.filter((product) => product.department !== "women");
  retired.collections = retired.collections.filter((collection) => collection.department !== "women");
  const retiredWomenMenu = retired.site.megaMenu.find((group) => group.id === "women")!;
  retiredWomenMenu.visible = false;
  retiredWomenMenu.featuredProductSlugs = [];
  retiredWomenMenu.columns = [{
    heading: "Shop",
    links: [{ label: "Women", href: "/shop?department=women" }],
  }];

  const upgradedRetired = mergePlatformContentDefaults(retired) as typeof retired;
  assert.equal(PlatformContentSchema.safeParse(upgradedRetired).success, true);
  assert.equal(upgradedRetired.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
  assert.equal(upgradedRetired.products.some((product) => product.department === "women"), false);
  assert.equal(upgradedRetired.collections.some((collection) => collection.department === "women"), false);
  assert.equal(upgradedRetired.site.megaMenu.find((group) => group.id === "women")?.visible, false);

  const renamed = structuredClone(DEFAULT_PLATFORM_CONTENT);
  renamed.products.find((product) => product.slug === "canvas")!.slug = "canvas-staff-edit";
  const renamedWomenMenu = renamed.site.megaMenu.find((group) => group.id === "women")!;
  renamedWomenMenu.featuredProductSlugs = renamedWomenMenu.featuredProductSlugs
    .map((slug) => slug === "canvas" ? "canvas-staff-edit" : slug);

  const upgradedRenamed = mergePlatformContentDefaults(renamed) as typeof renamed;
  assert.equal(PlatformContentSchema.safeParse(upgradedRenamed).success, true);
  assert.equal(upgradedRenamed.products.some((product) => product.slug === "canvas"), false);
  assert.equal(upgradedRenamed.products.some((product) => product.slug === "canvas-staff-edit"), true);
});

test("optional product detail copy validates and survives default upgrades without replacing merchant edits", () => {
  const governed = structuredClone(DEFAULT_PLATFORM_CONTENT);
  governed.products[0]!.composition = "100% atelier-selected cotton.";
  governed.products[0]!.care = "Dry clean only.";
  governed.products[0]!.delivery = "Dispatch estimate is shown above.";
  governed.products[0]!.returns = "See the published returns policy.";
  const upgraded = mergePlatformContentDefaults(governed) as typeof governed;
  assert.equal(PlatformContentSchema.safeParse(upgraded).success, true);
  assert.equal(upgraded.products[0]!.composition, "100% atelier-selected cotton.");
  assert.equal(upgraded.products[0]!.care, "Dry clean only.");

  const omitted = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  delete omitted.site.header.searchLabel;
  delete omitted.site.header.searchSuggestions;
  delete omitted.products[0].composition;
  const merged = mergePlatformContentDefaults(omitted) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.deepEqual(merged.site.header.searchSuggestions, DEFAULT_PLATFORM_CONTENT.site.header.searchSuggestions);
  assert.equal(merged.products[0]!.composition, undefined);
});

test("product detail labels are required, defaulted, and preserve merchant edits", () => {
  const missingLabels = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  delete missingLabels.productCopy.compositionLabel;
  delete missingLabels.productCopy.careLabel;
  delete missingLabels.productCopy.deliveryLabel;
  delete missingLabels.productCopy.returnsLabel;
  assert.equal(PlatformContentSchema.safeParse(missingLabels).success, false);

  const merged = mergePlatformContentDefaults(missingLabels) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(PlatformContentSchema.safeParse(merged).success, true);
  assert.equal(merged.productCopy.compositionLabel, DEFAULT_PLATFORM_CONTENT.productCopy.compositionLabel);
  assert.equal(merged.productCopy.careLabel, DEFAULT_PLATFORM_CONTENT.productCopy.careLabel);
  assert.equal(merged.productCopy.deliveryLabel, DEFAULT_PLATFORM_CONTENT.productCopy.deliveryLabel);
  assert.equal(merged.productCopy.returnsLabel, DEFAULT_PLATFORM_CONTENT.productCopy.returnsLabel);

  const merchantEdited = structuredClone(DEFAULT_PLATFORM_CONTENT);
  merchantEdited.productCopy.compositionLabel = "Materials";
  merchantEdited.productCopy.careLabel = "Garment care";
  merchantEdited.productCopy.deliveryLabel = "Shipping";
  merchantEdited.productCopy.returnsLabel = "Exchanges";
  assert.deepEqual(mergePlatformContentDefaults(merchantEdited), merchantEdited);
});

test("product detail source reads governed labels for product-specific detail copy", () => {
  const source = readFileSync(new URL("../../../soso-store/src/pages/ProductDetail.tsx", import.meta.url), "utf8");
  for (const label of ["compositionLabel", "careLabel", "deliveryLabel", "returnsLabel"]) {
    assert.ok(source.includes(`productCopy.${label}`), `ProductDetail omits governed ${label}`);
  }
  for (const literal of ['title: "Composition"', 'title: "Care"', 'title: "Delivery"', 'title: "Returns"']) {
    assert.equal(source.includes(literal), false, `ProductDetail hardcodes ${literal}`);
  }
});

test("legacy upgrades never populate an unpublished platform document", () => {
  const unpublished = {};
  assert.equal(mergePublishedPlatformContentDefaults(unpublished, null), unpublished);

  const staleUnpublishedCopy = { site: { name: "Retired storefront" } };
  assert.equal(mergePublishedPlatformContentDefaults(staleUnpublishedCopy, null), staleUnpublishedCopy);

  const published = mergePublishedPlatformContentDefaults(staleUnpublishedCopy, new Date());
  assert.notEqual(published, staleUnpublishedCopy);
  assert.equal((published as typeof DEFAULT_PLATFORM_CONTENT).site.name, "Retired storefront");
});

test("known bespoke-only defaults upgrade to hybrid copy without replacing merchant edits", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT);
  legacy.site.announcement = "Fit guidance if you need it · Atelier details confirmed after payment";
  legacy.homepage.hero.eyebrow = "Bespoke Menswear · Abuja, Nigeria";
  legacy.pages.shop.title = "The Collection";
  legacy.pages.about.whatWeMake.paragraphs[1] = "Every piece is made to order. Nothing in the collection is taken from a production rack. When you order from SOSO, your garment is made for you.";
  const upgraded = mergePlatformContentDefaults(legacy) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(upgraded.site.announcement, DEFAULT_PLATFORM_CONTENT.site.announcement);
  assert.equal(upgraded.homepage.hero.eyebrow, DEFAULT_PLATFORM_CONTENT.homepage.hero.eyebrow);
  assert.equal(upgraded.pages.shop.title, DEFAULT_PLATFORM_CONTENT.pages.shop.title);
  assert.equal(upgraded.pages.about.whatWeMake.paragraphs[1], DEFAULT_PLATFORM_CONTENT.pages.about.whatWeMake.paragraphs[1]);

  legacy.pages.shop.title = "Merchant seasonal edit";
  const preserved = mergePlatformContentDefaults(legacy) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(preserved.pages.shop.title, "Merchant seasonal edit");
});

test("known shipped hero defaults become quieter without replacing merchant campaign copy", () => {
  const shipped = structuredClone(DEFAULT_PLATFORM_CONTENT);
  shipped.homepage.hero.eyebrow = "New season · Ready now & made immediately";
  shipped.homepage.hero.title = "Dress like the man";
  shipped.homepage.hero.suffix = "for.";
  shipped.homepage.hero.accent = "make way";
  shipped.homepage.hero.description = "Shop premium kaftans, agbadas and refined separates in Standard sizes or Custom. Buy directly, with fit guidance and optional stylist support when you want it.";
  shipped.homepage.hero.primaryCta.label = "Shop the Collection";

  const upgraded = mergePlatformContentDefaults(shipped) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.deepEqual(upgraded.homepage.hero, DEFAULT_PLATFORM_CONTENT.homepage.hero);

  shipped.homepage.hero.title = "Merchant campaign headline";
  shipped.homepage.hero.description = "Merchant campaign description";
  const preserved = mergePlatformContentDefaults(shipped) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(preserved.homepage.hero.title, "Merchant campaign headline");
  assert.equal(preserved.homepage.hero.description, "Merchant campaign description");
  assert.equal(preserved.homepage.hero.accent, DEFAULT_PLATFORM_CONTENT.homepage.hero.accent);
});

test("platform schema upgrades fill missing fields without replacing edited content", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  legacy.contentVersion = 2;
  legacy.site.announcement = "A merchant-edited announcement";
  delete legacy.site.announcementItems;
  delete legacy.site.hqAddress;
  delete legacy.site.socialLinks;
  delete legacy.site.megaMenu;
  delete legacy.pages.shop.departments;
  delete legacy.pages.about;
  delete legacy.productCopy.addToBagLabel;
  delete legacy.supportCopy.productHelp;
  delete legacy.supportCopy.stylistDialog;
  delete legacy.pages.paymentReturn.statusUnavailableMessage;
  delete legacy.pages.policies.privacyRequest.invalidEmailMessage;
  delete legacy.site.skipLinkLabel;
  delete legacy.pages.faq.listAriaLabel;
  delete legacy.productCopy.detailImageAltSuffix;
  delete legacy.productCopy.sizeGuideCloseLabel;
  delete legacy.site.consent;
  delete legacy.pages.checkout;
  legacy.homepage.hero.imageUrl = "/images/soso/merchant-hero.jpg";
  legacy.homepage.hero.imageAlt = "Merchant seasonal campaign";
  delete legacy.homepage.hero.mediaMode;
  delete legacy.homepage.hero.mobileImageUrl;
  delete legacy.homepage.hero.playLabel;
  delete legacy.homepage.hero.pauseLabel;
  legacy.products[0].colour = "Merchant-edited midnight black";
  delete legacy.products[0].department;
  delete legacy.products[0].fabric;
  delete legacy.products[0].fit;
  delete legacy.products[0].searchableTerms;
  delete legacy.products[0].merchandising;
  delete legacy.products[0].standardEligible;
  delete legacy.products[0].customEligible;
  delete legacy.products[0].standardSizes;
  delete legacy.products[0].readyNowSizes;
  delete legacy.products[0].fulfilmentState;
  delete legacy.products[0].dispatchMessage;
  delete legacy.products[0].images[0].provenance;
  delete legacy.collections[0].department;

  const upgraded = mergePlatformContentDefaults(legacy);
  const parsed = PlatformContentSchema.safeParse(upgraded);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
    assert.equal(parsed.data.site.announcement, "A merchant-edited announcement");
    assert.equal(parsed.data.site.announcementItems[0], "A merchant-edited announcement");
    assert.equal(parsed.data.site.hqAddress, DEFAULT_PLATFORM_CONTENT.site.hqAddress);
    assert.deepEqual(parsed.data.site.socialLinks, DEFAULT_PLATFORM_CONTENT.site.socialLinks);
    assert.equal(
      parsed.data.site.megaMenu.find((group) => group.id === "men")?.columns
        .flatMap((column) => column.links)
        .some((link) => link.href === "/shop?department=men&sort=newest"),
      true,
    );
    assert.deepEqual(parsed.data.site.megaMenu, DEFAULT_PLATFORM_CONTENT.site.megaMenu);
    assert.equal(parsed.data.pages.shop.departments.women.title, DEFAULT_PLATFORM_CONTENT.pages.shop.departments.women.title);
    assert.equal(parsed.data.productCopy.addToBagLabel, DEFAULT_PLATFORM_CONTENT.productCopy.addToBagLabel);
    assert.equal(parsed.data.pages.about.hero.title, DEFAULT_PLATFORM_CONTENT.pages.about.hero.title);
    assert.equal(parsed.data.site.consent.title, DEFAULT_PLATFORM_CONTENT.site.consent.title);
    assert.equal(parsed.data.pages.checkout.title, DEFAULT_PLATFORM_CONTENT.pages.checkout.title);
    assert.equal(parsed.data.supportCopy.stylistDialog.title, DEFAULT_PLATFORM_CONTENT.supportCopy.stylistDialog.title);
    assert.equal(parsed.data.pages.paymentReturn.statusUnavailableMessage, DEFAULT_PLATFORM_CONTENT.pages.paymentReturn.statusUnavailableMessage);
    assert.equal(parsed.data.pages.policies.privacyRequest.invalidEmailMessage, DEFAULT_PLATFORM_CONTENT.pages.policies.privacyRequest.invalidEmailMessage);
    assert.equal(parsed.data.site.skipLinkLabel, DEFAULT_PLATFORM_CONTENT.site.skipLinkLabel);
    assert.equal(parsed.data.homepage.hero.mediaMode, "image");
    assert.equal(parsed.data.homepage.hero.imageUrl, "/images/soso/merchant-hero.jpg");
    assert.equal(parsed.data.homepage.hero.mobileImageUrl, "/images/soso/merchant-hero.jpg");
    assert.equal(parsed.data.homepage.hero.imageAlt, "Merchant seasonal campaign");
    assert.equal(parsed.data.pages.faq.listAriaLabel, DEFAULT_PLATFORM_CONTENT.pages.faq.listAriaLabel);
    assert.equal(parsed.data.productCopy.detailImageAltSuffix, DEFAULT_PLATFORM_CONTENT.productCopy.detailImageAltSuffix);
    assert.equal(parsed.data.productCopy.sizeGuideCloseLabel, DEFAULT_PLATFORM_CONTENT.productCopy.sizeGuideCloseLabel);
    assert.equal(parsed.data.products[0]!.colour, "Merchant-edited midnight black");
    assert.equal(parsed.data.products[0]!.department, "men");
    assert.equal(parsed.data.collections[0]!.department, "men");
    assert.equal(parsed.data.products[0]!.fabric, "Atelier-selected fabric");
    assert.equal(parsed.data.products[0]!.fulfilmentState, "made_immediately");
    assert.deepEqual(parsed.data.products[0]!.readyNowSizes, []);
    assert.equal(parsed.data.products[0]!.dispatchMessage, "Dispatch within five days");
    assert.equal(parsed.data.products[0]!.images[0]!.provenance.source, "SOSO Africa supplied asset");
  }
});

test("payment return measurement copy is strict and v4 default merging preserves staff edits", () => {
  for (const key of [
    "measurementSyncError",
    "noticeLabel",
    "requiredMeasurementsGuidance",
    "optionalMeasurementsGuidance",
    "measurementRangeErrorTemplate",
    "measurementConflictError",
    "measurementSubmitError",
    "atelierNoteLabel",
    "productionExceptionLabel",
    "unitLabel",
    "unitsGroupAriaLabel",
    "optionalContextPlaceholder",
    "submittingMeasurementsLabel",
    "submitMeasurementsLabel",
    "updateMeasurementsLabel",
  ]) {
    const incomplete = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
    delete incomplete.pages.paymentReturn[key];
    const parsed = PlatformContentSchema.safeParse(incomplete);
    assert.equal(parsed.success, false, `${key} must be required`);
  }
  const incompleteStatus = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  delete incompleteStatus.pages.paymentReturn.measurementStatusLabels.confirmed;
  assert.equal(PlatformContentSchema.safeParse(incompleteStatus).success, false);
  const incompleteFieldLabel = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  delete incompleteFieldLabel.pages.paymentReturn.measurementFieldLabels.height;
  assert.equal(PlatformContentSchema.safeParse(incompleteFieldLabel).success, false);
  const invalidTemplate = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  invalidTemplate.pages.paymentReturn.measurementRangeErrorTemplate = "{label} must be valid";
  assert.equal(PlatformContentSchema.safeParse(invalidTemplate).success, false);

  const migratedV4 = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  migratedV4.pages.paymentReturn.measurementSyncError = "Merchant measurement sync notice.";
  migratedV4.pages.paymentReturn.measurementStatusLabels.needed = "Merchant review needed";
  delete migratedV4.pages.paymentReturn.measurementConflictError;
  delete migratedV4.pages.paymentReturn.measurementFieldLabels.sleeve;

  const upgraded = mergePlatformContentDefaults(migratedV4) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(upgraded.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
  assert.equal(upgraded.pages.paymentReturn.measurementSyncError, "Merchant measurement sync notice.");
  assert.equal(upgraded.pages.paymentReturn.measurementStatusLabels.needed, "Merchant review needed");
  assert.equal(upgraded.pages.paymentReturn.measurementConflictError, DEFAULT_PLATFORM_CONTENT.pages.paymentReturn.measurementConflictError);
  assert.equal(upgraded.pages.paymentReturn.measurementFieldLabels.sleeve, DEFAULT_PLATFORM_CONTENT.pages.paymentReturn.measurementFieldLabels.sleeve);
  assert.equal(PlatformContentSchema.safeParse(upgraded).success, true);
});

test("version 4 adds governed interface copy without restoring v3 menu or ticker choices", () => {
  const version3 = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  version3.contentVersion = 3;
  version3.site.announcementItems = ["Merchant ticker only"];
  version3.site.megaMenu = version3.site.megaMenu.filter((group: { id: string }) => group.id !== "accessories");
  version3.site.header.clearSearchLabel = "Merchant clear search";
  version3.pages.shop.sortOptions.featured = "Merchant picks";
  version3.productCopy.quickShopTitle = "Merchant quick shop";
  version3.interfaceCopy = undefined;
  delete version3.site.structuredData;
  delete version3.site.cart.quantityLabel;
  delete version3.pages.shop.departmentLabels;
  delete version3.productCopy.viewFullDetailsLabel;

  const upgraded = mergePlatformContentDefaults(version3);
  const parsed = PlatformContentSchema.safeParse(upgraded);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
    assert.deepEqual(parsed.data.site.announcementItems, ["Merchant ticker only"]);
    assert.equal(parsed.data.site.megaMenu.some((group) => group.id === "accessories"), false);
    assert.equal(parsed.data.site.header.clearSearchLabel, "Merchant clear search");
    assert.equal(parsed.data.pages.shop.sortOptions.featured, "Merchant picks");
    assert.equal(parsed.data.productCopy.quickShopTitle, "Merchant quick shop");
    assert.equal(parsed.data.productCopy.viewFullDetailsLabel, DEFAULT_PLATFORM_CONTENT.productCopy.viewFullDetailsLabel);
    assert.equal(parsed.data.interfaceCopy.search.productsHeading, DEFAULT_PLATFORM_CONTENT.interfaceCopy.search.productsHeading);
  }
});

test("version 6 unifies hero motion with merchandising without replacing a merchant image choice", () => {
  const legacyDefault = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  // The task branch also reached version 5 before hero motion became its
  // default; version 6 must upgrade that parallel document shape.
  legacyDefault.contentVersion = 5;
  legacyDefault.homepage.hero.mediaMode = "image";
  delete legacyDefault.homepage.hero.videoUrl;
  delete legacyDefault.homepage.hero.mobileVideoUrl;

  const upgradedDefault = mergePlatformContentDefaults(legacyDefault) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(upgradedDefault.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
  assert.equal(upgradedDefault.homepage.hero.mediaMode, "video");
  assert.equal(upgradedDefault.homepage.hero.videoUrl, "/media/soso-craft-hero-desktop.webm");
  assert.equal(upgradedDefault.homepage.hero.mobileVideoUrl, "/media/soso-craft-hero-mobile.webm");

  const merchantImage = structuredClone(legacyDefault);
  merchantImage.homepage.hero.imageUrl = "/images/soso/agbada.jpg";
  merchantImage.homepage.hero.mobileImageUrl = "/images/soso/agbada.jpg";
  const upgradedMerchantImage = mergePlatformContentDefaults(merchantImage) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(upgradedMerchantImage.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
  assert.equal(upgradedMerchantImage.homepage.hero.mediaMode, "image");
  assert.equal(upgradedMerchantImage.homepage.hero.videoUrl, undefined);
  assert.equal(upgradedMerchantImage.homepage.hero.mobileVideoUrl, undefined);
  assert.equal(PlatformContentSchema.safeParse(upgradedMerchantImage).success, true);
});

test("version 18 adopts the approved craft hero without replacing merchant video choices", () => {
  const shippedDefault = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  shippedDefault.contentVersion = 17;
  shippedDefault.homepage.hero.videoUrl = "/media/soso-black-hero-desktop.webm";
  shippedDefault.homepage.hero.mobileVideoUrl = "/media/soso-black-hero-mobile.webm";

  const upgradedDefault = mergePlatformContentDefaults(shippedDefault) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(upgradedDefault.contentVersion, DEFAULT_PLATFORM_CONTENT.contentVersion);
  assert.equal(upgradedDefault.homepage.hero.videoUrl, "/media/soso-craft-hero-desktop.webm");
  assert.equal(upgradedDefault.homepage.hero.mobileVideoUrl, "/media/soso-craft-hero-mobile.webm");

  const merchantVideo = structuredClone(shippedDefault);
  merchantVideo.homepage.hero.videoUrl = "/api/storage/objects/uploads/merchant-desktop.webm";
  merchantVideo.homepage.hero.mobileVideoUrl = "/api/storage/objects/uploads/merchant-mobile.webm";
  const upgradedMerchantVideo = mergePlatformContentDefaults(merchantVideo) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(upgradedMerchantVideo.homepage.hero.videoUrl, merchantVideo.homepage.hero.videoUrl);
  assert.equal(upgradedMerchantVideo.homepage.hero.mobileVideoUrl, merchantVideo.homepage.hero.mobileVideoUrl);
});

test("version 7 removes only the shipped announcements and permits Staff to hide the strip", () => {
  const shipped = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  shipped.contentVersion = 6;
  shipped.site.announcementItems = [
    "Ready now and made immediately · Dispatch within five days",
    "Made in Abuja · Designed for presence",
    "Standard sizes or Custom · Choose your route",
  ];
  const upgradedShipped = mergePlatformContentDefaults(shipped) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.deepEqual(upgradedShipped.site.announcementItems, []);
  assert.equal(PlatformContentSchema.safeParse(upgradedShipped).success, true);

  const merchant = structuredClone(shipped);
  merchant.site.announcementItems = ["Private client weekend · 10% off selected pieces"];
  const upgradedMerchant = mergePlatformContentDefaults(merchant) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.deepEqual(upgradedMerchant.site.announcementItems, merchant.site.announcementItems);
});

test("version 8 category migration appends missing approved tiles without changing merchant order or image choices", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT);
  legacy.contentVersion = 7;
  legacy.homepage.categories.items = [
    legacy.homepage.categories.items[3]!,
    legacy.homepage.categories.items[0]!,
    legacy.homepage.categories.items[2]!,
    legacy.homepage.categories.items[1]!,
  ];
  legacy.homepage.categories.items[0]!.title = "Merchant Dashiki edit";
  legacy.homepage.categories.items[0]!.imageUrls = [];
  legacy.homepage.categories.items[1]!.imageUrls = ["/api/storage/objects/uploads/merchant-kaftan.webp"];

  const upgraded = mergePublishedPlatformContentDefaults(legacy, new Date()) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(PlatformContentSchema.safeParse(upgraded).success, true);
  assert.deepEqual(
    upgraded.homepage.categories.items.slice(0, 4).map((item) => item.href),
    legacy.homepage.categories.items.map((item) => item.href),
  );
  assert.equal(upgraded.homepage.categories.items[0]!.title, "Merchant Dashiki edit");
  assert.deepEqual(upgraded.homepage.categories.items[0]!.imageUrls, []);
  assert.deepEqual(upgraded.homepage.categories.items[1]!.imageUrls, ["/api/storage/objects/uploads/merchant-kaftan.webp"]);
  assert.deepEqual(upgraded.homepage.categories.items[4], DEFAULT_PLATFORM_CONTENT.homepage.categories.items[4]);
  assert.deepEqual(mergePublishedPlatformContentDefaults(upgraded, new Date()), upgraded);

  const unpublished = structuredClone(legacy);
  assert.equal(mergePublishedPlatformContentDefaults(unpublished, null), unpublished);
});

test("version 4 interface fields are required, strict, and non-blank", () => {
  const invalid = structuredClone(DEFAULT_PLATFORM_CONTENT) as Record<string, any>;
  invalid.pages.shop.sortOptions.featured = "  ";
  invalid.interfaceCopy.search.unexpected = "not allowed";
  const parsed = PlatformContentSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((issue) => issue.path.join(".") === "pages.shop.sortOptions.featured"));
    assert.ok(parsed.error.issues.some((issue) => issue.path.join(".") === "interfaceCopy.search"));
  }
});

test("homepage hero schema validates complete governed image and video combinations", () => {
  const still = structuredClone(DEFAULT_PLATFORM_CONTENT);
  assert.equal(PlatformContentSchema.safeParse(still).success, true);

  const video = structuredClone(DEFAULT_PLATFORM_CONTENT);
  video.homepage.hero.mediaMode = "video";
  video.homepage.hero.videoUrl = "/api/storage/objects/uploads/hero-desktop.mp4";
  video.homepage.hero.mobileVideoUrl = "/api/storage/objects/uploads/hero-mobile.webm";
  assert.equal(PlatformContentSchema.safeParse(video).success, true);

  delete video.homepage.hero.mobileVideoUrl;
  assert.equal(PlatformContentSchema.safeParse(video).success, false);

  video.homepage.hero.mediaMode = "image";
  video.homepage.hero.mobileVideoUrl = "/api/storage/objects/uploads/hero-mobile.webm";
  assert.equal(PlatformContentSchema.safeParse(video).success, false);

  const externalVideo = structuredClone(DEFAULT_PLATFORM_CONTENT);
  externalVideo.homepage.hero.mediaMode = "video";
  externalVideo.homepage.hero.videoUrl = "https://example.com/hero.mp4";
  externalVideo.homepage.hero.mobileVideoUrl = "/media/hero-mobile.webm";
  assert.equal(PlatformContentSchema.safeParse(externalVideo).success, false);
});

test("homepage hero publishing checks enforce uploaded poster and video identity and budgets", async () => {
  const video = structuredClone(DEFAULT_PLATFORM_CONTENT);
  video.homepage.hero.mediaMode = "video";
  video.homepage.hero.imageUrl = "/api/storage/objects/uploads/hero-desktop.jpg";
  video.homepage.hero.mobileImageUrl = "/api/storage/objects/uploads/hero-mobile.jpg";
  video.homepage.hero.videoUrl = "/api/storage/objects/uploads/hero-desktop.mp4";
  video.homepage.hero.mobileVideoUrl = "/api/storage/objects/uploads/hero-mobile.webm";

  const validIssues = await validateHomepageHeroMediaAssets(video, async (path) => ({
    contentType: path.endsWith(".jpg") ? "image/jpeg" : path.endsWith(".mp4") ? "video/mp4" : "video/webm",
    declaredContentType: path.endsWith(".jpg") ? "image/jpeg" : path.endsWith(".mp4") ? "video/mp4" : "video/webm",
    size: path.endsWith(".jpg") ? 500_000 : 2_000_000,
  }));
  assert.deepEqual(validIssues, []);

  const invalidIssues = await validateHomepageHeroMediaAssets(video, async (path) => ({
    contentType: path.endsWith(".jpg") ? "video/mp4" : "video/webm",
    declaredContentType: "application/octet-stream",
    size: path.endsWith(".jpg") ? 600_000 : 9_000_000,
  }));
  assert.equal(invalidIssues.length, 8);
  assert.ok(invalidIssues.some((issue) => issue.path.at(-1) === "imageUrl" && /budget/.test(issue.message)));
  assert.ok(invalidIssues.some((issue) => issue.path.at(-1) === "videoUrl" && /must match/.test(issue.message)));

  const crossExtensionIssues = await validateHomepageHeroMediaAssets(video, async (path) => ({
    contentType: path.endsWith(".jpg") ? "image/jpeg" : path.endsWith(".mp4") ? "video/webm" : "video/mp4",
    declaredContentType: path.endsWith(".jpg") ? "image/jpeg" : path.endsWith(".mp4") ? "video/webm" : "video/mp4",
    size: path.endsWith(".jpg") ? 500_000 : 2_000_000,
  }));
  assert.deepEqual(
    crossExtensionIssues.map((issue) => issue.path.at(-1)).sort(),
    ["mobileVideoUrl", "videoUrl"],
  );

  const animatedPosterIssues = await validateHomepageHeroMediaAssets(video, async (path) => ({
    contentType: path.endsWith(".jpg") ? "image/jpeg" : path.endsWith(".mp4") ? "video/mp4" : "video/webm",
    declaredContentType: path.endsWith(".jpg") ? "image/jpeg" : path.endsWith(".mp4") ? "video/mp4" : "video/webm",
    size: path.endsWith(".jpg") ? 500_000 : 2_000_000,
    animated: path.endsWith(".jpg"),
  }));
  assert.deepEqual(
    animatedPosterIssues.map((issue) => issue.path.at(-1)).sort(),
    ["imageUrl", "mobileImageUrl"],
  );
});

test("platform schema upgrades only the known legacy marketing consent copy", () => {
  const legacy = structuredClone(DEFAULT_PLATFORM_CONTENT);
  legacy.site.consent.body = "Necessary storage keeps your bag and privacy choice working. Optional measurement helps SOSO understand which pages are useful; it stays off until you choose it.";
  legacy.site.consent.marketingDescription = "Marketing — no marketing technology or pixels are currently active.";
  const upgraded = mergePlatformContentDefaults(legacy) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(upgraded.site.consent.body, DEFAULT_PLATFORM_CONTENT.site.consent.body);
  assert.equal(upgraded.site.consent.marketingDescription, DEFAULT_PLATFORM_CONTENT.site.consent.marketingDescription);

  legacy.site.consent.body = "Merchant-edited consent body";
  legacy.site.consent.marketingDescription = "Merchant-edited marketing explanation";
  const preserved = mergePlatformContentDefaults(legacy) as typeof DEFAULT_PLATFORM_CONTENT;
  assert.equal(preserved.site.consent.body, "Merchant-edited consent body");
  assert.equal(preserved.site.consent.marketingDescription, "Merchant-edited marketing explanation");
});

test("migrated public sources contain no bundled journal SEO or audited navigation/status literals", () => {
  const storefrontRoot = new URL("../../../soso-store/", import.meta.url);
  const journalPost = readFileSync(new URL("src/pages/JournalPost.tsx", storefrontRoot), "utf8");
  const paymentReturn = readFileSync(new URL("src/pages/PaymentReturn.tsx", storefrontRoot), "utf8");
  const policyHub = readFileSync(new URL("src/pages/PolicyHub.tsx", storefrontRoot), "utf8");
  const platformState = readFileSync(new URL("src/data/platformContent.ts", storefrontRoot), "utf8");
  const seoGenerator = readFileSync(new URL("scripts/generate-seo-assets.mjs", storefrontRoot), "utf8");

  assert.equal(journalPost.includes("Back to Journal"), false);
  assert.equal(journalPost.includes("SOSO Africa Journal"), false);
  assert.equal(journalPost.includes("journalSeo"), false);
  assert.equal(paymentReturn.includes("This payment return link is incomplete"), false);
  assert.equal(policyHub.includes("Loading published policies"), false);
  assert.equal(policyHub.includes("Published policies are temporarily unavailable"), false);
  assert.equal(platformState.includes("Loading the published storefront"), false);
  assert.equal(platformState.includes("Storefront content is not published"), false);
  assert.equal(seoGenerator.includes("journal-seo"), false);
  assert.match(seoGenerator, /from soso_journal_posts/);
});

test("every public platform state caller supplies editable copy and dialog/status copy stays out of runtime source", () => {
  const sourceRoot = new URL("../../../soso-store/src/", import.meta.url);
  const sourceFiles = readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".tsx"));
  const callers: string[] = [];
  const publicBypassLiterals = [
    "Secure payment did not open, and no payment has been taken.",
    "Enter a valid email address so we can contact you about this request.",
    "Preparing your visit",
    "Checking for the right SOSO page.",
    "Frequently asked questions",
    "Skip to content",
    '${product.name} detail',
    'aria-label="Close"',
  ];

  for (const path of sourceFiles) {
    const source = readFileSync(new URL(path, sourceRoot), "utf8");
    const states = source.match(/<PlatformContentState\b[^>]*>/g) ?? [];
    if (states.length > 0) callers.push(path);
    for (const state of states) assert.match(state, /\bcopy=/, `${path} omits platform state copy`);
    for (const phrase of publicBypassLiterals) {
      assert.equal(source.includes(phrase), false, `${path} contains bundled public copy: ${phrase}`);
    }
  }

  assert.deepEqual(callers.sort(), [
    "pages/About.tsx", "pages/Checkout.tsx", "pages/CollectionPage.tsx", "pages/FAQ.tsx",
    "pages/Home.tsx", "pages/Journal.tsx", "pages/JournalPost.tsx", "pages/PaymentReturn.tsx",
    "pages/Policy.tsx", "pages/PolicyHub.tsx", "pages/ProductDetail.tsx", "pages/Shop.tsx",
    "pages/not-found.tsx",
  ]);

  const dialog = readFileSync(new URL("components/StylistEnquiryDialog.tsx", sourceRoot), "utf8");
  const paymentReturn = readFileSync(new URL("pages/PaymentReturn.tsx", sourceRoot), "utf8");
  for (const phrase of [
    "Optional fit support", "Ask a SOSO stylist", "This does not pause or replace secure checkout",
    "Your question has been sent", "Tell us what you would like to know", "Send question",
  ]) assert.equal(dialog.includes(phrase), false, `Bundled stylist phrase remains: ${phrase}`);
  assert.equal(paymentReturn.includes("Payment status is unavailable"), false);
});

test("platform content rejects duplicate slugs, invalid references, unsafe media and non-positive prices", () => {
  const invalid = structuredClone(DEFAULT_PLATFORM_CONTENT);
  invalid.products[1]!.slug = invalid.products[0]!.slug;
  invalid.products[0]!.category = "does-not-exist";
  invalid.products[0]!.price = 0;
  invalid.products[0]!.img = "https://example.com/image.jpg";
  const parsed = PlatformContentSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.ok(parsed.error.issues.length >= 4);
});

test("administrator is accepted for content role gates while operations is denied", () => {
  for (const role of ["administrator", "operations"] as const) {
    let status: number | undefined;
    let continued = false;
    requireStaffRoles("owner", "administrator", "editor")(
      { staff: { role }, log: { warn() {} } } as never,
      { status(code: number) { status = code; return { json() {} }; } } as never,
      () => { continued = true; },
    );
    assert.equal(continued, role === "administrator");
    assert.equal(status, role === "operations" ? 403 : undefined);
  }
});

test("policy lifecycle exposes PUT draft updates and direct draft publication only", () => {
  const routes = (staffContentRouter as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
  }).stack.map((layer) => layer.route).filter(Boolean);
  const methodsFor = (path: string) => routes
    .filter((route) => route?.path === path)
    .flatMap((route) => Object.keys(route!.methods));

  assert.deepEqual(methodsFor("/staff/policies/:id").sort(), ["delete", "put"]);
  assert.deepEqual(methodsFor("/staff/policies/:id/publish"), ["post"]);
  assert.equal(routes.some((route) => route?.path === "/staff/policies/:id/review"), false);
  assert.equal(routes.some((route) => route?.path === "/staff/policies/:id/approve"), false);
});

test("policy sections reject invalid objects, empty arrays, and malformed content while accepting trimmed valid sections", () => {
  const valid = {
    slug: "privacy",
    title: " Privacy notice ",
    summary: " How we handle personal data. ",
    sections: [{ id: "data-use", heading: " Data use ", paragraphs: [" We use data to process requests. "] }],
  };
  const parsed = PolicyInputSchema.safeParse(valid);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.title, "Privacy notice");
    assert.deepEqual(parsed.data.sections[0]?.paragraphs, ["We use data to process requests."]);
  }
  assert.equal(PolicyInputSchema.safeParse({ ...valid, sections: {} }).success, false);
  assert.equal(PolicyInputSchema.safeParse({ ...valid, sections: [] }).success, false);
  assert.equal(PolicyInputSchema.safeParse({ ...valid, sections: [{ id: "bad id", heading: "", paragraphs: [] }] }).success, false);
  assert.equal(PolicyInputSchema.safeParse({ ...valid, sections: [{ id: "valid", heading: "Valid", unknown: true }] }).success, false);
});

test("public policy list and detail routes are registered", () => {
  const routes = (publicContentRouter as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
  }).stack.map((layer) => layer.route).filter(Boolean);
  const methodsFor = (path: string) => routes
    .filter((route) => route?.path === path)
    .flatMap((route) => Object.keys(route!.methods));
  assert.deepEqual(methodsFor("/policies"), ["get"]);
  assert.deepEqual(methodsFor("/policies/:slug"), ["get"]);
});

test("policy hub has no bundled cards or draft messaging", () => {
  const source = readFileSync(new URL("../../../soso-store/src/pages/PolicyHub.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("const policyLinks"), false);
  assert.equal(source.includes("Working drafts"), false);
  assert.equal(source.includes("Read draft"), false);
  assert.ok(source.includes('customFetch("/api/policies"'));
});