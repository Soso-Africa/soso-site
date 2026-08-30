import test from "node:test";
import assert from "node:assert/strict";
import { buildReportingRates, comparisonDelta, eventCountMap, rate } from "./analytics-reporting";
import { GetStaffAnalyticsMetricsQueryParams, GetStaffAnalyticsMetricsResponse } from "@workspace/api-zod";
import { analyticsFilterResponse, hasRecordedIdentityVerification, resolveAnalyticsFilters, resolveDateRange } from "./staff";

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

test("analytics reporting bounds date ranges and dimension filters", () => {
  assert.ok(resolveDateRange({ from: "2025-01-01", to: "2025-12-31" }, 366));
  assert.equal(resolveDateRange({ from: "2024-01-01", to: "2025-01-01" }, 366), null);
  assert.equal(resolveDateRange({ from: "2025-02-31", to: "2025-03-02" }, 366), null);
  assert.deepEqual(resolveAnalyticsFilters({
    country: "ng",
    device: "mobile",
    browser: "Safari",
    event: "page_view",
    path: "/shop",
  }), {
    source: undefined,
    path: "/shop",
    eventName: "page_view",
    country: "NG",
    device: "mobile",
    browser: "safari",
  });
  assert.equal(resolveAnalyticsFilters({ path: "/shop?email=private@example.com" }), null);
  assert.equal(resolveAnalyticsFilters({ browser: "full user agent value" }), null);
  assert.equal(resolveAnalyticsFilters({ source: ["google", "other"] }), null);
});

test("generated analytics contract matches server filter boundaries", () => {
  const maxPath = `/${"a".repeat(199)}`;
  const maxEvent = `a${"b".repeat(63)}`;
  const accepted = { path: maxPath, event: maxEvent, country: "unknown", device: "desktop", browser: "chrome" };
  assert.equal(GetStaffAnalyticsMetricsQueryParams.safeParse(accepted).success, true);
  assert.notEqual(resolveAnalyticsFilters(accepted), null);
  assert.equal(GetStaffAnalyticsMetricsQueryParams.safeParse({ path: `/${"a".repeat(200)}` }).success, false);
  assert.equal(resolveAnalyticsFilters({ path: `/${"a".repeat(200)}` }), null);
  assert.equal(GetStaffAnalyticsMetricsQueryParams.safeParse({ event: `a${"b".repeat(64)}` }).success, false);
  assert.equal(resolveAnalyticsFilters({ event: `a${"b".repeat(64)}` }), null);

  const appliedFilters = analyticsFilterResponse(resolveAnalyticsFilters(accepted));
  const minimalResponse = {
    from: "2026-08-24",
    to: "2026-08-30",
    generatedAt: "2026-08-30T12:00:00.000Z",
    privacyNote: "Aggregate consented data only.",
    semantics: { consent: "Consented first-party events only." },
    appliedFilters,
    summary: {
      visitors: { current: 1, previous: 0, delta: null },
      sessions: { current: 1, previous: 0, delta: null },
      pageViews: { current: 1, previous: 0, delta: null },
      events: { current: 1, previous: 0, delta: null },
      orders: { current: 0, previous: 0, delta: null },
    },
    dailyTimeSeries: [],
    pages: [],
    sources: [],
    geography: [],
    devices: [],
    browsers: [],
    events: [],
    conversions: [],
    engagement: { averageEngagedSeconds: null, bouncedSessions: 0, bounceRate: null, definition: "Bounded." },
    realtime: { windowMinutes: 5, activeNow: 0, events: 0, topPages: [], asOf: "2026-08-30T12:00:00.000Z", definition: "Rolling five minutes." },
    freshness: { latestEventAt: null, activeDays: 0, periodDays: 7, coverageRate: 0, definition: "Coverage." },
  };
  assert.equal(GetStaffAnalyticsMetricsResponse.safeParse(minimalResponse).success, true);
});

test("a privacy access package needs durable verification evidence", () => {
  assert.equal(hasRecordedIdentityVerification({ verificationNote: "Matched approved identity record", verifiedAt: new Date(), verifiedByClerkUserId: "staff_owner" }), true);
  assert.equal(hasRecordedIdentityVerification({ verificationNote: null, verifiedAt: new Date(), verifiedByClerkUserId: "staff_owner" }), false);
  assert.equal(hasRecordedIdentityVerification({ verificationNote: "Evidence", verifiedAt: null, verifiedByClerkUserId: "staff_owner" }), false);
});