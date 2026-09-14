import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DEFAULT_PLATFORM_CONTENT, PlatformContentSchema } from "./platform-content";
import {
  validateLegacyProductPublication,
  type LegacyProductInventory,
} from "./legacy-product-publication";

const sourceUrl = "https://shopsoso.co/product/review-piece/";
const sourceImageUrl = "https://shopsoso.co/wp-content/uploads/review-piece.jpg";
const mirrorPath = "/api/storage/objects/legacy-products/review-piece.jpg";

function fixture() {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  const product = content.products[0]!;
  product.name = "Review Piece";
  product.img = mirrorPath;
  product.legacyMigration = { sourceProductId: 987, sourceUrl };
  product.images = [{
    src: mirrorPath,
    alt: "Review Piece",
    provenance: {
      source: "SOSO legacy WooCommerce catalogue",
      rights: "SOSO merchant-owned catalogue asset; pending Staff approval",
      sourceUrl: sourceImageUrl,
    },
  }];
  product.sizes = product.sizes.filter((size) => size.toLocaleLowerCase() !== "custom");
  product.standardEligible = false;
  product.customEligible = false;
  product.standardSizes = [];
  product.readyNowSizes = [];
  product.fulfilmentState = "unavailable";
  product.unavailableMessage = "Awaiting approval";
  delete product.commerceProductId;
  delete product.commerceVariantIds;

  const inventory: LegacyProductInventory = {
    products: [{
      legacyId: 987,
      slug: product.slug,
      sourceUrl,
      approvalStatus: "business-approval-required",
      browseStatus: "not-published",
      checkoutStatus: "disabled-unmapped",
      sourceImages: [{
        sourceUrl: sourceImageUrl,
        mirrorPath: null,
        sha256: null,
        mirrorStatus: "awaiting-business-approval",
      }],
      justiceSure: {
        productId: null,
        variantIdsByOption: {},
        verifiedPriceMinor: null,
        verifiedCurrency: null,
        verifiedAvailability: null,
        endToEndVerifiedAt: null,
      },
    }],
  };
  return { content: PlatformContentSchema.parse(content), product, inventory };
}

test("imported pending products cannot be published for browsing", () => {
  const { content, inventory } = fixture();
  assert.match(
    validateLegacyProductPublication(content, inventory)[0]?.message ?? "",
    /Business approval is required/,
  );
});

test("approved browse-only products require verified SOSO-owned mirrors", () => {
  const { content, inventory } = fixture();
  inventory.products[0]!.approvalStatus = "approved";
  inventory.products[0]!.browseStatus = "browse-only";
  assert.match(
    validateLegacyProductPublication(content, inventory)[0]?.message ?? "",
    /verified SOSO-owned mirror/,
  );

  inventory.products[0]!.sourceImages[0] = {
    sourceUrl: sourceImageUrl,
    mirrorPath,
    sha256: "a".repeat(64),
    mirrorStatus: "verified",
  };
  assert.deepEqual(validateLegacyProductPublication(content, inventory), []);
});

test("browse-only imports cannot enable checkout", () => {
  const { content, inventory } = fixture();
  inventory.products[0]!.approvalStatus = "approved";
  inventory.products[0]!.browseStatus = "browse-only";
  inventory.products[0]!.sourceImages[0] = {
    sourceUrl: sourceImageUrl,
    mirrorPath,
    sha256: "a".repeat(64),
    mirrorStatus: "verified",
  };
  content.products[0]!.commerceProductId = randomUUID();
  assert.match(
    validateLegacyProductPublication(content, inventory).at(-1)?.message ?? "",
    /must remain unavailable and without commerce mappings/,
  );
});

test("checkout is enabled only after exact JusticeSure commerce evidence passes", () => {
  const { content, inventory } = fixture();
  const product = content.products[0]!;
  const productId = randomUUID();
  const variantId = randomUUID();
  inventory.products[0]!.approvalStatus = "approved";
  inventory.products[0]!.browseStatus = "published";
  inventory.products[0]!.checkoutStatus = "enabled-verified";
  inventory.products[0]!.sourceImages[0] = {
    sourceUrl: sourceImageUrl,
    mirrorPath,
    sha256: "a".repeat(64),
    mirrorStatus: "verified",
  };

  assert.ok(validateLegacyProductPublication(content, inventory).length > 0);

  product.sizes = ["S"];
  product.standardEligible = true;
  product.standardSizes = ["S"];
  product.fulfilmentState = "made_immediately";
  delete product.unavailableMessage;
  product.commerceProductId = productId;
  product.commerceVariantIds = { S: variantId };
  inventory.products[0]!.justiceSure = {
    productId,
    variantIdsByOption: { S: variantId },
    verifiedPriceMinor: product.price * 100,
    verifiedCurrency: "NGN",
    verifiedAvailability: true,
    endToEndVerifiedAt: "2026-09-07T00:00:00.000Z",
  };
  assert.deepEqual(validateLegacyProductPublication(content, inventory), []);
});

test("existing governed products remain outside the legacy publication gate", () => {
  assert.deepEqual(validateLegacyProductPublication(DEFAULT_PLATFORM_CONTENT), []);
});