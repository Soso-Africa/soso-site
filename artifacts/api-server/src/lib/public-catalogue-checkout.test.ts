import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlatformContent } from "./platform-content";
import { publicCatalogueContent } from "./public-catalogue-checkout";

const content = {
  site: { title: "Existing merchant editorial" },
  products: [{
    slug: "confirmed-shirt", fulfilmentState: "made_immediately",
    commerceProductId: "exact-product",
    commerceVariantIds: { M: "exact-variant" },
    commerceMappingConfirmation: { confidence: 97 },
  }],
} as unknown as PlatformContent;

test("inactive checkout retains available catalogue content but removes public purchase mappings", () => {
  const result = publicCatalogueContent(content, false);
  assert.equal(result.products[0]!.fulfilmentState, "made_immediately");
  assert.equal(result.products[0]!.slug, "confirmed-shirt");
  assert.equal(result.products[0]!.commerceProductId, undefined);
  assert.equal(result.products[0]!.commerceVariantIds, undefined);
  assert.equal(result.products[0]!.commerceMappingConfirmation, undefined);
  assert.equal(result.site, content.site);
  assert.equal(content.products[0]!.commerceProductId, "exact-product", "Staff's stored mapping must remain intact");
});

test("only explicit payment activation exposes existing mappings", () => {
  assert.equal(publicCatalogueContent(content, true), content);
});