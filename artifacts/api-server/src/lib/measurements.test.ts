import assert from "node:assert/strict";
import test from "node:test";
import {
  customerCanSubmit,
  isAtelierRole,
  reconciledOrderStatus,
  resolveAuthoritativeCheckoutItems,
  selectionType,
  shouldActivateMeasurements,
  staffMeasurementActionAllowed,
  validateMeasurementValues,
} from "./measurements";
import { catalogueProductHash, localMappingHash } from "./catalogue-mapping";

function catalogVariant(id: string, label: string, inStock = true) {
  return { id, name: label, label, attributes: { size: label }, amountKobo: 100, inStock };
}

const centimeters = {
  height: 120,
  chest: 50,
  waist: 50,
  hips: 180,
  shoulder: 70,
  sleeve: 35,
  garmentLength: 180,
};

test("only an exact case-insensitive Custom size selects atelier handling", () => {
  assert.equal(selectionType("CUSTOM"), "custom");
  assert.equal(selectionType(" custom "), "custom");
  assert.equal(selectionType("Custom fit"), "standard");
  assert.equal(selectionType(undefined), "standard");
});

test("measurement requests activate only from authoritative paid states", () => {
  assert.equal(shouldActivateMeasurements("paid"), true);
  assert.equal(shouldActivateMeasurements("fulfilled"), true);
  for (const status of ["starting", "payment_pending", "failed", "cancelled", "refunded"]) {
    assert.equal(shouldActivateMeasurements(status), false);
  }
});

test("payment reconciliation never regresses atelier progress", () => {
  assert.equal(reconciledOrderStatus("payment_pending", "paid"), "paid");
  assert.equal(reconciledOrderStatus("atelier_confirmation", "paid"), "atelier_confirmation");
  assert.equal(reconciledOrderStatus("in_production", "paid"), "in_production");
  assert.equal(reconciledOrderStatus("ready", "payment_pending"), "ready");
  assert.equal(reconciledOrderStatus("in_production", "refunded"), "refunded");
  assert.equal(reconciledOrderStatus("paid", "fulfilled"), "fulfilled");
  assert.equal(reconciledOrderStatus("fulfilled", "refunded"), "refunded");
  assert.equal(reconciledOrderStatus("fulfilled", "cancelled"), "cancelled");
  assert.equal(reconciledOrderStatus("refunded", "paid"), "refunded");
});

test("checkout selection type and price come from the authoritative variant mapping", () => {
  const customProductId = "11111111-1111-4111-8111-111111111111";
  const customVariantId = "22222222-2222-4222-8222-222222222222";
  const standardVariantId = "33333333-3333-4333-8333-333333333333";
  const catalog = [{
    id: customProductId,
    name: "Authority Kaftan",
    amountKobo: 2500000,
    inStock: true,
    variants: [
      catalogVariant(customVariantId, "custom"),
      catalogVariant(standardVariantId, "L"),
    ],
  }];
  const colour = {
    selectedColourId: "soso-black",
    selectedColourLabel: "SOSO Black",
    selectedColourHex: "#111111",
  };
  const storefront = [{
    slug: "authority-kaftan", name: "Authority Kaftan", price: 25000,
    standardEligible: true, customEligible: true, standardSizes: ["L"],
    fulfilmentState: "made_immediately" as const,
    commerceProductId: customProductId,
    commerceVariantIds: { Custom: customVariantId, L: standardVariantId },
    commerceMappingConfirmation: {
      productHash: catalogueProductHash(catalog[0]!),
      localHash: localMappingHash({
        slug: "authority-kaftan", name: "Authority Kaftan", price: 25000,
        eligibility: { standard: true, custom: true }, standardSizes: ["L"],
        commerceProductId: customProductId,
        commerceVariantIds: { Custom: customVariantId, L: standardVariantId },
      }),
      confidence: 97,
    },
    colourOptions: [{ id: "soso-black", label: "SOSO Black", hex: "#111111" }],
    allowCustomColour: false,
  }];

  const resolvedCustom = resolveAuthoritativeCheckoutItems([{
    productId: customProductId,
    variantId: customVariantId,
    quantity: 1,
    displaySlug: "authority-kaftan",
    selectedSize: "Custom",
    ...colour,
  }], catalog, storefront);
  assert.equal(resolvedCustom?.[0]?.selectedSize, "Custom");
  assert.equal(resolvedCustom?.[0]?.displayName, "Authority Kaftan");
  assert.equal(resolvedCustom?.[0]?.unitPriceKobo, 2500000);

  const browserMislabelsStandard = resolveAuthoritativeCheckoutItems([{
    productId: customProductId,
    variantId: standardVariantId,
    quantity: 1,
    selectedSize: "L",
    ...colour,
  }], catalog, storefront);
  assert.equal(browserMislabelsStandard?.[0]?.selectedSize, "L");

  assert.equal(resolveAuthoritativeCheckoutItems([{
    productId: customProductId,
    variantId: "44444444-4444-4444-8444-444444444444",
    quantity: 1,
    selectedSize: "L",
    ...colour,
  }], catalog, storefront), null);
});

test("checkout rejects unapproved or disabled custom colours against storefront authority", () => {
  const productId = "11111111-1111-4111-8111-111111111111";
  const variantId = "33333333-3333-4333-8333-333333333333";
  const catalog = [{ id: productId, name: "Vault", amountKobo: 100, inStock: true, variants: [catalogVariant(variantId, "L")] }];
  const localIdentity = {
    slug: "vault",
    name: "Vault",
    price: 1,
    eligibility: { standard: true, custom: false },
    standardSizes: ["L"],
    commerceProductId: productId,
    commerceVariantIds: { L: variantId },
  };
  const storefront = [{
    slug: "vault",
    name: "Vault",
    price: 1,
    standardEligible: true,
    customEligible: false,
    standardSizes: ["L"],
    fulfilmentState: "ready_now" as const,
    commerceProductId: productId,
    commerceVariantIds: { L: variantId },
    commerceMappingConfirmation: {
      productHash: catalogueProductHash(catalog[0]!),
      localHash: localMappingHash(localIdentity),
      confidence: 97,
    },
    colourOptions: [{ id: "soso-black", label: "SOSO Black", hex: "#111111" }],
    allowCustomColour: false,
  }];
  const valid = { productId, variantId, quantity: 1, selectedSize: "L", selectedColourId: "soso-black", selectedColourLabel: "SOSO Black", selectedColourHex: "#111111" };
  assert.equal(resolveAuthoritativeCheckoutItems([valid], catalog, storefront)?.[0]?.displaySlug, "vault");
  assert.equal(resolveAuthoritativeCheckoutItems([{ ...valid, selectedColourId: "unapproved" }], catalog, storefront), null);
  assert.equal(resolveAuthoritativeCheckoutItems([{ ...valid, selectedColourHex: "#FFFFFF" }], catalog, storefront), null);
  const custom = { productId, variantId, quantity: 1, selectedSize: "L", selectedColourId: "custom", customColour: "Deep wine with muted gold accents" };
  assert.equal(resolveAuthoritativeCheckoutItems([custom], catalog, storefront), null);
  assert.ok(resolveAuthoritativeCheckoutItems([custom], catalog, [{ ...storefront[0], allowCustomColour: true }]));
});

test("checkout uses the confirmed SOSO choice key and rejects an out-of-stock variant", () => {
  const productId = "11111111-1111-4111-8111-111111111111";
  const variantId = "33333333-3333-4333-8333-333333333333";
  const item = {
    productId,
    variantId,
    quantity: 1,
    selectedSize: "L",
    selectedColourId: "black",
    selectedColourLabel: "Black",
    selectedColourHex: "#111111",
  };
  const catalog = [{
    id: productId,
    name: "Alias Safe",
    amountKobo: 100,
    inStock: true,
    variants: [catalogVariant(variantId, "Large", true)],
  }];
  const storefront = [{
    slug: "alias-safe",
    name: "Alias Safe",
    price: 1,
    standardEligible: true,
    customEligible: false,
    standardSizes: ["L"],
    fulfilmentState: "ready_now" as const,
    commerceProductId: productId,
    commerceVariantIds: { L: variantId },
    colourOptions: [{ id: "black", label: "Black", hex: "#111111" }],
    allowCustomColour: false,
    commerceMappingConfirmation: {
      productHash: catalogueProductHash(catalog[0]!),
      localHash: localMappingHash({
        slug: "alias-safe",
        name: "Alias Safe",
        price: 1,
        eligibility: { standard: true, custom: false },
        standardSizes: ["L"],
        commerceProductId: productId,
        commerceVariantIds: { L: variantId },
      }),
      confidence: 97,
    },
  }];
  assert.equal(resolveAuthoritativeCheckoutItems([item], catalog, storefront)?.[0]?.selectedSize, "L");
  assert.equal(resolveAuthoritativeCheckoutItems([item], [{
    ...catalog[0]!,
    variants: [catalogVariant(variantId, "Large", false)],
  }], storefront), null);

  const changedSemantics = [{
    ...catalog[0]!,
    variants: [catalogVariant(variantId, "Medium", true)],
  }];
  assert.equal(resolveAuthoritativeCheckoutItems([item], changedSemantics, [{
    ...storefront[0]!,
    commerceMappingConfirmation: {
      ...storefront[0]!.commerceMappingConfirmation,
      productHash: catalogueProductHash(changedSemantics[0]!),
    },
  }]), null);

  const unavailable = {
    ...storefront[0]!,
    fulfilmentState: "unavailable" as const,
  };
  assert.equal(resolveAuthoritativeCheckoutItems([item], catalog, [{
    ...unavailable,
    commerceMappingConfirmation: {
      ...unavailable.commerceMappingConfirmation,
      localHash: localMappingHash({
        slug: unavailable.slug,
        name: unavailable.name,
        price: unavailable.price,
        eligibility: "unavailable",
        standardSizes: unavailable.standardSizes,
        commerceProductId: unavailable.commerceProductId,
        commerceVariantIds: unavailable.commerceVariantIds,
      }),
    },
  }]), null);
});

test("checkout rejects provider-only items when published storefront authority is absent", () => {
  const productId = "11111111-1111-4111-8111-111111111111";
  const resolved = resolveAuthoritativeCheckoutItems([{
    productId,
    quantity: 1,
    selectedColourId: "not-specified",
    selectedColourLabel: "Not specified",
    selectedColourHex: "#777777",
  }], [{
    id: productId,
    name: "Test Canvas Tote",
    amountKobo: 250000,
    inStock: true,
    variants: [],
  }]);

  assert.equal(resolved, null);
});

test("measurement validation accepts inclusive cm and equivalent inch boundaries", () => {
  assert.equal(validateMeasurementValues("cm", centimeters), true);
  assert.equal(validateMeasurementValues("in", Object.fromEntries(
    Object.entries(centimeters).map(([key, value]) => [key, value / 2.54]),
  )), true);
  assert.equal(validateMeasurementValues("cm", { ...centimeters, height: 119.99 }), false);
  assert.equal(validateMeasurementValues("in", { ...centimeters, height: 120 / 2.54 - 0.01 }), false);
  assert.equal(validateMeasurementValues("mm", centimeters), false);
  assert.equal(validateMeasurementValues("cm", { ...centimeters, extra: 1 }), false);
});

test("customers can submit initially and correct until atelier confirmation", () => {
  assert.equal(customerCanSubmit("needed"), true);
  assert.equal(customerCanSubmit("clarification_requested"), true);
  assert.equal(customerCanSubmit("submitted"), true);
  assert.equal(customerCanSubmit("confirmed"), false);
  assert.equal(customerCanSubmit("cancelled"), false);
});

test("staff transitions and atelier roles are bounded", () => {
  assert.equal(staffMeasurementActionAllowed("submitted", "confirm", false), true);
  assert.equal(staffMeasurementActionAllowed("needed", "confirm", false), false);
  assert.equal(staffMeasurementActionAllowed("submitted", "request_clarification", false), true);
  assert.equal(staffMeasurementActionAllowed("clarification_requested", "request_clarification", false), false);
  assert.equal(staffMeasurementActionAllowed("submitted", "clear_production_exception", false), false);
  assert.equal(staffMeasurementActionAllowed("confirmed", "clear_production_exception", true), true);
  assert.equal(staffMeasurementActionAllowed("cancelled", "set_production_exception", false), false);
  for (const role of ["owner", "administrator", "operations", "stylist"]) assert.equal(isAtelierRole(role), true);
  for (const role of ["editor", "analyst"]) assert.equal(isAtelierRole(role), false);
});