import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogProduct } from "../../../data/platformContent";
import { isSizePlaceholder } from "./size-placeholders";
import { handleUpdateStandardSizes, handleUpdateAvailableSizes } from "./ProductTransitions";

const product = {
  sizes: ["To confirm", "M"], standardSizes: ["To confirm"], readyNowSizes: [],
  commerceVariantIds: {}, standardEligible: true,
} as unknown as CatalogProduct;

test("guidance labels cannot become Standard variants; real size labels are unaffected", () => {
  for (const label of ["To confirm", " TO BE CONFIRMED ", "TBC", "tbd", "Unknown", "Pending"]) {
    assert.equal(isSizePlaceholder(label), true);
    assert.equal(handleUpdateStandardSizes(product, label, true, () => true), null);
  }
  for (const label of ["S", "M", "XL", "One size", "42", "6–8"]) assert.equal(isSizePlaceholder(label), false);
  assert.ok(handleUpdateStandardSizes(product, "M", true, () => true)?.standardSizes.includes("M"));
});

test("legacy placeholder selections can be removed without inventing sizes, prices or mappings", () => {
  const deselected = handleUpdateStandardSizes(product, "To confirm", false, () => true)!;
  assert.deepEqual(deselected.standardSizes, []);
  assert.deepEqual(product.standardSizes, ["To confirm"]);
  const repaired = handleUpdateAvailableSizes(product, ["M"], () => true)!;
  assert.deepEqual(repaired.sizes, ["M"]);
  assert.deepEqual(repaired.standardSizes, []);
  assert.equal(repaired.variantPrices, undefined);
  assert.equal(repaired.commerceVariantIds, undefined);
});

test("removing a configured placeholder still requires permission", () => {
  assert.equal(handleUpdateAvailableSizes(product, ["M"], () => false), null);
});
