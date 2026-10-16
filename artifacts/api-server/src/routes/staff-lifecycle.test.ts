import assert from "node:assert/strict";
import test from "node:test";
import { GetStaffOverviewResponse } from "@workspace/api-zod";
import staffRouter, { staffOverviewView } from "./staff";

test("staff overview response includes legacy counters and metric cards", () => {
  const parsed = GetStaffOverviewResponse.parse(staffOverviewView({
    ordersTotal: 3,
    ordersInProduction: 2,
    openEnquiries: 1,
    storefrontEvents7d: 8,
  }, {
    from: "2026-08-01",
    to: "2026-08-07",
  }, new Date("2026-08-07T12:00:00.000Z")));

  assert.equal(parsed.ordersTotal, 3);
  assert.equal(parsed.metrics[0]?.value, parsed.ordersTotal);
  assert.equal(parsed.metrics[0]?.label, "Verified orders");
  assert.equal(parsed.paymentIsLive, false);
});

test("staff overview uses the resolved checkout readiness rather than a hardcoded disabled flag", () => {
  const values = { ordersTotal: 0, ordersInProduction: 0, openEnquiries: 0, storefrontEvents7d: 0 };
  const range = { from: "2026-10-01", to: "2026-10-14" };
  assert.equal(staffOverviewView(values, range, new Date(), true).paymentIsLive, true);
  assert.equal(staffOverviewView(values, range, new Date(), false).paymentIsLive, false);
});
test("redirect lifecycle uses PUT updates and explicit publication mutations", () => {
  const routes = (staffRouter as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
  }).stack.map((layer) => layer.route).filter(Boolean);
  const methodsFor = (path: string) => routes
    .filter((route) => route?.path === path)
    .flatMap((route) => Object.keys(route!.methods));

  assert.deepEqual(methodsFor("/staff/redirects").sort(), ["get", "post"]);
  assert.deepEqual(methodsFor("/staff/redirects/:id").sort(), ["delete", "put"]);
  assert.deepEqual(methodsFor("/staff/redirects/:id/publish"), ["post"]);
});