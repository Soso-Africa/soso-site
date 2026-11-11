import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

// One mounted document: separate viewport contexts would miss stale focus traps,
// scroll locks and an overlay left behind when desktop navigation takes over.
export async function assertPhoneMenuRotation({ browser, origin, platform, outputDir, installDeterministicRoutes, preparePage, surface }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, colorScheme: "light",
    reducedMotion: "reduce", deviceScaleFactor: 1, locale: "en-US",
    timezoneId: "Africa/Lagos", serviceWorkers: "block",
  });
  const page = await context.newPage();
  const phases = [];
  const menu = page.locator("#soso-mobile-menu");
  const header = page.locator("header");
  const copy = platform.content.site.header;
  const open = header.getByRole("button", { name: copy.openMenuLabel, exact: true });
  const close = menu.getByRole("button", { name: copy.closeMenuLabel, exact: true });
  const desktopLink = header.locator("nav").getByRole("link").first();
  try {
    await installDeterministicRoutes(page);
    await preparePage(page, surface);
    const originalOverflow = await page.evaluate(() => document.body.style.overflow);
    await page.evaluate(() => { window.__phoneMenuDocument = "mounted"; });
    const sameDocument = async (phase) => {
      assert.equal(await page.evaluate(() => window.__phoneMenuDocument), "mounted", `${phase}: must not reload.`);
      assert.equal(new URL(page.url()).pathname, "/", `${phase}: resizing must not navigate.`);
      phases.push({ phase, viewport: page.viewportSize() });
    };
    const reachableClose = async () => {
      await expect(close).toBeInViewport({ ratio: 1 });
      // Trial clicks check actual hit-testing without scrolling a hidden control into view.
      await close.click({ trial: true });
      await expect(menu).toHaveAttribute("aria-modal", "true");
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), "hidden");
    };
    const pageScrolls = async () => {
      await expect(menu).toHaveCount(0);
      assert.equal(await page.evaluate(() => document.body.style.overflow), originalOverflow, "Closing must restore the previous body style.");
      await page.mouse.move(10, page.viewportSize().height - 20);
      const before = await page.evaluate(() => window.scrollY);
      await page.mouse.wheel(0, 260);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    };

    await open.click();
    await reachableClose();
    const lockedY = await page.evaluate(() => window.scrollY);
    await page.mouse.move(10, 200);
    await page.mouse.wheel(0, 260);
    // Give the browser frames to apply wheel scrolling before checking the background.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    assert.equal(await page.evaluate(() => window.scrollY), lockedY, "An open phone menu must not scroll the page behind it.");
    for (const viewport of [
      { width: 844, height: 390 }, // landscape, still hamburger navigation
      { width: 767, height: 390 },
      { width: 768, height: 390 }, // hero/phone styling breakpoint
      { width: 1279, height: 720 }, // immediately below desktop navigation eligibility
    ]) {
      await page.setViewportSize(viewport);
      await sameDocument(`open at ${viewport.width}`);
      await expect(menu).toBeVisible();
      await reachableClose();
    }
    await close.click();
    await expect(open).toBeFocused();
    await pageScrolls();

    // Re-open below the desktop breakpoint, then let measured desktop links take over.
    await open.click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await sameDocument("desktop takeover");
    await expect(desktopLink).toBeVisible();
    await expect(open).toBeHidden();
    await pageScrolls();
    await desktopLink.focus();
    await page.keyboard.press("Tab");
    assert.equal(await menu.count(), 0, "Desktop keyboard use must not revive the phone focus trap.");

    await page.setViewportSize({ width: 390, height: 844 });
    await sameDocument("return to portrait");
    await expect(open).toBeVisible();
    await open.click();
    await reachableClose();
    await close.click();
    await expect(open).toBeFocused();
    await pageScrolls();

    // Escape must also clean up after rotation, and a real collection link must
    // still navigate client-side and dismiss the re-opened menu.
    await open.click();
    await page.keyboard.press("Escape");
    await expect(open).toBeFocused();
    await pageScrolls();
    await open.click();
    const men = platform.content.site.megaMenu.find((group) => group.id === "men");
    await menu.getByRole("button", { name: men.label, exact: true }).click();
    const destination = menu.locator('a[href="/collections/kaftans"]');
    await destination.click();
    await page.waitForURL(`${origin}/collections/kaftans`);
    await expect(page.locator("main h1")).toHaveText(platform.content.collections.find((collection) => collection.slug === "kaftans").h1);
    await expect(menu).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.__phoneMenuDocument), "mounted", "Collection navigation must retain the document.");
    assert.equal(await page.evaluate(() => document.body.style.overflow), originalOverflow);
    process.stdout.write("Passed same-page phone menu rotation: reachable close, desktop takeover, scroll restoration and portrait collection navigation.\n");
  } catch (error) {
    await page.screenshot({ path: resolve(outputDir, "phone-menu-rotation-failure.png") }).catch(() => {});
    await writeFile(resolve(outputDir, "phone-menu-rotation-phases.json"), JSON.stringify(phases, null, 2));
    throw error;
  } finally {
    await context.close();
  }
}
