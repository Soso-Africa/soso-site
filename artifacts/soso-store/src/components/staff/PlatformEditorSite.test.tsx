import assert from "node:assert/strict";
import test from "node:test";
import React, { useState } from "react";
import { act, create } from "react-test-renderer";
import { DEFAULT_PLATFORM_CONTENT, mergePlatformContentDefaults, PlatformContentSchema } from "../../../../api-server/src/lib/platform-content";
import type { PlatformContent } from "../../data/platformContent";
import { completeMenCollections } from "../../lib/menuCollections";
import { PlatformEditorSite } from "./PlatformEditorSite";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("Staff hydrates legacy links locally, renames and reorders them, and preserves the saved publication shape", async () => {
  const document = structuredClone(DEFAULT_PLATFORM_CONTENT) as PlatformContent;
  const men = document.site.megaMenu.find((group) => group.id === "men")!;
  const columnIndex = men.columns.findIndex((column) => column.heading === "Collections");
  men.columns[columnIndex].links = [
    { label: "Tailored kaftans", href: "/collections/kaftans" },
    { label: "Agbadas", href: "/collections/agbadas" },
    { label: "Business shirts", href: "/collections/shirts" },
  ];
  const before = structuredClone(document);
  let latest = document.site;
  function Editor() {
    const [site, setSite] = useState(document.site);
    latest = site;
    return <PlatformEditorSite data={site} onChange={setSite}
      products={document.products} publishedCollections={document.collections}
      allowedTargets={document.collections.map((collection) => `/collections/${collection.slug}`)} />;
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<Editor />); });
  const groupIndex = latest.megaMenu.findIndex((group) => group.id === "men");
  const links = () => latest.megaMenu[groupIndex].columns[columnIndex].links;
  assert.equal(links().length, 5);
  assert.deepEqual(document, before, "Opening the editor must not mutate the stored snapshot.");
  const labelId = `input-mega-menu-link-label-${groupIndex}-${columnIndex}-4`;
  await act(async () => {
    renderer!.root.findByProps({ "data-testid": labelId }).props.onChange({ target: { value: "Matching sets" } });
  });
  const row = renderer!.root.findByProps({ "data-testid": `site-mega-menu-link-${groupIndex}-${columnIndex}-4` });
  await act(async () => {
    row.findAllByType("button").find((button) => button.props["aria-label"] === "Move link Matching sets up")!.props.onClick();
  });
  assert.equal(links()[3].label, "Matching sets");
  assert.equal(links()[0].label, "Tailored kaftans");
  assert.equal(links()[2].label, "Business shirts");
  assert.deepEqual(latest.megaMenu.filter((group) => group.id !== "men"),
    before.site.megaMenu.filter((group) => group.id !== "men"));

  // These are the server's existing draft/publication parse and default-merge
  // boundaries, exercised without a database write or publication request.
  const saved = PlatformContentSchema.parse(JSON.parse(JSON.stringify({ ...document, site: latest })));
  const reloaded = PlatformContentSchema.parse(mergePlatformContentDefaults(saved));
  assert.deepEqual(reloaded.site.megaMenu, latest.megaMenu);
  assert.deepEqual(completeMenCollections(reloaded.site.megaMenu, reloaded.collections), latest.megaMenu);
  await act(async () => { renderer!.unmount(); });
});
