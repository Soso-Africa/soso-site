import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import binary from "@sparticuz/chromium";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const origin = "http://127.0.0.1:41741";
const platform = JSON.parse(await readFile(resolve(root, "visual/fixtures/platform.json"), "utf8"));
const privacy = JSON.parse(await readFile(resolve(root, "visual/fixtures/privacy.json"), "utf8"));
const product = platform.content.products.find((item) => item.slug === "vault");
assert(product, "The visual fixture needs a real product photo.");
const originalSrc = product.images?.[0]?.src ?? product.img;
const otherSources = platform.content.products.filter((item) => item.slug !== product.slug).map((item) => item.images?.[0]?.src ?? item.img);
const whiteSrc = otherSources[0];
const greenSrc = otherSources[1];
product.colourOptions = [
  { id: "as-shown", label: "White", hex: "#FFFFFF", previewImageSrc: whiteSrc },
  { id: "black", label: "Black", hex: "#191919", previewImageSrc: originalSrc },
  { id: "green", label: "Green", hex: "#008000", previewImageSrc: greenSrc },
  { id: "scarlet", label: "Scarlet", hex: "#B01030" },
];
product.standardEligible = true;
product.standardSizes = ["S", "M"];
product.sizes = ["S", "M"];
product.customEligible = false;
product.price = 25000;
product.name = "Synthetic JusticeSure Test Set";
product.variantPrices = { S: 25000, M: 35000 };
product.commerceProductId = randomUUID();
product.commerceVariantIds = { S: randomUUID(), M: randomUUID() };
platform.checkoutEnabled = true;
product.colourVisualizer = {
  baseImageSrc: originalSrc,
  garmentMaskSrc: "/images/soso/retired-garment-mask.png",
};
const unavailable = platform.content.products.find((item) => item.slug !== product.slug);
if (unavailable) unavailable.fulfilmentState = "unavailable";

const server = spawn("pnpm", ["exec", "vite", "preview", "--host", "127.0.0.1",
  "--port", "41741", "--strictPort"], { cwd: root, detached: true, stdio: "ignore" });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* server starting */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  assert(ready, "The built storefront preview did not start.");
  browser = await chromium.launch({
    executablePath: await binary.executablePath(),
    args: binary.args.filter((arg) => arg !== "--single-process"), headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1120, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("soso-consent-v1", "essential_only");
    sessionStorage.setItem("soso-pwa-install-dismissed-v1", "yes");
  });
  let maskRequests = 0;
  await context.route("**/*retired-garment-mask*", (route) => {
    maskRequests++;
    return route.abort();
  });
  await context.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    let status = 404;
    let body = { error: "photo_fixture_only" };
    if (path === "/api/content/platform") { body = platform; status = 200; }
    if (path === "/api/policies/privacy") { body = privacy; status = 200; }
    if (path.includes("redirect")) { body = { redirect: null }; status = 200; }
    if (path === "/api/price-display") {
      const { amounts = [] } = route.request().postDataJSON();
      body = { baseCurrency: "NGN", currency: "NGN", suggestedCurrency: "NGN",
        availableCurrencies: ["NGN"], estimated: false, updatedAt: null,
        expiresAt: null, unavailableReason: null,
        sourceUrl: "https://www.exchangerate-api.com",
        prices: amounts.map((naira) => ({ naira, amount: naira })) };
      status = 200;
    }
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  await page.goto(origin + "/shop");
  const card = page.locator(`.soso-card:has([href="/product/${product.slug}"]) img`).first();
  await card.waitFor();
  assert.equal(new URL(await card.getAttribute("src"), origin).pathname, originalSrc);
  await card.hover();
  assert.deepEqual(await card.evaluate((img) => {
    const style = getComputedStyle(img);
    return [style.objectFit, style.filter, style.transform, style.opacity];
  }), ["contain", "none", "none", "1"], "Catalogue images must not crop, grey, blur or enlarge.");
  if (unavailable) {
    const unavailableCard = page.locator(`.soso-card:has([href="/product/${unavailable.slug}"])`);
    await unavailableCard.waitFor();
    assert.deepEqual(await unavailableCard.locator("img").first().evaluate((img) =>
      [getComputedStyle(img).filter, getComputedStyle(img).opacity]), ["none", "1"]);
    assert.equal(await unavailableCard.locator('div[class*="absolute inset-0"][class*="backdrop-blur"]').count(), 0);
  }
  await page.goto(origin + `/product/${product.slug}`);
  for (const [colour, source] of [["White", whiteSrc], ["Black", originalSrc], ["Green", greenSrc]]) {
    await page.getByRole("button", { name: `Select colour ${colour}` }).click();
    await page.waitForFunction((expected) =>
      document.querySelector(".soso-gallery img")?.getAttribute("src") === expected, source);
    assert.equal(await page.locator("dl").first().locator("dd").first().innerText(), colour);
  }
  await page.getByRole("button", { name: "Select colour Scarlet" }).click();
  const galleryImage = page.locator(".soso-gallery img").first();
  await galleryImage.waitFor();
  assert.equal(new URL(await galleryImage.getAttribute("src"), origin).pathname, originalSrc);
  assert.equal(await galleryImage.evaluate((img) => getComputedStyle(img).objectFit), "contain");
  assert.equal(await page.locator(".soso-gallery [style*='mask']").count(), 0);
  assert.equal(maskRequests, 0);
  await page.getByText(/No separate photograph is available for Scarlet/).waitFor();
  await page.getByRole("button", { name: "Select colour White" }).click();
  await page.getByTestId("button-size-S").click();
  await page.getByTestId("button-add-to-cart").click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("soso-cart") || "[]")[0]?.price === 25000);
  await page.getByTestId("select-cart-size-vault").selectOption("M");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("soso-cart") || "[]")[0]?.price === 35000);
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("soso-cart") || "[]"));
  assert.equal(cart[0].size, "M");
  assert.equal(cart[0].commerceVariantId, product.commerceVariantIds.M);
  assert.equal(cart[0].selectedColourId, "as-shown");
  assert.equal(cart[0].img, whiteSrc);
  assert((await page.getByRole("dialog").getByText(/35,000/).count()) >= 2,
    "Both the cart line price and its total must reflect the selected variant.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + `/product/${product.slug}`);
  await page.getByRole("button", { name: "Select colour Green" }).click();
  await page.getByTestId("button-size-M").click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "The product title, gallery, prices and colour controls must fit the phone viewport.");
  assert.equal(await page.locator("dl").first().locator("dd").first().innerText(), "Green");
  console.log("Product photos and variant pricing passed: each colour shows its linked original photo, no masks or distortion, and changing size updates the exact variant, unit price and cart total.");
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise((resolveStop) => server.once("exit", resolveStop));
    process.kill(-server.pid, "SIGTERM");
    await stopped;
  }
}
