import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CloudinaryUsageView } from "@workspace/api-client-react";
import { CloudinaryUsageReport, quotaWarning } from "./CloudinaryUsagePanel";

const now = Date.parse("2026-10-14T12:00:00Z");
const metric = { usage: 0, limit: null, usedPercent: null };
const view: CloudinaryUsageView = {
  status: "available", message: null, nextRefreshAt: "2026-10-14T12:15:00Z",
  snapshot: {
    plan: "Free", fetchedAt: "2026-10-14T12:00:00Z", providerUpdatedAt: "2026-10-14T00:00:00Z",
    dateRequested: "2026-10-14T00:00:00Z", windowStart: "2026-09-15", windowEnd: "2026-10-14",
    credits: { usage: 24, limit: 25, usedPercent: 96 }, storage: metric,
    bandwidth: { usage: 20_000_000_000, limit: 25_000_000_000, usedPercent: 80 },
    transformations: { usage: 25000, limit: 25000, usedPercent: 100 },
    adminLimit: 500, adminRemaining: 499, adminResetAt: "2026-10-14T13:00:00Z",
  },
};

test("usage UI shows real figures, rolling dates, warnings and non-attribution explanation", () => {
  const html = renderToStaticMarkup(<CloudinaryUsageReport view={view} now={now} />);
  for (const text of ["Credits", "Storage", "Bandwidth", "Transformations", "24", "25", "96%", "20 GB",
    "2026-09-15", "2026-10-14", "Critical: near quota", "Warning: usage is rising", "Quota reached or exceeded",
    "Server-side approval and publication inspections", "does not measure their individual shares",
    "15-minute minimum refresh", "does not delete assets or buy a plan", "Reported limit: Unavailable"]) {
    assert.ok(html.includes(text), `Expected report text: ${text}`);
  }
});
test("unavailable report has no fabricated usage cards and cached failures display stale", () => {
  const unavailable = renderToStaticMarkup(<CloudinaryUsageReport view={{ ...view, status: "unavailable", snapshot: null, message: "Access denied" }} now={now} />);
  assert.match(unavailable, /Usage unavailable/);
  assert.match(unavailable, /Access denied/);
  assert.doesNotMatch(unavailable, /Reported limit/);
  const stale = renderToStaticMarkup(<CloudinaryUsageReport view={view} requestFailed now={now} />);
  assert.match(stale, /Stale usage/);
  assert.match(stale, /last reported/);
  assert.match(renderToStaticMarkup(<CloudinaryUsageReport view={view} now={now + 30 * 60_000} />), /Stale usage/);
});
test("warning boundaries are explicit and missing percentages never warn", () => {
  assert.equal(quotaWarning(null), null);
  assert.equal(quotaWarning(79.99), null);
  assert.equal(quotaWarning(80), "Warning: usage is rising");
  assert.equal(quotaWarning(90), "Critical: near quota");
  assert.equal(quotaWarning(100), "Quota reached or exceeded");
  assert.equal(quotaWarning(150), "Quota reached or exceeded");
});
