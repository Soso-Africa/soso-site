import assert from "node:assert/strict";
import { createStaffBrowserHarness } from "./staff-browser-harness.mjs";

const editorPassword = "CatalogueActionsBrowser123!";
const harness = await createStaffBrowserHarness({ prefix: "catalogue-actions", ownerPassword: "CatalogueActionsOwner123!" });
const { storeOrigin } = harness;

try {
  await harness.startServers();
  const original = harness.originalPlatformRow;
  assert.ok(original.draft?.products?.length);
  assert.ok(original.published?.products?.length);
  const publicRemovalFixture = structuredClone(original.draft.products.find((product) => product.fulfilmentState === "unavailable"));
  assert.ok(publicRemovalFixture, "Fixture needs a browse-only product.");
  publicRemovalFixture.slug = "browser-published-removal";
  publicRemovalFixture.name = "Browser Published Removal";
  publicRemovalFixture.releaseState = "placeholder";
  delete publicRemovalFixture.commerceProductId;
  delete publicRemovalFixture.commerceVariantIds;
  delete publicRemovalFixture.commerceMappingConfirmation;
  let savedRow = {
    ...original,
    draft: { ...structuredClone(original.draft), products: [publicRemovalFixture, ...structuredClone(original.draft.products)] },
    published: { ...structuredClone(original.published), products: [publicRemovalFixture, ...structuredClone(original.published.products)] },
    draftUpdatedAt: "2026-09-21T10:00:00.000Z",
    publishedAt: "2026-09-21T10:00:00.000Z",
  };
  const initiallyPublished = structuredClone(savedRow.published);
  let savedPayload;
  let productPublishRequests = 0;
  let productRemovalRequests = 0;
  let rejectRemoval = true;
  let releaseRemovalResponse;
  const removalResponseGate = new Promise((resolve) => { releaseRemovalResponse = resolve; });
  const { email } = await harness.createStaffUser({ label: "editor", password: editorPassword });
  const browser = await harness.launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.route("**/api/payment/catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"products":[]}' }));
  await page.route("**/api/staff/content/platform/revisions", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/staff/content/platform/publish", (route) => route.fulfill({
    status: 400, contentType: "application/json",
    body: JSON.stringify({ error: "JusticeSure mappings did not pass live publishing checks", issues: ["boardroom-shirt: confirm the current high-confidence JusticeSure mapping before publishing."] }),
  }));
  await page.route("**/api/staff/content/platform/products/*/publish", (route) => {
    productPublishRequests++;
    return route.fulfill({
      status: 400, contentType: "application/json",
      body: JSON.stringify({ error: "Finish this product’s images before publishing it.", issues: [{ path: ["products", 0, "images", 0, "alt"], message: "Add image alt text." }] }),
    });
  });
  await page.route("**/api/staff/content/platform/products/*/unpublish", async (route) => {
    productRemovalRequests++;
    if (rejectRemoval) return route.fulfill({
      status: 400, contentType: "application/json",
      body: JSON.stringify({ error: "Remove published Journal references before unpublishing this product.", issues: [`Journal “launch-story” lists ${publicRemovalFixture.slug} as a related product.`] }),
    });
    await removalResponseGate;
    assert.equal(route.request().postDataJSON().expectedDraftUpdatedAt, savedRow.draftUpdatedAt);
    assert.equal(route.request().postDataJSON().expectedPublishedAt, savedRow.publishedAt);
    savedRow = {
      ...savedRow,
      published: { ...savedRow.published, products: savedRow.published.products.filter((item) => item.slug !== publicRemovalFixture.slug) },
      publishedAt: new Date(Date.parse(savedRow.publishedAt) + 1000).toISOString(),
    };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(savedRow) });
  });
  await page.route("**/api/staff/content/platform", async (route) => {
    if (route.request().method() === "PUT") {
      savedPayload = route.request().postDataJSON().content;
      savedRow = { ...savedRow, draft: structuredClone(savedPayload), draftUpdatedAt: new Date(Date.parse(savedRow.draftUpdatedAt) + 1000).toISOString() };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(savedRow) });
  });

  await page.goto(`${storeOrigin}/sign-in`);
  await page.getByLabel("Staff email").fill(email);
  await page.getByLabel("Password").fill(editorPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/staff");
  await page.getByRole("button", { name: "Platform content" }).click();
  await page.getByTestId("platform-section-catalogue").click();

  const referencedSlug = savedRow.draft.homepage.featured.productSlugs[0];
  await page.getByTestId(`catalogue-product-header-${referencedSlug}`).click();
  await page.getByTestId(`button-delete-catalogue-product-${referencedSlug}`).click();
  await page.getByRole("alert").filter({ hasText: "Remove references" }).waitFor();
  assert.ok(await page.getByTestId(`catalogue-product-${referencedSlug}`).count());

  await page.getByTestId("button-add-catalogue-product").click();
  const added = page.locator('[data-testid^="catalogue-product-new-product-"]').first();
  const slug = (await added.getAttribute("data-testid")).replace("catalogue-product-", "");
  const deleteButton = page.getByTestId(`button-delete-catalogue-product-${slug}`);
  page.once("dialog", (dialog) => dialog.dismiss());
  await deleteButton.click();
  assert.ok(await added.count(), "Cancel should leave the product in the draft.");
  page.once("dialog", (dialog) => dialog.accept());
  await deleteButton.click();
  await added.waitFor({ state: "detached" });
  await page.getByTestId("btn-save-draft").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="status-message"]')?.textContent?.includes("Draft saved"));
  assert.ok(savedPayload);
  assert.ok(!savedPayload.products.some((item) => item.slug === slug));
  assert.deepEqual(savedRow.published, initiallyPublished, "Deleting a draft product must not change published content.");

  await page.getByTestId("btn-publish").click();
  await page.getByTestId("status-message").getByText(/boardroom-shirt: confirm the current high-confidence/).waitFor();

  await page.getByTestId("button-add-catalogue-product").click();
  const next = page.locator('[data-testid^="catalogue-product-new-product-"]').first();
  const nextSlug = (await next.getAttribute("data-testid")).replace("catalogue-product-", "");
  const slugInput = page.locator('input[data-testid^="input-product-slug-"]:visible');
  await slugInput.click();
  await slugInput.press("End");
  await page.keyboard.type("-focus", { delay: 10 });
  assert.equal(await slugInput.inputValue(), `${nextSlug}-focus`, "Typing must keep focus in the slug field.");
  assert.equal(await slugInput.evaluate((input) => input === document.activeElement), true);
  await slugInput.evaluate((input) => input.setSelectionRange(4, 4));
  await page.keyboard.type("new-", { delay: 10 });
  assert.equal(await slugInput.inputValue(), `${nextSlug.slice(0, 4)}new-${nextSlug.slice(4)}-focus`, "Typing at the cursor must not reset its position.");
  await slugInput.fill(nextSlug);
  await page.getByTestId(`button-publish-catalogue-product-${nextSlug}`).click();
  await page.getByTestId(`product-publish-status-${nextSlug}`).getByText(/Save your current draft/).waitFor();
  assert.equal(productPublishRequests, 0, "Unsaved edits must never reach the publication API.");
  await page.getByTestId("btn-save-draft").click();
  await page.waitForFunction((expected) => document.querySelector('[data-testid="status-message"]')?.textContent?.includes(expected), "Draft saved");
  await page.getByTestId(`button-publish-catalogue-product-${nextSlug}`).click();
  await page.getByTestId(`product-publish-status-${nextSlug}`).getByText(/products\.0\.images\.0\.alt: Add image alt text/).waitFor();
  assert.equal(productPublishRequests, 1);

  await page.getByTestId(`catalogue-product-header-${publicRemovalFixture.slug}`).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId(`button-delete-catalogue-product-${publicRemovalFixture.slug}`).click();
  const publishRemoval = page.getByTestId(`button-publish-product-removal-${publicRemovalFixture.slug}`);
  await publishRemoval.waitFor();
  await publishRemoval.click();
  await page.getByTestId("product-removal-status").getByText(/Save the draft without this product/).waitFor();
  assert.equal(productRemovalRequests, 0);
  await page.getByTestId("btn-save-draft").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="status-message"]')?.textContent?.includes("Draft saved"));
  assert.ok(!savedRow.draft.products.some((item) => item.slug === publicRemovalFixture.slug));
  assert.ok(savedRow.published.products.some((item) => item.slug === publicRemovalFixture.slug));

  page.once("dialog", (dialog) => dialog.dismiss());
  await publishRemoval.click();
  assert.equal(productRemovalRequests, 0, "A cancelled confirmation must not unpublish the product.");
  page.once("dialog", (dialog) => dialog.accept());
  await publishRemoval.click();
  await page.getByTestId("product-removal-status").getByText(/Journal “launch-story” lists/).waitFor();
  assert.equal(productRemovalRequests, 1);
  assert.ok(savedRow.published.products.some((item) => item.slug === publicRemovalFixture.slug));
  rejectRemoval = false;
  page.once("dialog", (dialog) => dialog.accept());
  await publishRemoval.click();
  await page.waitForFunction(() => document.querySelector('fieldset:disabled [data-testid="button-add-catalogue-product"]') !== null);
  assert.equal(await page.getByTestId("button-add-catalogue-product").isDisabled(), true, "Editing must pause while public removal is in flight.");
  releaseRemovalResponse();
  await publishRemoval.waitFor({ state: "detached" });
  await page.getByTestId("status-message").getByText(/removed from the live storefront/).waitFor();
  assert.equal(productRemovalRequests, 2);
  assert.ok(!savedRow.published.products.some((item) => item.slug === publicRemovalFixture.slug));
  assert.deepEqual(savedRow.published.homepage, original.published.homepage);
  await context.close();
  console.log("Catalogue draft deletion, scoped public removal, and publish feedback browser regressions passed.");
} finally {
  await harness.cleanup();
}