import assert from "node:assert/strict";
import test from "node:test";
import { projectCommerceCatalogProduct, projectPickupLocations } from "./commerce";

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

test("commerce catalogue supports provider-authorized products without images or variants", () => {
  const product = projectCommerceCatalogProduct({
    id: productId,
    name: "Test Canvas Tote",
    description: "Synthetic sample product",
    amountKobo: 250000,
    inStock: true,
    images: [],
    variants: [],
  });

  assert.equal(product.img, "");
  assert.deepEqual(product.images, []);
  assert.deepEqual(product.standardSizes, ["Standard"]);
  assert.equal(product.standardEligible, true);
  assert.deepEqual(product.commerceVariantIds, {});
});

test("pickup presents only complete shops, without accepting warehouses as shopper locations", () => {
  assert.deepEqual(projectPickupLocations({ locations: [
    { id: productId, type: "warehouse", name: "Stock room", address: null, city: null, country: "Nigeria" },
    { id: standardVariantId, type: "shop", name: "SOSO HQ", address: "37 Agadez Street", city: "Abuja", country: "Nigeria" },
  ] }), [{ id: standardVariantId, name: "SOSO HQ", address: "37 Agadez Street", city: "Abuja", country: "Nigeria" }]);
  assert.deepEqual(projectPickupLocations({ locations: [{ id: productId, type: "warehouse" }] }), []);
  assert.throws(() => projectPickupLocations({ locations: [
    { id: productId, type: "shop", name: "SOSO HQ", address: null, city: "Abuja", country: "Nigeria" },
  ] }), /pickup_locations_invalid_location/);
});