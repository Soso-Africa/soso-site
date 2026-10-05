import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import serverlessChromium from "@sparticuz/chromium";

// Read-only development browser check; never send mutations to a backend.
const base = process.env.HEADER_TEST_URL;
assert.ok(base, "Set HEADER_TEST_URL to the development storefront URL.");
const browser = await chromium.launch({
  executablePath: await serverlessChromium.executablePath(),
  args: serverlessChromium.args,
  headless: true,
});
try {
  const context = await browser.newContext();
  await context.route("**/api/**", (route) => {
    if (route.request().method() === "GET") return route.continue();
    return route.fulfill({ status: 403, contentType: "application/json", body: "{}" });
  });
  const page = await context.newPage();
  await page.goto(`${base}/?previewContent=development`);
  const header = page.getByTestId("storefront-header");
  await header.waitFor();
  await page.evaluate(() => document.fonts.ready);
  const consent = page.getByRole("button", { name: "Necessary only", exact: true });
  if (await consent.isVisible()) await consent.click();
  const menu = header.locator('button[aria-controls="soso-mobile-menu"]');

  for (const width of [320, 360, 390, 768, 820, 1024, 1279, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(120);
    const geometry = await header.evaluate((element) => {
      const box = (node) => {
        const { left, right } = node.getBoundingClientRect();
        return { left, right };
      };
      const logo = element.querySelector('[data-testid="link-header-home"]');
      const nav = element.querySelector("nav");
      const actions = element.lastElementChild;
      const fullMenu = getComputedStyle(nav).visibility === "visible";
      return {
        header: box(element), logo: box(logo), nav: box(nav), actions: box(actions), fullMenu,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert.equal(geometry.overflow, false, `Horizontal overflow at ${width}px`);
    assert.ok(geometry.actions.left >= geometry.logo.right, `Actions overlap logo at ${width}px`);
    assert.ok(Math.abs((geometry.logo.left + geometry.logo.right) / 2
      - (geometry.header.left + geometry.header.right) / 2) < 1, `Logo not centred at ${width}px`);
    if (geometry.fullMenu) {
      assert.ok(geometry.nav.right <= geometry.logo.left, `Navigation overlaps logo at ${width}px`);
      assert.equal(await menu.isVisible(), false);
    } else {
      assert.equal(await menu.isVisible(), true);
      await menu.click();
      await page.locator("#soso-mobile-menu").waitFor();
      await page.keyboard.press("Escape");
      await page.locator("#soso-mobile-menu").waitFor({ state: "detached" });
    }
    if (width < 1280) assert.equal(geometry.fullMenu, false);
    console.log(`${width}px: ${geometry.fullMenu ? "full" : "compact"} menu, no overlap`);
  }

  // Staff-authored longer labels must fall back instead of colliding.
  await page.setViewportSize({ width: 1440, height: 900 });
  await header.locator("nav a").first().evaluate((link) => {
    link.textContent = "A much longer collection navigation label ".repeat(8);
  });
  await menu.waitFor({ state: "visible" });
  await menu.click();
  await page.locator("#soso-mobile-menu").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("#soso-mobile-menu").waitFor({ state: "detached" });
  console.log("Long labels: accessible compact menu, no collision");
} finally {
  await browser.close();
}
