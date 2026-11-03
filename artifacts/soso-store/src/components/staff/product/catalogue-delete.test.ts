import assert from "node:assert/strict";
import test from "node:test";
import type { PlatformContent } from "../../../data/platformContent";
import { hasOtherDraftEditsForDeletion, productDeletionReferences } from "./catalogue-delete";
import { platformActionError } from "../platform-action-error";

const deletionFixture = () => ({
  products: [
    { slug: "remove-me", name: "Unfinished product", images: [] },
    { slug: "keep-me", name: "Keep this product", images: [] },
  ],
  collections: [{ slug: "clothing", label: "Clothing" }],
  homepage: { featured: { productSlugs: ["remove-me", "keep-me"] } },
}) as unknown as PlatformContent;

test("a saved product can be deleted without saving its unfinished edits", () => {
  const saved = deletionFixture(), editor = structuredClone(saved);
  editor.products[0]!.name = "Unfinished edits";
  editor.products[0]!.description = "";
  assert.notEqual(JSON.stringify(editor), JSON.stringify(saved), "the old whole-document guard blocked this");
  assert.equal(hasOtherDraftEditsForDeletion(editor, saved, "remove-me"), false);
  assert.equal(saved.products[0]!.name, "Unfinished product", "the guard must not mutate saved content");
});

test("other unsaved product edits stay protected even when both items changed", () => {
  const saved = deletionFixture(), editor = structuredClone(saved);
  editor.products[0]!.name = "Discard these changes";
  editor.products[1]!.name = "Do not lose my changes";
  assert.equal(hasOtherDraftEditsForDeletion(editor, saved, "remove-me"), true);
});

test("other sections, collection edits, product additions and removals stay protected", () => {
  const saved = deletionFixture();
  const sectionEdit = structuredClone(saved);
  sectionEdit.collections[0]!.label = "Unsaved label";
  assert.equal(hasOtherDraftEditsForDeletion(sectionEdit, saved, "remove-me"), true);
  const addition = structuredClone(saved);
  addition.products.push({ ...addition.products[1]!, slug: "new-unsaved-product" });
  assert.equal(hasOtherDraftEditsForDeletion(addition, saved, "remove-me"), true);
  const removal = structuredClone(saved);
  removal.products = removal.products.filter((p) => p.slug !== "keep-me");
  assert.equal(hasOtherDraftEditsForDeletion(removal, saved, "remove-me"), true);
});

test("JSON object-key ordering does not invent unsaved changes", () => {
  const saved = deletionFixture();
  const editor = {
    homepage: saved.homepage, collections: saved.collections,
    products: saved.products.map(({ slug, name, ...rest }) => ({ ...rest, name, slug })),
  } as PlatformContent;
  assert.notEqual(JSON.stringify(editor), JSON.stringify(saved));
  assert.equal(hasOtherDraftEditsForDeletion(editor, saved, "remove-me"), false);
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