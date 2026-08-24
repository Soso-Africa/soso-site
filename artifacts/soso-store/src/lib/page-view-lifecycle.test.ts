import assert from "node:assert/strict";
import test from "node:test";
import {
  nextMeasurementGrantGeneration,
  pageViewRecordAfterSend,
  shouldRecordPageViewForGrant,
  type PageViewRecord,
} from "./page-view-lifecycle";

test("records each pathname once per continuous measurement grant", () => {
  let generation = nextMeasurementGrantGeneration(0, false, true);
  let recorded: PageViewRecord | null = null;

  assert.equal(shouldRecordPageViewForGrant(recorded, generation, "/shop"), true);
  recorded = pageViewRecordAfterSend(recorded, generation, "/shop", true);
  assert.equal(shouldRecordPageViewForGrant(recorded, generation, "/shop"), false);

  // analytics -> marketing -> analytics remains one continuous allowed grant.
  generation = nextMeasurementGrantGeneration(generation, true, true);
  generation = nextMeasurementGrantGeneration(generation, true, true);
  assert.equal(generation, 1);
  assert.equal(shouldRecordPageViewForGrant(recorded, generation, "/shop"), false);

  assert.equal(shouldRecordPageViewForGrant(recorded, generation, "/about"), true);
  recorded = pageViewRecordAfterSend(recorded, generation, "/about", true);
  assert.equal(shouldRecordPageViewForGrant(recorded, generation, "/about"), false);

  // Revocation does not emit. Regrant starts a new generation for this path.
  generation = nextMeasurementGrantGeneration(generation, true, false);
  assert.equal(generation, 1);
  generation = nextMeasurementGrantGeneration(generation, false, true);
  assert.equal(generation, 2);
  assert.equal(shouldRecordPageViewForGrant(recorded, generation, "/about"), true);
  recorded = pageViewRecordAfterSend(recorded, generation, "/about", true);
  assert.equal(shouldRecordPageViewForGrant(recorded, generation, "/about"), false);
});

test("does not mark a page view when its consent-aware send fails", () => {
  const generation = nextMeasurementGrantGeneration(0, false, true);
  const recorded = pageViewRecordAfterSend(null, generation, "/journal", false);

  assert.equal(recorded, null);
  assert.equal(shouldRecordPageViewForGrant(recorded, generation, "/journal"), true);
});