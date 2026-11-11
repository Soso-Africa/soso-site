import assert from "node:assert/strict";
import test from "node:test";
import type { PlatformContent } from "../../../data/platformContent";
import { reconcileDraftProductDeletion, productDeletionReferences } from "./catalogue-delete";
import { platformActionError } from "../platform-action-error";

const deletionFixture = () => ({
  products: [
    { slug: "remove-me", name: "Unfinished product", images: [], department: "men", img: "/remove.jpg" },
    { slug: "keep-me", name: "Keep this product", images: [], department: "men", img: "/keep.jpg", relatedProductSlugs: ["remove-me"] },
  ],
  collections: [{ slug: "clothing", label: "Clothing" }],
  homepage: { featured: { title: "Featured", productSlugs: ["remove-me", "keep-me"] } },
  site: {
    megaMenu: [{ id: "men", label: "Men", visible: true, department: "men", featuredProductSlugs: ["remove-me"], href: "/product/remove-me", columns: [] }],
    header: { searchSuggestions: [{ label: "Remove", href: "/product/remove-me" }, { label: "Shop", href: "/shop" }] },
  },
}) as unknown as PlatformContent;

// Synthetic acknowledgement, separate from the production reconciliation.
// The API's own tests verify persisted reference repairs and schema validity.
const committedDeletion = (saved: PlatformContent): PlatformContent => {
  const next = structuredClone(saved);
  next.products = next.products.filter((product) => product.slug !== "remove-me");
  for (const product of next.products) product.relatedProductSlugs = product.relatedProductSlugs?.filter((slug) => slug !== "remove-me");
  for (const group of next.site.megaMenu) {
    group.featuredProductSlugs = group.featuredProductSlugs.filter((slug) => slug !== "remove-me");
    if (group.visible && group.department && !group.featuredProductSlugs.length) group.featuredProductSlugs = [next.products[0]!.slug];
  }
  if (next.homepage.newArrival?.productSlug === "remove-me") next.homepage.newArrival.productSlug = next.products[0]!.slug;
  const repair = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === "href" && entry === "/product/remove-me") (value as Record<string, unknown>)[key] = "/shop";
      else if (key === "productSlug" && entry === "remove-me") delete (value as Record<string, unknown>)[key];
      else repair(entry);
    }
  };
  repair(next);
  next.site.header.searchSuggestions = next.site.header.searchSuggestions.filter((entry, index, items) => items.findIndex((item) => item.href === entry.href) === index);
  const choices = next.products.map((product) => product.slug);
  next.homepage.featured.productSlugs = Array.from({ length: 4 }, (_, index) => choices[index % choices.length]!);
  next.homepage.featured.legacySparseCompatibility = true;
  return next;
};

test("deleting a saved product discards only that product's edits and retains other fields", () => {
  const saved = deletionFixture(), editor = structuredClone(saved);
  editor.products[0]!.name = "Discard these changes";
  editor.products[1]!.name = "Do not lose my changes";
  editor.collections[0]!.label = "Unsaved collection";
  editor.homepage.featured.title = "Unsaved homepage";
  const committed = committedDeletion(saved);
  const snapshots = structuredClone({ saved, committed, editor });
  const merged = reconcileDraftProductDeletion(saved, committed, editor, "remove-me");
  assert.deepEqual(merged.products.map((product) => product.slug), ["keep-me"]);
  assert.equal(merged.products[0]!.name, "Do not lose my changes");
  assert.deepEqual(merged.products[0]!.relatedProductSlugs, []);
  assert.equal(merged.collections[0]!.label, "Unsaved collection");
  assert.equal(merged.homepage.featured.title, "Unsaved homepage");
  assert.deepEqual(merged.homepage.featured.productSlugs, committed.homepage.featured.productSlugs);
  assert.deepEqual({ saved, committed, editor }, snapshots, "neither saved / public inputs nor editor are mutated");
});

test("local additions, removals, reorder and same-field reference edits survive", () => {
  const saved = deletionFixture();
  saved.products.push({ ...saved.products[1]!, slug: "third" });
  const editor = structuredClone(saved);
  editor.products = [{ ...editor.products[1]!, slug: "new-product", relatedProductSlugs: ["remove-me", "keep-me"] }, editor.products[0]!, editor.products[1]!];
  editor.site.megaMenu[0]!.label = "New menu label";
  editor.site.megaMenu[0]!.href = "/collections/clothing";
  editor.site.megaMenu[0]!.featuredProductSlugs = ["remove-me", "new-product"];
  const merged = reconcileDraftProductDeletion(saved, committedDeletion(saved), editor, "remove-me");
  assert.deepEqual(merged.products.map((product) => product.slug), ["new-product", "keep-me"]);
  assert.deepEqual(merged.products[0]!.relatedProductSlugs, ["keep-me"]);
  assert.equal(merged.site.megaMenu[0]!.label, "New menu label");
  assert.equal(merged.site.megaMenu[0]!.href, "/collections/clothing");
  assert.deepEqual(merged.site.megaMenu[0]!.featuredProductSlugs, ["new-product"]);
});

test("unchanged editor uses the exact committed reference adjustments regardless of key order", () => {
  const saved = deletionFixture();
  const editor = {
    site: saved.site,
    homepage: saved.homepage, collections: saved.collections,
    products: saved.products.map(({ slug, name, ...rest }) => ({ ...rest, name, slug })),
  } as PlatformContent;
  assert.notEqual(JSON.stringify(editor), JSON.stringify(saved));
  const committed = committedDeletion(saved);
  assert.deepEqual(reconcileDraftProductDeletion(saved, committed, editor, "remove-me"), committed);
});

test("latest edits typed during DELETE are kept and cannot resurrect the product or its links", () => {
  const saved = deletionFixture(), latest = structuredClone(saved);
  const committed = committedDeletion(saved);
  latest.products[0]!.name = "Late edit to deleted item";
  latest.products[1]!.description = "Typed while pending";
  latest.products[1]!.relatedProductSlugs = ["remove-me"];
  latest.site.megaMenu.push({ ...latest.site.megaMenu[0]!, id: "late-menu", label: "Late group" });
  latest.site.header.searchSuggestions.unshift({ label: "New late link", href: "https://shopsoso.co/product/remove-me?q=1" });
  latest.homepage.featured.productSlugs = ["keep-me", "remove-me", "keep-me", "remove-me"];
  const merged = reconcileDraftProductDeletion(saved, committed, latest, "remove-me");
  assert.equal(merged.products[0]!.description, "Typed while pending");
  assert.equal(merged.products.some((product) => product.slug === "remove-me"), false);
  assert.deepEqual(productDeletionReferences(merged, "remove-me"), []);
  assert.equal(merged.homepage.featured.productSlugs.length, 4);
  assert.equal(merged.site.megaMenu[1]!.label, "Late group");
  assert.deepEqual(merged.site.megaMenu[1]!.featuredProductSlugs, ["keep-me"]);
  assert.equal(merged.site.header.searchSuggestions.length, 1);
  assert.equal(merged.site.header.searchSuggestions[0]!.label, "New late link");
});

test("a local menu with no eligible replacement is hidden without losing its copy", () => {
  const saved = deletionFixture(), latest = structuredClone(saved);
  latest.site.megaMenu.push({ ...latest.site.megaMenu[0]!, id: "late-women", department: "women", label: "Keep copy" });
  const merged = reconcileDraftProductDeletion(saved, committedDeletion(saved), latest, "remove-me");
  assert.equal(merged.site.megaMenu[1]!.visible, false);
  assert.equal(merged.site.megaMenu[1]!.label, "Keep copy");
});

test("saved deletion replaces required homepage bindings and unbinds optional artwork without relabelling it", () => {
  const saved = deletionFixture();
  saved.homepage.newArrival = {
    productSlug: "remove-me", title: "Keep heading", link: { label: "Shop", href: "/product/remove-me" },
    editorial: { productSlug: "remove-me", imageUrl: "/authentic-editorial.jpg", title: "Keep editorial" },
  } as PlatformContent["homepage"]["newArrival"];
  saved.homepage.fit = { productSlug: "remove-me", imageUrl: "/fit.jpg" } as PlatformContent["homepage"]["fit"];
  saved.homepage.story = { productSlug: "remove-me", imageUrl: "/story.jpg" } as PlatformContent["homepage"]["story"];
  saved.homepage.categories = { items: [{ productSlug: "remove-me", imageUrl: "/category.jpg", href: "/product/remove-me" }] } as PlatformContent["homepage"]["categories"];
  saved.homepage.occasions = { items: [{ productSlug: "remove-me", imageUrl: "/occasion.jpg", href: "/product/remove-me" }] } as PlatformContent["homepage"]["occasions"];
  const committed = committedDeletion(saved);
  assert.deepEqual(productDeletionReferences(committed, "remove-me"), []);
  assert.equal(committed.homepage.newArrival.productSlug, "keep-me");
  assert.equal(committed.homepage.newArrival.title, "Keep heading");
  assert.equal(committed.homepage.newArrival.editorial.productSlug, undefined);
  assert.equal(committed.homepage.newArrival.editorial.imageUrl, "/authentic-editorial.jpg");
  assert.equal(committed.homepage.fit.productSlug, undefined);
  assert.equal(committed.homepage.story.productSlug, undefined);
  assert.equal(committed.homepage.categories.items[0]!.productSlug, undefined);
  assert.equal(committed.homepage.occasions.items[0]!.productSlug, undefined);
  const latest = structuredClone(saved);
  latest.homepage.newArrival.title = "Late heading";
  latest.homepage.newArrival.editorial.title = "Late editorial heading";
  const merged = reconcileDraftProductDeletion(saved, committed, latest, "remove-me");
  assert.deepEqual(productDeletionReferences(merged, "remove-me"), []);
  assert.equal(merged.homepage.newArrival.title, "Late heading");
  assert.equal(merged.homepage.newArrival.editorial.title, "Late editorial heading");
  assert.equal(merged.homepage.newArrival.editorial.imageUrl, "/authentic-editorial.jpg");
});

test("homepage bindings added during a pending deletion are repaired without changing valid choices", () => {
  const saved = deletionFixture();
  saved.homepage.newArrival = { productSlug: "keep-me", editorial: {} } as PlatformContent["homepage"]["newArrival"];
  const committed = committedDeletion(saved), latest = structuredClone(saved);
  latest.homepage.newArrival.productSlug = "remove-me";
  latest.homepage.newArrival.editorial.productSlug = "remove-me";
  const merged = reconcileDraftProductDeletion(saved, committed, latest, "remove-me");
  assert.equal(merged.homepage.newArrival.productSlug, "keep-me");
  assert.equal(merged.homepage.newArrival.editorial.productSlug, undefined);
  assert.deepEqual(productDeletionReferences(merged, "remove-me"), []);
  latest.homepage.newArrival.productSlug = "keep-me";
  assert.equal(reconcileDraftProductDeletion(saved, committed, latest, "remove-me").homepage.newArrival.productSlug, "keep-me");
});

test("a new unreferenced catalogue product may be removed from a draft", () => {
  const content = {
    products: [{ slug: "new-product" }, { slug: "existing" }],
    homepage: { featured: { productSlugs: ["existing"] } },
  } as unknown as PlatformContent;
  assert.deepEqual(productDeletionReferences(content, "new-product"), []);
});

test("deletion detects homepage, menu, related product, and direct-link references", () => {
  const content = {
    products: [{ slug: "new-product" }, { slug: "existing", relatedProductSlugs: ["new-product"] }],
    homepage: { featured: { productSlugs: ["new-product"] } },
    site: { megaMenu: [{ featuredProductSlugs: ["new-product"], href: "https://shopsoso.co/product/new-product?from=menu" }] },
  } as unknown as PlatformContent;
  assert.deepEqual(productDeletionReferences(content, "new-product"), [
    "products[0].relatedProductSlugs[0]",
    "homepage.featured.productSlugs[0]",
    "site.megaMenu[0].featuredProductSlugs[0]",
    "site.megaMenu[0].href",
  ]);
});

test("publish errors show each JusticeSure rejection instead of only HTTP 400", () => {
  const error = Object.assign(new Error("HTTP 400: JusticeSure mappings did not pass live publishing checks"), {
    data: { issues: ["shirt-one: confirm the current high-confidence JusticeSure mapping before publishing."] },
  });
  assert.match(platformActionError(error, "Could not publish"), /shirt-one: confirm the current high-confidence/);
  assert.match(platformActionError({ data: { issues: [{ path: ["products", 0, "img"], message: "Missing image" }] } }, "Could not save"), /products\.0\.img: Missing image/);
  assert.match(platformActionError({ data: { issues: [{ productSlug: "minimal-cocoa", message: "Business approval required" }] } }, "Could not publish"), /minimal-cocoa: Business approval required/);
  const manyIssues = Array.from({ length: 18 }, (_, index) => `product-${index}: needs a mapping`);
  assert.match(platformActionError({ data: { issues: manyIssues } }, "Could not publish"), /product-17: needs a mapping/);
});