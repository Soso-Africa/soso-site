import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { createRequire } from "node:module";
import express from "express";

const requireFromDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const pg = requireFromDb("pg");

const REQUIRED_BRANCH_ID = "br-round-darkness-b1wiyx9t";
const serveMode = process.argv.slice(2).includes("--serve");
let stage = "environment_guard";
let client;
let server;
let restoreFetch;
let originalRow;
let syntheticClerkUserId;
let syntheticStaffId;
let syntheticEmail;
let syntheticToken;
let staffTokenHash;
let isolatedBranchConfirmed = false;
let cleanupComplete = false;
let serveReady = false;
let servingOrigin;
let output;
let failure;
let diagnostics;

function databaseSafetyCheck() {
  const databaseUrl = process.env.DATABASE_URL;
  const branchId = process.env.SOSO_ISOLATED_TEST_BRANCH_ID;
  const expectedHost = process.env.SOSO_ISOLATED_TEST_DB_HOST;
  assert.equal(branchId, REQUIRED_BRANCH_ID, "SOSO_ISOLATED_TEST_BRANCH_ID must identify the approved isolated branch.");
  assert.ok(databaseUrl, "DATABASE_URL is required; no workspace URL fallback is allowed.");
  assert.ok(expectedHost, "SOSO_ISOLATED_TEST_DB_HOST is required.");

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL.");
  }
  assert.ok(
    parsed.protocol === "postgres:" || parsed.protocol === "postgresql:",
    "DATABASE_URL must use PostgreSQL.",
  );
  assert.equal(
    parsed.hostname.toLowerCase().replace(/\.$/, ""),
    expectedHost.toLowerCase().replace(/\.$/, ""),
    "DATABASE_URL host does not match SOSO_ISOLATED_TEST_DB_HOST.",
  );
  isolatedBranchConfirmed = true;
  return { databaseUrl, host: parsed.hostname.toLowerCase() };
}

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`Required test fixture is unreadable: ${path}`);
  }
}

function providerProduct(product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    images: product.images,
    price: { currency: product.currency, amountKobo: product.amountKobo },
    availability: { inStock: product.inStock },
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      attributes: variant.attributes,
      price: { amountKobo: variant.amountKobo },
      availability: { inStock: variant.inStock },
    })),
  };
}

function responseJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function getUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function getMethod(input, init) {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function buildTestBaseline(published) {
  const baseline = structuredClone(published);
  assert.ok(Array.isArray(baseline.products), "Published branch content has no product catalogue.");
  assert.equal(baseline.products.length, 18, "Expected the isolated branch's published 18-product baseline.");

  const slugMap = new Map(baseline.products.map((product) => [
    product.slug,
    `guided-baseline-${product.slug}`,
  ]));
  const rewriteReferences = (value) => {
    if (Array.isArray(value)) return value.map(rewriteReferences);
    if (!value || typeof value !== "object") {
      if (typeof value !== "string") return value;
      if (slugMap.has(value)) return slugMap.get(value);
      let rewritten = value;
      for (const [oldSlug, newSlug] of slugMap) {
        rewritten = rewritten.split(`/product/${oldSlug}`).join(`/product/${newSlug}`);
      }
      return rewritten;
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewriteReferences(child)]));
  };
  const content = rewriteReferences(baseline);
  const approvedBundledImage = "/images/soso/dashiki.jpg";
  const suppliedImageProvenance = {
    source: "SOSO Africa supplied asset",
    rights: "Supplied by SOSO Africa for storefront publication",
  };

  for (const product of content.products) {
    delete product.legacyMigration;
    delete product.commerceProductId;
    delete product.commerceVariantIds;
    delete product.commerceMappingConfirmation;
    product.fulfilmentState = "unavailable";
    product.readyNowSizes = [];
    product.unavailableMessage = "Unavailable in isolated publication fixture";
    if (product.department === "accessories") product.releaseState = "placeholder";
    product.img = approvedBundledImage;
    product.images = [{
      src: approvedBundledImage,
      alt: "SOSO Africa bundled product image used by the isolated publication fixture",
      provenance: { ...suppliedImageProvenance },
    }];
    product.materialTurnSets = [];
    delete product.colourVisualizer;
    product.colourOptions = product.colourOptions.map((option) => {
      const cleanOption = { ...option };
      delete cleanOption.previewImageSrc;
      return cleanOption;
    });
  }
  for (const group of content.site.megaMenu) group.visible = false;
  for (const item of content.homepage.categories.items) {
    item.active = false;
    item.imageUrl = approvedBundledImage;
    if (item.imageUrls) item.imageUrls = item.imageUrls.map(() => approvedBundledImage);
    if (item.mobileImageUrls) item.mobileImageUrls = item.mobileImageUrls.map(() => approvedBundledImage);
  }
  content.homepage.hero.mediaMode = "image";
  content.homepage.hero.imageUrl = approvedBundledImage;
  content.homepage.hero.mobileImageUrl = approvedBundledImage;
  delete content.homepage.hero.videoUrl;
  delete content.homepage.hero.mobileVideoUrl;
  content.homepage.newArrival.editorial.imageUrl = approvedBundledImage;
  for (const item of content.homepage.occasions.items) item.imageUrl = approvedBundledImage;
  content.homepage.fit.imageUrl = approvedBundledImage;
  for (const collection of content.collections) {
    collection.showCover = false;
    delete collection.cover;
  }
  if (content.homepage.hero.campaignCta) content.homepage.hero.campaignCta.enabled = false;
  delete content.homepage.featured.legacySparseCompatibility;
  return content;
}

function summarizeActualDraft(draft, preview) {
  const bySlug = new Map(preview.suggestions.map((suggestion) => [suggestion.slug, suggestion]));
  const incompleteImages = [];
  const legacyIdentityCandidates = [];
  const availableWithoutMapping = [];
  const availableWithoutConfirmation = [];
  const availableWithBlockedSuggestion = [];
  const availableWithReviewSuggestion = [];

  for (const product of draft.products) {
    const isAvailable = product.fulfilmentState !== "unavailable";
    const imageIncomplete = !product.img
      || !Array.isArray(product.images)
      || product.images.length === 0
      || product.images.some((image) => (
        !image?.src
        || !image.alt?.trim()
        || !image.provenance?.source?.trim()
        || !image.provenance?.rights?.trim()
      ));
    if (imageIncomplete) incompleteImages.push(product.slug);
    if (product.legacyMigration || product.images?.some((image) => image.provenance?.sourceUrl)) {
      legacyIdentityCandidates.push(product.slug);
    }
    if (!isAvailable) continue;
    if (!product.commerceProductId) availableWithoutMapping.push(product.slug);
    if (!product.commerceMappingConfirmation || product.commerceMappingConfirmation.confidence < 95) {
      availableWithoutConfirmation.push(product.slug);
    }
    const suggestion = bySlug.get(product.slug);
    if (suggestion?.status === "blocked") availableWithBlockedSuggestion.push(product.slug);
    else if (suggestion?.status !== "confident") availableWithReviewSuggestion.push(product.slug);
  }

  return {
    productCount: draft.products.length,
    unavailableProductCount: draft.products.filter((product) => product.fulfilmentState === "unavailable").length,
    capturedCatalogueConfidentSuggestions: preview.suggestions
      .filter((suggestion) => suggestion.status === "confident")
      .map((suggestion) => ({ slug: suggestion.slug, confidence: suggestion.confidence })),
    capturedCatalogueBlockedSuggestions: preview.suggestions
      .filter((suggestion) => suggestion.status === "blocked")
      .map((suggestion) => ({ slug: suggestion.slug, issues: suggestion.issues })),
    availableWithoutCommerceMapping: availableWithoutMapping,
    availableWithoutHighConfidenceConfirmation: availableWithoutConfirmation,
    availableWithBlockedCapturedCatalogueSuggestion: availableWithBlockedSuggestion,
    availableWithNeedsReviewOrUnmatchedSuggestion: availableWithReviewSuggestion,
    productsWithIncompleteImageApprovalFields: incompleteImages,
    productsWithLegacyIdentityNeedingReview: legacyIdentityCandidates,
    mappingPreviewIsSuggestionOnly: true,
  };
}

function mappingRequestProduct(product) {
  return {
    slug: product.slug,
    name: product.name,
    price: product.price,
    standardEligible: product.standardEligible,
    customEligible: product.customEligible,
    standardSizes: product.standardSizes,
    fulfilmentState: product.fulfilmentState,
    ...(product.commerceProductId ? { commerceProductId: product.commerceProductId } : {}),
    ...(product.commerceVariantIds ? { commerceVariantIds: product.commerceVariantIds } : {}),
  };
}

async function run() {
  const safeDatabase = databaseSafetyCheck();

  // Configure the API before its first import: catalogue reads get a test-only,
  // read-only client; all payment activation and write credentials stay off.
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.JUSTICESURE_COMMERCE_API_BASE_URL = "https://commerce.test";
  process.env.JUSTICESURE_COMMERCE_TEST_API_KEY = "jsk_test_guided_publication_read_only";
  process.env.JUSTICESURE_COMMERCE_RUNTIME_READY = "false";
  delete process.env.JUSTICESURE_COMMERCE_API_KEY;
  delete process.env.JUSTICESURE_COMMERCE_WEBHOOK_SECRET;
  delete process.env.JUSTICESURE_COMMERCE_TEST_WEBHOOK_SECRET;
  delete process.env.SOSO_PAYMENT_RETURN_URL;
  assert.equal(process.env.JUSTICESURE_COMMERCE_RUNTIME_READY, "false");

  stage = "load_captured_fixture_data";
  const captured = loadJson("/tmp/soso-live-catalogue-current.json");
  const savedMappingPayload = loadJson("/tmp/soso-real-draft-mapping-payload.json");
  assert.equal(captured.products?.length, 138, "Captured live catalogue must contain all 138 products.");
  assert.equal(savedMappingPayload.products?.length, 52, "Sanitized saved-draft payload must contain 52 products.");
  const catalogueProducts = captured.products.map(providerProduct);
  const capturedByName = new Map(captured.products.map((product) => [product.name, product]));
  const confirmedFixtureProvider = capturedByName.get("Crest Ivory Two-Piece");
  assert.ok(confirmedFixtureProvider, "Captured catalogue must include the selected real test fixture.");

  stage = "open_isolated_database";
  client = new pg.Client({ connectionString: safeDatabase.databaseUrl });
  await client.connect();
  const snapshotResult = await client.query(
    `select key, draft, published, draft_updated_at, published_at,
            updated_by_clerk_user_id, published_by_clerk_user_id
       from soso_site_content where key = 'platform'`,
  );
  assert.equal(snapshotResult.rowCount, 1, "The isolated branch must already contain platform content.");
  originalRow = snapshotResult.rows[0];
  assert.equal(originalRow.draft?.products?.length, 52, "The isolated branch's saved draft must contain 52 products.");
  assert.equal(originalRow.published?.products?.length, 18, "The isolated branch's published baseline must contain 18 products.");

  stage = "create_authorized_owner_context";
  const token = randomBytes(32).toString("hex");
  syntheticToken = token;
  const email = `guided-publication-${randomUUID()}@example.test`;
  syntheticEmail = email;
  syntheticClerkUserId = `guided-publication-${randomUUID()}`;
  staffTokenHash = createHash("sha256").update(token).digest("hex");
  await client.query(
    `insert into soso_staff_users (clerk_user_id, email, role, is_active)
     values ($1, $2, 'owner', true)`,
    [syntheticClerkUserId, email],
  );
  const ownerResult = await client.query(
    `select id from soso_staff_users where clerk_user_id = $1`,
    [syntheticClerkUserId],
  );
  assert.equal(ownerResult.rowCount, 1, "Synthetic isolated owner must be present in the branch database.");
  syntheticStaffId = ownerResult.rows[0].id;
  await client.query(
    `insert into soso_staff_sessions (staff_user_id, token_hash, expires_at)
     select id, $2, now() + interval '1 hour'
       from soso_staff_users where clerk_user_id = $1`,
    [syntheticClerkUserId, staffTokenHash],
  );

  stage = "import_actual_api_and_configure_external_provider_transport";
  const capturedRequests = [];
  let providerFailureMode = false;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = getUrl(input);
    const method = getMethod(input, init);
    if (url.startsWith("https://commerce.test/")) {
      capturedRequests.push({ method, path: new URL(url).pathname });
      if (method !== "GET") throw new Error("The isolated test blocks JusticeSure write requests.");
      if (providerFailureMode) {
        return Response.json({ error: { message: "Isolated provider-read failure" } }, { status: 503 });
      }
      if (!/^https:\/\/commerce\.test\/products\?limit=100&offset=0$/.test(url)) {
        throw new Error("Unexpected JusticeSure endpoint in read-only publication test.");
      }
      return Response.json({ data: catalogueProducts });
    }
    if (url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:")) {
      return originalFetch(input, init);
    }
    throw new Error("Unexpected external network access is blocked by the isolated test driver.");
  };
  restoreFetch = () => { globalThis.fetch = originalFetch; };

  const { default: app } = await import(new URL("../dist/app.mjs", import.meta.url));
  const servingApp = express();
  if (serveMode) {
    // Only the initial StaffGate profile is synthesized. It establishes the
    // real isolated owner session cookie; all following Staff requests pass
    // through the actual API session middleware and product HTTP routers.
    servingApp.get("/api/staff-auth/status", (req, res, next) => {
      const staffCookie = req.get("cookie")?.match(/(?:^|;\s*)soso_staff_session=([^;]+)/)?.[1];
      if (staffCookie && decodeURIComponent(staffCookie) !== token) {
        res.status(401).json({ error: "Only the isolated synthetic Staff profile is allowed by this driver." });
        return;
      }
      if (staffCookie) {
        next();
        return;
      }
      res.cookie("soso_staff_session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 60 * 60 * 1000,
        path: "/",
      });
      res.json({ id: syntheticStaffId, email, role: "owner" });
    });
  }
  servingApp.use(app);
  server = servingApp.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  servingOrigin = baseUrl;
  const cookie = `soso_staff_session=${token}`;

  async function api(path, { method = "GET", body } = {}) {
    const response = await originalFetch(`${baseUrl}${path}`, {
      method,
      headers: {
        cookie,
        ...(["POST", "PUT", "PATCH", "DELETE"].includes(method) ? { origin: baseUrl } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let value;
    let jsonParseSucceeded = true;
    try {
      value = text ? JSON.parse(text) : null;
    } catch {
      value = null;
      jsonParseSucceeded = false;
    }
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      jsonParseSucceeded,
      responseBodyLength: text.length,
      value,
    };
  }

  async function getStaffContent() {
    const response = await api("/api/staff/content/platform");
    assert.equal(response.status, 200, "Authorized Staff GET must read platform content from the branch database.");
    return response.value;
  }

  async function publishCurrentDraft() {
    const latest = await getStaffContent();
    return api("/api/staff/content/platform/publish", {
      method: "POST",
      body: { expectedDraftUpdatedAt: latest.draftUpdatedAt },
    });
  }

  async function saveProduct(product, expectedDraftUpdatedAt) {
    return api(`/api/staff/content/platform/products/${encodeURIComponent(product.slug)}/draft`, {
      method: "PUT",
      body: { expectedDraftUpdatedAt, product },
    });
  }

  async function preview(products) {
    return api("/api/staff/commerce/catalogue-mapping/preview", {
      method: "POST",
      body: { products },
    });
  }

  async function assertRejectedPublicationPreservedDraft(savedRow, label) {
    const reloaded = await getStaffContent();
    assert.equal(reloaded.draftUpdatedAt, savedRow.draftUpdatedAt, `${label}: failed publish must retain the saved draft timestamp.`);
    assert.equal(iso(reloaded.publishedAt), iso(savedRow.publishedAt), `${label}: failed publish must retain the published timestamp.`);
    const fixture = reloaded.draft.products.find((product) => product.slug === fixtureSlug);
    assert.ok(fixture, `${label}: failed publish must retain the fixture in the persisted draft.`);
    assert.deepEqual(fixture.commerceVariantIds, savedRow.draft.products.find((product) => product.slug === fixtureSlug).commerceVariantIds);
    return reloaded;
  }

  stage = "preflight_actual_saved_52_draft";
  const staffBeforePreflight = await getStaffContent();
  assert.equal(staffBeforePreflight.draft.products.length, 52, "Real Staff GET must reload the actual 52-product draft.");
  const persistedBySlug = new Map(staffBeforePreflight.draft.products.map((product) => [product.slug, product]));
  let matchingPayloadProducts = 0;
  for (const item of savedMappingPayload.products) {
    const persisted = persistedBySlug.get(item.slug);
    if (!persisted) continue;
    const fields = ["slug", "name", "price", "fulfilmentState", "standardEligible", "customEligible", "standardSizes"];
    if (fields.every((field) => JSON.stringify(persisted[field]) === JSON.stringify(item[field]))) {
      matchingPayloadProducts += 1;
    }
  }
  assert.equal(matchingPayloadProducts, 52, "Sanitized 52-product preview payload must match the current saved draft.");

  const actualPreview = await preview(staffBeforePreflight.draft.products.map(mappingRequestProduct));
  assert.equal(actualPreview.status, 200, "Actual Staff mapping-preview route must accept the captured 138-product catalogue.");
  assert.equal(actualPreview.value.suggestions.length, 52);
  const allSuggestionCounts = Object.fromEntries(["confident", "blocked", "needs_review"].map((status) => [
    status,
    actualPreview.value.suggestions.filter((suggestion) => suggestion.status === status).length,
  ]));
  const persistedMappedProducts = staffBeforePreflight.draft.products.filter((product) => typeof product.commerceProductId === "string");
  const payloadMappedProducts = savedMappingPayload.products.filter((product) => typeof product.commerceProductId === "string");
  const persistedMappedSlugs = persistedMappedProducts.map((product) => product.slug).sort();
  const payloadMappedSlugs = payloadMappedProducts.map((product) => product.slug).sort();
  const mappedSlugSet = new Set(persistedMappedSlugs);
  const mappedSuggestions = actualPreview.value.suggestions
    .filter((suggestion) => mappedSlugSet.has(suggestion.slug))
    .map((suggestion) => ({
      slug: suggestion.slug,
      status: suggestion.status,
      confidence: suggestion.confidence,
      evidence: suggestion.evidence,
      issues: suggestion.issues,
      matchedVariantCount: Object.keys(suggestion.variantIds ?? {}).length,
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const mappedPreviewCounts = Object.fromEntries(["confident", "blocked", "needs_review"].map((status) => [
    status,
    mappedSuggestions.filter((suggestion) => suggestion.status === status).length,
  ]));
  diagnostics = {
    actualPersistedDraftProductCount: staffBeforePreflight.draft.products.length,
    capturedCatalogueProductCount: captured.products.length,
    savedDraftCommerceMappedProductCount: persistedMappedProducts.length,
    sanitizedPayloadCommerceMappedProductCount: payloadMappedProducts.length,
    persistedAndSanitizedMappedSlugsMatch: JSON.stringify(persistedMappedSlugs) === JSON.stringify(payloadMappedSlugs),
    all52SuggestionCounts: allSuggestionCounts,
    mappedProductPreviewCounts: mappedPreviewCounts,
    mappedProductPreviewEvidence: mappedSuggestions,
  };
  assert.equal(persistedMappedProducts.length, 7, `Expected seven mapped products in the real saved draft; evidence: ${JSON.stringify(diagnostics)}`);
  assert.equal(payloadMappedProducts.length, 7, `Expected seven mapped products in the sanitized payload; evidence: ${JSON.stringify(diagnostics)}`);
  assert.deepEqual(persistedMappedSlugs, payloadMappedSlugs, `The sanitized payload's mapped slugs must be those in the actual saved draft; evidence: ${JSON.stringify(diagnostics)}`);
  assert.equal(mappedSuggestions.length, 7, `The live preview must return all seven saved mapped products; evidence: ${JSON.stringify(diagnostics)}`);
  assert.equal(mappedPreviewCounts.confident, 5, `The five confident suggestions must be among the seven saved mapped products; evidence: ${JSON.stringify(diagnostics)}`);
  assert.equal(mappedPreviewCounts.blocked, 2, `The two blocked suggestions must be among the seven saved mapped products; evidence: ${JSON.stringify(diagnostics)}`);
  const knownActualBlockers = summarizeActualDraft(staffBeforePreflight.draft, actualPreview.value);

  let actualDraftPublishGuard;
  const guaranteedMappingBlocker = staffBeforePreflight.draft.products.some((product) => (
    product.fulfilmentState !== "unavailable"
    && (!product.commerceProductId
      || !product.commerceMappingConfirmation
      || product.commerceMappingConfirmation.confidence < 95)
  ));
  if (guaranteedMappingBlocker) {
    const blocked = await api("/api/staff/content/platform/publish", {
      method: "POST",
      body: { expectedDraftUpdatedAt: staffBeforePreflight.draftUpdatedAt },
    });
    assert.notEqual(blocked.status, 200, "Actual saved draft has a deterministic mapping blocker and must not publish.");
    const reloaded = await getStaffContent();
    assert.equal(reloaded.draftUpdatedAt, staffBeforePreflight.draftUpdatedAt, "Actual blocked publication must preserve the saved draft.");
    assert.equal(iso(reloaded.publishedAt), iso(staffBeforePreflight.publishedAt), "Actual blocked publication must preserve public content.");
    assert.deepEqual(reloaded.draft, staffBeforePreflight.draft, "Actual blocked publication must not mutate the 52-product draft.");
    actualDraftPublishGuard = {
      attempted: true,
      httpStatus: blocked.status,
      error: blocked.value?.error ?? null,
      issueCount: Array.isArray(blocked.value?.issues) ? blocked.value.issues.length : 0,
      issues: Array.isArray(blocked.value?.issues)
        ? blocked.value.issues.map((issue) => ({
            path: Array.isArray(issue.path) ? issue.path : undefined,
            message: issue.message,
          }))
        : [],
      draftAndPublishedStatePreserved: true,
    };
  } else {
    actualDraftPublishGuard = {
      attempted: false,
      reason: "No deterministic unmapped or unconfirmed available product was found; the actual 52-product draft was not submitted for publication.",
    };
  }

  stage = "prepare_temporary_18_product_fixture_baseline";
  const fixtureSlug = `guided-publication-${randomUUID().slice(0, 8)}`;
  const baseline = buildTestBaseline(staffBeforePreflight.published);
  const saveBaseline = await api("/api/staff/content/platform", {
    method: "PUT",
    body: { content: baseline, expectedDraftUpdatedAt: staffBeforePreflight.draftUpdatedAt },
  });
  assert.equal(saveBaseline.status, 200, "Real full-document Save Draft route must save the isolated 18-product baseline.");
  const baselineReload = await getStaffContent();
  assert.equal(baselineReload.draft.products.length, 18, "Reloaded fixture baseline must contain the 18 branch-published products.");
  assert.equal(baselineReload.draftUpdatedAt, saveBaseline.value.draftUpdatedAt);

  const sourceProduct = baseline.products.find((product) => product.department !== "accessories");
  assert.ok(sourceProduct, "Test baseline needs an apparel product to clone for the fixture.");
  const providerProductRecord = confirmedFixtureProvider;
  assert.equal(providerProductRecord.amountKobo % 100, 0, "Fixture provider price must be representable as NGN whole units.");
  const fixtureSizes = providerProductRecord.variants
    .map((variant) => variant.name)
    .filter((name) => name.toLocaleLowerCase() !== "custom");
  assert.ok(fixtureSizes.length > 0, "Captured fixture product must have standard variants.");
  const fixtureProduct = structuredClone(sourceProduct);
  fixtureProduct.slug = fixtureSlug;
  fixtureProduct.name = providerProductRecord.name;
  fixtureProduct.price = providerProductRecord.amountKobo / 100;
  fixtureProduct.releaseState = "approved";
  fixtureProduct.tag = "Isolated catalogue-mapping test fixture";
  fixtureProduct.note = "Test-only publication candidate";
  fixtureProduct.description = `Isolated test fixture for the confirmed ${providerProductRecord.name} mapping flow.`;
  fixtureProduct.searchableTerms = [providerProductRecord.name, "isolated test fixture"];
  fixtureProduct.sizes = [...fixtureSizes];
  fixtureProduct.standardEligible = true;
  fixtureProduct.customEligible = false;
  fixtureProduct.standardSizes = [...fixtureSizes];
  fixtureProduct.readyNowSizes = [];
  fixtureProduct.fulfilmentState = "made_immediately";
  delete fixtureProduct.unavailableMessage;
  fixtureProduct.dispatchMessage = "Test fixture fulfilment state; checkout runtime remains disabled.";
  fixtureProduct.img = "/images/soso/dashiki.jpg";
  fixtureProduct.images = [{
    src: "/images/soso/dashiki.jpg",
    alt: "SOSO Africa bundled image approved for this isolated publication fixture",
    provenance: {
      source: "SOSO Africa supplied asset",
      rights: "Supplied by SOSO Africa for storefront publication",
    },
  }];
  delete fixtureProduct.legacyMigration;
  delete fixtureProduct.commerceProductId;
  delete fixtureProduct.commerceVariantIds;
  delete fixtureProduct.commerceMappingConfirmation;
  fixtureProduct.materialTurnSets = [];
  delete fixtureProduct.colourVisualizer;
  fixtureProduct.colourOptions = fixtureProduct.colourOptions.map((option) => {
    const cleaned = { ...option };
    delete cleaned.previewImageSrc;
    return cleaned;
  });
  fixtureProduct.relatedProductSlugs = [];
  fixtureProduct.merchandising = { ...fixtureProduct.merchandising, isNew: false };

  stage = "preview_new_confirmable_fixture";
  const fixturePreview = await preview([mappingRequestProduct(fixtureProduct)]);
  assert.equal(fixturePreview.status, 200, "Real Staff preview route must map the new fixture against captured provider data.");
  const suggestion = fixturePreview.value.suggestions.find((item) => item.slug === fixtureSlug);
  assert.ok(suggestion, "Fixture preview must return a mapping suggestion.");
  assert.equal(suggestion.status, "confident", "Fixture must have one exact, high-confidence captured catalogue match.");
  assert.ok(suggestion.confidence >= 95);
  assert.equal(suggestion.productId, providerProductRecord.id);
  assert.equal(Object.keys(suggestion.variantIds).length, fixtureSizes.length);

  fixtureProduct.commerceProductId = suggestion.productId;
  fixtureProduct.commerceVariantIds = { ...suggestion.variantIds };
  const confirmedFixture = structuredClone(fixtureProduct);
  confirmedFixture.commerceMappingConfirmation = {
    productHash: suggestion.productHash,
    localHash: suggestion.localHash,
    snapshotHash: fixturePreview.value.snapshotHash,
    snapshotFetchedAt: fixturePreview.value.fetchedAt,
    confirmedAt: new Date().toISOString(),
    confidence: suggestion.confidence,
    source: "automatic",
    evidence: suggestion.evidence,
    choiceLabels: suggestion.choiceLabels,
  };

  stage = "save_unconfirmed_fixture_and_reject_publication";
  const saveUnconfirmed = await saveProduct(fixtureProduct, baselineReload.draftUpdatedAt);
  assert.equal(saveUnconfirmed.status, 200, "Real product Save Draft route must persist a structurally complete unconfirmed mapping.");
  const unconfirmedPublish = await publishCurrentDraft();
  assert.equal(unconfirmedPublish.status, 400, "Unconfirmed available mapping must block publication over HTTP.");
  assert.match(JSON.stringify(unconfirmedPublish.value), /confirm the current high-confidence JusticeSure mapping/i);
  await assertRejectedPublicationPreservedDraft(saveUnconfirmed.value, "unconfirmed mapping");

  stage = "preview_unsafe_fixture_and_reject_publication";
  const otherProviderProduct = captured.products.find((product) => product.id !== providerProductRecord.id);
  assert.ok(otherProviderProduct, "Captured catalogue needs a different provider product for the unsafe-mapping guard.");
  const unsafeFixture = structuredClone(fixtureProduct);
  unsafeFixture.commerceProductId = otherProviderProduct.id;
  const unsafePreview = await preview([mappingRequestProduct(unsafeFixture)]);
  assert.equal(unsafePreview.status, 200);
  assert.equal(unsafePreview.value.suggestions[0]?.status, "blocked", "Wrong parent UUID must be reported as blocked by real preview logic.");
  const saveUnsafe = await saveProduct(unsafeFixture, saveUnconfirmed.value.draftUpdatedAt);
  assert.equal(saveUnsafe.status, 200, "Draft save must preserve a structurally valid but unsafe provider mapping for review.");
  const unsafePublish = await publishCurrentDraft();
  assert.equal(unsafePublish.status, 400, "Unsafe live catalogue mapping must block publication over HTTP.");
  assert.match(JSON.stringify(unsafePublish.value), /different normalized name/i);
  await assertRejectedPublicationPreservedDraft(saveUnsafe.value, "unsafe provider mapping");

  stage = "simulate_provider_read_failure_and_reject_publication";
  const saveConfirmedForProviderCheck = await saveProduct(confirmedFixture, saveUnsafe.value.draftUpdatedAt);
  assert.equal(saveConfirmedForProviderCheck.status, 200, "Confirmed test fixture must save before testing provider-read failure.");
  providerFailureMode = true;
  const providerFailedPublish = await publishCurrentDraft();
  providerFailureMode = false;
  assert.equal(providerFailedPublish.status, 503, "Provider transport failure must block publication over HTTP.");
  assert.equal(providerFailedPublish.value?.diagnostic?.stage, "publication_catalogue_read");
  assert.equal(providerFailedPublish.value?.diagnostic?.category, "provider");
  await assertRejectedPublicationPreservedDraft(saveConfirmedForProviderCheck.value, "provider failure");

  stage = "publish_confirmed_fixture";
  const confirmedPublish = await publishCurrentDraft();
  assert.equal(confirmedPublish.status, 200, `Confirmed fixture publication must succeed through the actual router.`);
  const persistedStaff = await getStaffContent();
  const persistedFixture = persistedStaff.published.products.find((product) => product.slug === fixtureSlug);
  assert.ok(persistedFixture, "Staff reload must read the fixture from the persisted published database document.");
  assert.deepEqual(persistedFixture.commerceVariantIds, confirmedFixture.commerceVariantIds);
  assert.deepEqual(persistedFixture.images[0], confirmedFixture.images[0]);
  assert.equal(persistedFixture.images[0]?.provenance?.source, confirmedFixture.images[0]?.provenance?.source, "Staff-persisted photo provenance source must match the approved fixture image.");
  assert.equal(persistedFixture.images[0]?.provenance?.rights, confirmedFixture.images[0]?.provenance?.rights, "Staff-persisted photo rights must match the approved fixture image.");
  assert.equal(persistedFixture.releaseState, "approved");

  stage = "verify_public_content_read";
  const publicRead = await api("/api/content/platform");
  const publicProducts = Array.isArray(publicRead.value?.content?.products) ? publicRead.value.content.products : [];
  const publicFixture = publicProducts.find((product) => product.slug === fixtureSlug);
  const expectedPrimaryImage = confirmedFixture.images[0];
  const staffPrimaryImage = persistedFixture.images[0];
  const publicPrimaryImage = publicFixture?.images?.[0];
  const publicPrimaryImageMatchesApprovedAsset = Boolean(
    publicFixture
    && publicPrimaryImage
    && publicFixture.img === expectedPrimaryImage.src
    && publicPrimaryImage.src === expectedPrimaryImage.src
    && publicPrimaryImage.alt === expectedPrimaryImage.alt,
  );
  diagnostics = {
    ...diagnostics,
    publicContentRead: {
      httpStatus: publicRead.status,
      contentType: publicRead.contentType,
      jsonParseSucceeded: publicRead.jsonParseSucceeded,
      responseBodyLength: publicRead.responseBodyLength,
      bodyKeys: publicRead.value && typeof publicRead.value === "object" && !Array.isArray(publicRead.value)
        ? Object.keys(publicRead.value).sort()
        : [],
      contentKeys: publicRead.value?.content && typeof publicRead.value.content === "object" && !Array.isArray(publicRead.value.content)
        ? Object.keys(publicRead.value.content).sort()
        : [],
      productsCount: publicProducts.length,
      fixtureFound: Boolean(publicFixture),
      publishedAtMatchesStaffReload: typeof publicRead.value?.publishedAt === "string"
        && publicRead.value.publishedAt === persistedStaff.publishedAt,
      photo: {
        expectedApprovedPhoto: {
          src: expectedPrimaryImage.src,
          alt: expectedPrimaryImage.alt,
          keys: Object.keys(expectedPrimaryImage).sort(),
        },
        staffCanonicalPhoto: {
          productPrimaryPath: persistedFixture.img,
          src: staffPrimaryImage?.src ?? null,
          alt: staffPrimaryImage?.alt ?? null,
          keys: staffPrimaryImage ? Object.keys(staffPrimaryImage).sort() : [],
          provenancePersisted: Boolean(
            staffPrimaryImage?.provenance?.source === expectedPrimaryImage.provenance.source
            && staffPrimaryImage?.provenance?.rights === expectedPrimaryImage.provenance.rights,
          ),
        },
        publicPhotoProjection: {
          productPrimaryPath: publicFixture?.img ?? null,
          src: publicPrimaryImage?.src ?? null,
          alt: publicPrimaryImage?.alt ?? null,
          keys: publicPrimaryImage ? Object.keys(publicPrimaryImage).sort() : [],
          includesProvenance: Boolean(publicPrimaryImage?.provenance),
        },
        publicPrimaryImageMatchesApprovedAsset,
      },
    },
  };
  assert.equal(publicRead.status, 200, `Public content HTTP route must return 200 after successful persisted publication; diagnostics: ${JSON.stringify(diagnostics.publicContentRead)}`);
  assert.ok(publicFixture, `Public content response must contain the published test fixture; diagnostics: ${JSON.stringify(diagnostics.publicContentRead)}`);
  assert.ok(publicPrimaryImageMatchesApprovedAsset, `Public photo projection must preserve the approved primary photo path and alt text; diagnostics: ${JSON.stringify(diagnostics.publicContentRead.photo)}`);
  assert.equal(publicRead.value.publishedAt, persistedStaff.publishedAt);
  assert.ok(!process.env.JUSTICESURE_COMMERCE_RUNTIME_READY || process.env.JUSTICESURE_COMMERCE_RUNTIME_READY !== "true");
  assert.ok(capturedRequests.every((request) => request.method === "GET"), "External provider transport must remain read-only.");

  output = {
    ok: true,
    branch: {
      id: REQUIRED_BRANCH_ID,
      databaseHostMatchedProtectedHost: true,
      isolatedBranchConfirmed: isolatedBranchConfirmed,
    },
    checkout: {
      runtimeReady: false,
      providerWritesAttempted: 0,
      capturedProviderRequestsWereReadOnly: true,
    },
    actualDraftPreflight: {
      savedDraftProductCount: staffBeforePreflight.draft.products.length,
      sanitizedPayloadProductCount: savedMappingPayload.products.length,
      payloadMatchesPersistedDraft: matchingPayloadProducts === 52,
      capturedCatalogueProductCount: captured.products.length,
      actualHttpPreviewSuggestionCounts: {
        all52SuggestionCounts: allSuggestionCounts,
        mappedProductPreviewCounts: mappedPreviewCounts,
      },
      actualMappedProductPreviewEvidence: mappedSuggestions,
      actualDraftBlockers: knownActualBlockers,
      actualDraftPublicationGuard: actualDraftPublishGuard,
    },
    endToEnd: {
      baselineProductCount: 18,
      baselineWasTemporaryBranchFixtureOnly: true,
      baselineWasNormalizedToUnavailableUnmappedProducts: true,
      baselineFixtureOnlyChanges: [
        "prefixed the 18 baseline product slugs to avoid legacy-inventory identity matches",
        "made baseline products unavailable and removed their checkout mappings",
        "replaced baseline product and selected homepage media with the verified bundled SOSO image",
        "deactivated homepage category tiles and mega-menu visibility for the test baseline",
        "disabled collection covers and campaign activation for the test baseline",
      ],
      savedFixtureSlug: fixtureSlug,
      savedFixtureProductName: fixtureProduct.name,
      saveDraftHttpStatus: saveConfirmedForProviderCheck.status,
      unconfirmedMappingPublication: {
        httpStatus: unconfirmedPublish.status,
        blocked: true,
        draftPreserved: true,
      },
      unsafeMappingPublication: {
        previewStatus: unsafePreview.status,
        previewBlocked: unsafePreview.value.suggestions[0].status === "blocked",
        publishHttpStatus: unsafePublish.status,
        blocked: true,
        draftPreserved: true,
      },
      providerFailurePublication: {
        httpStatus: providerFailedPublish.status,
        blocked: true,
        draftPreserved: true,
        diagnostic: providerFailedPublish.value.diagnostic,
      },
      confirmedFixturePublishHttpStatus: confirmedPublish.status,
      fixturePersistedAfterStaffReload: Boolean(persistedFixture),
      fixtureVisibleThroughPublicContentRouter: Boolean(publicFixture),
      imageApproval: {
        source: "governed bundled SOSO image asset",
        publicationImageValidationPassed: true,
        staffCanonicalProvenancePersisted: diagnostics.publicContentRead.photo.staffCanonicalPhoto.provenancePersisted,
        publicPrimaryImageMatchesApprovedAsset,
        publicImageProjectionKeys: diagnostics.publicContentRead.photo.publicPhotoProjection.keys,
        publicProjectionIncludesPrivateProvenance: diagnostics.publicContentRead.photo.publicPhotoProjection.includesProvenance,
        actualCloudinaryUploadPerformed: false,
      },
    },
    cleanup: {
      originalPlatformRowRestored: false,
      syntheticOwnerRemoved: false,
      actualMerchantDraftRemainsUnchanged: true,
    },
  };

  if (serveMode) {
    stage = "prepare_guarded_playwright_serve_state";
    await client.query(
      `update soso_site_content
          set draft = $1::jsonb, published = $2::jsonb, draft_updated_at = $3,
              published_at = $4, updated_by_clerk_user_id = $5,
              published_by_clerk_user_id = $6
        where key = 'platform'`,
      [
        JSON.stringify(originalRow.draft),
        JSON.stringify(originalRow.published),
        originalRow.draft_updated_at,
        originalRow.published_at,
        originalRow.updated_by_clerk_user_id,
        originalRow.published_by_clerk_user_id,
      ],
    );
    await client.query(
      `delete from soso_site_content_revisions where content_key = 'platform' and created_by_clerk_user_id = $1`,
      [syntheticClerkUserId],
    );
    await client.query(`delete from soso_audit_logs where actor_clerk_user_id = $1`, [syntheticClerkUserId]);

    const restored = await getStaffContent();
    assert.equal(restored.draft.products.length, 52);
    const serveBaseline = buildTestBaseline(originalRow.published);
    const saveServeBaseline = await api("/api/staff/content/platform", {
      method: "PUT",
      body: { content: serveBaseline, expectedDraftUpdatedAt: restored.draftUpdatedAt },
    });
    assert.equal(saveServeBaseline.status, 200, "Serve-mode baseline must be saved through the actual full-document Draft route.");

    const minimalCocoaProvider = captured.products.find((product) => product.name === "Minimal Cocoa");
    assert.ok(minimalCocoaProvider, "Captured catalogue must contain Minimal Cocoa for the Staff mapping flow.");
    assert.equal(minimalCocoaProvider.amountKobo % 100, 0);
    const minimalStandardSizes = minimalCocoaProvider.variants
      .map((variant) => variant.name)
      .filter((name) => name.toLocaleLowerCase() !== "custom");
    const hasCustomVariant = minimalCocoaProvider.variants.some((variant) => variant.name.toLocaleLowerCase() === "custom");
    const minimalCocoa = structuredClone(serveBaseline.products.find((product) => product.department !== "accessories"));
    assert.ok(minimalCocoa);
    minimalCocoa.slug = "minimal-cocoa";
    minimalCocoa.name = minimalCocoaProvider.name;
    minimalCocoa.price = minimalCocoaProvider.amountKobo / 100;
    minimalCocoa.releaseState = "approved";
    minimalCocoa.tag = "Isolated catalogue-mapping test fixture";
    minimalCocoa.note = "Test-only publication candidate";
    minimalCocoa.description = "Isolated Staff-flow fixture for the Minimal Cocoa catalogue-mapping review.";
    minimalCocoa.searchableTerms = [minimalCocoaProvider.name, "isolated test fixture"];
    minimalCocoa.sizes = [...minimalStandardSizes, ...(hasCustomVariant ? ["Custom"] : [])];
    minimalCocoa.standardEligible = true;
    minimalCocoa.customEligible = hasCustomVariant;
    minimalCocoa.standardSizes = [...minimalStandardSizes];
    minimalCocoa.readyNowSizes = [];
    minimalCocoa.fulfilmentState = "made_immediately";
    delete minimalCocoa.unavailableMessage;
    minimalCocoa.dispatchMessage = "Dispatch timing confirmed after order.";
    minimalCocoa.img = "/images/soso/dashiki.jpg";
    minimalCocoa.images = [{
      src: "/images/soso/dashiki.jpg",
      alt: "SOSO Africa bundled image approved for isolated Minimal Cocoa review",
      provenance: {
        source: "SOSO Africa supplied asset",
        rights: "Supplied by SOSO Africa for storefront publication",
      },
    }];
    delete minimalCocoa.legacyMigration;
    delete minimalCocoa.commerceProductId;
    delete minimalCocoa.commerceVariantIds;
    delete minimalCocoa.commerceMappingConfirmation;
    minimalCocoa.materialTurnSets = [];
    delete minimalCocoa.colourVisualizer;
    minimalCocoa.colourOptions = minimalCocoa.colourOptions.map((option) => {
      const cleaned = { ...option };
      delete cleaned.previewImageSrc;
      return cleaned;
    });
    minimalCocoa.relatedProductSlugs = [];
    minimalCocoa.merchandising = { ...minimalCocoa.merchandising, isNew: false };
    const saveMinimalCocoa = await saveProduct(minimalCocoa, saveServeBaseline.value.draftUpdatedAt);
    assert.equal(saveMinimalCocoa.status, 200, "Unconfirmed Minimal Cocoa must be saved through the real product Draft route.");

    const serveReload = await getStaffContent();
    assert.equal(serveReload.draft.products.length, 19);
    const savedMinimalCocoa = serveReload.draft.products.find((product) => product.slug === "minimal-cocoa");
    assert.ok(savedMinimalCocoa, "Serve-mode draft must contain the matching Minimal Cocoa candidate.");
    assert.equal(savedMinimalCocoa.name, "Minimal Cocoa");
    assert.equal(savedMinimalCocoa.fulfilmentState, "made_immediately");
    assert.equal(savedMinimalCocoa.img, "/images/soso/dashiki.jpg");
    assert.equal(savedMinimalCocoa.commerceProductId, undefined);
    assert.equal(savedMinimalCocoa.commerceVariantIds, undefined);
    assert.equal(savedMinimalCocoa.commerceMappingConfirmation, undefined);
    assert.equal(iso(serveReload.publishedAt), iso(originalRow.published_at));
    assert.equal(serveReload.published.products.length, 18, "Serve-mode setup must preserve the branch's original public content.");
    assert.ok(capturedRequests.every((request) => request.method === "GET"));
    serveReady = true;
  }
}

async function cleanup() {
  if (server) {
    const closed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    // Browser proxies can leave an abandoned upstream request open. The test
    // child owns these connections; close them before restoring its DB copy.
    server.closeAllConnections();
    await closed;
    server = undefined;
  }
  if (restoreFetch) {
    // This is a dedicated child process. Keep the external-network guard in
    // place through teardown: an in-flight or scheduled cleanup must not gain
    // access to the production storage assets copied into the test database.
    restoreFetch = undefined;
  }
  if (!client) return;
  if (originalRow) {
    await client.query(
      `update soso_site_content
          set draft = $1::jsonb, published = $2::jsonb, draft_updated_at = $3,
              published_at = $4, updated_by_clerk_user_id = $5,
              published_by_clerk_user_id = $6
        where key = 'platform'`,
      [
        JSON.stringify(originalRow.draft),
        JSON.stringify(originalRow.published),
        originalRow.draft_updated_at,
        originalRow.published_at,
        originalRow.updated_by_clerk_user_id,
        originalRow.published_by_clerk_user_id,
      ],
    );
  }
  if (syntheticClerkUserId) {
    await client.query(
      `delete from soso_site_content_revisions where content_key = 'platform' and created_by_clerk_user_id = $1`,
      [syntheticClerkUserId],
    );
    await client.query(
      `delete from soso_audit_logs where actor_clerk_user_id = $1`,
      [syntheticClerkUserId],
    );
    await client.query(
      `delete from soso_staff_sessions
        where token_hash = $1
           or staff_user_id in (select id from soso_staff_users where clerk_user_id = $2)`,
      [staffTokenHash, syntheticClerkUserId],
    );
    await client.query(`delete from soso_staff_users where clerk_user_id = $1`, [syntheticClerkUserId]);
  }
  await client.end();
  client = undefined;
  cleanupComplete = true;
  if (output) {
    output.cleanup = {
      originalPlatformRowRestored: Boolean(originalRow),
      syntheticOwnerRemoved: Boolean(syntheticClerkUserId),
      actualMerchantDraftRemainsUnchanged: Boolean(originalRow),
    };
  }
}

try {
  await run();
} catch (error) {
  failure = {
    ok: false,
    stage,
    isolatedBranchConfirmed,
    error: error instanceof Error && error.name === "AssertionError"
      ? error.message.split("\n", 1)[0].slice(0, 300)
      : "Driver stopped safely; sensitive connection details and provider credentials are not included.",
    ...(diagnostics ? { diagnostics } : {}),
  };
}

if (serveMode && output && serveReady) {
  const stopServing = async () => {
    try {
      await cleanup();
    } catch {
      // Stop promptly even if the protected branch becomes unavailable.
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGTERM", stopServing);
  process.once("SIGINT", stopServing);
  process.stdout.write(`${JSON.stringify({ apiOrigin: servingOrigin, ready: true, branchId: REQUIRED_BRANCH_ID })}\n`);
} else {
  try {
    await cleanup();
  } catch {
    failure = {
      ok: false,
      stage: `${stage}_cleanup`,
      isolatedBranchConfirmed,
      error: "Cleanup failed; inspect only the isolated test branch before retrying.",
    };
  }

  if (output && cleanupComplete) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
    process.exit(0);
  }
  process.stdout.write(`${JSON.stringify(failure ?? {
    ok: false,
    stage,
    isolatedBranchConfirmed,
    error: "Driver did not complete cleanup successfully.",
  })}\n`);
  process.exit(1);
}