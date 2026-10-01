import assert from "node:assert/strict";
import test from "node:test";
import { computeProductSteps, type StepInputs } from "./ProductStepFlow";
import { publicationState, sameProduct } from "./product-state";

const base: StepInputs = {
  imageCount: 1, imageIssues: 0, detailIssues: 0, fulfilmentIssues: 0, hasName: true, priceOk: true, eligibleChoices: 6,
  standardSizesOk: true, mappedChoices: 6, hasProductMapping: true, confirmedCurrent: false,
  analysisStatus: undefined, savedSinceEdit: false, publicationState: "unsaved",
};
const st = (steps: ReturnType<typeof computeProductSteps>, id: string) => steps.find((x) => x.id === id)?.state;

test("6 of 6 selected but unconfirmed keeps review next and publish blocked", () => {
  const s = computeProductSteps(base);
  assert.equal(st(s, "mapping"), "done");
  assert.equal(st(s, "review"), "next");
  assert.equal(st(s, "publish"), "blocked");
});
test("failed save leaves save step incomplete (saved draft differs)", () => {
  const s = computeProductSteps({ ...base, confirmedCurrent: true, savedSinceEdit: false });
  assert.equal(st(s, "save"), "next");
  assert.equal(st(s, "publish"), "blocked");
});
test("publish ready only after saved draft; live_current marks publish done", () => {
  const ready = computeProductSteps({ ...base, confirmedCurrent: true, savedSinceEdit: true, publicationState: "draft_not_live" });
  assert.equal(st(ready, "publish"), "next");
  const old = computeProductSteps({ ...base, confirmedCurrent: true, savedSinceEdit: true, publicationState: "live_old_version" });
  assert.equal(st(old, "publish"), "next");
  const live = computeProductSteps({ ...base, confirmedCurrent: true, savedSinceEdit: true, publicationState: "live_current" });
  assert.equal(st(live, "publish"), "done");
});
test("publicationState compares content, not slug presence", () => {
  const a = { slug: "x", price: 1, tags: ["a"] };
  assert.equal(publicationState(a, undefined, undefined), "unsaved");
  assert.equal(publicationState(a, a, undefined), "draft_not_live");
  assert.equal(publicationState(a, a, { ...a, price: 2 }), "live_old_version");
  assert.equal(publicationState(a, a, { tags: ["a"], price: 1, slug: "x" }), "live_current");
  assert.equal(publicationState({ ...a, price: 3 }, a, a), "unsaved");
  assert.ok(sameProduct({ a: 1, b: undefined }, { a: 1 }));
});

test("details complete with valid content while review is not ready; image issues are independent", () => {
  const s = computeProductSteps({ ...base, confirmedCurrent: false });
  assert.equal(st(s, "details"), "done");
  assert.equal(st(s, "review"), "next");
  const bad = computeProductSteps({ ...base, imageIssues: 2 });
  assert.equal(st(bad, "images"), "next");
  assert.equal(st(bad, "details"), "done");
});
