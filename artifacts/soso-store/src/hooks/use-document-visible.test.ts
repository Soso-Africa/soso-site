import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { documentIsVisible, observeDocumentVisibility } from "./use-document-visible";

test("visibility changes pause/resume polling state and listener cleanup works", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const source = new EventTarget() as EventTarget & { visibilityState: string };
  source.visibilityState = "visible";
  Object.defineProperty(globalThis, "document", { configurable: true, value: source });
  try {
    const states: boolean[] = [];
    assert.equal(documentIsVisible(), true);
    const stop = observeDocumentVisibility((visible) => states.push(visible));
    source.visibilityState = "hidden";
    source.dispatchEvent(new Event("visibilitychange"));
    assert.equal(documentIsVisible(), false);
    source.visibilityState = "visible";
    source.dispatchEvent(new Event("visibilitychange"));
    stop();
    source.visibilityState = "hidden";
    source.dispatchEvent(new Event("visibilitychange"));
    assert.deepEqual(states, [true, false, true]);
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("every Staff list is gated by visibility and its matching section", () => {
  const staff = readFileSync(new URL("../pages/Staff.tsx", import.meta.url), "utf8");
  const dashboardQueries = staff.slice(0, staff.indexOf("const availableTabs"));
  const sections = ["overview", "orders", "enquiries", "privacy", "accessory-launch-notifications"];
  for (const section of sections) {
    assert.ok(staff.includes(`&& visible && activeTab === "${section}"`), `${section} must be visibility/section gated`);
  }
  assert.match(staff, /refetchInterval: 120_000/);
  assert.doesNotMatch(dashboardQueries, /window\.setInterval/);
  assert.match(staff, /refetchType: "active"/);
  assert.match(staff, /"staff-stale-catalogue-mappings", profile\?\.id, profile\?\.role/);
});