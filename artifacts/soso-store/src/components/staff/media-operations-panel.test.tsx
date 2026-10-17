import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { R2MediaOperations } from "@workspace/api-client-react";
import { MediaOperationsPanel } from "./MediaOperationsPanel";

const now = Date.now();
const timestamp = new Date(now).toISOString();
const healthy = (): R2MediaOperations => ({
  version: 1, reportedAt: timestamp,
  delivery: { status: "healthy", checkedAt: timestamp, checkedCases: 6, privateDenial: true, message: null },
  backup: { status: "healthy", lastAttemptAt: timestamp, lastSuccessAt: timestamp, pending: 0,
    reservedBytes: 4_000_000, dailyByteLimit: 100_000_000, totalByteLimit: 1_000_000_000, attemptedBytes: 0, messages: [] },
});
test("missing operations evidence is explicitly unavailable, not successful", () => {
  const html = renderToStaticMarkup(<MediaOperationsPanel now={now} report={null} />);
  assert.match(html, /Protection reports are unavailable/);
  assert.match(html, /Unverified or stale/);
  assert.doesNotMatch(html, />Verified</);
});
test("current reports show both successful outcomes and their exact scope", () => {
  const html = renderToStaticMarkup(<MediaOperationsPanel now={now} report={healthy()} />);
  assert.equal((html.match(/>Verified</g) || []).length, 2);
  assert.match(html, /Files uploaded since the last backup are not yet independently protected/);
  assert.match(html, /not account billing caps/);
});
test("fresh report wrappers cannot conceal stale delivery or backup evidence", () => {
  const report = healthy();
  report.delivery.checkedAt = new Date(now - 3 * 60 * 60_000).toISOString();
  report.backup!.lastSuccessAt = new Date(now - 27 * 60 * 60_000).toISOString();
  const html = renderToStaticMarkup(<MediaOperationsPanel now={now} report={report} />);
  assert.doesNotMatch(html, />Verified</);
  assert.match(html, /Unverified or stale/);
  assert.match(html, /Incomplete, unavailable or stale/);
});
test("an expired running lease and a pending warning cannot look complete", () => {
  const report = healthy();
  report.backup!.status = "running";
  report.backup!.lastAttemptAt = new Date(now - 30 * 60_000).toISOString();
  const html = renderToStaticMarkup(<MediaOperationsPanel now={now} report={report} />);
  assert.match(html, /Incomplete, unavailable or stale/);
  assert.doesNotMatch(html, /Running — not yet verified/);
});
