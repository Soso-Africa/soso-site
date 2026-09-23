import assert from "node:assert/strict";
import { createStaffBrowserHarness } from "./staff-browser-harness.mjs";

const editorPassword = "HomepageEditor123!";
const staleEditorPassword = "HomepageStaleEditor123!";
let browser;
const harness = await createStaffBrowserHarness({ prefix: "homepage", ownerPassword: "HomepageOwner123!" });
const { api, currentPlatformRow: currentRow, savePlatformContent: saveContent, storeOrigin } = harness;

async function merchandisingValues(page, prefix, length) {
  return Promise.all(Array.from({ length }, (_, index) =>
    page.getByTestId(`${prefix}-${index}`).getAttribute("data-merchandising-value")));
}

async function moveStructuredCardDown(page, testId) {
  await page.getByTestId(testId).locator(":scope > div").first()
    .getByRole("button", { name: "Move down" }).click();
}

try {
  await harness.startServers();
  const originalRow = harness.originalPlatformRow;
  assert.ok(originalRow.draft && originalRow.published, "The isolated storefront fixture must start with draft and published content.");

  const editor = await harness.createStaffUser({ label: "editor", password: editorPassword });
  const staleEditor = await harness.createStaffUser({ label: "stale-editor", password: staleEditorPassword });
  const { email: editorEmail, cookie: editorCookie } = editor;
  const { email: staleEditorEmail, cookie: staleEditorCookie } = staleEditor;

  browser = await harness.launchBrowser();
  const context = await browser.newContext();
  const staleContext = await browser.newContext();
  const page = await context.newPage();
  const stalePage = await staleContext.newPage();
  await page.goto(`${storeOrigin}/sign-in`);
  await page.getByLabel("Staff email").fill(editorEmail);
  await page.getByLabel("Password").fill(editorPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/staff");

  await stalePage.goto(`${storeOrigin}/sign-in`);
  await stalePage.getByLabel("Staff email").fill(staleEditorEmail);
  await stalePage.getByLabel("Password").fill(staleEditorPassword);
  await stalePage.getByRole("button", { name: "Sign in" }).click();
  await stalePage.waitForURL("**/staff");

  const [browserPlatformResponse] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/staff/content/platform" && response.request().method() === "GET"),
    page.getByRole("button", { name: "Platform content" }).click(),
  ]);
  const browserPlatformRow = await browserPlatformResponse.json();
  await page.getByText("Draft and published content are versioned separately.").waitFor();
  await page.getByTestId("platform-section-homepage").click();
  await page.getByTestId("homepage-structured-editor").waitFor();

  const [staleBrowserPlatformResponse] = await Promise.all([
    stalePage.waitForResponse((response) => new URL(response.url()).pathname === "/api/staff/content/platform" && response.request().method() === "GET"),
    stalePage.getByRole("button", { name: "Platform content" }).click(),
  ]);
  const staleBrowserPlatformRow = await staleBrowserPlatformResponse.json();
  await stalePage.getByTestId("platform-section-homepage").click();
  await stalePage.getByTestId("homepage-structured-editor").waitFor();
  assert.equal(
    staleBrowserPlatformRow.draftUpdatedAt,
    browserPlatformRow.draftUpdatedAt,
    "Both editor sessions must start from the same homepage draft revision.",
  );

  const initialCategories = await merchandisingValues(page, "homepage-category", 4);
  const initialFeatured = await merchandisingValues(page, "homepage-featured", 4);
  const initialOccasions = await merchandisingValues(page, "homepage-occasion", 2);
  const initialArrival = await page.getByTestId("homepage-new-arrival-product").inputValue();
  const alternateArrival = originalRow.draft.products
    .map((product) => product.slug)
    .find((slug) => slug !== initialArrival);
  assert.ok(alternateArrival, "Expected an alternate published product for New Arrival.");
  const productNameBySlug = new Map(originalRow.draft.products.map((product) => [product.slug, product.name]));

  await moveStructuredCardDown(page, "homepage-category-0");
  await page.getByTestId("homepage-featured-0").getByRole("button", { name: "Move down" }).click();
  await moveStructuredCardDown(page, "homepage-occasion-0");
  await page.getByTestId("homepage-new-arrival-product").selectOption(alternateArrival);

  const expectedCategories = [initialCategories[1], initialCategories[0], ...initialCategories.slice(2)];
  const expectedFeatured = [initialFeatured[1], initialFeatured[0], ...initialFeatured.slice(2)];
  const expectedOccasions = [initialOccasions[1], initialOccasions[0]];
  assert.deepEqual(await merchandisingValues(page, "homepage-category", 4), expectedCategories);
  assert.deepEqual(await merchandisingValues(page, "homepage-featured", 4), expectedFeatured);
  assert.deepEqual(await merchandisingValues(page, "homepage-occasion", 2), expectedOccasions);
  await page.getByTestId("homepage-summary-categories").getByText(String(expectedCategories[0]), { exact: false }).waitFor();
  await page.getByTestId("homepage-summary-new-arrival").getByText(productNameBySlug.get(alternateArrival), { exact: false }).waitFor();
  await page.getByTestId("homepage-summary-featured").getByText(String(productNameBySlug.get(expectedFeatured[0])), { exact: false }).waitFor();
  await page.getByTestId("homepage-summary-occasions").getByText(String(expectedOccasions[0]), { exact: false }).waitFor();

  const rowBeforeSave = await currentRow(editorCookie);
  assert.deepEqual(rowBeforeSave.draft, browserPlatformRow.draft, "Platform default merging must be idempotent.");
  assert.equal(rowBeforeSave.draftUpdatedAt, browserPlatformRow.draftUpdatedAt, "The draft changed after the browser loaded it.");
  const [saveResponse] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/staff/content/platform" && response.request().method() === "PUT"),
    page.getByTestId("btn-save-draft").click(),
  ]);
  assert.equal(saveResponse.status(), 200, await saveResponse.text());
  const savedRow = await currentRow(editorCookie);
  await moveStructuredCardDown(stalePage, "homepage-category-0");
  const [staleSaveResponse] = await Promise.all([
    stalePage.waitForResponse((response) => new URL(response.url()).pathname === "/api/staff/content/platform" && response.request().method() === "PUT"),
    stalePage.getByTestId("btn-save-draft").click(),
  ]);
  assert.equal(staleSaveResponse.status(), 409, await staleSaveResponse.text());
  await stalePage.getByText("Platform content changed while you were editing. Reload before saving.").waitFor();
  const rowAfterStaleSave = await currentRow(staleEditorCookie);
  assert.deepEqual(
    rowAfterStaleSave.draft.homepage,
    savedRow.draft.homepage,
    "The stale editor must not overwrite the first editor's saved homepage order.",
  );
  assert.equal(
    rowAfterStaleSave.draftUpdatedAt,
    savedRow.draftUpdatedAt,
    "A rejected stale save must not create a new draft revision.",
  );

  const invalidContent = structuredClone(savedRow.draft);
  invalidContent.homepage.featured.productSlugs[1] = invalidContent.homepage.featured.productSlugs[0];
  const rejected = await saveContent(editorCookie, invalidContent, savedRow.draftUpdatedAt);
  assert.equal(rejected.response.status, 400, "Publication safeguards must reject duplicate featured products.");

  const [publishResponse] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/staff/content/platform/publish"),
    page.getByTestId("btn-publish").click(),
  ]);
  assert.equal(publishResponse.status(), 200, await publishResponse.text());
  const publishedRow = await currentRow(editorCookie);
  assert.deepEqual(
    publishedRow.published.homepage.categories.items.slice(0, 4).map((item) => item.title),
    expectedCategories,
    "Publishing must persist the saved homepage category order.",
  );
  await context.close();
  await staleContext.close();
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(storeOrigin);
  await publicPage.getByTestId("link-home-hero-primary").waitFor();
  assert.deepEqual(
    await merchandisingValues(publicPage, "home-category", 4),
    initialCategories,
    "The public category destinations must retain their canonical route order.",
  );
  assert.equal(await publicPage.getByTestId("home-new-arrival").getAttribute("data-merchandising-value"), alternateArrival);
  assert.deepEqual(await merchandisingValues(publicPage, "home-featured", 4), expectedFeatured);
  assert.deepEqual(await merchandisingValues(publicPage, "home-occasion", 2), expectedOccasions);
  await publicContext.close();
  console.log("Homepage merchandising and concurrent editor browser regressions passed.");
} finally {
  await harness.cleanup().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}