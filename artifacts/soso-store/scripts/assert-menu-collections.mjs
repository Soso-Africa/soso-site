import assert from "node:assert/strict";

const primarySlugs = ["kaftans", "agbadas", "shirts", "dashikis", "two-piece"];
const legacySlugs = primarySlugs.slice(0, 3);

// Clone the public response, never change the baseline fixture or query cache.
export function menuFixture(platform, restricted = false) {
  const fixture = structuredClone(platform);
  const men = fixture.content.site.megaMenu.find((group) => group.id === "men");
  assert.deepEqual(men.columns.find((column) => column.heading === "Collections").links.map((link) => link.href),
    legacySlugs.map((slug) => `/collections/${slug}`), "The regression fixture must start with three Men links.");
  assert.deepEqual(primarySlugs.filter((slug) => fixture.content.collections.some((collection) =>
    collection.slug === slug && collection.department === "men")), primarySlugs);
  men.label = "Staff Men";
  men.columns.find((column) => column.heading === "Collections").links[0].label = "Atelier Kaftans";
  fixture.content.site.megaMenu.find((group) => group.id === "women").label = "Staff Women";
  if (restricted) {
    // Neither an absent collection nor the same slug in another department may be appended.
    fixture.content.collections = fixture.content.collections
      .filter((collection) => collection.slug !== "dashikis")
      .map((collection) => collection.slug === "two-piece" ? { ...collection, department: "women" } : collection);
  }
  return fixture;
}

async function openGroup(page, fixture, viewportName, group) {
  if (viewportName === "mobile") {
    const menu = page.locator("#soso-mobile-menu");
    if (!await menu.isVisible()) {
      await page.locator("header").getByRole("button", { name: fixture.content.site.header.openMenuLabel, exact: true }).click();
    }
    const trigger = menu.getByRole("button", { name: group.label, exact: true });
    if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
    return trigger.locator("..");
  }
  const trigger = page.locator("header nav").getByRole("link", { name: group.label, exact: true });
  await trigger.hover();
  await page.waitForFunction((label) => Array.from(document.querySelectorAll("header nav a"))
    .some((link) => link.textContent.trim() === label && link.getAttribute("aria-expanded") === "true"), group.label);
  return trigger.locator("..");
}

export async function assertMenuCollections(page, fixture, viewportName, origin) {
  const before = JSON.stringify(fixture);
  const men = fixture.content.site.megaMenu.find((group) => group.id === "men");
  const publishedPrimary = primarySlugs.flatMap((slug) => fixture.content.collections
    .filter((collection) => collection.slug === slug && collection.department === "men"));
  const legacyColumn = men.columns.find((column) => column.heading === "Collections");
  const appended = publishedPrimary.filter((collection) => !legacyColumn.links.some((link) =>
    link.href === `/collections/${collection.slug}`));
  const expectedColumns = men.columns.map((column) => column === legacyColumn
    ? { ...column, links: [...column.links, ...appended.map((collection) =>
      ({ label: collection.label, href: `/collections/${collection.slug}` }))] } : column);
  const panel = await openGroup(page, fixture, viewportName, men);
  for (const column of expectedColumns) {
    const columnPanel = panel.getByRole("heading", { name: column.heading, exact: true }).locator("..");
    assert.deepEqual(await columnPanel.locator("a").evaluateAll((links) =>
      links.map((link) => ({ label: link.textContent.trim(), href: link.getAttribute("href") }))),
    column.links.filter((link) => !/wa\.me|whatsapp/i.test(link.href)),
    `${viewportName}: Men ${column.heading} must preserve Staff labels and contain only approved links.`);
  }
  for (const slug of primarySlugs) {
    const link = panel.locator(`a[href="/collections/${slug}"]`);
    const approved = publishedPrimary.some((collection) => collection.slug === slug);
    assert.equal(await link.count(), approved ? 1 : 0, `${viewportName}: ${slug} must appear exactly once only when published for Men.`);
    if (approved) await link.waitFor({ state: "visible" });
  }
  // Check other visible groups against the uncompleted Staff response, and hidden groups stay hidden.
  for (const group of fixture.content.site.megaMenu.filter((group) => group.id !== "men")) {
    if (!group.visible) {
      const navigation = viewportName === "mobile" ? page.locator("#soso-mobile-menu") : page.locator("header nav");
      assert.equal(await navigation.getByRole(viewportName === "mobile" ? "button" : "link",
        { name: group.label, exact: true }).count(), 0);
      continue;
    }
    const otherPanel = await openGroup(page, fixture, viewportName, group);
    for (const column of group.columns) {
      const columnPanel = otherPanel.getByRole("heading", { name: column.heading, exact: true }).locator("..");
      assert.deepEqual(await columnPanel.locator("a").evaluateAll((links) =>
        links.map((link) => ({ label: link.textContent.trim(), href: link.getAttribute("href") }))),
      column.links.filter((link) => !/wa\.me|whatsapp/i.test(link.href)),
      `${viewportName}: ${group.label} must not be changed by Men completion.`);
    }
  }
  for (const collection of appended) {
    const activePanel = await openGroup(page, fixture, viewportName, men);
    await activePanel.getByRole("link", { name: collection.label, exact: true }).click();
    await page.waitForURL(`${origin}/collections/${collection.slug}`);
    await page.locator("main").getByRole("heading", { level: 1, name: collection.h1, exact: true }).waitFor({ state: "visible" });
    assert.equal(new URL(page.url()).pathname, `/collections/${collection.slug}`);
    assert.equal(await page.locator("#soso-mobile-menu").count(), 0, "Following a destination must close the phone menu.");
  }
  assert.equal(JSON.stringify(fixture), before, "Menu checks must not mutate the published fixture.");
}
