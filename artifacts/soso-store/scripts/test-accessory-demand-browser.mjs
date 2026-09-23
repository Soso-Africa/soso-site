import assert from "node:assert/strict";
import { createStaffBrowserHarness } from "./staff-browser-harness.mjs";

const editorPassword = "DemandEditorBrowser123!";
const harness = await createStaffBrowserHarness({ prefix: "demand", ownerPassword: "DemandOwnerBrowser123!" });
const { storeOrigin } = harness;
let browser;

const items = [
  { productSlug: "new-demand-pouch", accessoryCategory: "Bags", requestCount: 2, previousRequestCount: 0, change: 2, trend: "new" },
  { productSlug: "growing-demand-belt", accessoryCategory: "Belts", requestCount: 4, previousRequestCount: 1, change: 3, trend: "growth" },
  { productSlug: "declining-demand-scarf", accessoryCategory: "Scarves", requestCount: 1, previousRequestCount: 3, change: -2, trend: "decline" },
  { productSlug: "steady-demand-pin", accessoryCategory: "Jewellery", requestCount: 2, previousRequestCount: 2, change: 0, trend: "no_change" },
];

function summary(comparisonCoverage) {
  return {
    from: "2026-09-08",
    to: "2026-09-14",
    comparisonFrom: "2026-09-01",
    comparisonTo: "2026-09-07",
    comparisonCoverage,
    comparisonAvailableFrom: comparisonCoverage === "partial" ? "2026-09-04" : null,
    totalUniqueRequests: 9,
    previousTotalUniqueRequests: comparisonCoverage === "empty" ? 0 : 6,
    items,
  };
}

async function assertContainedAndReadable(page) {
  const summaryRegion = page.getByTestId("accessory-demand-summary");
  const regionBox = await summaryRegion.boundingBox();
  assert.ok(regionBox, "The demand summary must be visible.");
  assert.equal(
    await summaryRegion.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    true,
    "The demand summary must not overflow horizontally.",
  );
  for (const locator of [page.getByTestId("accessory-demand-comparison"), ...await page.getByTestId("accessory-demand-trend").all()]) {
    const box = await locator.boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0, "Comparison guidance and trend labels must have visible dimensions.");
    assert.ok(box.x >= regionBox.x - 1 && box.x + box.width <= regionBox.x + regionBox.width + 1, "Summary signals must stay inside the aggregate card.");
  }
  const aggregateText = await summaryRegion.innerText();
  assert.doesNotMatch(aggregateText, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, "The aggregate must not render shopper email addresses.");
}

async function openDemandTab(page) {
  const summaryRegion = page.getByTestId("accessory-demand-summary");
  if (await summaryRegion.count()) {
    await summaryRegion.waitFor();
    return;
  }
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    const mobileNavigationButton = page.getByRole("button", { name: "Open staff navigation" });
    await mobileNavigationButton.waitFor();
    await mobileNavigationButton.click();
  }
  await page.getByRole("button", { name: "Accessory launch requests" }).click();
  await summaryRegion.waitFor();
}

try {
  await harness.startServers();
  const { email } = await harness.createStaffUser({ label: "editor", password: editorPassword });
  browser = await harness.launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  let coverage = "full";

  await page.route("**/api/staff/accessory-launch-notifications/summary?*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary(coverage)) }));
  await page.route("**/api/staff/accessory-launch-notifications", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  await page.goto(`${storeOrigin}/sign-in`);
  await page.getByLabel("Staff email").fill(email);
  await page.getByLabel("Password").fill(editorPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/staff");
  await openDemandTab(page);

  for (const label of ["New demand", "Up 3", "Down 2", "No change"]) {
    await page.getByTestId("accessory-demand-summary").getByText(label, { exact: true }).waitFor();
  }
  await page.getByText("Compared with 1 Sep 2026 – 7 Sep 2026.", { exact: true }).waitFor();
  await assertContainedAndReadable(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await assertContainedAndReadable(page);

  coverage = "partial";
  await page.reload();
  await openDemandTab(page);
  await page.getByText("Comparison is partial: recorded requests begin 4 Sep 2026, after this comparison period started.", { exact: true }).waitFor();
  await assertContainedAndReadable(page);

  coverage = "empty";
  await page.reload();
  await openDemandTab(page);
  await page.getByText("No recorded requests are available for 1 Sep 2026 – 7 Sep 2026; new demand is shown against zero.", { exact: true }).waitFor();
  await assertContainedAndReadable(page);

  await context.close();
  console.log("Accessory demand summary desktop and mobile browser regressions passed.");
} finally {
  await harness.cleanup().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}