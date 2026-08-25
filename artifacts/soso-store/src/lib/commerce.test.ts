import assert from "node:assert/strict";
import test from "node:test";
import { CommerceConfigurationError, projectCommerceCatalogProduct } from "./commerce";

const productId = "0efebec6-2687-4d2f-9350-f67282534d30";
const standardVariantId = "a725a2f5-5cdd-46e7-a36d-c0c5beef6a31";
const customVariantId = "618626e6-f359-4167-853c-2370df34c686";

test("commerce catalogue projects Custom as a direct mapped route", () => {
  const product = projectCommerceCatalogProduct({
    id: productId,
    name: "Vault",
    description: "A signature piece",
    amountKobo: 25000000,
    inStock: true,
    images: ["/images/soso/vault-black.jpg"],
    variants: [
      { id: standardVariantId, label: "M" },
      { id: customVariantId, label: "Custom" },
    ],
  });

  assert.equal(product.standardEligible, true);
  assert.deepEqual(product.standardSizes, ["M"]);
  assert.equal(product.customEligible, true);
  assert.equal(product.commerceVariantIds?.M, standardVariantId);
  assert.equal(product.commerceVariantIds?.Custom, customVariantId);
});

test("commerce catalogue does not advertise Custom without a mapped Custom variant", () => {
  const product = projectCommerceCatalogProduct({
    id: productId,
    name: "Vault",
    description: null,
    amountKobo: 25000000,
    inStock: true,
    images: ["/images/soso/vault-black.jpg"],
    variants: [{ id: standardVariantId, label: "M" }],
  });

  assert.equal(product.customEligible, false);
  assert.deepEqual(product.standardSizes, ["M"]);
});

test("commerce catalogue fails closed when checkout variants are absent", () => {
  assert.throws(
    () => projectCommerceCatalogProduct({
      id: productId,
      name: "Vault",
      description: null,
      amountKobo: 25000000,
      inStock: true,
      images: ["/images/soso/vault-black.jpg"],
      variants: [],
    }),
    (error) => error instanceof CommerceConfigurationError && error.message === "catalogue_incomplete",
  );
});