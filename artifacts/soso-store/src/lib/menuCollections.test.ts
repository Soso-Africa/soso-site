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
  const [wrongDepartment] = completeMenCollections([legacy], collections.map((item) =>
    item.slug === "two-piece" ? { ...item, department: "women" as const } : item));
  assert(!wrongDepartment.columns[1].links.some((link) => link.href === "/collections/two-piece"));
  const women = { ...legacy, id: "women" };
  assert.equal(completeMenCollections([women], collections)[0], women);
});

test("completion preserves Staff copy, all other groups, columns and published inputs", () => {
  const men = structuredClone(legacy);
  men.label = "Staff Men";
  men.columns[1].links[0].label = "Atelier Kaftans";
  const women = { ...structuredClone(legacy), id: "women", label: "Staff Women" };
  const accessories = { ...structuredClone(legacy), id: "accessories", visible: false };
  const groups = [men, women, accessories];
  const before = structuredClone({ groups, collections });
  const result = completeMenCollections(groups, collections);
  assert.deepEqual({ groups, collections }, before);
  assert.equal(result[0].label, men.label);
  assert.equal(result[0].columns[1].links[0].label, "Atelier Kaftans");
  assert.equal(result[0].columns[0], men.columns[0]);
  assert.equal(result[1], women);
  assert.equal(result[2], accessories);
  for (const collection of collections) {
    assert.equal(result[0].columns[1].links.filter((link) =>
      link.href === `/collections/${collection.slug}`).length, 1);
  }
  assert.equal(completeMenCollections(result, collections)[0], result[0]);
});

test("empty publication cannot invent destinations and missing columns restore only approved destinations", () => {
  assert.equal(completeMenCollections([legacy], [])[0], legacy);
  const noCollections = { ...legacy, columns: [legacy.columns[0]] };
  assert.equal(completeMenCollections([noCollections], [])[0], noCollections);
  const [restored] = completeMenCollections([noCollections], collections);
  assert.equal(restored.columns[0], noCollections.columns[0]);
  assert.deepEqual(restored.columns[1].links.map((link) => link.href),
    collections.map((collection) => `/collections/${collection.slug}`));
  const unrelated = { slug: "unapproved-men", label: "Not a primary collection", department: "men" as const };
  const [result] = completeMenCollections([legacy], [...collections, unrelated]);
  assert(!result.columns.flatMap((column) => column.links).some((link) =>
    link.href === "/collections/unapproved-men"));
});

test("renamed and reordered columns retain custom labels and unrelated groups", () => {
  const edited = structuredClone(legacy);
  edited.columns.reverse();
  edited.columns[0].heading = "Our tailoring";
  edited.columns[0].links.reverse();
  edited.columns[0].links[0].label = "Business shirts";
  const women = { ...structuredClone(legacy), id: "women" };
  const [result, untouched] = completeMenCollections([edited, women], collections);
  assert.equal(result.columns[0].heading, "Our tailoring");
  assert.deepEqual(result.columns[0].links.slice(0, 3), edited.columns[0].links);
  assert.equal(result.columns[1], edited.columns[1]);
  assert.equal(untouched, women);
  assert.equal(result.columns[0].links.length, 5);
});

test("JSON save/reload projections preserve chosen labels and order", () => {
  const [edited] = completeMenCollections([structuredClone(legacy)], collections);
  edited.columns[1].links.reverse();
  edited.columns[1].links[0].label = "Coordinated sets";
  const saved = JSON.parse(JSON.stringify([edited])) as MegaMenuGroup[];
  assert.deepEqual(completeMenCollections(saved, collections), [edited]);
  assert.equal(completeMenCollections(saved, collections)[0], saved[0]);
});

test("required published destinations remain reachable without duplicating links in other columns", () => {
  const edited = structuredClone(legacy);
  edited.columns[0].links.push({ label: "Custom dashiki label", href: "/collections/dashikis" });
  const [result] = completeMenCollections([edited], collections);
  assert.equal(result.columns.flatMap((column) => column.links)
    .filter((link) => link.href === "/collections/dashikis").length, 1);
  const withoutCollections = { ...edited, columns: [legacy.columns[0]] };
  const [restored] = completeMenCollections([withoutCollections], collections);
  assert.equal(restored.columns[0], legacy.columns[0]);
  assert.equal(restored.columns[1].heading, "Collections");
  for (const { slug } of collections) {
    assert(restored.columns.some((column) => column.links.some((link) => link.href === `/collections/${slug}`)));
  }
});
