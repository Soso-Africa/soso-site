import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogProduct } from "../../../data/platformContent";
import { applySelectedChanges, buildUpdateReview, type UpdateRow } from "./update-model";
import { assertSpreadsheetDoesNotOverwriteEditor, reconcileSavedProducts } from "./editor-merge";

const base = (slug = "garment"): CatalogProduct => ({
  slug, name: slug, price: 100, department: "men", category: "Shirts", releaseState: "placeholder",
  standardEligible: false, customEligible: true, standardSizes: [], sizes: ["Custom"],
  readyNowSizes: [], variantPrices: {}, fabric: "Cotton",
} as CatalogProduct);
const collections = [{ department: "men", category: "Shirts" }];
const mapping = { Variant: "variant", Price: "price", Standard: "standardEligible", Sizes: "standardSizes", All: "sizes", Fabric: "fabric" } as const;
const row = (rowNumber: number, slug: string, fields: Record<string, string>): UpdateRow => ({ rowNumber, slug, fields });
const review = (rows: UpdateRow[], savedProducts = [base()], mode: "fill" | "replace" = "replace") =>
  buildUpdateReview({ rows, savedProducts, mapping, mode, collections });

test("new size eligibility and its price work together, independent of row order", () => {
  const rows = [
    row(2, "garment", { Variant: "S", Price: "120" }),
    row(3, "garment", { Standard: "Yes", Sizes: "S | M", All: "S | M | Custom" }),
  ];
  const result = review(rows);
  assert.deepEqual(result.errors, []);
  const ids = new Set(result.changes.map((c) => c.id));
  const next = applySelectedChanges([base()], result.changes, ids, collections)[0];
  assert.equal(next.variantPrices?.S, 120);
  assert.deepEqual(next.standardSizes, ["S", "M"]);
  const onlyPrice = new Set(result.changes.filter((c) => c.field === "variantPrice").map((c) => c.id));
  assert.throws(() => applySelectedChanges([base()], result.changes, onlyPrice, collections), /together/);
});

test("fill-only cannot silently replace disabled eligibility to accept a price", () => {
  const result = review([row(2, "garment", { Standard: "Yes", Sizes: "S", All: "S | Custom" }), row(3, "garment", { Variant: "S", Price: "120" })], [base()], "fill");
  assert.ok(result.errors.length);
  assert.equal(result.changes.length, 0);
});

test("bad product blocks only its own fields, not another product's fabric", () => {
  const result = review([row(2, "bad", { Variant: "S", Price: "120", Fabric: "Silk" }), row(3, "good", { Fabric: "Linen" })], [base("bad"), base("good")]);
  assert.equal(result.errors[0].slug, "bad");
  assert.deepEqual(result.changes.map((c) => c.slug), ["good"]);
});

test("global column conflicts still block every product", () => {
  const result = buildUpdateReview({ rows: [row(2, "garment", { Fabric: "Linen" })], savedProducts: [base()], collections, mode: "replace", mapping: { Fabric: "fabric", Duplicate: "fabric" } });
  assert.ok(result.errors.some((e) => !e.slug));
  assert.deepEqual(result.changes, []);
});

test("unrelated and late form edits survive spreadsheet saves; overlaps are explicit", () => {
  const saved = base(), updated = { ...saved, fabric: "Linen" };
  const editor = { ...saved, name: "Unsaved name" };
  assert.doesNotThrow(() => assertSpreadsheetDoesNotOverwriteEditor([editor], [saved], [updated]));
  const next = reconcileSavedProducts([editor], [saved], [updated])[0];
  assert.equal(next.name, "Unsaved name");
  assert.equal(next.fabric, "Linen");
  assert.throws(() => assertSpreadsheetDoesNotOverwriteEditor([{ ...saved, fabric: "Silk" }], [saved], [updated]), /also edited/);
  assert.equal(reconcileSavedProducts([{ ...saved, fabric: "Late edit" }], [saved], [updated])[0].fabric, "Late edit");
});
