import test from "node:test";
import assert from "node:assert/strict";
import { buildReportingRates, comparisonDelta, eventCountMap, rate } from "./analytics-reporting";
import { hasRecordedIdentityVerification } from "./staff";

test("analytics reporting rates are denominator-safe and never imply payment success", () => {
  const counts = eventCountMap([
    { eventName: "page_view", count: 100 },
    { eventName: "product_view", count: 40 },
    { eventName: "add_to_bag", count: 10 },
    { eventName: "checkout_started", count: 5 },
    { eventName: "payment_clicked", count: 3 },
  ]);
  const rates = Object.fromEntries(buildReportingRates(counts).map((item) => [item.key, item]));

  assert.equal(rates.add_to_bag_rate.value, 0.25);
  assert.equal(rates.cart_abandonment.value, 0.5);
  assert.equal(rates.checkout_abandonment.value, 0.4);
  assert.match(rates.payment_click_rate.definition, /does not prove payment success/i);
  assert.equal(rate(3, 0), null);
});

test("comparison deltas stay unavailable without a valid prior baseline", () => {
  assert.equal(comparisonDelta(15, 10), 0.5);
  assert.equal(comparisonDelta(15, 0), null);
});

test("a privacy access package needs durable verification evidence", () => {
  assert.equal(hasRecordedIdentityVerification({ verificationNote: "Matched approved identity record", verifiedAt: new Date(), verifiedByClerkUserId: "staff_owner" }), true);
  assert.equal(hasRecordedIdentityVerification({ verificationNote: null, verifiedAt: new Date(), verifiedByClerkUserId: "staff_owner" }), false);
  assert.equal(hasRecordedIdentityVerification({ verificationNote: "Evidence", verifiedAt: null, verifiedByClerkUserId: "staff_owner" }), false);
});