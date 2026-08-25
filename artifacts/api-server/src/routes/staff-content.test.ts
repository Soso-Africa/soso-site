import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { auditLogsTable, db } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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
} from "../lib/platform-content";
import { validateHomepageHeroMediaAssets } from "../lib/hero-media-validation";
import { validateProductMediaAssets } from "../lib/product-media-validation";

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

test("platform content validates the complete seeded document and hashes deterministically", () => {
  assert.equal(PlatformContentSchema.safeParse(DEFAULT_PLATFORM_CONTENT).success, true);
  assert.equal(platformContentHash(DEFAULT_PLATFORM_CONTENT), platformContentHash(structuredClone(DEFAULT_PLATFORM_CONTENT)));
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

  const validIssues = await validateProductMediaAssets(content, async (path) => ({
    contentType: path.endsWith(".webp") ? "image/webp" : "image/jpeg",
    declaredContentType: path.endsWith(".webp") ? "image/webp" : "image/jpeg",
    size: 350_000,
  }));
  assert.deepEqual(validIssues, []);

  const missingIssues = await validateProductMediaAssets(content, async () => null);
  assert.equal(missingIssues.length, new Set(content.products.flatMap((product) => product.images.map((image) => image.src))).size);
  assert.ok(missingIssues.every((issue) => issue.message.includes("verified bundled or SOSO App Storage")));

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
  legacy.site.announcement = "A merchant-edited announcement";
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

  const upgraded = mergePlatformContentDefaults(legacy);
  const parsed = PlatformContentSchema.safeParse(upgraded);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.site.announcement, "A merchant-edited announcement");
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
    assert.equal(parsed.data.products[0]!.fabric, "Atelier-selected fabric");
    assert.equal(parsed.data.products[0]!.fulfilmentState, "made_immediately");
    assert.deepEqual(parsed.data.products[0]!.readyNowSizes, []);
    assert.equal(parsed.data.products[0]!.dispatchMessage, "Dispatch within five days");
    assert.equal(parsed.data.products[0]!.images[0]!.provenance.source, "SOSO Africa supplied asset");
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