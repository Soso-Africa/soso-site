import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { createStaffBrowserHarness } from "./staff-browser-harness.mjs";

const editorPassword = "MaskEditorBrowser123!";
const baseAPath = "/api/storage/objects/uploads/browser-mask-base-a.png";
const baseBPath = "/api/storage/objects/uploads/browser-mask-base-b.png";
const approvedPath = "/api/storage/objects/uploads/browser-approved-garment-mask.png";
const initialMaskPath = "/api/storage/objects/uploads/existing-approved-garment-mask.png";
let browser;
const harness = await createStaffBrowserHarness({ prefix: "mask", ownerPassword: "MaskOwnerBrowser123!" });
const { api, replaceDraftFixture, storeOrigin } = harness;

function makePng(width, height) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const garment = x > 0 && x < width - 1 && y > 0 && y < height - 1;
      png.data[index] = garment ? 20 : 245;
      png.data[index + 1] = garment ? 40 : 245;
      png.data[index + 2] = garment ? 80 : 245;
      png.data[index + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function makeMask(width, height) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const garment = x > 0 && x < width - 1 && y > 0 && y < height - 1;
      png.data[index] = 255;
      png.data[index + 1] = 255;
      png.data[index + 2] = 255;
      png.data[index + 3] = garment ? 255 : 0;
    }
  }
  return PNG.sync.write(png);
}

try {
  await harness.startServers();
  const originalRow = harness.originalPlatformRow;
  assert.ok(originalRow.draft?.products?.length, "The isolated fixture must contain a catalogue product.");

  const product = originalRow.draft.products[0];
  const seededContent = structuredClone(originalRow.draft);
  seededContent.products[0].colourVisualizer = {
    baseImageSrc: baseAPath,
    garmentMaskSrc: initialMaskPath,
  };
  await replaceDraftFixture(seededContent);

  const { email: editorEmail } = await harness.createStaffUser({ label: "editor", password: editorPassword });

  browser = await harness.launchBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  const basePng = makePng(8, 8);
  const matchingMask = makeMask(8, 8);
  const mismatchedMask = makeMask(7, 8);
  let delayBaseA = true;
  let uploadRequests = 0;

  await page.route(`**${baseAPath}`, async (route) => {
    if (delayBaseA) await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    await route.fulfill({ status: 200, contentType: "image/png", body: basePng });
  });
  await page.route(`**${baseBPath}`, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: basePng }));
  await page.route("**/api/storage/uploads/request-url", async (route) => {
    uploadRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploadURL: `${storeOrigin}/mask-test/upload`,
        uploadMethod: "POST",
        uploadFields: {},
        objectPath: approvedPath,
      }),
    });
  });
  await page.route("**/mask-test/upload", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/storage/uploads/finalize", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ objectPath: approvedPath }) }));

  await page.goto(`${storeOrigin}/sign-in`);
  await page.getByLabel("Staff email").fill(editorEmail);
  await page.getByLabel("Password").fill(editorPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/staff");
  await page.getByRole("button", { name: "Platform content" }).click();
  await page.getByText("Draft and published content are versioned separately.").waitFor();
  await page.getByTestId("platform-section-catalogue").click();
  await page.getByTestId(`catalogue-product-header-${product.slug}`).click();

  const baseInput = page.getByTestId(`input-mask-base-${product.slug}`);
  const approvedOutput = page.getByTestId(`mask-approved-path-${product.slug}`);
  const prepareButton = page.getByTestId(`button-mask-prepare-${product.slug}`);
  const draft = page.getByTestId(`mask-draft-${product.slug}`);
  const reviewInput = page.getByTestId(`input-mask-review-${product.slug}`);

  await approvedOutput.getByText(initialMaskPath, { exact: true }).waitFor();
  await prepareButton.click();
  await baseInput.fill(baseBPath);
  await page.waitForTimeout(650);
  assert.equal(await draft.count(), 0, "A draft prepared for a replaced base image must be discarded.");
  await approvedOutput.getByText("None — live recolouring remains off", { exact: true }).waitFor();

  delayBaseA = false;
  await baseInput.fill(baseAPath);
  await prepareButton.click();
  await draft.waitFor();
  assert.equal(uploadRequests, 0, "Preparing a draft must not upload or assign a mask.");
  await approvedOutput.getByText("None — live recolouring remains off", { exact: true }).waitFor();
  await page.getByTestId(`button-mask-discard-${product.slug}`).click();
  assert.equal(await draft.count(), 0, "Discard draft must remove the pending review.");

  await reviewInput.setInputFiles({ name: "wrong-size.png", mimeType: "image/png", buffer: mismatchedMask });
  await page.getByTestId(`mask-error-${product.slug}`)
    .getByText("The mask dimensions must exactly match the selected base image.", { exact: true }).waitFor();
  assert.equal(await page.getByTestId(`button-mask-approve-${product.slug}`).count(), 0);
  assert.equal(uploadRequests, 0, "A dimension-mismatched PNG must never reach upload.");

  await reviewInput.setInputFiles({ name: "matching-mask.png", mimeType: "image/png", buffer: matchingMask });
  await draft.waitFor();
  assert.equal(uploadRequests, 0, "Reviewing a valid PNG must remain local until explicit approval.");
  await approvedOutput.getByText("None — live recolouring remains off", { exact: true }).waitFor();

  await page.getByTestId(`button-mask-approve-${product.slug}`).click();
  await approvedOutput.getByText(approvedPath, { exact: true }).waitFor();
  assert.equal(uploadRequests, 1, "Only Approve & use mask may start the governed upload.");
  assert.equal(await draft.count(), 0, "Approval must clear the reviewed draft.");

  await context.close();
  console.log("Garment mask browser approval regressions passed.");
} finally {
  await harness.cleanup().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}