import assert from "node:assert/strict";
import test from "node:test";
import { isPrivateStorefrontPath, RecordAnalyticsEventBody } from "@workspace/api-zod";
import {
  buildAnalyticsQualityReport,
  type AnalyticsQualityFixture,
} from "./analytics-quality";
import { validateAnalyticsEvent } from "./analytics-validation";

const now = new Date("2026-08-24T12:00:00.000Z");
const baseFixture: AnalyticsQualityFixture = {
  events24h: 20,
  events7d: 140,
  invalidPathCount: 0,
  attributionCount: 0,
  futureTimestampCount: 0,
  journeyRows: [
    { sessionId: "session-valid-001", eventName: "product_view", occurredAt: now },
    { sessionId: "session-valid-001", eventName: "add_to_bag", occurredAt: now },
    { sessionId: "session-valid-001", eventName: "checkout_started", occurredAt: now },
    { sessionId: "session-valid-001", eventName: "payment_clicked", occurredAt: now },
  ],
  burstCount: 0,
  generatedAt: now,
};

function checkStatuses(fixture: Partial<AnalyticsQualityFixture>) {
  const report = buildAnalyticsQualityReport({ ...baseFixture, ...fixture });
  return new Map(report.checks.map((check) => [check.check, check.status]));
}

test("accepts current and newly launched public storefront paths", () => {
  for (const path of [
    "/",
    "/shop",
    "/collections/kaftans",
    "/product/heritage-kaftan",
    "/journal/new-story",
  ]) {
    assert.equal(
      isTrackableStorefrontPath(path),
      true,
      `${path} should be tracked as a public storefront route`,
    );
    assert.equal(
      new RegExp(INVALID_STOREFRONT_PATH_PATTERN, "i").test(path),
      false,
      `${path} should not be flagged by the staff quality SQL policy`,
    );
    assert.equal(
      validateAnalyticsEvent({ path, occurredAt: now }, now.getTime()),
      null,
      `${path} should be accepted by analytics ingestion`,
    );
  }

  const body = RecordAnalyticsEventBody.safeParse({
    eventId: "event-valid-001",
    eventVersion: 1,
    anonymousId: "anonymous-valid-001",
    sessionId: "session-valid-001",
    eventName: "page_view",
    path: "/shop",
    consent: "analytics",
    occurredAt: now.toISOString(),
  });

  assert.equal(body.success, true);
  if (body.success) {
    assert.equal(validateAnalyticsEvent(body.data, now.getTime()), null);
    assert.equal(body.data.consent, "analytics");
  }
});

test("keeps private and API paths out of storefront measurement", () => {
  for (const path of [
    "/api/staff/analytics/quality",
    "/staff",
    "/sign-in",
    "/journal/preview/draft-story",
    "shop",
    "/shop?utm_source=private",
  ]) {
    assert.equal(isTrackableStorefrontPath(path), false, `${path} should not be tracked`);
    assert.equal(
      validateAnalyticsEvent({ path, occurredAt: now }, now.getTime()),
      "path",
      `${path} should be rejected by analytics ingestion`,
    );
    assert.equal(
      new RegExp(INVALID_STOREFRONT_PATH_PATTERN, "i").test(path),
      true,
      `${path} should be flagged by the staff quality SQL policy`,
    );
  }
});

test("a supported public page stays healthy in the quality report", () => {
  assert.equal(isTrackableStorefrontPath("/collections/kaftans"), true);
  assert.equal(checkStatuses({ invalidPathCount: 0 }).get("storefront_paths"), "ok");
});

test("rejects stale and future event timestamps", () => {
  assert.equal(
    validateAnalyticsEvent(
      { path: "/shop", occurredAt: new Date(now.getTime() - 31 * 24 * 60 * 60_000 - 1) },
      now.getTime(),
    ),
    "timestamp",
  );
  assert.equal(
    validateAnalyticsEvent(
      { path: "/shop", occurredAt: new Date(now.getTime() + 5 * 60_000 + 1) },
      now.getTime(),
    ),
    "timestamp",
  );
});

test("rejects non-storefront paths even when the timestamp is valid", () => {
  assert.equal(
    validateAnalyticsEvent({ path: "/api/staff/analytics/quality", occurredAt: now }, now.getTime()),
    "path",
  );
  assert.equal(
    validateAnalyticsEvent({ path: "/product/not valid", occurredAt: now }, now.getTime()),
    "path",
  );
});

test("accepts new public paths while retaining namespace-aware private and malformed path checks", () => {
  for (const path of [
    "/staff-picks",
    "/staffing",
    "/sign-style",
    "/sign-updates",
    "/apiary",
    "/journal/previews",
    "/new-storefront-page",
  ]) {
    assert.equal(validateAnalyticsEvent({ path, occurredAt: now }, now.getTime()), null, path);
    assert.equal(isPrivateStorefrontPath(path), false, path);
  }

  for (const path of [
    "/api",
    "/api/x",
    "/staff",
    "/staff/orders",
    "/sign-in",
    "/sign-in/callback",
    "/sign-up",
    "/sign-up/verify",
    "/journal/preview",
    "/journal/preview/draft",
  ]) {
    assert.equal(validateAnalyticsEvent({ path, occurredAt: now }, now.getTime()), "path", path);
    assert.equal(isPrivateStorefrontPath(path), true, path);
  }

  for (const path of [
    "/staff?tab=orders",
    "//staff-picks",
    "/sign-style#details",
  ]) {
    assert.equal(validateAnalyticsEvent({ path, occurredAt: now }, now.getTime()), "path", path);
  }
});

test("each aggregate quality check moves from healthy to its flagged state", () => {
  const scenarios: [
    string,
    Partial<AnalyticsQualityFixture>,
    "review" | "issue",
  ][] = [
    ["volume_spike", { events24h: 101, events7d: 140 }, "review"],
    ["signal_volume", { events7d: 9 }, "review"],
    ["storefront_paths", { invalidPathCount: 1 }, "issue"],
    ["attribution_completeness", { attributionCount: 2 }, "review"],
    ["time_sanity", { futureTimestampCount: 1 }, "issue"],
    [
      "journey_order",
      {
        journeyRows: [
          { sessionId: "session-out-of-order", eventName: "payment_clicked", occurredAt: now },
        ],
      },
      "review",
    ],
    ["automation_bursts", { burstCount: 1 }, "review"],
  ];

  const healthy = checkStatuses({});
  assert.deepEqual([...healthy.values()], ["ok", "ok", "ok", "ok", "ok", "ok", "ok"]);

  for (const [check, fixture, status] of scenarios) {
    assert.equal(checkStatuses(fixture).get(check), status, `${check} should be flagged`);
  }
});

test("quality response keeps its contract and does not expose identifiers", () => {
  const report = buildAnalyticsQualityReport({
    ...baseFixture,
    invalidPathCount: 1,
    attributionCount: 1,
    futureTimestampCount: 1,
    burstCount: 1,
  });

  assert.ok(report.status === "ok" || report.status === "review" || report.status === "issue");
  assert.equal(report.checks.length, 7);
  for (const check of report.checks) {
    assert.equal(typeof check.status, "string");
    assert.equal(typeof check.detail, "string");
    assert.equal(typeof check.scope, "string");
    assert.equal(typeof check.nextAction, "string");
  }

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("anonymousId"), false);
  assert.equal(serialized.includes("sessionId"), false);
  assert.equal(serialized.includes("session-valid-001"), false);
});
