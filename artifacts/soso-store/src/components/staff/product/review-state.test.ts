import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogProduct } from "../../../data/platformContent";
import {
  applyReviewFailure, applyReviewSuccess, mappingInputFingerprint, mergeWholeAnalysis,
  shouldAcceptReview, suggestionIfCurrent, type ReviewedSuggestion,
} from "./review-state";
import { validateProductGroups } from "./ProductValidation";

const product = (over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  slug: "agbada-one", name: "Agbada One", img: "/media/a.jpg",
  images: [{ src: "/media/a.jpg", alt: "Agbada front", provenance: { source: "SOSO studio", rights: "Owned" } }],
  materialTurnSets: [], price: 250000, tag: "New", note: "", category: "Agbada", department: "men",
  releaseState: "approved", description: "d", sizes: ["S", "M"], relatedProductSlugs: [], colour: "Ivory",
  colourOptions: [], allowCustomColour: false, fabric: "Silk", fit: "Regular", searchableTerms: [],
  merchandising: { isNew: true, label: "New", sortPriority: 1 }, standardEligible: true, customEligible: false,
  standardSizes: ["S", "M"], readyNowSizes: [], fulfilmentState: "made_to_order", dispatchMessage: "Ships in 3 weeks",
  ...over,
} as CatalogProduct);

const sugg = (slug: string): ReviewedSuggestion => ({ slug, status: "confident", confidence: 99, evidence: [], variantIds: {}, choiceLabels: {}, issues: [] });

test("delayed response from an older request is rejected", () => {
  assert.equal(shouldAcceptReview({ submittedFp: "a", currentFp: "a", requestGen: 1, currentGen: 2 }), false);
  assert.equal(shouldAcceptReview({ submittedFp: "a", currentFp: "a", requestGen: 2, currentGen: 2 }), true);
});

test("edit during review rejects the response and invalidates old analysis", () => {
  const p = product();
  const fp = mappingInputFingerprint(p);
  const edited = product({ price: 260000 });
  assert.equal(shouldAcceptReview({ submittedFp: fp, currentFp: mappingInputFingerprint(edited), requestGen: 1, currentGen: 1 }), false);
  const reviewed = applyReviewSuccess([], p.slug, sugg(p.slug), fp);
  assert.ok(suggestionIfCurrent(reviewed[0], p));
  assert.equal(suggestionIfCurrent(reviewed[0], edited), undefined);
  for (const change of [{ name: "X" }, { standardSizes: ["S"] }, { fulfilmentState: "ready_now" }, { customEligible: true }, { commerceProductId: "id" }, { commerceVariantIds: { S: "v" } }] as Partial<CatalogProduct>[]) {
    assert.notEqual(mappingInputFingerprint(product(change)), fp);
  }
  assert.equal(mappingInputFingerprint(product({ description: "other" })), fp);
});

test("failure after success removes the old analysis so Confirm cannot use it", () => {
  const p = product();
  const ok = applyReviewSuccess([sugg("other")], p.slug, sugg(p.slug), mappingInputFingerprint(p));
  const failed = applyReviewFailure(ok, p.slug);
  assert.equal(failed.find((s) => s.slug === p.slug), undefined);
  assert.ok(failed.find((s) => s.slug === "other"));
});

test("whole-catalogue analysis does not overwrite changed or newer per-product reviews", () => {
  const a = product(); const b = product({ slug: "b" });
  const fpA = mappingInputFingerprint(a); const fpB = mappingInputFingerprint(b);
  const prev = applyReviewSuccess([], "a", { ...sugg("a"), status: "needs_review" }, fpA);
  const submitted = { a: { fp: fpA, gen: 0 }, b: { fp: fpB, gen: 0 } };
  // a got a newer per-product request (gen 1) while whole analysis was running
  const current = { a: { fp: fpA, gen: 1 }, b: { fp: fpB, gen: 0 } };
  const merged = mergeWholeAnalysis(prev, [sugg("a"), sugg("b")], submitted, current);
  assert.equal(merged.find((s) => s.slug === "a")?.status, "needs_review");
  assert.equal(merged.find((s) => s.slug === "b")?.inputFingerprint, fpB);
  // b edited meanwhile: whole result for b is dropped
  const edited = mergeWholeAnalysis([], [sugg("b")], submitted, { ...current, b: { fp: "changed", gen: 1 } });
  assert.equal(edited.length, 0);
});

test("invalid primary photo blocks images only; details stay independent", () => {
  const bad = product({ images: [{ src: "/media/a.jpg", alt: "", provenance: { source: "", rights: "" } }] });
  const g = validateProductGroups(bad, [bad], ["Agbada"]);
  assert.ok(g.images.length > 0);
  assert.equal(g.details.length, 0);
  const wrongPrimary = validateProductGroups(product({ img: "/media/other.jpg" }), [product()], ["Agbada"]);
  assert.ok(wrongPrimary.images.some((m) => /Primary image/.test(m)));
  const unmapped = validateProductGroups(product({ commerceVariantIds: { S: "x" } }), [product()], ["Agbada"]);
  assert.equal(unmapped.details.length, 0);
  assert.ok(unmapped.mapping.length > 0);
});

test("webhook invalidation epoch discards a pre-invalidation review even for an unchanged product", () => {
  const p = product();
  const fp = mappingInputFingerprint(p);
  // launched at epoch 3, webhook advanced to 4, product and slug counter unchanged
  assert.equal(shouldAcceptReview({ submittedFp: fp, currentFp: fp, requestGen: 1, currentGen: 1, requestEpoch: 3, currentEpoch: 4 }), false);
  // discarded response leaves no analysis, so Confirm has nothing current
  assert.equal(suggestionIfCurrent(undefined, p), undefined);
  // a review launched after invalidation is accepted
  assert.equal(shouldAcceptReview({ submittedFp: fp, currentFp: fp, requestGen: 2, currentGen: 2, requestEpoch: 4, currentEpoch: 4 }), true);
});
