import assert from "node:assert/strict";
import test from "node:test";
import {
  isRegionDefaultAnalytics,
  shouldAutomaticallyEnableAnalytics,
} from "./consent-region";

test("only a verified non-regulated response enables analytics automatically", () => {
  assert.equal(
    shouldAutomaticallyEnableAnalytics({ region: "non_regulated", consentRequired: false }),
    true,
  );
  for (const decision of [
    { region: "regulated", consentRequired: true },
    { region: "unknown", consentRequired: true },
    { region: "non_regulated", consentRequired: true },
    null,
    {},
  ]) {
    assert.equal(shouldAutomaticallyEnableAnalytics(decision), false);
  }
});

test("only persisted automatic analytics requires a fresh region decision", () => {
  assert.equal(isRegionDefaultAnalytics("analytics", "region_default"), true);
  assert.equal(isRegionDefaultAnalytics("analytics", "banner"), false);
  assert.equal(isRegionDefaultAnalytics("marketing", "region_default"), false);
  assert.equal(isRegionDefaultAnalytics(null, "region_default"), false);
});