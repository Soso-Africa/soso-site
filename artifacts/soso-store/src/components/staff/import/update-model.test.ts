import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogProduct } from "../../../data/platformContent";
import { applySelectedChanges, buildUpdateReview, mappingErrors, parseMoney, suggestMapping, type UpdateRow } from "./update-model";

const cols = [{ department: "men", category: "Kaftans" }, { department: "women", category: "Gowns" }];
const product = (over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  slug: "adire-kaftan", name: "Adire Kaftan", img: "", images: [], materialTurnSets: [], price: 85000, tag: "", note: "",
  category: "Kaftans", department: "men", releaseState: "placeholder", description: "", sizes: ["M", "L"], colour: "Indigo",
  colourOptions: [{ id: "indigo", label: "Indigo", hex: "#223355" }], allowCustomColour: false, fabric: "To be confirmed", fit: "Relaxed",
  searchableTerms: [], merchandising: { isNew: true, sortPriority: 1 }, standardEligible: true, customEligible: true,
  standardSizes: ["M", "L"], readyNowSizes: [], fulfilmentState: "unavailable", dispatchMessage: "Soon",
  commerceMappingConfirmation: { productHash: "a", localHash: "b", snapshotHash: "c", snapshotFetchedAt: "", confirmedAt: "", confidence: 1, source: "manual", evidence: [], choiceLabels: {} },
  ...over,
});
const row = (n: number, slug: string, fields: Record<string, string>): UpdateRow => ({ rowNumber: n, slug, fields });
const build = (rows: UpdateRow[], saved: CatalogProduct[], mode: "fill" | "replace" = "fill") =>
  buildUpdateReview({ rows, mapping: suggestMapping(Object.keys(rows[0]!.fields)), mode, savedProducts: saved, collections: cols });

test("money parser rejects unsafe forms", () => {
  assert.equal(parseMoney("NGN 85,000.50"), 85000.5);
  assert.equal(parseMoney("₦1,200"), 1200);
  for (const bad of ["-5", "+5", "1e5", "Infinity", "0", "1,00", "12.345", "1000000001", "1,2345"]) assert.equal(parseMoney(bad), null, bad);
});

test("blank cells preserve values; fill-only skips existing; placeholders count as missing", () => {
  const r = build([row(2, "adire-kaftan", { Fabric: "Cotton adire", Fit: "Slim", Description: "" })], [product()]);
  assert.deepEqual(r.changes.map((c) => c.field), ["fabric"]);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.blankCells, 1);
});

test("false and zero-like values are not missing; booleans parse explicitly", () => {
  const r = build([row(2, "adire-kaftan", { "Allow custom colour": "yes" })], [product()]);
  assert.equal(r.changes.length, 0);
  assert.equal(r.skipped.length, 1);
  const bad = build([row(2, "adire-kaftan", { Featured: "maybe" })], [product()]);
  assert.equal(bad.errors.length, 1);
});

test("price=1 is unknown only with placeholder + PRICE UNKNOWN note", () => {
  const unknown = product({ price: 1, note: "PRICE UNKNOWN — placeholder" });
  assert.equal(build([row(2, "adire-kaftan", { Price: "90,000" })], [unknown]).changes.length, 1);
  assert.equal(build([row(2, "adire-kaftan", { Price: "90,000" })], [product({ price: 1 })]).changes.length, 0);
});

test("exact variant keys, multirow merge, duplicates and conflicts", () => {
  const ok = build([row(2, "adire-kaftan", { Variant: "M", Price: "90000" }), row(3, "adire-kaftan", { Variant: "Custom", Price: "120000" }),
    row(4, "adire-kaftan", { Variant: "M", Price: "90,000" })], [product()]);
  assert.equal(ok.errors.length, 0);
  assert.deepEqual(ok.changes.map((c) => c.variant), ["M", "Custom"]);
  assert.deepEqual(ok.changes[0]!.rows, [2, 4]);
  assert.equal(build([row(2, "adire-kaftan", { Variant: "m", Price: "1" })], [product()]).errors.length, 1);
  assert.equal(build([row(2, "adire-kaftan", { Variant: "Custom", Price: "1" })], [product({ customEligible: false })]).errors.length, 1);
  const conflict = build([row(2, "adire-kaftan", { Fabric: "A" }), row(3, "adire-kaftan", { Fabric: "B" })], [product()]);
  assert.equal(conflict.errors.length, 1);
});

test("unknown slugs and duplicate destinations block", () => {
  assert.equal(build([row(2, "Adire Kaftan", { Fabric: "x" })], [product()]).errors.length, 1);
  assert.ok(mappingErrors({ Fabric: "fabric", Material: "fabric" }).length > 0);
  assert.equal(suggestMapping(["Release State", "Commerce Product ID"])["Release State"], "ignore");
});

test("applies only selected changes to clones and clears mapping confirmation", () => {
  const saved = [product({ variantPrices: { L: 95000 } }), product({ slug: "other" })];
  const r = build([row(2, "adire-kaftan", { Fabric: "Adire cotton", Variant: "M", Price: "90000" })], saved);
  const fabric = r.changes.find((c) => c.field === "fabric")!;
  const out = applySelectedChanges(saved, r.changes, new Set([r.changes.find((c) => c.variant === "M")!.id]), cols);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0]!.variantPrices, { L: 95000, M: 90000 });
  assert.equal(out[0]!.fabric, "To be confirmed");
  assert.equal(out[0]!.commerceMappingConfirmation, undefined);
  assert.ok(saved[0]!.commerceMappingConfirmation);
  assert.equal(out[0]!.releaseState, "placeholder");
  assert.ok(fabric);
});

test("replace mode corrects existing values; category must be exact collection", () => {
  assert.equal(build([row(2, "adire-kaftan", { Fit: "Slim" })], [product()], "replace").changes.length, 1);
  assert.equal(build([row(2, "adire-kaftan", { Category: "Gowns" })], [product()], "replace").errors.length, 1);
});
