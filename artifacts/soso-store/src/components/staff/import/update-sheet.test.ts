import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import type { CatalogProduct } from "../../../data/platformContent";
// Round-trip the actual file bytes through the unchanged server parser, then the real review/save model.
import { parseCatalogueSpreadsheet } from "../../../../../api-server/src/lib/catalogue-import-sheet";
import { createUpdateSheet, updateSheetBatches, updateSheetRows, type UpdateSheetFormat } from "./update-sheet";
import { applySelectedChanges, buildUpdateReview, FIELD_DEFS, MAX_UPDATE_PRODUCTS, mappingErrors, sheetHeadings, suggestMapping, type FieldKey } from "./update-model";

const collections = [{ department: "men", category: "Kaftans" }];
const product = (overrides: Partial<CatalogProduct> = {}): CatalogProduct => ({
  slug: "saved-kaftan", name: "Saved kaftan", img: "", images: [], materialTurnSets: [], price: 85000,
  tag: "", note: "PRIVATE INTERNAL NOTE", category: "Kaftans", department: "men", releaseState: "placeholder",
  description: "", sizes: ["M", "XL / Tall"], colour: "Indigo", colourOptions: [],
  allowCustomColour: false, fabric: "To be confirmed", fit: "Relaxed", searchableTerms: [],
  merchandising: { isNew: false, sortPriority: 1 }, standardEligible: true, customEligible: true,
  standardSizes: ["M", "XL / Tall"], readyNowSizes: [], fulfilmentState: "unavailable", dispatchMessage: "Soon",
  variantPrices: { M: 85000, "XL / Tall": 95000, Custom: 120000 },
  commerceProductId: "PROTECTED-ID",
  ...overrides,
});
const parse = async (format: UpdateSheetFormat, blob: Blob) =>
  parseCatalogueSpreadsheet(`updates.${format}`, Buffer.from(await blob.arrayBuffer()), "update");
const review = (rows: Awaited<ReturnType<typeof parse>>["rows"], savedProducts: CatalogProduct[], mode: "fill" | "replace" = "fill") =>
  buildUpdateReview({ rows, mapping: suggestMapping(sheetHeadings(rows)), savedProducts, collections, mode });

test("only selected editable headings and exact saved identities are exported, all update cells blank", () => {
  const rows = updateSheetRows([product()], ["fabric", "price"]);
  assert.deepEqual(rows, [
    ["Slug", "Variant", "fabric", "price"],
    ["saved-kaftan", "", "", ""], ["saved-kaftan", "M", "", ""],
    ["saved-kaftan", "XL / Tall", "", ""], ["saved-kaftan", "Custom", "", ""],
  ]);
  assert.ok(!JSON.stringify(rows).includes("PRIVATE"));
  assert.ok(!JSON.stringify(rows).includes("PROTECTED"));
  assert.deepEqual(updateSheetRows([product({ customEligible: false })], ["fabric"]).map((r) => r[1]), ["Variant", "", "M", "XL / Tall"]);
  assert.deepEqual(updateSheetRows([product({ standardSizes: [], customEligible: false })], ["fabric"]), [
    ["Slug", "Variant", "fabric"], ["saved-kaftan", "", ""],
  ]);
  for (const field of ["releaseState", "businessApproval", "commerceProductId", "commerceVariantIds", "commerceMappingConfirmation", "slug"]) {
    assert.throws(() => updateSheetRows([product()], [field as FieldKey]), /supported editable/);
  }
  assert.throws(() => updateSheetRows([product()], []), /at least one/);
  assert.throws(() => updateSheetRows([product()], ["fabric", "fabric"]), /supported editable/);
  const all = updateSheetRows([product()], FIELD_DEFS.map((d) => d.key));
  assert.deepEqual(suggestMapping(all[0].slice(2)), Object.fromEntries(FIELD_DEFS.map((d) => [d.aliases[0], d.key])));
});

for (const format of ["csv", "xlsx"] as const) {
  test(`${format}: blank downloads, including non-price-only sheets, are no-ops in both review modes`, async () => {
    const saved = [product(), product({ slug: "other", standardSizes: [], customEligible: false })];
    const before = structuredClone(saved);
    for (const fields of [["fabric"], ["price"], FIELD_DEFS.map((d) => d.key)] as FieldKey[][]) {
      const sheet = await parse(format, await createUpdateSheet(saved, fields, format));
      for (const mode of ["fill", "replace"] as const) {
        const result = review(sheet.rows, saved, mode);
        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.changes, []);
        assert.deepEqual(applySelectedChanges(saved, result.changes, new Set(), collections), []);
      }
    }
    assert.deepEqual(saved, before);
  });

  test(`${format}: filled product field and one exact size price use the existing selected draft update path`, async () => {
    const saved = [product(), product({ slug: "untouched" })];
    const before = structuredClone(saved);
    const blob = await createUpdateSheet(saved, ["fabric", "price"], format);
    let edited: Blob;
    if (format === "csv") {
      const text = await blob.text();
      edited = new Blob([text.replace('"saved-kaftan","","",""', '"saved-kaftan","","Cotton",""')
        .replace('"saved-kaftan","XL / Tall","",""', '"saved-kaftan","XL / Tall","","99000"')]);
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(await blob.arrayBuffer()) as never);
      workbook.worksheets[0].getCell("C2").value = "Cotton";
      workbook.worksheets[0].getCell("D4").value = 99000;
      edited = new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())]);
    }
    const sheet = await parse(format, edited);
    const result = review(sheet.rows, saved, "replace");
    assert.deepEqual(result.errors, []);
    assert.equal(result.changes.length, 2);
    const price = result.changes.find((c) => c.variant === "XL / Tall")!;
    const selectedOnly = applySelectedChanges(saved, result.changes, new Set([price.id]), collections);
    assert.equal(selectedOnly.length, 1);
    assert.deepEqual(selectedOnly[0].variantPrices, { M: 85000, "XL / Tall": 99000, Custom: 120000 });
    assert.equal(selectedOnly[0].fabric, before[0].fabric);
    const both = applySelectedChanges(saved, result.changes, new Set(result.changes.map((c) => c.id)), collections);
    assert.equal(both[0].fabric, "Cotton");
    assert.equal(both[0].releaseState, before[0].releaseState);
    assert.equal(both[0].commerceProductId, before[0].commerceProductId);
    assert.deepEqual(saved, before);
    sheet.rows.find((r) => r.fields.Variant === "XL / Tall")!.fields.Variant = "xl / tall";
    assert.ok(review(sheet.rows, saved, "replace").errors.some((e) => e.message.includes("not an exact variant")));
    sheet.rows[0].slug = "unknown-slug";
    assert.ok(review(sheet.rows, saved, "replace").errors.some((e) => e.message.includes("never creates products")));
  });
}

test("Variant reference alone is not an editable mapping; non-price fields can accompany the reference", () => {
  assert.ok(mappingErrors({ Variant: "variant" }).length);
  assert.deepEqual(mappingErrors({ Variant: "variant", Fabric: "fabric" }), []);
});

test("batches keep whole products within existing 50-product and 1,000-row limits without omissions", () => {
  const products = Array.from({ length: 112 }, (_, i) => product({ slug: `product-${i}` }));
  const batches = updateSheetBatches(products);
  assert.deepEqual(batches.map((b) => b.products.length), [50, 50, 12]);
  assert.deepEqual(batches.flatMap((b) => b.products), products);
  assert.ok(batches.every((b) => b.rowCount <= 1000 && b.products.length <= MAX_UPDATE_PRODUCTS));
  const manySizes = Array.from({ length: 30 }, (_, i) => product({ slug: `large-${i}`, standardSizes: Array.from({ length: 40 }, (_, j) => `Size ${j}`) }));
  assert.deepEqual(updateSheetBatches(manySizes).map((b) => b.rowCount), [966, 294]);
  assert.deepEqual(updateSheetBatches([]), []);
  assert.throws(() => updateSheetBatches([product({ standardSizes: Array.from({ length: 1000 }, (_, i) => `${i}`) })]), /too many/);
  assert.equal(updateSheetRows(products, ["fabric"], { populated: true }).length, 449);
  assert.equal(updateSheetRows(manySizes, ["fabric"], { populated: true }).length, 1261);
  assert.throws(() => updateSheetRows(Array.from({ length: 1001 }, (_, i) => product({ slug: `too-many-${i}` })), ["fabric"]), /batch/);
});

test("CSV quoting preserves punctuation and Unicode; unsafe identity formulas require literal-string XLSX", async () => {
  const safe = product({ standardSizes: ['L, "Tall"', "Éxtra"], customEligible: false });
  const sheet = await parse("csv", await createUpdateSheet([safe], ["fabric"], "csv"));
  assert.deepEqual(sheet.rows.slice(1).map((r) => r.fields.Variant), safe.standardSizes);
  for (const choice of ["=1+1", "+SUM(1)", "-1", "@SUM(1)"]) {
    const saved = [product({ standardSizes: [choice] })];
    await assert.rejects(createUpdateSheet(saved, ["price"], "csv"), /CSV formula/);
    const parsed = await parse("xlsx", await createUpdateSheet(saved, ["price"], "xlsx"));
    assert.equal(parsed.rows[1].fields.Variant, choice);
  }
  for (const choice of ["", " M", "M "])
    assert.throws(() => updateSheetRows([product({ standardSizes: [choice] })], ["price"]), /correct|Correct/);
});

test("download rejects oversize files, and workbook import still uses only its first matching sheet", async () => {
  const large = product({ standardSizes: Array.from({ length: 100 }, (_, i) => `${i}${"x".repeat(8000)}`) });
  await assert.rejects(createUpdateSheet([large], ["price"], "csv"), /650 KiB/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await (await createUpdateSheet([product()], ["fabric"], "xlsx")).arrayBuffer()) as never);
  workbook.addWorksheet("Second updates").addRows([["Slug", "fabric"], ["saved-kaftan", "Must not import"]]);
  const parsed = await parse("xlsx", new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())]));
  assert.equal(parsed.sheetName, "Existing product updates");
  assert.equal(review(parsed.rows, [product()]).changes.length, 0);
  assert.ok(parsed.warnings.some((warning) => warning.includes("Second updates")));
});
