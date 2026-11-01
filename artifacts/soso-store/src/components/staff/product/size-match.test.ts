import assert from "node:assert/strict";
import test from "node:test";
import { canonicalSize, compatibleVariants, evaluateChoices, isCompatibleVariant } from "./size-match";

const v = (id: string, name: string, attributes: Record<string, unknown> = {}, label = "") => ({ id, name, label, attributes });

test("aliases map to canonical sizes", () => {
  assert.equal(canonicalSize("Small"), "S");
  assert.equal(canonicalSize("2XL"), "XXL");
  assert.equal(canonicalSize("3xl"), "XXXL");
  assert.equal(canonicalSize("Made to measure"), "Custom");
  assert.equal(canonicalSize("Bespoke"), "Custom");
  assert.equal(canonicalSize("Red"), undefined);
});
test("selector offers only compatible sizes", () => {
  const all = [v("1", "Agbada", { Size: "Small" }), v("2", "Agbada", { Size: "M" }), v("3", "Agbada", { Size: "Extra large" }), v("4", "Bespoke")];
  assert.deepEqual(compatibleVariants("S", all).map((x) => x.id), ["1"]);
  assert.deepEqual(compatibleVariants("XL", all).map((x) => x.id), ["3"]);
  assert.deepEqual(compatibleVariants("L", all).map((x) => x.id), []);
  assert.deepEqual(compatibleVariants("Custom", all).map((x) => x.id), ["4"]);
});
test("custom merchant size labels stay usable without guessing from product names", () => {
  assert.equal(isCompatibleVariant("42", v("one", "Size 42", { size: 42 })), true);
  assert.equal(isCompatibleVariant("One size", v("one", "One size")), true);
  assert.equal(isCompatibleVariant("Custom", v("one", "Agbada Bespoke")), false);
});
test("authoritative attributes override name; colours ignored", () => {
  assert.equal(isCompatibleVariant("M", v("1", "Small batch", { Size: "M" })), true);
  assert.equal(isCompatibleVariant("S", v("1", "Small batch", { Size: "M" })), false);
  assert.equal(isCompatibleVariant("L", v("1", "Kaftan", { Colour: "Large print blue" })), false);
});
test("mismatched selection stays selected but is not counted correct", () => {
  const r = evaluateChoices(["S", "M"], { S: "2", M: "2" }, [v("2", "x", { Size: "Medium" })]);
  assert.equal(r.selectedCount, 2);
  assert.equal(r.correctCount, 1);
  assert.equal(r.rows[0].status, "wrong");
  assert.equal(r.rows[0].selectedId, "2");
});
