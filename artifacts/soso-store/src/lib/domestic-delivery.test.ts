import assert from "node:assert/strict";
import test from "node:test";
import { deliveryFromForm } from "./domestic-delivery";

test("checkout constructs a Nigeria-only address using contact details and never invents a postal code or shipping price", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    address: " 1 Example Road ", addressLine2: "Apartment 2", city: "Ikeja",
    region: "Lagos", name: "Ada Example", phone: "+2348000000000", deliveryNote: "Call on arrival",
    country: "GB",
  })) form.set(key, value);
  const delivery = deliveryFromForm(form);
  assert.equal(delivery.destinationCountry, "NG");
  assert.equal(delivery.shippingAddress.country, "NG");
  assert.equal(delivery.address, "1 Example Road, Apartment 2, Ikeja, Lagos, Nigeria");
  assert.deepEqual(delivery.shippingAddress.addressLines, ["1 Example Road", "Apartment 2"]);
  assert.equal(delivery.shippingAddress.recipientName, "Ada Example");
  assert.equal(delivery.shippingAddress.postalCode, "");
  assert.equal(delivery.shippingAddress.deliveryInstructions, "Call on arrival");
  assert.equal("shippingMinor" in delivery, false);
});
