import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { validateAccessoryProductPublication } from "./accessory-product-publication";
import { DEFAULT_PLATFORM_CONTENT, PlatformContentSchema } from "./platform-content";

function accessoryFixture() {
  const content = PlatformContentSchema.parse(structuredClone(DEFAULT_PLATFORM_CONTENT));
  const product = content.products.find((entry) => entry.slug === "soso-cufflinks-coming-soon")!;
  return { content, product };
}

test("accessory placeholders remain browse-only even with stale commerce data", () => {
  const { content, product } = accessoryFixture();
  product.commerceProductId = randomUUID();
  assert.match(
    validateAccessoryProductPublication(content)[0]?.message ?? "",
    /must remain unavailable and without commerce mappings/,
  );
});

test("approving one accessory requires real product content and exact checkout readiness", () => {
  const { content, product } = accessoryFixture();
  product.releaseState = "approved";
  assert.ok(validateAccessoryProductPublication(content).length >= 3);

  const productId = randomUUID();
  const variantId = randomUUID();
  product.slug = "soso-cufflinks";
  product.name = "SOSO Signature Cufflinks";
  product.img = "/api/storage/objects/products/soso-cufflinks.jpg";
  product.images = [{
    src: product.img,
    alt: "SOSO Signature Cufflinks",
    provenance: { source: "SOSO Africa studio", rights: "SOSO Africa owned product photography" },
  }];
  product.tag = "Signature";
  product.note = "Polished metal cufflinks";
  product.description = "A polished finishing detail for formal shirting.";
  product.colour = "Silver";
  product.fabric = "Polished metal";
  product.fit = "One size";
  product.searchableTerms = ["cufflinks", "formal"];
  product.merchandising.label = "New";
  product.standardEligible = true;
  product.standardSizes = ["One size"];
  product.fulfilmentState = "made_immediately";
  product.dispatchMessage = "Dispatch after atelier confirmation";
  delete product.unavailableMessage;
  product.commerceProductId = productId;
  product.commerceVariantIds = { "One size": variantId };

  assert.deepEqual(validateAccessoryProductPublication(content), []);
});

test("releasing one accessory does not change the other placeholder gates", () => {
  const { content, product } = accessoryFixture();
  product.releaseState = "approved";
  const otherPlaceholders = content.products.filter((entry) => (
    entry.department === "accessories" && entry.slug !== product.slug
  ));
  assert.ok(otherPlaceholders.every((entry) => (
    entry.releaseState === "placeholder"
    && entry.fulfilmentState === "unavailable"
    && !entry.commerceProductId
  )));
});