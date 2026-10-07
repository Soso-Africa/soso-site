import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DomesticDeliveryFields } from "./DomesticDeliveryFields";
import { QuoteReview } from "./QuoteReview";

test("delivery form exposes Nigerian state, city and street fields without offering international shipping", () => {
  const html = renderToStaticMarkup(<DomesticDeliveryFields />);
  for (const name of ["address", "region", "city"]) assert.match(html, new RegExp(`name="${name}"`));
  assert.match(html, /Federal Capital Territory/);
  assert.match(html, /International delivery is not available yet/);
  assert.match(html, /<input[^>]*readOnly=""[^>]*value="Nigeria"/);
  assert.match(html, /Postal code \(if known\)/);
  assert.doesNotMatch(html, /United Kingdom|United States/);
});

test("delivery review shows the authoritative charge and address without calling it collection", () => {
  const html = renderToStaticMarkup(<QuoteReview formattedTotal="₦258,499.00" currency="NGN" chargeCurrency="NGN"
    expiresAt="2026-10-05T18:00:00Z" shippingCost="₦7,500.00" deliveryAddress="1 Example Road, Ikeja, Lagos, Nigeria" />);
  assert.match(html, /Order total/);
  assert.match(html, /₦258,499.00/);
  assert.match(html, /Delivery charge/);
  assert.match(html, /₦7,500.00/);
  assert.match(html, /Delivery within Nigeria/);
  assert.match(html, /Ikeja, Lagos, Nigeria/);
  assert.doesNotMatch(html, />Collection</);
});
