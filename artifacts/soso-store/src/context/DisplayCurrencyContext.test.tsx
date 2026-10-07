import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DisplayPrice, formatDisplayPrice } from "./DisplayCurrencyContext";
import { naira } from "../lib/utils";
import type { PriceDisplaySnapshot } from "@workspace/api-client-react";

const snapshot: PriceDisplaySnapshot = { baseCurrency: "NGN", currency: "USD", suggestedCurrency: "USD",
  availableCurrencies: ["NGN", "USD"], estimated: true, updatedAt: "2026-10-06T00:00:00Z",
  expiresAt: "2026-10-08T00:00:00Z", unavailableReason: null, sourceUrl: "https://www.exchangerate-api.com",
  prices: [{ naira: 265999, amount: 266 }] };
const now = Date.parse("2026-10-06T12:00:00Z");
test("converted browsing labels are explicitly approximate and retain the currency code", () => {
  const label = formatDisplayPrice(265999, snapshot, now);
  assert.match(label, /≈/);
  assert.match(label, /USD/);
  assert.match(label, /266/);
});
test("expired, missing or malformed conversion amounts show the original naira value", () => {
  for (const value of [null, { ...snapshot, expiresAt: "invalid" }, { ...snapshot, expiresAt: "2026-10-01" },
    { ...snapshot, prices: [{ naira: 265999, amount: NaN }] }]) assert.equal(formatDisplayPrice(265999, value, now), naira(265999));
  assert.equal(formatDisplayPrice(1234, snapshot, now), naira(1234));
  assert.equal(formatDisplayPrice(265999, { ...snapshot, currency: "NGN" }, now), naira(265999));
});
test("existing product renderers remain functional without a currency provider", () => {
  assert.equal(renderToStaticMarkup(<DisplayPrice amount={265999} />), naira(265999));
});
