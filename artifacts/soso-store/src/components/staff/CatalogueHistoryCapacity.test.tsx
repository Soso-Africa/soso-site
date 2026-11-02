import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogueHistoryCapacity } from "@workspace/api-client-react";
import { CatalogueHistoryCapacityReport } from "./CatalogueHistoryCapacity";

const MiB = 1048576;
const data: CatalogueHistoryCapacity = {
  status: "available", level: "urgent",
  budgetBytes: 100 * MiB, warningBytes: 70 * MiB, urgentBytes: 90 * MiB,
  sample: { measuredAt: "2026-11-02T12:00:00Z", revisionBytes: 80 * MiB, auditBytes: 10 * MiB },
  previous: { measuredAt: "2026-11-01T12:00:00Z", revisionBytes: 79 * MiB, auditBytes: 10 * MiB },
  revisionBytesPerDay: MiB, auditBytesPerDay: 0, daysToBudget: 10,
  nextRefreshAt: "2026-11-03T12:00:00Z", message: null,
};

test("owner report labels separate bytes, trends, budget and conservative scope without implying transfer usage", () => {
  const html = renderToStaticMarkup(<CatalogueHistoryCapacityReport data={data} />);
  for (const text of ["urgent capacity warning", "100.00 MiB", "70.00 MiB", "90.00 MiB",
    "Retained revision allocation", "Shared audit evidence allocation", "83,886,080 bytes",
    "+1,048,576 bytes", "0 bytes", "10 days", "two-point estimate", "Growth compared",
    "not network transfer", "unrelated events", "TOAST", "owners only", "no email",
    "nothing is automatically removed", "on an owner visit"]) {
    assert.ok(html.includes(text), `Missing owner-facing detail: ${text}`);
  }
});

test("unavailable, stale, missing baseline and failed refresh remain visible without fabricated usage", () => {
  const unavailable = renderToStaticMarkup(<CatalogueHistoryCapacityReport data={{ ...data, status: "unavailable", sample: null, previous: null, level: "unknown", message: "Measurement failed" }} />);
  assert.match(unavailable, /No successful measurement yet/);
  assert.match(unavailable, /Measurement failed/);
  assert.doesNotMatch(unavailable, /Combined:|90.0%/);
  const stale = renderToStaticMarkup(<CatalogueHistoryCapacityReport data={{ ...data, status: "stale", message: "Measurement failed", revisionBytesPerDay: null, auditBytesPerDay: null, daysToBudget: null }} />);
  assert.match(stale, /Stale measurement/);
  assert.match(stale, /Awaiting two daily measurements/);
  assert.match(stale, /urgent capacity warning/);
  const failed = renderToStaticMarkup(<CatalogueHistoryCapacityReport data={data} failed />);
  assert.match(failed, /does not mean usage is within budget/);
  assert.match(failed, /urgent capacity warning/);
});
