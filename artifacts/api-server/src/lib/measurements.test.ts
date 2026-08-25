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
      { id: customVariantId, label: "custom" },
      { id: standardVariantId, label: "L" },
    ],
  }];

  const resolvedCustom = resolveAuthoritativeCheckoutItems([{
    productId: customProductId,
    variantId: customVariantId,
    quantity: 1,
    displaySlug: "authority-kaftan",
  }], catalog);
  assert.equal(resolvedCustom?.[0]?.selectedSize, "Custom");
  assert.equal(resolvedCustom?.[0]?.displayName, "Authority Kaftan");
  assert.equal(resolvedCustom?.[0]?.unitPriceKobo, 2500000);

  const browserMislabelsStandard = resolveAuthoritativeCheckoutItems([{
    productId: customProductId,
    variantId: standardVariantId,
    quantity: 1,
  }], catalog);
  assert.equal(browserMislabelsStandard?.[0]?.selectedSize, "L");

  assert.equal(resolveAuthoritativeCheckoutItems([{
    productId: customProductId,
    variantId: "44444444-4444-4444-8444-444444444444",
    quantity: 1,
  }], catalog), null);
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