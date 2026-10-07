import assert from "node:assert/strict";
import test from "node:test";
import { domesticFulfillment, domesticFulfillmentOptions, fulfillmentUnavailable, deliveryQuoteMatches } from "./domestic-fulfillment";

const delivery = {
  type: "delivery", destinationCountry: "NG",
  shippingAddress: {
    country: "NG", region: "Lagos", city: "Ikeja", postalCode: "100271",
    addressLines: ["1 Example Road"], recipientName: "Ada Example", recipientPhone: "+2348000000000",
  },
};

test("domestic delivery requires an explicit matching Nigerian destination and complete structured address", () => {
  const parsed = domesticFulfillment(delivery)!;
  assert.equal(parsed.address, "1 Example Road, Ikeja, Lagos, Nigeria");
  assert.deepEqual(parsed.shippingAddress, delivery.shippingAddress);
  assert.equal(domesticFulfillment({ ...delivery, destinationCountry: "GB" }), null);
  assert.equal(domesticFulfillment({ ...delivery, shippingAddress: { ...delivery.shippingAddress, country: "GB" } }), null);
  assert.equal(domesticFulfillment({ type: "delivery", address: "1 London Road" }), null);
  for (const field of ["region", "city", "recipientName", "recipientPhone"]) {
    assert.equal(domesticFulfillment({ ...delivery, shippingAddress: { ...delivery.shippingAddress, [field]: "" } }), null);
  }
  assert.equal(domesticFulfillment({ ...delivery, address: "Another destination" }), null);
  assert.equal(domesticFulfillment({ ...delivery, locationId: "pickup" }), null);
});

test("postal codes may be omitted by the shopper but are never invented; invalid or oversized addresses fail closed", () => {
  assert.equal(domesticFulfillment({ ...delivery, shippingAddress: { ...delivery.shippingAddress, postalCode: "" } })?.shippingAddress?.postalCode, "");
  for (const postalCode of ["SW1A 1AA", "12345", "1234567"]) {
    assert.equal(domesticFulfillment({ ...delivery, shippingAddress: { ...delivery.shippingAddress, postalCode } }), null);
  }
  for (const addressLines of [[], [""], ["x".repeat(251)], ["a", "b", "c", "d"]]) {
    assert.equal(domesticFulfillment({ ...delivery, shippingAddress: { ...delivery.shippingAddress, addressLines } }), null);
  }
});

test("delivery is shown only for store-enabled Nigerian checkout, independently of pickup and international corridors", () => {
  assert.deepEqual(domesticFulfillmentOptions(["pickup", "delivery"]), ["pickup", "delivery"]);
  assert.deepEqual(domesticFulfillmentOptions(["delivery"]), ["delivery"]);
  assert.deepEqual(domesticFulfillmentOptions(["pickup"]), ["pickup"]);
  assert.deepEqual(domesticFulfillmentOptions(["pickup", "delivery"], "GB"), []);
  const parsed = domesticFulfillment(delivery)!;
  assert.equal(fulfillmentUnavailable(parsed, ["delivery"], false), null);
  assert.match(fulfillmentUnavailable(parsed, ["pickup"], true)!, /not enabled/);
  assert.notEqual(fulfillmentUnavailable({ ...parsed, destinationCountry: "US" }, ["delivery"], false), null);
});

test("pickup keeps its original request shape and requires the current enabled HQ location", () => {
  const pickup = { type: "pickup", locationId: "2f7ee0e8-f2bc-4f08-aac1-67687b2c8652" };
  const parsed = domesticFulfillment(pickup)!;
  assert.deepEqual(parsed, pickup);
  assert.equal(fulfillmentUnavailable(parsed, ["pickup"], true), null);
  assert.notEqual(fulfillmentUnavailable(parsed, ["pickup"], false), null);
  assert.notEqual(fulfillmentUnavailable(parsed, ["delivery"], true), null);
  assert.equal(domesticFulfillment({ ...pickup, destinationCountry: "GB" }), null);
});

test("a retrieved delivery quote must bind every address and recipient field; changed destinations cannot be paid", () => {
  const expected = domesticFulfillment(delivery)!;
  assert.equal(deliveryQuoteMatches(expected as unknown as Record<string, unknown>, expected), true);
  for (const field of ["country", "region", "city", "postalCode", "recipientName", "recipientPhone", "addressLines"]) {
    const altered = { ...expected, shippingAddress: { ...expected.shippingAddress, [field]: field === "addressLines" ? ["Other Road"] : "Changed" } };
    assert.equal(deliveryQuoteMatches(altered, expected), false);
  }
  assert.equal(deliveryQuoteMatches({ ...expected, destinationCountry: "GB" }, expected), false);
  assert.equal(deliveryQuoteMatches({ ...expected, shippingAddress: null }, expected), false);
});
