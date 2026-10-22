import ExcelJS from "exceljs";
import { inflateRawSync } from "node:zlib";
import type { CatalogueImportRow, CatalogueImportSheet } from "@workspace/api-zod";

export const MAX_IMPORT_SHEET_BYTES = 650 * 1024;
const MAX_ROWS = 1000;
const MAX_COLUMNS = 80;
const normal = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Only exact known headings are mapped. Unknown columns remain in fields for review. */
export function rowsToCatalogueSheet(sheetName: string, rows: string[][]): CatalogueImportSheet {
  const headerIndex = rows.findIndex((row, index) => index < 20
    && row.some((cell) => ["newsiteslug", "slug", "productslug"].includes(normal(cell)))
    && row.some((cell) => ["name", "productname", "proposedname"].includes(normal(cell))));
  if (headerIndex < 0) throw new Error("No Name and New-site slug headings were found. Keep the workbook headings, or use Name and Slug in CSV.");
  const headers = rows[headerIndex].map((cell) => cell.trim());
  const nonempty = headers.filter(Boolean).map(normal);
  if (new Set(nonempty).size !== nonempty.length) throw new Error("Duplicate spreadsheet headings must be resolved before importing.");
  const result: CatalogueImportRow[] = [];
  for (let index = headerIndex + 1; index < rows.length; index++) {
    const values = rows[index];
    if (!values.some((value) => value.trim())) continue;
    if (result.length >= MAX_ROWS) throw new Error("Import at most 1,000 product rows per spreadsheet.");
    const fields: Record<string, string> = Object.create(null);
    headers.forEach((header, col) => { if (header) fields[header] = (values[col] ?? "").trim(); });
    const get = (...aliases: string[]) => {
      for (const alias of aliases) {
        const header = headers.find((heading) => normal(heading) === normal(alias));
        if (header && fields[header]) return fields[header];
      }
      return "";
    };
    const slug = get("New-site slug", "Slug", "Product slug");
    const name = get("Proposed Name", "Name", "Product Name");
    const department = get("Department").toLowerCase();
    const category = get("Proposed category", "Category");
    const driveUrl = get("Drive Product / Image Link", "Drive folder", "Drive URL");
    const driveFolderId = driveFolderIdFromUrl(driveUrl);
    const warnings: string[] = [];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160) warnings.push("A valid unique product slug is required.");
    if (!name) warnings.push("Product name is missing.");
    if (!["men", "women", "accessories"].includes(department)) warnings.push("Resolve department explicitly: men, women or accessories. Unisex is not an automatic match.");
    if (!category) warnings.push("Category is missing.");
    if (!driveFolderId) warnings.push("No valid Drive product-folder link; assign local photos instead.");
    for (const [label, value] of [
      ["Price", get("Price (NGN)", "Price")], ["Sizes", get("Sizes")],
      ["Fabric", get("Fabric")], ["Fit", get("Fit")],
      ["SKU", get("SKU / Product ID", "SKU")], ["Inventory", get("Inventory Qty", "Stock")],
    ]) {
      if (!value || /\b(tbd|confirm|pending|unknown)\b/i.test(value)) warnings.push(`${label} is unverified.`);
    }
    if (get("Long description", "Description")) warnings.push("Spreadsheet description is draft copy, not approved product evidence.");
    if (get("Category review needed").toLowerCase() === "yes") warnings.push("Category needs atelier review.");
    if (get("Colour review needed").toLowerCase() === "yes") warnings.push("Colour needs atelier review.");
    const missing = get("Review / Missing Information");
    if (missing) warnings.push(`Source review: ${missing}`);
    result.push({
      rowNumber: index + 1, slug, name, department, category, fields, warnings,
      ...(driveFolderId ? { driveFolderId, driveUrl } : {}),
      photoNames: get("All Renamed Photo Filenames").split(/[|;\n]+/).map((value) => value.trim()).filter(Boolean),
    });
  }
  const counts = new Map<string, number>();
  const folders = new Map<string, number>();
  for (const row of result) {
    counts.set(row.slug, (counts.get(row.slug) ?? 0) + 1);
    if (row.driveFolderId) folders.set(row.driveFolderId, (folders.get(row.driveFolderId) ?? 0) + 1);
  }
  for (const row of result) {
    if ((counts.get(row.slug) ?? 0) > 1) row.warnings.push("Conflicting duplicate slug in this spreadsheet.");
    if (row.driveFolderId && (folders.get(row.driveFolderId) ?? 0) > 1) row.warnings.push("Conflicting Drive folder shared by multiple product rows; review before accepting.");
  }
  return { sheetName, rows: result, warnings: ["Preview only. Prices, stock, sizes, business claims and JusticeSure mappings are not approved by this import."] };
}

export function driveFolderIdFromUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "drive.google.com" || url.username || url.password) return undefined;
    const id = /^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,160})\/?$/.exec(url.pathname)?.[1];
    return id;
  } catch { return undefined; }
}

export function parseCatalogueCsv(text: string): string[][] {
  // RFC4180 quoting, including embedded newlines. Support common Excel CSV delimiters.
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
  const delimiter = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const pushCell = () => {
    if (cell.length > 10_000 || row.length >= MAX_COLUMNS) throw new Error("Spreadsheet cells or column count exceed the import budget.");
    row.push(cell); cell = ""; closed = false;
  };
  const pushRow = () => {
    pushCell(); rows.push(row); row = [];
    if (rows.length > MAX_ROWS + 21) throw new Error("Spreadsheet exceeds 1,000 product rows.");
  };
  text = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"' && !cell && !closed) quoted = true;
    else if (char === delimiter) pushCell();
    else if (char === "\r" || char === "\n") { if (char === "\r" && text[index + 1] === "\n") index++; pushRow(); }
    else {
      if (closed) throw new Error("Malformed CSV quoting. Export the file as UTF-8 CSV again.");
      cell += char;
    }
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  if (cell || row.length || closed) pushRow();
  return rows;
}

/** Check the ZIP central directory before ExcelJS decompresses any workbook entry. */
export function checkWorkbookBudget(bytes: Buffer): void {
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index--) {
    if (bytes.readUInt32LE(index) === 0x06054b50) { end = index; break; }
  }
  if (end < 0) throw new Error("Not a valid XLSX workbook.");
  const entries = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16), total = 0;
  if (entries > 2000 || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) throw new Error("Unsupported workbook archive.");
  for (let entry = 0; entry < entries; entry++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid workbook directory.");
    const size = bytes.readUInt32LE(cursor + 24);
    total += size;
    if (size > 8 * 1024 * 1024 || total > 16 * 1024 * 1024) throw new Error("Workbook expands beyond the import budget. Split it into smaller sheets.");
    const compressed = bytes.readUInt32LE(cursor + 20);
    const method = bytes.readUInt16LE(cursor + 10);
    const offset = bytes.readUInt32LE(cursor + 42);
    if (bytes.readUInt16LE(cursor + 8) & 1 || ![0, 8].includes(method)
      || offset + 30 > end || bytes.readUInt32LE(offset) !== 0x04034b50) throw new Error("Unsupported workbook compression.");
    const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
    if (start + compressed > end) throw new Error("Invalid compressed workbook entry.");
    const data = bytes.subarray(start, start + compressed);
    // A forged central-directory size must not let ExcelJS expand a ZIP bomb.
    const expanded = method === 8 ? inflateRawSync(data, { maxOutputLength: Math.max(1, size) }) : data;
    if (expanded.length !== size) throw new Error("Workbook entry size does not match its directory.");
    cursor += 46 + bytes.readUInt16LE(cursor + 28) + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
  }
}

export async function parseCatalogueSpreadsheet(name: string, bytes: Buffer): Promise<CatalogueImportSheet> {
  if (!bytes.length || bytes.length > MAX_IMPORT_SHEET_BYTES) throw new Error("Choose a nonempty Excel/CSV file no larger than 650 KiB.");
  if (/\.csv$/i.test(name)) return rowsToCatalogueSheet(name, parseCatalogueCsv(bytes.toString("utf8")));
  if (!/\.xlsx$/i.test(name)) throw new Error("Use an .xlsx workbook or UTF-8 .csv file.");
  checkWorkbookBudget(bytes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  let selected: CatalogueImportSheet | undefined;
  const others: string[] = [];
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > MAX_ROWS + 21 || sheet.columnCount > MAX_COLUMNS) throw new Error("Workbook sheet exceeds the row or column budget.");
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let col = 1; col <= sheet.columnCount; col++) {
        const cell = row.getCell(col);
        const value = cell.value;
        // Never execute formulas, nor adopt cached formula output as merchant facts.
        const text = value && typeof value === "object" && ("formula" in value || "sharedFormula" in value) ? "" : cell.text;
        if (text.length > 10_000) throw new Error("Workbook cell exceeds 10,000 characters.");
        cells.push(text);
      }
      rows.push(cells);
    });
    const hasHeader = rows.slice(0, 20).some((row) => row.some((cell) => ["newsiteslug", "slug", "productslug"].includes(normal(cell))));
    if (!hasHeader) { if (sheet.actualRowCount) others.push(sheet.name); continue; }
    const parsed = rowsToCatalogueSheet(sheet.name, rows);
    if (!selected) selected = parsed;
    else others.push(sheet.name);
  }
  if (!selected) throw new Error("No product sheet with Name and New-site slug headings was found.");
  if (others.length) selected.warnings.push(`Other sheets were not imported: ${others.join(", ")}.`);
  return selected;
}
