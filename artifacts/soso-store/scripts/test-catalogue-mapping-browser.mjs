import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createStaffBrowserHarness } from "./staff-browser-harness.mjs";

const editorPassword = "MappingEditorBrowser123!";
const harness = await createStaffBrowserHarness({ prefix: "mapping", ownerPassword: "MappingOwnerBrowser123!" });
const { storeOrigin } = harness;
let browser;

try {
  await harness.startServers();
  const originalRow = harness.originalPlatformRow;
  assert.ok(originalRow.draft?.products?.length >= 3, "The mapping browser fixture needs three catalogue products.");

  const fixture = structuredClone(originalRow.draft);
  const [safeProduct, reviewProduct, blockedProduct] = fixture.products;
  for (const product of [safeProduct, reviewProduct, blockedProduct]) {
    delete product.commerceProductId;
    delete product.commerceVariantIds;
    delete product.commerceMappingConfirmation;
  }

  const safeRemoteId = randomUUID();
  const reviewRemoteId = randomUUID();
  const blockedRemoteId = randomUUID();
  const blockedVariantId = randomUUID();
  const blockedSize = blockedProduct.sizes.find((size) => size.toLowerCase() !== "custom") ?? blockedProduct.sizes[0];
  assert.ok(blockedSize);
  blockedProduct.standardEligible = true;
  blockedProduct.standardSizes = [blockedSize];
  const remoteProducts = [
    { id: safeRemoteId, name: safeProduct.name, amountKobo: safeProduct.price * 100, inStock: true, variants: [] },
    { id: reviewRemoteId, name: reviewProduct.name, amountKobo: reviewProduct.price * 100, inStock: true, variants: [] },
    { id: blockedRemoteId, name: blockedProduct.name, amountKobo: blockedProduct.price * 100, inStock: false, variants: [
      { id: blockedVariantId, name: `Size ${blockedSize}`, label: blockedSize, attributes: { size: blockedSize }, amountKobo: blockedProduct.price * 100, inStock: false },
    ] },
  ];
  let savedRow = {
    ...originalRow,
    draft: fixture,
    draftUpdatedAt: "2026-09-21T10:00:00.000Z",
  };
  let localChanged = false;
  let remoteChanged = false;
  let lastSavedContent;

  const suggestion = (product, overrides) => ({
    slug: product.slug,
    status: "confident",
    confidence: 99,
    evidence: ["Exact SOSO and JusticeSure identity match", "Price and fulfilment are compatible"],
    productId: safeRemoteId,
    productHash: remoteChanged ? "safe-product-hash-changed" : "safe-product-hash",
    localHash: localChanged ? "safe-local-hash-changed" : "safe-local-hash",
    variantIds: {},
    choiceLabels: {},
    issues: [],
    ...overrides,
  });
  const mappingPreview = () => ({
    snapshotHash: remoteChanged ? "snapshot-changed" : "snapshot-initial",
    fetchedAt: "2026-09-21T10:05:00.000Z",
    suggestions: [
      suggestion(safeProduct),
      suggestion(reviewProduct, {
        status: "needs_review",
        confidence: 72,
        evidence: ["Name is similar, but the price differs"],
        productId: reviewRemoteId,
        productHash: "review-product-hash",
        localHash: "review-local-hash",
        issues: ["A staff member must review the price mismatch"],
      }),
      suggestion(blockedProduct, {
        status: "blocked",
        confidence: 0,
        evidence: ["JusticeSure inventory is out of stock and has no exact option mapping"],
        productId: blockedRemoteId,
        productHash: "blocked-product-hash",
        localHash: "blocked-local-hash",
        issues: ["Unsafe mapping cannot be confirmed"],
      }),
    ],
  });

  const { email } = await harness.createStaffUser({ label: "editor", password: editorPassword });
  browser = await harness.launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  await page.route("**/api/payment/catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: remoteProducts }) }));
  await page.route("**/api/staff/commerce/catalogue-mapping/preview", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mappingPreview()) }));
  await page.route("**/api/staff/content/platform/revisions", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/staff/content/platform", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      lastSavedContent = body.content;
      savedRow = {
        ...savedRow,
        draft: structuredClone(body.content),
        draftUpdatedAt: "2026-09-21T10:10:00.000Z",
      };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(savedRow) });
  });
  await page.route("**/api/staff/content/platform/products/*/draft", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const { product, expectedDraftUpdatedAt } = route.request().postDataJSON();
    assert.equal(expectedDraftUpdatedAt, savedRow.draftUpdatedAt);
    savedRow = {
      ...savedRow,
      draft: {
        ...savedRow.draft,
        products: savedRow.draft.products.map((item) => item.slug === product.slug ? product : item),
      },
      draftUpdatedAt: new Date(Date.parse(savedRow.draftUpdatedAt) + 1000).toISOString(),
    };
    lastSavedContent = savedRow.draft;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(savedRow) });
  });

  await page.goto(`${storeOrigin}/sign-in`);
  await page.getByLabel("Staff email").fill(email);
  await page.getByLabel("Password").fill(editorPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/staff");
  await page.getByRole("button", { name: "Platform content" }).click();
  await page.getByText("Draft and published content are versioned separately.").waitFor();
  await page.getByTestId("platform-section-catalogue").click();

  const summary = page.getByTestId("catalogue-mapping-summary");
  await summary.getByText("Confident: 1", { exact: true }).waitFor();
  await summary.getByText("Needs Review: 1", { exact: true }).waitFor();
  await summary.getByText("Blocked: 1", { exact: true }).waitFor();

  await page.getByTestId(`catalogue-product-header-${safeProduct.slug}`).click();
  await page.getByTestId(`mapping-confidence-${safeProduct.slug}`).getByText("confident (99%)", { exact: true }).waitFor();
  await page.getByTestId(`mapping-evidence-${safeProduct.slug}`)
    .getByText("Exact SOSO and JusticeSure identity match", { exact: true }).waitFor();

  await page.getByTestId("button-confirm-safe-matches").click();
  await page.getByTestId(`mapping-status-${safeProduct.slug}`).getByText("Confirmed current", { exact: true }).waitFor();
  await page.getByTestId("btn-save-draft").click();
  try {
    await page.getByTestId("status-message").getByText("Draft saved. It is not public until published.", { exact: true }).waitFor({ timeout: 10000 });
  } catch (error) {
    console.error("Mapping save status:", await page.getByTestId("status-message").textContent());
    throw error;
  }

  assert.ok(lastSavedContent, "The browser must submit the confirmed draft.");
  assert.equal(lastSavedContent.products[0].commerceProductId, safeRemoteId);
  assert.equal(lastSavedContent.products[0].commerceMappingConfirmation.confidence, 99);
  assert.deepEqual(lastSavedContent.products[0].commerceMappingConfirmation.evidence, [
    "Exact SOSO and JusticeSure identity match",
    "Price and fulfilment are compatible",
  ]);
  assert.equal(lastSavedContent.products[1].commerceMappingConfirmation, undefined, "Needs-review suggestions must not be bulk-confirmed.");
  assert.equal(lastSavedContent.products[2].commerceMappingConfirmation, undefined, "Blocked suggestions must not be bulk-confirmed.");

  await page.reload();
  await page.getByRole("button", { name: "Platform content" }).click();
  await page.getByTestId("platform-section-catalogue").click();
  await page.getByTestId("catalogue-mapping-summary").getByText("Confirmed: 1", { exact: true }).waitFor();
  await page.getByTestId(`catalogue-product-header-${safeProduct.slug}`).click();
  await page.getByTestId(`mapping-status-${safeProduct.slug}`).getByText("Confirmed current", { exact: true }).waitFor();

  localChanged = true;
  await page.getByTestId(`input-product-name-${safeProduct.slug}`).fill(`${safeProduct.name} updated`);
  await page.getByRole("button", { name: "Re-analyze Catalogue" }).click();
  await page.getByTestId("catalogue-mapping-summary").getByText("Stale: 1", { exact: true }).waitFor();
  await page.getByTestId(`mapping-status-${safeProduct.slug}`).getByText("Confirmation stale", { exact: true }).waitFor();

  localChanged = false;
  remoteChanged = true;
  await page.getByTestId(`input-product-name-${safeProduct.slug}`).fill(safeProduct.name);
  await page.getByRole("button", { name: "Re-analyze Catalogue" }).click();
  await page.getByTestId("catalogue-mapping-summary").getByText("Stale: 1", { exact: true }).waitFor();
  await page.getByTestId(`mapping-status-${safeProduct.slug}`).getByText("Confirmation stale", { exact: true }).waitFor();

  await page.getByTestId(`catalogue-product-header-${blockedProduct.slug}`).click();
  await page.getByTestId(`input-product-commerce-id-${blockedProduct.slug}`).click();
  const productSearch = page.getByRole("combobox", { name: "Search justicesure product" });
  await productSearch.fill(blockedRemoteId);
  const productResults = page.locator("[cmdk-root]").filter({ has: productSearch }).locator("[cmdk-item]:visible");
  await productResults.filter({ hasText: blockedProduct.name }).waitFor();
  assert.equal(await productResults.count(), 1, "Searching by exact product ID must narrow the catalogue.");
  await productResults.click();
  assert.match(await page.getByTestId(`input-product-commerce-id-${blockedProduct.slug}`).textContent(), new RegExp(blockedProduct.name));
  await page.getByTestId(`input-product-variant-${blockedProduct.slug}-${blockedSize}`).click();
  const variantSearch = page.getByRole("combobox", { name: `Search standard: ${blockedSize.toLowerCase()}` });
  await variantSearch.fill(blockedVariantId);
  const variantResults = page.locator("[cmdk-root]").filter({ has: variantSearch }).locator("[cmdk-item]:visible");
  await variantResults.filter({ hasText: `Size ${blockedSize}` }).waitFor();
  assert.equal(await variantResults.count(), 1, "Searching by exact variant ID must narrow variants.");
  await variantResults.click();
  await page.getByText("Advanced mapping identifiers").last().click();
  await page.getByText(`${blockedSize}: ${blockedVariantId}`, { exact: true }).waitFor();

  await context.close();
  console.log("Catalogue mapping Staff browser regressions passed.");
} finally {
  await harness.cleanup().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}