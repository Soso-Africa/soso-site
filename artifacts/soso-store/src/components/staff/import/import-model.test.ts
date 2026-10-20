import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogueImportRow } from "@workspace/api-client-react";
import {
  applySharedFacts, exactFolderSuggestion, markGroupsSaved, newGroupReview, normaliseDepartment, readinessBlockers,
  safeUploadName, slugCounts, toCatalogProduct, moveItem, type GroupReview,
} from "./import-model";

const row = (over: Partial<CatalogueImportRow> = {}): CatalogueImportRow => ({
  rowNumber: 2, slug: "adire-kaftan", name: "Adire Kaftan", department: "Unisex", category: "Kaftans",
  driveFolderId: "f1", fields: { "Product Description": "Hand-dyed.", Price: "" }, warnings: [], photoNames: [], ...over,
});

const ready = (g: GroupReview): GroupReview => ({
  ...g, department: "men", category: "Kaftans", accepted: true, rights: "Owned by SOSO atelier", coverKey: "b",
  photos: [
    { key: "a", name: "01.jpg", source: "drive", size: 1, mimeType: "image/jpeg", included: true, path: "/api/storage/objects/uploads/a", colourId: "indigo" },
    { key: "b", name: "02.jpg", source: "drive", size: 1, mimeType: "image/jpeg", included: true, path: "/api/storage/objects/uploads/b" },
    { key: "c", name: "03.jpg", source: "drive", size: 1, mimeType: "image/jpeg", included: false },
  ],
  colours: [{ id: "indigo", label: "Indigo", hex: "#2b3a67" }],
});

test("committed saved metadata preserves receipts and survives serialization without mutating other groups", () => {
  const groups = { 2: ready(newGroupReview(row())), 3: newGroupReview(row({ rowNumber: 3 })) };
  groups[2].saveError = "An earlier save failed";
  const saved = markGroupsSaved(groups, [2], "2026-10-20T12:00:00.000Z");
  assert.equal(saved[2]!.savedAt, "2026-10-20T12:00:00.000Z");
  assert.equal(saved[2]!.saveError, undefined);
  assert.equal(groups[2].savedAt, undefined);
  assert.equal(saved[3], groups[3]);
  const restored = JSON.parse(JSON.stringify(saved)) as typeof saved;
  assert.equal(restored[2]!.savedAt, saved[2]!.savedAt);
  assert.deepEqual(restored[2]!.photos, groups[2].photos);
  assert.equal(exactFolderSuggestion("download/parent/adire-kaftan", [row()], {}), 2);
});

test("unisex and unknown departments require explicit resolution", () => {
  assert.equal(normaliseDepartment("Unisex"), "");
  assert.equal(normaliseDepartment(" Women "), "women");
  assert.equal(newGroupReview(row()).department, "");
});

test("readiness requires acceptance, cover, department, rights and blocks existing slugs", () => {
  const g = newGroupReview(row());
  const blockers = readinessBlockers(row(), g, new Set(), slugCounts([row()]));
  assert.ok(blockers.some((b) => /department/.test(b)));
  assert.ok(blockers.some((b) => /cover/.test(b)));
  assert.ok(blockers.some((b) => /rights/.test(b)));
  assert.ok(blockers.some((b) => /Accept/.test(b)));
  assert.deepEqual(readinessBlockers(row(), ready(g), new Set(), slugCounts([row()])), []);
  assert.ok(readinessBlockers(row(), ready(g), new Set(["adire-kaftan"]), slugCounts([row()])).some((b) => /already exists/.test(b)));
  assert.ok(readinessBlockers(row(), ready(g), new Set(), slugCounts([row(), row({ rowNumber: 3 })])).some((b) => /more than one/.test(b)));
});

test("conversion forces a non-selling placeholder with chosen cover first and genuine colour previews", () => {
  const p = toCatalogProduct(row(), ready(newGroupReview(row())), 4);
  assert.equal(p.releaseState, "placeholder");
  assert.equal(p.fulfilmentState, "unavailable");
  assert.equal(p.price, 1);
  assert.deepEqual(p.sizes, ["To confirm"]);
  assert.equal(p.standardEligible, false);
  assert.equal(p.customEligible, false);
  assert.equal(p.commerceProductId, undefined);
  assert.equal(p.img, "/api/storage/objects/uploads/b");
  assert.equal(p.images.length, 2);
  assert.equal(p.colourOptions[0]!.previewImageSrc, "/api/storage/objects/uploads/a");
  assert.equal(p.description, "Hand-dyed.");
  assert.match(p.note, /PRICE UNKNOWN/);
});

test("conversion refuses photos that have not been uploaded", () => {
  const g = ready(newGroupReview(row()));
  g.photos[0] = { ...g.photos[0]!, path: undefined };
  assert.throws(() => toCatalogProduct(row(), g, 0), /not uploaded/);
});

test("shared facts touch only selected groups and never blank existing values", () => {
  const a = { ...newGroupReview(row()), fabric: "Aso-oke" };
  const b = newGroupReview(row({ rowNumber: 3 }));
  const next = applySharedFacts({ 2: a, 3: b }, [3], { fabric: "Cotton", fit: "", sizes: "S, M", colourLabel: "Ochre", colourHex: "#c48a2c", rights: "SOSO" });
  assert.equal(next[2]!.fabric, "Aso-oke");
  assert.equal(next[3]!.fabric, "Cotton");
  assert.deepEqual(next[3]!.sizes, ["S", "M"]);
  assert.equal(next[3]!.colours[0]!.id, "ochre");
  const keep = applySharedFacts({ 2: a }, [2], { fabric: "", fit: "", sizes: "", colourLabel: "", colourHex: "", rights: "" });
  assert.equal(keep[2]!.fabric, "Aso-oke");
});

test("folder suggestions are exact and unique only", () => {
  const rows = [row(), row({ rowNumber: 3, slug: "adire-kaftan-2" })];
  assert.equal(exactFolderSuggestion("adire-kaftan", rows, {}), 2);
  assert.equal(exactFolderSuggestion("adire", rows, {}), null);
  assert.equal(exactFolderSuggestion("Kaftan Shoot", rows, { 3: "kaftan shoot" }), 3);
});

test("upload names satisfy the media name pattern", () => {
  assert.match(safeUploadName("__ÉTÉ photo (1).HEIC", "image/jpeg"), /^[A-Za-z0-9][A-Za-z0-9._ -]{0,159}$/);
  assert.deepEqual(moveItem([1, 2, 3], 0, 2), [2, 3, 1]);
});

test("rescan keeps receipts only for unchanged content and flags changes", async () => {
  const { mergeDriveListing, canReuseGroup, folderCounts } = await import("./import-model");
  const base = { ...newGroupReview(row()), photos: [
    { key: "d:1", name: "a.jpg", source: "drive" as const, folderId: "f1", driveFileId: "1", size: 10, mimeType: "image/jpeg", md5: "m1", included: true, hash: "h", path: "/p1" },
    { key: "d:2", name: "b.jpg", source: "drive" as const, folderId: "f1", driveFileId: "2", size: 10, mimeType: "image/jpeg", modifiedTime: "t1", included: true, path: "/p2" },
  ] };
  const same = mergeDriveListing(base, "f1", [
    { id: "1", name: "a.jpg", size: 10, mimeType: "image/jpeg", md5Checksum: "m1" },
    { id: "2", name: "b.jpg", size: 10, mimeType: "image/jpeg", modifiedTime: "t1" },
  ]);
  assert.equal(same.changed, false);
  assert.equal(same.photos[0]!.path, "/p1");
  assert.equal(same.photos[1]!.path, "/p2");
  const edited = mergeDriveListing(base, "f1", [{ id: "1", name: "a.jpg", size: 10, mimeType: "image/jpeg", md5Checksum: "m2" }]);
  assert.equal(edited.changed, true);
  assert.equal(edited.photos.length, 1);
  assert.equal(edited.photos[0]!.path, undefined);
  assert.equal(canReuseGroup(row(), row()), true);
  assert.equal(canReuseGroup(row(), row({ driveFolderId: "f2" })), false);
  assert.equal(folderCounts([row(), row({ rowNumber: 3, slug: "x" })]).get("f1"), 2);
});

test("limits and shared-folder conflicts block saving until acknowledged", () => {
  const g = ready(newGroupReview(row()));
  const folders = new Map([["f1", 2]]);
  assert.ok(readinessBlockers(row(), g, new Set(), slugCounts([row()]), folders).some((b) => /shared/.test(b)));
  assert.deepEqual(readinessBlockers(row(), { ...g, folderAck: true }, new Set(), slugCounts([row()]), folders), []);
  const many = { ...g, photos: Array.from({ length: 41 }, (_, i) => ({ ...g.photos[0]!, key: `k${i}` })) };
  assert.ok(readinessBlockers(row(), many, new Set(), slugCounts([row()])).some((b) => /at most 40/.test(b)));
  const big = { ...g, photos: g.photos.map((p) => ({ ...p, size: 13 * 1024 * 1024 })) };
  assert.ok(readinessBlockers(row(), big, new Set(), slugCounts([row()])).some((b) => /12 MiB/.test(b)));
  assert.ok(readinessBlockers(row(), { ...g, sizes: ["x".repeat(41)] }, new Set(), slugCounts([row()])).some((b) => /40 characters/.test(b)));
});

test("shared facts clear acceptance; description prefers long description", async () => {
  const { descriptionFrom } = await import("./import-model");
  const g = { ...newGroupReview(row()), accepted: true };
  assert.equal(applySharedFacts({ 2: g }, [2], { fabric: "Silk", fit: "", sizes: "", colourLabel: "", colourHex: "", rights: "" })[2]!.accepted, false);
  assert.equal(descriptionFrom({ "Short description": "Short", "Long Description": " Long\ntext ", Description: "Mid" }), " Long\ntext ");
  assert.equal(descriptionFrom({ "Short description": "Short", Description: "Mid" }), "Mid");
  assert.equal(descriptionFrom({ "Short description": "Short" }), "Short");
});

test("category resolves only to an exact saved department collection", async () => {
  const { isKnownCategory, categoriesFor } = await import("./import-model");
  const collections = [{ department: "men", category: "Shirts" }, { department: "men", category: "Dashikis" }, { department: "women", category: "Tops" }];
  assert.equal(newGroupReview(row({ department: "Men", category: "Shirts" }), collections).category, "Shirts");
  assert.equal(newGroupReview(row({ department: "Men", category: "Dansiki" }), collections).category, "");
  assert.equal(newGroupReview(row({ department: "Women", category: "Shirts" }), collections).category, "");
  assert.equal(newGroupReview(row({ department: "Unisex", category: "Shirts" }), collections).category, "");
  assert.equal(isKnownCategory(collections, "women", "Shirts"), false);
  assert.deepEqual(categoriesFor(collections, "men"), ["Dashikis", "Shirts"]);
  const g = ready(newGroupReview(row()));
  assert.ok(readinessBlockers(row(), { ...g, category: "" }, new Set(), slugCounts([row()])).some((b) => /collection category/.test(b)));
  assert.ok(readinessBlockers(row(), g, new Set(), slugCounts([row()]), undefined, collections).some((b) => /not a saved men collection/.test(b)));
  assert.deepEqual(readinessBlockers(row(), g, new Set(), slugCounts([row()]), undefined, [{ department: "men", category: "Kaftans" }]), []);
  assert.equal(toCatalogProduct(row({ category: "Dansiki" }), { ...g, category: "Kaftans" }, 0).category, "Kaftans");
  assert.throws(() => toCatalogProduct(row(), { ...g, category: "" }, 0), /category unresolved/);
});
