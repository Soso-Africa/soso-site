import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import type { CatalogProduct } from "../../../data/platformContent";
import { rowsToCatalogueSheet, parseCatalogueSpreadsheet } from "../../../../../api-server/src/lib/catalogue-import-sheet";
import { createUpdateSheet, updateSheetRows } from "./update-sheet";
import { buildUpdateReview, suggestMapping, sheetHeadings, applySelectedChanges, FIELD_DEFS } from "./update-model";
import { ORIGINAL_VALUES_HEADING } from "./update-reference";

const base = (): CatalogProduct => ({
  slug: "saved-kaftan", name: "Saved kaftan", img: "", images: [], materialTurnSets: [],
  tag: "", note: "", category: "Kaftans", department: "men", releaseState: "placeholder",
  description: "", colour: "Indigo", colourOptions: [], allowCustomColour: false,
  fit: "Relaxed", searchableTerms: [], merchandising: { isNew: false, sortPriority: 1 },
  readyNowSizes: [], fulfilmentState: "unavailable", dispatchMessage: "Soon",
  standardEligible: true, standardSizes: ["M", "XL"], customEligible: false,
  sizes: ["M", "XL"], price: 25000, variantPrices: { M: 25500, XL: 28000 },
  fabric: "Cotton", care: "Hand wash",
});
const review = (rows: string[][], saved = [base()]) => {
  const sheet = rowsToCatalogueSheet("updates", rows, "update");
  return buildUpdateReview({ rows: sheet.rows, savedProducts: saved,
    mapping: suggestMapping(sheetHeadings(sheet.rows)), mode: "replace",
    collections: [{ department: saved[0].department, category: saved[0].category }],
  });
};
test("populated downloads include saved facts, exact size prices and protected originals; untouched uploads are no-ops", () => {
  const p = base();
  const rows = updateSheetRows([p], ["fabric", "price", "care"], { populated: true });
  assert.equal(rows[1][2], "Cotton");
  assert.equal(rows[1][3], "Hand wash"); // FIELD_DEFS ordering, not caller array ordering.
  assert.equal(rows[1][4], "25000");
  assert.equal(rows[2][4], "25500");
  assert.equal(rows[0].at(-1), ORIGINAL_VALUES_HEADING);
  const result = review(rows);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.changes, []);
  assert.ok(!sheetHeadings(rowsToCatalogueSheet("updates", rows, "update").rows).includes(ORIGINAL_VALUES_HEADING));
});
test("only edited product and variant cells change; untouched saved columns never overwrite newer edits", () => {
  const p = base(), rows = updateSheetRows([p], ["fabric", "price", "care"], { populated: true });
  rows[1][rows[0].indexOf("fabric")] = "Linen";
  rows[2][rows[0].indexOf("price")] = "26000";
  const newer = { ...p, care: "Dry clean" };
  const result = review(rows, [newer]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.changes.length, 2);
  const next = applySelectedChanges([newer], result.changes, new Set(result.changes.map(c => c.id)),
    [{ department: newer.department, category: newer.category }])[0];
  assert.equal(next.fabric, "Linen");
  assert.equal(next.care, "Dry clean");
  assert.deepEqual(next.variantPrices, { M: 26000, XL: 28000 });
  assert.equal(next.price, 25000);
});
test("stale edited facts and identity/reference mismatches fail closed", () => {
  const p = base(), rows = updateSheetRows([p], ["fabric"], { populated: true });
  rows[1][2] = "Linen";
  assert.match(review(rows, [{ ...p, fabric: "Silk" }]).errors[0].message, /after this download/);
  rows[1][0] = "other-product";
  assert.match(review(rows, [{ ...p, slug: "other-product" }]).errors[0].message, /another product/);
});
test("formatting a populated price is not an edit, even when the saved price later changes", () => {
  const p = base(), rows = updateSheetRows([p], ["price"], { populated: true });
  rows[1][2] = "NGN 25,000.00";
  const result = review(rows, [{ ...p, price: 27000 }]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.changes, []);
});
test("CSV and XLSX current-value files round-trip all editable fields and over 50 products in one file", async () => {
  for (const format of ["csv", "xlsx"] as const) {
    const products = Array.from({ length: 60 }, (_, i) => ({ ...base(), slug: `piece-${i}` }));
    const blob = await createUpdateSheet(products, FIELD_DEFS.map(d => d.key), format, { populated: true });
    const parsed = await parseCatalogueSpreadsheet(`all.${format}`, Buffer.from(await blob.arrayBuffer()), "update");
    assert.equal(new Set(parsed.rows.map(r => r.slug)).size, 60);
    const result = buildUpdateReview({ rows: parsed.rows, savedProducts: products, mapping: suggestMapping(sheetHeadings(parsed.rows)),
      mode: "replace", collections: [{ department: products[0].department, category: products[0].category }] });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.changes, []);
    if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(await blob.arrayBuffer()) as never);
      assert.equal(workbook.worksheets[0].getColumn(parsed.rows[0] ? Object.keys(parsed.rows[0].fields).length : 1).hidden, true);
    }
  }
});
