import type { CatalogProduct } from "../../../data/platformContent";
import { MAX_SHEET_BYTES } from "./import-model";
import { FIELD_DEFS, MAX_UPDATE_PRODUCTS, variantChoices, type FieldKey } from "./update-model";
import { ORIGINAL_VALUES_HEADING, MAX_UPDATE_SHEET_BYTES, MAX_UPDATE_SHEET_ROWS, exportFieldValue, fieldFingerprint } from "./update-reference";

export type UpdateSheetFormat = "csv" | "xlsx";
export type UpdateSheetBatch = { products: CatalogProduct[]; rowCount: number };
const MAX_ROWS = 1000;

/** Whole-product batches keep both the existing sheet and review/save budgets. */
export function updateSheetBatches(products: CatalogProduct[]): UpdateSheetBatch[] {
  const batches: UpdateSheetBatch[] = [];
  for (const product of products) {
    const rowCount = 1 + new Set(variantChoices(product)).size;
    if (rowCount > MAX_ROWS) throw new Error(`${product.slug} has too many size labels for one update sheet.`);
    let batch = batches.at(-1);
    if (!batch || batch.products.length >= Math.min(50, MAX_UPDATE_PRODUCTS) || batch.rowCount + rowCount > MAX_ROWS) {
      batch = { products: [], rowCount: 0 };
      batches.push(batch);
    }
    batch.products.push(product);
    batch.rowCount += rowCount;
  }
  return batches;
}

/** Allowlisted headings only. No saved facts, approvals, mappings or credentials leave here. */
export function updateSheetRows(products: CatalogProduct[], fields: readonly FieldKey[], options: { populated?: boolean } = {}): string[][] {
  const defs = FIELD_DEFS.filter((def) => fields.includes(def.key));
  if (!defs.length || new Set(fields).size !== fields.length || defs.length !== fields.length)
    throw new Error("Choose at least one supported editable field.");
  if (!products.length || products.length > MAX_UPDATE_PRODUCTS)
    throw new Error(`Choose a batch of 1–${MAX_UPDATE_PRODUCTS} saved products.`);
  const rows: string[][] = [["Slug", "Variant", ...defs.map((def) => def.aliases[0]), ...(options.populated ? [ORIGINAL_VALUES_HEADING] : [])]];
  const seen = new Set<string>();
  for (const product of products) {
    if (seen.has(product.slug)) throw new Error("Duplicate saved slugs must be resolved before downloading.");
    seen.add(product.slug);
    const choices = variantChoices(product);
    if (choices.some((choice) => !choice.trim()))
      throw new Error(`${product.slug}: correct empty saved size labels before downloading.`);
    const labels = ["", ...new Set(choices)];
    for (const variant of labels) {
      if (!product.slug || product.slug.trim() !== product.slug || variant.trim() !== variant || variant.length > 10_000
        || /[\r\n\u0000]/.test(product.slug + variant))
        throw new Error(`${product.slug}: identity labels cannot round-trip exactly. Correct the saved slug or size labels first.`);
      const values = Object.fromEntries(defs.map((def) => [def.key,
        options.populated && (!variant || def.key === "price") ? exportFieldValue(product, def.key, variant) : "",
      ]));
      rows.push([product.slug, variant, ...defs.map((def) => values[def.key]),
        ...(options.populated ? [JSON.stringify({ version: 1, slug: product.slug, variant,
          values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, fieldFingerprint(value)])),
        })] : []),
      ]);
    }
  }
  if (rows.length - 1 > MAX_UPDATE_SHEET_ROWS) throw new Error("Choose fewer products: the update sheet limit is 10,000 rows.");
  return rows;
}

export async function createUpdateSheet(products: CatalogProduct[], fields: readonly FieldKey[], format: UpdateSheetFormat, options: { populated?: boolean } = {}): Promise<Blob> {
  const rows = updateSheetRows(products, fields, options);
  let blob: Blob;
  if (format === "csv") {
    // Quoting alone does not stop Excel interpreting formula-looking identity cells.
    // Do not prefix an apostrophe: that would break the exact size-label match.
    if (rows.some((row) => row.some((cell) => /^[\s]*[=+@\-\t\r]/.test(cell))))
      throw new Error("A saved identity label could be read as a CSV formula. Choose Excel (.xlsx) to preserve it safely.");
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    blob = new Blob(["\uFEFF", csv, "\r\n"], { type: "text/csv;charset=utf-8" });
  } else {
    // Keep the workbook library out of the initial storefront bundle.
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Existing product updates");
    sheet.addRows(rows); // Strings, never formula objects (including formula-looking size labels).
    sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column, i) => { column.width = i === 0 ? 38 : 26; });
    if (options.populated) sheet.getColumn(rows[0].length).hidden = true;
    const bytes = await workbook.xlsx.writeBuffer();
    blob = new Blob([new Uint8Array(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  const maxBytes = options.populated ? MAX_UPDATE_SHEET_BYTES : MAX_SHEET_BYTES;
  if (blob.size > maxBytes) throw new Error(`This download exceeds ${options.populated ? "2 MiB" : "650 KiB"}. Choose fewer fields/products or use Excel for a smaller file.`);
  return blob;
}
