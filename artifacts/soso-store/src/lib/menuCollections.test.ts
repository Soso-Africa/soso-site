import assert from "node:assert/strict";
import test from "node:test";
import { completeMenCollections } from "./menuCollections";
import type { MegaMenuGroup } from "../data/platformContent";

const collections = ["kaftans", "agbadas", "shirts", "dashikis", "two-piece"].map((slug) => ({
  slug, label: slug === "two-piece" ? "Two-Piece Sets" : slug, department: "men" as const,
}));
const legacy: MegaMenuGroup = {
  id: "men", label: "Men", href: "/shop?department=men", visible: true,
  featuredProductSlugs: ["existing-feature"],
  columns: [
    { heading: "Shop", links: [{ label: "Shop all men", href: "/shop?department=men" }] },
    { heading: "Collections", links: [
      { label: "Kaftans", href: "/collections/kaftans" },
      { label: "Agbadas", href: "/collections/agbadas" },
      { label: "Shirts", href: "/collections/shirts" },
    ] },
  ],
};

test("an older Men menu includes all five published primary collections", () => {
  const before = structuredClone(legacy);
  const [result] = completeMenCollections([legacy], collections);
  assert.deepEqual(result.columns[1].links.map((link) => link.href),
    collections.map((item) => `/collections/${item.slug}`));
  assert.equal(result.columns[1].links.at(-1)?.label, "Two-Piece Sets");
  assert.deepEqual(legacy, before, "The published query cache must not be mutated.");
  assert.equal(result.columns[0], legacy.columns[0]);
  assert.deepEqual(result.featuredProductSlugs, legacy.featuredProductSlugs);
});

test("existing Staff labels and complete menus are preserved without duplicates", () => {
  const [complete] = completeMenCollections([structuredClone(legacy)], collections);
  complete.columns[1].links[0].label = "Atelier Kaftans";
  assert.equal(completeMenCollections([complete], collections)[0], complete);
  assert.equal(complete.columns[1].links[0].label, "Atelier Kaftans");
});

test("unpublished collections and other departments are not added", () => {
  const [result] = completeMenCollections([legacy], collections.filter((item) => item.slug !== "dashikis"));
  assert(!result.columns[1].links.some((link) => link.href === "/collections/dashikis"));
  const women = { ...legacy, id: "women" };
  assert.equal(completeMenCollections([women], collections)[0], women);
});
