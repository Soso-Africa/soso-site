import assert from "node:assert/strict";
import test from "node:test";
import type { PlatformContent } from "../../../data/platformContent";
import { productDeletionReferences } from "./catalogue-delete";
import { platformActionError } from "../platform-action-error";

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
  const manyIssues = Array.from({ length: 18 }, (_, index) => `product-${index}: needs a mapping`);
  assert.match(platformActionError({ data: { issues: manyIssues } }, "Could not publish"), /product-17: needs a mapping/);
});