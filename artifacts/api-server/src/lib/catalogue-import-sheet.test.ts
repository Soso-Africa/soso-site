import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import { checkWorkbookBudget, driveFolderIdFromUrl, parseCatalogueCsv, parseCatalogueSpreadsheet, rowsToCatalogueSheet } from "./catalogue-import-sheet";

const path = new URL("../../../../attached_assets/0_SOSO_Online_Stock_Catalogue_-_New_Drive_Collection_-_Draft_1792484546301.xlsx", import.meta.url);

test("XLSX parsing skips an empty first sheet and preserves unconfirmed product metadata", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Sheet1");
  workbook.addWorksheet("Products").addRows([
    ["Name", "Slug", "Department", "Category", "Price (NGN)", "Fabric"],
    ["Sample Kaftan", "sample-kaftan", "men", "Kaftans", "TBD", ""],
  ]);
  const sheet = await parseCatalogueSpreadsheet("sample.xlsx", Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.equal(sheet.sheetName, "Products");
  assert.equal(sheet.rows[0].slug, "sample-kaftan");
  assert.equal(sheet.rows[0].fields["Price (NGN)"], "TBD");
  assert.equal(sheet.rows[0].fields.Fabric, "");
});

test("supplied SOSO workbook maps 162 products without treating prices or departments as approved", {
  skip: !existsSync(path) && "Merchant workbook is workspace-only; synthetic XLSX coverage still runs.",
}, async () => {
  const sheet = await parseCatalogueSpreadsheet("SOSO.xlsx", await readFile(path));
  assert.equal(sheet.rows.length, 162);
  assert.equal(sheet.sheetName, "New Collection - 162 Products");
  assert.equal(sheet.rows[0].slug, "onyx-womens-relaxed-short-sleeve-dansiki");
  assert.equal(sheet.rows[0].driveFolderId, "1y8kSk_FPNhmm-MGuTG-yD1TzTQiCy26u");
  assert.equal(sheet.rows[0].fields["Price (NGN)"], "TBD");
  assert.ok(sheet.rows[0].warnings.includes("Price is unverified."));
  assert.ok(sheet.rows.find((row) => row.department === "unisex")?.warnings.some((warning) => warning.startsWith("Resolve department")));
  assert.ok(sheet.rows.every((row) => row.photoNames.length === 0));
});

test("CSV supports BOM, quoted newlines, commas, escaped quotes, semicolons and missing cells", () => {
  const parsed = parseCatalogueCsv('\uFEFFName,Slug,Description\r\n"A ""dress"", blue",blue-dress,"Line1\nLine2"\r\nOther,other\r\n');
  assert.equal(parsed[1][0], 'A "dress", blue');
  assert.equal(parsed[1][2], "Line1\nLine2");
  assert.equal(parsed.length, 3);
  const sheet = rowsToCatalogueSheet("CSV", parsed);
  assert.equal(sheet.rows[1].fields.Description, "");
  assert.deepEqual(parseCatalogueCsv("Name;Slug\nA;a"), [["Name", "Slug"], ["A", "a"]]);
  assert.throws(() => parseCatalogueCsv('Name,Slug\n"unclosed,a'), /unclosed/);
});

test("mapping flags duplicate slugs and reused folders; does not infer an unisex department", () => {
  const url = "https://drive.google.com/drive/folders/folder_identifier123";
  const sheet = rowsToCatalogueSheet("Products", [
    ["Name", "Slug", "Department", "Drive folder"],
    ["A", "same", "unisex", url],
    ["B", "same", "men", url],
  ]);
  assert.equal(sheet.rows[0].department, "unisex");
  assert.ok(sheet.rows.every((row) => row.warnings.some((warning) => warning.includes("duplicate slug"))));
  assert.ok(sheet.rows.every((row) => row.warnings.some((warning) => warning.includes("shared by multiple"))));
  assert.throws(() => rowsToCatalogueSheet("Bad", [["Name", "Slug", "slug"], ["A", "a", "b"]]), /Duplicate/);
});

test("folder extraction rejects arbitrary hosts, files, credentials and insecure links", () => {
  for (const value of ["http://drive.google.com/drive/folders/abc123456789", "https://evil.com/drive/folders/abc123456789",
    "https://user:secret@drive.google.com/drive/folders/abc123456789", "https://drive.google.com/file/d/abc123456789/view"]) {
    assert.equal(driveFolderIdFromUrl(value), undefined);
  }
  assert.equal(driveFolderIdFromUrl("https://drive.google.com/drive/u/0/folders/abc123456789?usp=sharing"), "abc123456789");
});

test("unsupported, oversized and malformed workbooks are rejected before parsing", async () => {
  await assert.rejects(parseCatalogueSpreadsheet("bad.xlsm", Buffer.from("not Excel")), /xlsx/);
  await assert.rejects(parseCatalogueSpreadsheet("big.csv", Buffer.alloc(650 * 1024 + 1)), /650/);
  assert.throws(() => checkWorkbookBudget(Buffer.from("not zip")), /valid XLSX/);
  const bomb = Buffer.alloc(68);
  bomb.writeUInt32LE(0x02014b50, 0);
  bomb.writeUInt32LE(20 * 1024 * 1024, 24);
  bomb.writeUInt32LE(0x06054b50, 46);
  bomb.writeUInt16LE(1, 56);
  assert.throws(() => checkWorkbookBudget(bomb), /budget/);
});
