import assert from "node:assert/strict";
import test from "node:test";
import inventory from "../../../../docs/soso-legacy-product-inventory.json";

test("legacy product inventory preserves the complete live sitemap snapshot", () => {
  assert.equal(inventory.audit.productSitemapUrlCount, 144);
  assert.equal(inventory.audit.productIndexUrlCount, 1);
  assert.equal(inventory.audit.productPageCount, 143);
  assert.equal(inventory.audit.categoryCount, 11);
  assert.equal(inventory.productSitemapUrls.length, 144);
  assert.equal(inventory.products.length, 143);
  assert.equal(inventory.categories.length, 11);
  assert.equal(new Set(inventory.products.map(({ sourceUrl }) => sourceUrl)).size, 143);
  assert.equal(new Set(inventory.categories.map(({ sourceUrl }) => sourceUrl)).size, 11);
});

test("unapproved legacy products stay unpublished and impossible to check out", () => {
  for (const product of inventory.products) {
    assert.equal(product.approvalStatus, "business-approval-required");
    assert.equal(product.browseStatus, "not-published");
    assert.equal(product.checkoutStatus, "disabled-unmapped");
    assert.equal(product.justiceSure.productId, null);
    assert.equal(product.justiceSure.verifiedPriceMinor, null);
    assert.equal(product.justiceSure.verifiedCurrency, null);
    assert.equal(product.justiceSure.verifiedAvailability, null);
    assert.equal(product.justiceSure.endToEndVerifiedAt, null);
  }
});

test("approved images must be mirrored before an item can be published", () => {
  for (const product of inventory.products) {
    if (product.approvalStatus !== "approved") continue;
    assert.ok(product.sourceImages.length > 0);
    for (const image of product.sourceImages) {
      assert.match(image.mirrorPath ?? "", /^\/api\/storage\/objects\//);
      assert.match(image.sha256 ?? "", /^[a-f0-9]{64}$/);
      assert.equal(image.mirrorStatus, "verified");
    }
  }
});
