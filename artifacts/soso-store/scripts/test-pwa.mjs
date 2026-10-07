import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import binary from "@sparticuz/chromium";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const origin = "http://127.0.0.1:41740";
const platform = JSON.parse(await readFile(resolve(root, "visual/fixtures/platform.json"), "utf8"));
const privacy = JSON.parse(await readFile(resolve(root, "visual/fixtures/privacy.json"), "utf8"));
let output = "";
function startServer() {
  const child = spawn("pnpm", ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", "41740", "--strictPort"],
    { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { output += data; });
  return child;
}
let server = startServer();
async function stopServer() {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const stopped = new Promise((resolveStop) => server.once("exit", resolveStop));
  process.kill(-server.pid, "SIGTERM");
  await stopped;
}
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(origin)).ok) return; } catch { /* starting */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(output);
}
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath: await binary.executablePath(),
    args: binary.args.filter((arg) => arg !== "--single-process"), headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem("soso-consent-v1", "essential_only");
    sessionStorage.setItem("soso-pwa-install-dismissed-v1", "yes");
  });
  const routeApi = (route) => {
    const path = new URL(route.request().url()).pathname;
    let body = { error: "pwa_fixture_only" };
    let status = 404;
    if (path === "/api/content/platform") { body = platform; status = 200; }
    if (path === "/api/policies/privacy") { body = privacy; status = 200; }
    if (path.includes("redirect")) { body = { redirect: null }; status = 200; }
    if (path === "/api/price-display") {
      const { amounts = [] } = route.request().postDataJSON();
      body = { baseCurrency: "NGN", currency: "NGN", suggestedCurrency: "NGN",
        availableCurrencies: ["NGN"], estimated: false, updatedAt: null, expiresAt: null,
        unavailableReason: null, sourceUrl: "https://www.exchangerate-api.com",
        prices: amounts.map((naira) => ({ naira, amount: naira })) };
      status = 200;
    }
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  };
  await context.route("**/api/**", routeApi);
  const page = await context.newPage();
  await page.goto(origin + "/shop");
  const help = page.getByText("Install SOSO on your device", { exact: true });
  await help.waitFor();
  await help.click();
  assert(await page.getByText(/iPhone and iPad:/).isVisible());
  assert(await page.getByText(/Desktop and Android:/).isVisible());
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send("Page.getAppManifest");
  assert.equal(manifest.errors.length, 0, JSON.stringify(manifest.errors));
  const parsed = JSON.parse(manifest.data);
  assert.equal(parsed.display, "standalone");
  assert.equal(parsed.start_url, "./");
  assert.equal(parsed.icons.length, 2);
  for (const icon of parsed.icons) {
    const response = await fetch(origin + "/" + icon.src);
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
  }
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => { window.__pwaPromptCalled = true; };
    event.userChoice = Promise.resolve({ outcome: "dismissed" });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Install SOSO", exact: true }).click();
  assert(await page.evaluate(() => window.__pwaPromptCalled));
  assert.equal(await page.getByRole("button", { name: "Install SOSO", exact: true }).count(), 0);
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await help.waitFor({ state: "hidden" });
  assert.equal(await help.count(), 0);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cacheAudit = () => page.evaluate(async () => {
    const names = (await caches.keys()).filter((key) => key.startsWith("soso-pwa:"));
    const urls = [];
    for (const name of names) {
      for (const request of await (await caches.open(name)).keys()) urls.push(new URL(request.url).pathname);
    }
    return urls.sort();
  });
  const expected = ["/offline.html", "/pwa-icon-192.png", "/pwa-icon-512.png"].sort();
  assert.deepEqual(await cacheAudit(), expected);
  // Chromium's renderer offline emulation may leave worker fetches online.
  // Removing the origin proves real worker network-failure handling instead.
  await stopServer();
  await page.goto(origin + "/checkout/return?reference=pwa-synthetic-check");
  await page.getByRole("heading", { name: "You’re offline" }).waitFor({ timeout: 10000 });
  assert(page.url().includes("reference=pwa-synthetic-check"), "Offline recovery must preserve payment-return URL.");
  await page.goto(origin + "/staff");
  assert(await page.getByRole("heading", { name: "You’re offline" }).isVisible());
  assert.deepEqual(await cacheAudit(), expected, "Private navigation must not add cache entries.");
  server = startServer();
  await waitForServer();
  await page.goto(origin + "/shop");
  await help.waitFor();
  assert.deepEqual(await cacheAudit(), expected);

  const ipad = await browser.newContext({
    viewport: { width: 1024, height: 1366 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  });
  await ipad.addInitScript(() => {
    localStorage.setItem("soso-consent-v1", "essential_only");
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
  });
  await ipad.route("**/api/**", routeApi);
  const ipadPage = await ipad.newPage();
  await ipadPage.goto(origin + "/shop");
  const popup = ipadPage.getByRole("dialog", { name: "Install SOSO" });
  await popup.waitFor();
  assert(await popup.getByText("On your iPhone or iPad").isVisible(), "Desktop-style iPadOS must get Apple's manual steps.");
  assert(await popup.getByText(/Choose.*Add to Home Screen/).isVisible());
  assert.equal(await popup.getByRole("button", { name: "Install SOSO", exact: true }).count(), 0,
    "Safari must not offer a fake native installation action.");
  await ipadPage.keyboard.press("Escape");
  await popup.waitFor({ state: "hidden" });
  await ipadPage.reload();
  await ipadPage.waitForTimeout(3200);
  assert.equal(await popup.count(), 0, "Dismissal must survive navigation/reload in the same session.");
  await ipadPage.evaluate(() => sessionStorage.removeItem("soso-pwa-install-dismissed-v1"));
  await ipadPage.reload();
  await popup.waitFor();
  await ipadPage.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await popup.waitFor({ state: "hidden" });
  assert.equal(await ipadPage.getByText("Install SOSO on your device", { exact: true }).count(), 0);

  // A fresh browsing session still shows the guide, but not on sensitive routes.
  const safe = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await safe.addInitScript(() => localStorage.setItem("soso-consent-v1", "essential_only"));
  await safe.route("**/api/**", routeApi);
  const safePage = await safe.newPage();
  for (const path of ["/checkout", "/checkout/return", "/sign-in", "/privacy"]) {
    await safePage.goto(origin + path);
    await safePage.waitForTimeout(2800);
    assert.equal(await safePage.locator("[data-pwa-install-popup]").count(), 0, path + " must not be interrupted.");
  }
  await safePage.goto(origin + "/shop");
  await safePage.getByRole("dialog", { name: "Install SOSO" }).waitFor();
  const box = await safePage.locator("[data-pwa-install-popup]").boundingBox();
  assert(box.x >= 0 && box.x + box.width <= 390, "The phone popup must fit the viewport.");
  await safePage.getByRole("button", { name: "Continue browsing", exact: true }).click();

  const installedContext = await browser.newContext();
  await installedContext.addInitScript(() => {
    localStorage.setItem("soso-consent-v1", "essential_only");
    Object.defineProperty(navigator, "standalone", { get: () => true });
  });
  await installedContext.route("**/api/**", routeApi);
  const installedPage = await installedContext.newPage();
  await installedPage.goto(origin + "/shop");
  await installedPage.waitForTimeout(3200);
  assert.equal(await installedPage.locator("[data-pwa-install-popup]").count(), 0);
  assert.equal(await installedPage.getByText("Install SOSO on your device", { exact: true }).count(), 0);

  const native = await browser.newContext();
  await native.addInitScript(() => {
    localStorage.setItem("soso-consent-v1", "essential_only");
    document.addEventListener("DOMContentLoaded", () => {
      const early = new Event("beforeinstallprompt", { cancelable: true });
      early.prompt = async () => { window.__earlyPwaPromptCalled = true; };
      early.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(early);
    });
  });
  await native.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/content/platform") {
      await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
    }
    return routeApi(route);
  });
  const nativePage = await native.newPage();
  await nativePage.goto(origin + "/shop");
  const nativePopup = nativePage.getByRole("dialog", { name: "Install SOSO" });
  await nativePopup.waitFor();
  await nativePopup.getByRole("button", { name: "Install SOSO", exact: true }).click();
  assert(await nativePage.evaluate(() => window.__earlyPwaPromptCalled),
    "An install event before catalogue/footer mounting must remain usable.");
  await nativePopup.waitFor({ state: "hidden" });

  const privacyContext = await browser.newContext();
  await privacyContext.route("**/api/**", routeApi);
  const privacyPage = await privacyContext.newPage();
  await privacyPage.goto(origin + "/shop");
  const privacyChoices = privacyPage.locator("[data-soso-privacy-choices]");
  await privacyChoices.waitFor();
  await privacyPage.waitForTimeout(3200);
  assert.equal(await privacyPage.locator("[data-pwa-install-popup]").count(), 0,
    "The installation dialog must not cover unresolved privacy choices.");
  await privacyChoices.getByRole("button", { name: platform.content.site.consent.essentialLabel, exact: true }).click();
  await privacyPage.getByRole("dialog", { name: "Install SOSO" }).waitFor();
  await privacyPage.getByRole("button", { name: "Continue browsing", exact: true }).click();
  assert.equal(await privacyPage.evaluate(() => localStorage.getItem("soso-consent-v1")), "essential_only",
    "Dismissing the install guide must not grant optional measurement consent.");
  console.log("PWA checks passed: manifest/icons, automatic iPad and phone popup, session dismissal, installed suppression, sensitive-route exclusion, early native prompt, worker, safe caches and reconnect.");
} finally {
  await browser?.close();
  await stopServer();
}
