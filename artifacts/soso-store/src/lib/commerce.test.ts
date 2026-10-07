import assert from "node:assert/strict";
import test from "node:test";
import { CommerceConfigurationError, projectCommerceCatalogProduct, projectPickupLocations } from "./commerce";

const productId = "0efebec6-2687-4d2f-9350-f67282534d30";
const standardVariantId = "a725a2f5-5cdd-46e7-a36d-c0c5beef6a31";
const customVariantId = "618626e6-f359-4167-853c-2370df34c686";

test("commerce catalogue projects Custom as a direct mapped route", () => {
  const product = projectCommerceCatalogProduct({
    id: productId,
    name: "Vault",
    description: "A signature piece",
    currency: "NGN",
    amountKobo: 25000000,
    inStock: true,
    images: ["/images/soso/vault-black.jpg"],
    variants: [
      { id: standardVariantId, label: "M" },
      { id: customVariantId, label: "Custom" },
    ],
  });

  assert.equal(product.customEligible, true);
  assert.deepEqual(product.standardSizes, ["M"]);
  assert.equal(product.commerceVariantIds?.M, standardVariantId);
  assert.equal(product.commerceVariantIds?.Custom, customVariantId);
});

test("commerce catalogue does not advertise Custom without a mapped Custom variant", () => {
  const product = projectCommerceCatalogProduct({
    id: productId,
    name: "Vault",
    description: null,
    currency: "NGN",
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
    currency: "NGN",
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

test("commerce catalogue refuses a non-NGN price even for an otherwise usable product", () => {
  assert.throws(() => projectCommerceCatalogProduct({
    id: productId, name: "Vault", description: null, currency: "USD", amountKobo: 25000000,
    inStock: true, images: [], variants: [{ id: standardVariantId, label: "M" }],
  }), (error) => error instanceof CommerceConfigurationError && error.message === "catalogue_incomplete");
});

test("pickup locations require and project the real API location fields", () => {
  assert.deepEqual(projectPickupLocations({
    locations: [{
      id: standardVariantId,
      type: "shop",
      name: "Lagos Atelier",
      address: "12 Marina Road",
      city: "Lagos",
      country: "Nigeria",
      extra: "ignored",
    }],
  }), [{
    id: standardVariantId,
    name: "Lagos Atelier",
    address: "12 Marina Road",
    city: "Lagos",
    country: "Nigeria",
  }]);
});

test("pickup locations fail closed for malformed or duplicate locations", () => {
  assert.throws(
    () => projectPickupLocations({ locations: [{ id: standardVariantId, type: "shop", name: "Atelier" }] }),
    (error) => error instanceof CommerceConfigurationError && error.message === "pickup_locations_invalid_location",
  );
  assert.throws(
    () => projectPickupLocations({
      locations: [
        { id: standardVariantId, type: "shop", name: "Atelier", address: "1 Road", city: "Lagos", country: "Nigeria" },
        { id: standardVariantId, type: "shop", name: "Other", address: "2 Road", city: "Lagos", country: "Nigeria" },
      ],
    }),
    (error) => error instanceof CommerceConfigurationError && error.message === "pickup_locations_duplicate_id",
  );
});
