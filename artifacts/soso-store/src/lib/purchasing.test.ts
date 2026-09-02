import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogProduct } from "@/data/platformContent";
import { changeCartLineSelection, isMappedPurchaseChoice, isSameCartLine, mappedPurchaseChoices } from "./purchasing";

const product = {
  fulfilmentState: "ready_now",
  commerceProductId: "product-id",
  commerceVariantIds: { S: "variant-s", Custom: "variant-custom" },
  standardEligible: true,
  standardSizes: ["S", "M"],
  customEligible: true,
} as CatalogProduct;

test("purchase choices include only eligible mapped variants", () => {
  assert.deepEqual(mappedPurchaseChoices(product), ["S", "Custom"]);
  assert.equal(isMappedPurchaseChoice(product, "S"), true);
  assert.equal(isMappedPurchaseChoice(product, "M"), false);
  assert.equal(isMappedPurchaseChoice({ ...product, fulfilmentState: "unavailable" }, "S"), false);
});

test("cart selection changes reject unmapped variants and merge existing lines", () => {
  const items = [
    { slug: "vault", size: "S", selectedColourId: "black", quantity: 2, commerceProductId: "product-id", commerceVariantId: "variant-s" },
    { slug: "vault", size: "Custom", selectedColourId: "black", quantity: 1, commerceProductId: "product-id", commerceVariantId: "stale-variant-custom" },
  ];

  assert.equal(changeCartLineSelection(items, "vault", "S", "M"), items);
  assert.equal(changeCartLineSelection(items, "vault", "S", "S", "variant-s"), items);
  assert.deepEqual(
    changeCartLineSelection(items, "vault", "S", "Custom", "variant-custom", "black"),
    [{ slug: "vault", size: "Custom", selectedColourId: "black", quantity: 3, commerceProductId: "product-id", commerceVariantId: "variant-custom" }],
  );
});

test("cart identity keeps colours separate and size changes target the exact colour", () => {
  const items = [
    { slug: "vault", size: "S", selectedColourId: "black", quantity: 1, commerceProductId: "product-id", commerceVariantId: "variant-s" },
    { slug: "vault", size: "S", selectedColourId: "ivory", quantity: 2, commerceProductId: "product-id", commerceVariantId: "variant-s" },
  ];
  assert.equal(isSameCartLine(items[0], items[1]), false);
  assert.equal(isSameCartLine(items[0], { ...items[0] }), true);
  assert.deepEqual(changeCartLineSelection(items, "vault", "S", "M", "variant-m", "ivory"), [
    items[0],
    { ...items[1], size: "M", commerceVariantId: "variant-m" },
  ]);
});