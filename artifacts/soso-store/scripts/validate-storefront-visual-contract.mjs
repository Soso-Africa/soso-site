import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import serverlessChromium from "@sparticuz/chromium";
import { chromium } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const baselineDir = resolve(root, "visual/baselines");
const outputDir = resolve(root, "visual/output");
const fixtureDir = resolve(root, "visual/fixtures");
const updateBaselines = process.env.UPDATE_VISUAL_BASELINES === "1";
const port = 41739;
const origin = `http://127.0.0.1:${port}`;
const allowedDiffRatio = 0.002;

const platform = JSON.parse(await readFile(resolve(fixtureDir, "platform.json"), "utf8"));
const privacy = JSON.parse(await readFile(resolve(fixtureDir, "privacy.json"), "utf8"));
await mkdir(baselineDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
const surfaces = [
  { name: "home", path: "/", ready: '[data-testid="link-home-hero-primary"]' },
  { name: "shop", path: "/shop", ready: '[data-testid="status-result-count"]' },
  { name: "product", path: "/product/vault", ready: "h1" },
  { name: "checkout", path: "/checkout", ready: "h1" },
  { name: "policy", path: "/privacy", ready: "h1" },
  { name: "payment-return", path: "/checkout/return", ready: "h1" },
  { name: "not-found", path: "/visual-regression-404", ready: "h1" },
  { name: "staff-sign-in", path: "/sign-in", ready: "form" },
  { name: "cart", path: "/shop", ready: '[role="dialog"]', openCart: true },
];

const server = spawn(
  "pnpm",
  ["exec", "vite", "preview", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(port)],
  { cwd: root, env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] },
);
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Vite preview did not start.\n${serverOutput}`);
}

function luminance([red, green, blue]) {
  const values = [red, green, blue].map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value) {
  const match = value.match(/rgba?\((\d+),?\s+(\d+),?\s+(\d+)/);
  assert.ok(match, `Expected an RGB color, received ${value}.`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

async function installDeterministicRoutes(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
      await route.abort();
      return;
    }
    if (!url.pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }
    if (url.pathname === "/api/content/platform") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(platform) });
      return;
    }
    if (url.pathname === "/api/policies/privacy") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(privacy) });
      return;
    }
    if (url.pathname.includes("redirect")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ redirect: null }) });
      return;
    }
    if (url.pathname === "/api/staff-auth/status") {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "signed_out" }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "visual_fixture_missing" }) });
  });
}

async function preparePage(page, surface) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("soso-consent-v1", "essential_only");
  });
  await page.goto(`${origin}${surface.path}`, { waitUntil: "networkidle" });
  assert.equal(
    await page.getByRole("heading", { name: platform.content.site.consent.title }).count(),
    0,
    "Consent panel must be settled before visual capture.",
  );
  if (surface.openCart) {
    await page.locator("header").getByRole("button", { name: platform.content.site.header.openCartLabel }).click();
  }
  await page.locator(surface.ready).first().waitFor({ state: "visible" });
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}`,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
}

async function assertVisualSemantics(page, surface, viewportName) {
  if (viewportName === "mobile" && !surface.openCart) {
    const horizontalOverflow = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth <= viewportWidth + 1) return [];
      return Array.from(document.querySelectorAll("body *")).flatMap((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.right <= viewportWidth + 1 && rect.left >= -1) return [];
        const style = getComputedStyle(element);
        if (style.position === "fixed" || style.display === "none" || style.visibility === "hidden") return [];
        return [{
          tag: element.tagName.toLowerCase(),
          className: element.className,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        }];
      }).slice(0, 8);
    });
    assert.deepEqual(
      horizontalOverflow,
      [],
      `${viewportName} ${surface.name} overflows horizontally: ${JSON.stringify(horizontalOverflow)}`,
    );
  }
  const colors = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { background: style.backgroundColor, foreground: style.color };
  });
  const background = parseRgb(colors.background);
  const foreground = parseRgb(colors.foreground);
  if (surface.name === "staff-sign-in") {
    assert.ok(luminance(background) < 0.03, `${viewportName} Staff sign-in is no longer dark.`);
    assert.ok(contrast(foreground, background) >= 7, `${viewportName} Staff sign-in contrast dropped below 7:1.`);
    assert.equal(await page.locator("header").count(), 0, `${viewportName} public header leaked into Staff sign-in.`);
  } else {
    assert.ok(luminance(background) > 0.9, `${viewportName} ${surface.name} is no longer a bright surface.`);
    assert.ok(contrast(foreground, background) >= 7, `${viewportName} ${surface.name} body contrast dropped below 7:1.`);
    const darkSemanticSurfaces = await page.locator("main section,main article,[role=dialog]").evaluateAll((elements) =>
      elements.flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const color = style.backgroundColor.match(/rgba?\((\d+),?\s+(\d+),?\s+(\d+)(?:[,\s/]+([\d.]+))?/);
        if (!color || rect.width * rect.height < window.innerWidth * window.innerHeight * 0.08) return [];
        const alpha = color[4] === undefined ? 1 : Number(color[4]);
        if (alpha < 0.8) return [];
        const channels = [Number(color[1]), Number(color[2]), Number(color[3])];
        const relative = channels.map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        const surfaceLuminance = 0.2126 * relative[0] + 0.7152 * relative[1] + 0.0722 * relative[2];
        return surfaceLuminance < 0.25
          ? [{ tag: element.tagName.toLowerCase(), className: element.className, luminance: surfaceLuminance }]
          : [];
      }),
    );
    assert.deepEqual(
      darkSemanticSurfaces,
      [],
      `${viewportName} ${surface.name} contains a dark public semantic surface: ${JSON.stringify(darkSemanticSurfaces)}`,
    );
  }
  if (surface.name === "home") {
    assert.equal(
      await page.locator("section").first().locator("h1,h2,h3,[data-hero-slogan]").count(),
      0,
      `${viewportName} hero slogan returned.`,
    );
  }
  if (surface.name !== "staff-sign-in") {
    assert.equal(
      await page.locator(
        'header a[href*="wa.me"],header a[href*="whatsapp"],header button:has-text("WhatsApp")',
      ).count(),
      0,
      `${viewportName} global/header WhatsApp ordering control returned.`,
    );
  }
  if (surface.name === "home" && viewportName === "mobile") {
    const menuButton = page.locator("header").getByRole("button", { name: platform.content.site.header.openMenuLabel });
    await menuButton.click();
    assert.equal(
      await page.locator('#soso-mobile-menu a[href*="wa.me"],#soso-mobile-menu a[href*="whatsapp"]').count(),
      0,
      "Mobile menu WhatsApp ordering control returned.",
    );
    await page.locator("#soso-mobile-menu").getByRole("button", { name: platform.content.site.header.closeMenuLabel }).click();
  }
}

async function compareScreenshot(actualPath, baselinePath, diffPath, label) {
  if (updateBaselines) {
    await writeFile(baselinePath, await readFile(actualPath));
    return;
  }
  const [actualBytes, baselineBytes] = await Promise.all([readFile(actualPath), readFile(baselinePath)]);
  const actual = PNG.sync.read(actualBytes);
  const baseline = PNG.sync.read(baselineBytes);
  assert.equal(actual.width, baseline.width, `${label} baseline width changed.`);
  assert.equal(actual.height, baseline.height, `${label} baseline height changed.`);
  const diff = new PNG({ width: actual.width, height: actual.height });
  const changed = pixelmatch(actual.data, baseline.data, diff.data, actual.width, actual.height, {
    threshold: 0.2,
    includeAA: false,
  });
  const ratio = changed / (actual.width * actual.height);
  if (ratio > allowedDiffRatio) {
    await writeFile(diffPath, PNG.sync.write(diff));
  }
  assert.ok(
    ratio <= allowedDiffRatio,
    `${label} changed ${(ratio * 100).toFixed(2)}% (allowed ${(allowedDiffRatio * 100).toFixed(2)}%). Diff: ${diffPath}`,
  );
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    args: serverlessChromium.args.filter((argument) => argument !== "--single-process"),
    executablePath: await serverlessChromium.executablePath(),
    headless: true,
  });
  for (const [viewportName, viewport] of Object.entries(viewports)) {
    const context = await browser.newContext({
      viewport,
      colorScheme: "light",
      reducedMotion: "reduce",
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "Africa/Lagos",
    });
    const page = await context.newPage();
    await installDeterministicRoutes(page);
    for (const surface of surfaces) {
      await preparePage(page, surface);
      await assertVisualSemantics(page, surface, viewportName);
      const label = `${viewportName}-${surface.name}`;
      const actualPath = resolve(outputDir, `${label}.png`);
      const baselinePath = resolve(baselineDir, `${label}.png`);
      const diffPath = resolve(outputDir, `${label}-diff.png`);
      await page.screenshot({
        path: actualPath,
        animations: "disabled",
        fullPage: !surface.openCart,
      });
      await compareScreenshot(actualPath, baselinePath, diffPath, label);
    }
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

process.stdout.write(
  `${updateBaselines ? "Updated" : "Passed"} ${surfaces.length * Object.keys(viewports).length} rendered storefront visual baselines with semantic contrast and banned-control guards.\n`,
);