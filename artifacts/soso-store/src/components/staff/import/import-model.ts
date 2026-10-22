import type { CatalogueImportRow } from "@workspace/api-client-react";
import type { CatalogProduct, ProductDepartment } from "../../../data/platformContent";

export const MAX_SHEET_BYTES = 650 * 1024;
export const MAX_PER_SAVE = 10;
export const PILOT_DEFAULT = 5;
export const PRICE_PLACEHOLDER = 1;
export const SIZES_PLACEHOLDER = ["To confirm"];
export const MAX_PHOTOS_PER_GROUP = 40;
export const MAX_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_COLOURS = 16;
export const MAX_SIZE_LEN = 40;
export const MAX_COLOUR_LABEL = 80;
export const MAX_ID_LEN = 64;
export const UPLOADABLE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type PhotoItem = {
  key: string;
  name: string;
  source: "drive" | "local";
  folderId?: string;
  driveFileId?: string;
  size: number;
  mimeType: string;
  md5?: string;
  modifiedTime?: string;
  hash?: string;
  path?: string;
  included: boolean;
  colourId?: string;
  error?: string;
};

export type CollectionRef = { department: string; category: string };

/** True only for an EXACT existing department+category collection. No fuzzy mapping. */
export function isKnownCategory(collections: CollectionRef[] | undefined, department: string, category: string): boolean {
  return Boolean(department && category && collections?.some((c) => c.department === department && c.category === category));
}

export function categoriesFor(collections: CollectionRef[] | undefined, department: string): string[] {
  return [...new Set((collections ?? []).filter((c) => c.department === department).map((c) => c.category))].sort();
}

export type ColourDraft = { id: string; label: string; hex: string };

export type GroupReview = {
  rowNumber: number;
  department: ProductDepartment | "";
  /** Resolved existing collection category — never raw spreadsheet text unless it matched exactly. */
  category: string;
  accepted: boolean;
  coverKey: string | null;
  photos: PhotoItem[];
  colours: ColourDraft[];
  fabric: string;
  fit: string;
  sizes: string[];
  rights: string;
  scan: { status: "idle" | "scanning" | "done" | "failed" | "unavailable"; error?: string; folderName?: string; warnings?: string[] };
  /** Staff explicitly acknowledged that this row's Drive folder is shared with another row. */
  folderAck?: boolean;
  savedAt?: string;
  saveError?: string;
};

export type SharedFacts = { fabric: string; fit: string; sizes: string; colourLabel: string; colourHex: string; rights: string };

/** A committed batch must be persisted before displaying success, not left to the review debounce. */
export function markGroupsSaved(groups: Record<number, GroupReview>, rows: number[], savedAt: string): Record<number, GroupReview> {
  const next = { ...groups };
  for (const n of rows) if (next[n]) next[n] = { ...next[n]!, savedAt, saveError: undefined };
  return next;
}

export function normaliseDepartment(raw: string): ProductDepartment | "" {
  const v = raw.trim().toLowerCase();
  if (["men", "man", "mens", "men's", "male"].includes(v)) return "men";
  if (["women", "woman", "womens", "women's", "female", "ladies"].includes(v)) return "women";
  if (["accessories", "accessory"].includes(v)) return "accessories";
  return ""; // unisex, blank or anything else must be resolved explicitly by Staff
}

export function newGroupReview(row: CatalogueImportRow, collections?: CollectionRef[]): GroupReview {
  const department = normaliseDepartment(row.department);
  const raw = row.category.trim();
  return {
    rowNumber: row.rowNumber,
    department,
    category: isKnownCategory(collections, department, raw) ? raw : "",
    accepted: false,
    coverKey: null,
    photos: [],
    colours: [],
    fabric: "",
    fit: "",
    sizes: [],
    rights: "",
    scan: { status: row.driveFolderId ? "idle" : "unavailable" },
  };
}

export function parseSizes(text: string): string[] {
  return text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

export function slugifyId(label: string): string {
  return label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, MAX_ID_LEN).replace(/-$/, "") || "colour";
}

type DriveFile = { id: string; name: string; size: number; mimeType: string; md5Checksum?: string; modifiedTime?: string };

/** Same Drive file ID is only "unchanged" when its content fingerprint matches; otherwise upload receipts are dropped. */
export function sameDriveContent(old: PhotoItem, f: DriveFile): boolean {
  if (old.size !== f.size || old.mimeType !== f.mimeType) return false;
  if (old.md5 || f.md5Checksum) return Boolean(old.md5 && f.md5Checksum && old.md5 === f.md5Checksum);
  return Boolean(old.modifiedTime && f.modifiedTime && old.modifiedTime === f.modifiedTime);
}

/** Merges a fresh Drive listing into a group. Any new, removed or changed photo clears acceptance. */
export function mergeDriveListing(g: GroupReview, folderId: string, files: DriveFile[]): { photos: PhotoItem[]; changed: boolean } {
  const prior = new Map(g.photos.map((p) => [p.key, p]));
  let changed = false;
  const fresh = new Map<string, PhotoItem>();
  for (const f of files) {
    const key = `d:${f.id}`;
    const old = prior.get(key);
    const same = old ? sameDriveContent(old, f) : false;
    if (!old || !same) changed = true;
    fresh.set(key, {
      key, name: f.name, source: "drive", folderId, driveFileId: f.id, size: f.size, mimeType: f.mimeType, md5: f.md5Checksum, modifiedTime: f.modifiedTime,
      included: old?.included ?? true, colourId: old?.colourId,
      ...(same ? { hash: old!.hash, path: old!.path } : {}),
    });
  }
  if (g.photos.some((p) => p.source === "drive" && !fresh.has(p.key))) changed = true;
  const kept = g.photos.filter((p) => p.source === "drive" && fresh.has(p.key)).map((p) => fresh.get(p.key)!);
  const added = [...fresh.values()].filter((p) => !prior.has(p.key));
  return { photos: [...kept, ...added, ...g.photos.filter((p) => p.source === "local")], changed };
}

/** A prior review is reused for a re-read row only when slug AND Drive folder are unchanged. */
export function canReuseGroup(prev: CatalogueImportRow | undefined, next: CatalogueImportRow): boolean {
  return Boolean(prev && prev.slug === next.slug && (prev.driveFolderId ?? "") === (next.driveFolderId ?? ""));
}

export function folderCounts(rows: CatalogueImportRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if (r.driveFolderId) m.set(r.driveFolderId, (m.get(r.driveFolderId) ?? 0) + 1);
  return m;
}

/** Applies confirmed shared facts only to the explicitly selected groups; blank shared fields leave groups untouched. */
export function applySharedFacts(groups: Record<number, GroupReview>, selected: number[], facts: SharedFacts): Record<number, GroupReview> {
  const next = { ...groups };
  const sizes = parseSizes(facts.sizes);
  for (const n of selected) {
    const g = next[n];
    if (!g) continue;
    const updated = { ...g };
    if (facts.fabric.trim()) updated.fabric = facts.fabric.trim();
    if (facts.fit.trim()) updated.fit = facts.fit.trim();
    if (sizes.length) updated.sizes = sizes;
    if (facts.rights.trim()) updated.rights = facts.rights.trim();
    if (facts.colourLabel.trim() && /^#[0-9a-f]{6}$/i.test(facts.colourHex)) {
      const id = slugifyId(facts.colourLabel);
      if (!updated.colours.some((c) => c.id === id)) updated.colours = [...updated.colours, { id, label: facts.colourLabel.trim(), hex: facts.colourHex }];
    }
    updated.accepted = false;
    next[n] = updated;
  }
  return next;
}

export type RowIssue = "missing" | "ambiguous" | "conflicting";

export function rowIssues(row: CatalogueImportRow, group: GroupReview | undefined, existingSlugs: Set<string>, sheetSlugCounts: Map<string, number>): RowIssue[] {
  const issues: RowIssue[] = [];
  const includedPhotos = group?.photos.filter((p) => p.included).length ?? 0;
  if (!row.driveFolderId && includedPhotos === 0) issues.push("missing");
  else if (group && group.scan.status === "done" && group.photos.length === 0) issues.push("missing");
  if (!group?.department || row.warnings.length > 0) issues.push("ambiguous");
  if (existingSlugs.has(row.slug) || (sheetSlugCounts.get(row.slug) ?? 0) > 1) issues.push("conflicting");
  return issues;
}

export function slugCounts(rows: CatalogueImportRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.slug, (m.get(r.slug) ?? 0) + 1);
  return m;
}

/** Blocking reasons before a group may be saved. Empty array means ready. */
export function readinessBlockers(row: CatalogueImportRow, g: GroupReview, existingSlugs: Set<string>, sheetSlugCounts: Map<string, number>, sheetFolderCounts?: Map<string, number>, collections?: CollectionRef[]): string[] {
  const out: string[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) out.push("Slug is not a valid storefront slug");
  if (existingSlugs.has(row.slug)) out.push("Slug already exists in the saved draft — this pilot never replaces products");
  if ((sheetSlugCounts.get(row.slug) ?? 0) > 1) out.push("Slug appears on more than one spreadsheet row");
  if (!g.department) out.push("Resolve department (men, women or accessories)");
  else if (!g.category) out.push("Choose an existing collection category for this department");
  else if (collections && !isKnownCategory(collections, g.department, g.category)) out.push(`“${g.category}” is not a saved ${g.department} collection`);
  const included = g.photos.filter((p) => p.included);
  if (included.length === 0) out.push("Include at least one photo");
  if (included.length > MAX_PHOTOS_PER_GROUP) out.push(`Include at most ${MAX_PHOTOS_PER_GROUP} photos (currently ${included.length})`);
  const big = included.filter((p) => p.size > MAX_FILE_BYTES);
  if (big.length) out.push(`${big.length} photo(s) exceed 12 MiB`);
  if (g.colours.length > MAX_COLOURS) out.push(`At most ${MAX_COLOURS} colours`);
  if (g.colours.some((c) => c.label.length > MAX_COLOUR_LABEL || c.id.length > MAX_ID_LEN)) out.push("A colour name is too long");
  if (g.sizes.some((s) => s.length > MAX_SIZE_LEN)) out.push(`Each size must be ${MAX_SIZE_LEN} characters or fewer`);
  const sharedFolder = row.driveFolderId && (sheetFolderCounts?.get(row.driveFolderId) ?? 0) > 1;
  if (sharedFolder && included.some((p) => p.source === "drive") && !g.folderAck) out.push("Drive folder is shared with another row — confirm these photos belong to this product");
  if (!g.coverKey || !included.some((p) => p.key === g.coverKey)) out.push("Choose a cover photo");
  if (!g.rights.trim()) out.push("Enter image rights text");
  const unsupported = included.filter((p) => p.mimeType && !UPLOADABLE_TYPES.includes(p.mimeType));
  if (unsupported.length) out.push(`${unsupported.length} photo(s) use an unsupported format`);
  if (!g.accepted) out.push("Accept the group after review");
  return out;
}

export function descriptionFrom(fields: Record<string, string>): string {
  const keys = Object.keys(fields);
  const norm = (k: string) => k.trim().toLowerCase().replace(/[_\s]+/g, " ");
  for (const want of ["long description", "description", "short description"]) {
    const key = keys.find((k) => norm(k) === want && fields[k]!.trim());
    if (key) return fields[key]!;
  }
  const loose = keys.find((k) => /description/i.test(k) && fields[k]!.trim());
  return loose ? fields[loose]! : "";
}

/** Converts a reviewed group into an unpublished, non-selling placeholder product. All photos must already carry server paths. */
export function toCatalogProduct(row: CatalogueImportRow, g: GroupReview, sortPriority: number): CatalogProduct {
  if (!g.department) throw new Error(`Row ${row.rowNumber}: department unresolved`);
  if (!g.category) throw new Error(`Row ${row.rowNumber}: category unresolved`);
  const included = g.photos.filter((p) => p.included);
  const missing = included.filter((p) => !p.path);
  if (missing.length) throw new Error(`Row ${row.rowNumber}: ${missing.length} photo(s) not uploaded`);
  const cover = included.find((p) => p.key === g.coverKey);
  if (!cover?.path) throw new Error(`Row ${row.rowNumber}: cover not chosen`);
  const ordered = [cover, ...included.filter((p) => p.key !== cover.key)];
  const provenance = { source: row.driveUrl ? "SOSO atelier Google Drive folder" : "SOSO atelier photo upload", rights: g.rights.trim(), ...(row.driveUrl ? { sourceUrl: row.driveUrl } : {}) };
  const images = ordered.map((p, i) => ({ src: p.path!, alt: `${row.name} — photo ${i + 1}`, provenance }));
  const colourOptions = g.colours.length
    ? g.colours.map((c) => {
        const preview = included.find((p) => p.colourId === c.id && p.path);
        return { id: c.id, label: c.label, hex: c.hex, ...(preview ? { previewImageSrc: preview.path } : {}) };
      })
    : [{ id: "to-confirm", label: "Colour to confirm", hex: "#8a8178" }];
  return {
    slug: row.slug,
    name: row.name.trim() || row.slug,
    img: cover.path,
    images,
    materialTurnSets: [],
    price: PRICE_PLACEHOLDER,
    tag: "Import draft",
    note: "PRICE UNKNOWN — internal placeholder of 1, not for sale. Spreadsheet description is unverified draft content.",
    category: g.category,
    department: g.department,
    releaseState: "placeholder",
    description: descriptionFrom(row.fields),
    sizes: g.sizes.length ? g.sizes : [...SIZES_PLACEHOLDER],
    relatedProductSlugs: [],
    colour: g.colours.map((c) => c.label).join(", ") || "Colour to confirm",
    colourOptions,
    allowCustomColour: false,
    fabric: g.fabric.trim() || "To be confirmed",
    fit: g.fit.trim() || "To be confirmed",
    searchableTerms: [],
    merchandising: { isNew: true, label: "Import draft", sortPriority },
    standardEligible: false,
    customEligible: false,
    standardSizes: [],
    readyNowSizes: [],
    fulfilmentState: "unavailable",
    dispatchMessage: "Dispatch timing will be confirmed before release.",
    unavailableMessage: "This product is being prepared for release.",
  };
}

/** Local folder → spreadsheet group suggestion: exact slug or exact Drive folder name only, never fuzzy. */
export function exactFolderSuggestion(dirName: string, rows: CatalogueImportRow[], folderNames: Record<number, string | undefined>): number | null {
  const d = dirName.split("/").at(-1)!.trim().toLowerCase();
  const hits = rows.filter((r) => r.slug === d || folderNames[r.rowNumber]?.trim().toLowerCase() === d);
  return hits.length === 1 ? hits[0]!.rowNumber : null;
}

export function safeUploadName(name: string, mimeType: string): string {
  const ext = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
  const base = name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._ -]/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 140) || "photo";
  return base + ext;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
