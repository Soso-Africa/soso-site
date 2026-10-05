import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QuoteReview } from "./QuoteReview";

const props = {
  formattedTotal: "NGN 250,999.00",
  currency: "NGN",
  chargeCurrency: "NGN",
  expiresAt: "2026-10-05T15:58:26.000Z",
  paymentProvider: "paystack",
  paymentMethod: "card",
  collectionLabel: "Soso Africa HQ",
};

test("quote review preserves the formatted authoritative total and uses shopper-friendly details", () => {
  const html = renderToStaticMarkup(<QuoteReview {...props} />);
  assert.ok(html.includes(props.formattedTotal));
  assert.match(html, /Order total/);
  assert.match(html, /Soso Africa HQ/);
  assert.match(html, /Paystack · Card/);
  assert.match(html, /Valid until/);
  assert.match(html, /2026/);
  assert.doesNotMatch(html, /canonical|exponent|immutable|settlement|minor unit/i);
  assert.doesNotMatch(html, /payment (?:complete|confirmed)|order confirmed/i);
  assert.doesNotMatch(html, /type="submit"|<button|<input/);
});

test("matching currencies do not add unnecessary currency explanations", () => {
  assert.doesNotMatch(renderToStaticMarkup(<QuoteReview {...props} />), /payment will be taken in/);
});

test("different charge currency is disclosed without inventing a conversion", () => {
  const html = renderToStaticMarkup(<QuoteReview {...props} chargeCurrency="USD" />);
  assert.match(html, /payment will be taken in USD/);
  assert.match(html, /order total in NGN/);
  assert.ok(html.includes(props.formattedTotal));
  assert.doesNotMatch(html, /\$\s*250/);
});

test("unavailable optional details and invalid dates do not render machine errors", () => {
  const html = renderToStaticMarkup(<QuoteReview {...props} paymentProvider={undefined} paymentMethod={undefined} collectionLabel={undefined} expiresAt="invalid" />);
  assert.doesNotMatch(html, /Invalid Date|undefined|null|<dt[^>]*>Payment/);
  assert.match(html, /on the payment page/);
});

test("provider branding and readable payment methods are retained", () => {
  const html = renderToStaticMarkup(<QuoteReview {...props} paymentProvider="paypal" paymentMethod="bank_transfer" />);
  assert.match(html, /PayPal · Bank transfer/);
});
