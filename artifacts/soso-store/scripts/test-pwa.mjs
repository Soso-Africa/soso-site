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
  await context.addInitScript(() => localStorage.setItem("soso-consent-v1", "essential_only"));
  await context.route("**/api/**", (route) => {
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
  });
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
  console.log("PWA checks passed: manifest/icons, mobile instructions, install/dismiss/installed events, worker, offline return/Staff, safe caches and reconnect.");
} finally {
  await browser?.close();
  await stopServer();
}
