import type { CatalogProduct, ProductDepartment } from "../../../data/platformContent";
import { ORIGINAL_VALUES_HEADING, exportFieldValue, fieldFingerprint } from "./update-reference";

/** Pure model for the "Update existing products" spreadsheet flow. Never creates products, never publishes. */

export const MAX_UPDATE_PRODUCTS = 1000;
export const MAX_MONEY_NGN = 1_000_000_000;
export const MAX_TEXT = 4000;
export const MAX_LIST_ITEM = 120;

export type UpdateRow = { rowNumber: number; slug: string; fields: Record<string, string> };
export type UpdateMode = "fill" | "replace";
export type FieldKind = "text" | "list" | "bool" | "money" | "enum" | "category" | "json";

export type FieldKey =
  | "name" | "description" | "fabric" | "fit" | "colour" | "composition" | "care" | "delivery" | "returns"
  | "tag" | "note" | "dispatchMessage" | "unavailableMessage" | "department" | "category" | "fulfilmentState"
  | "sizes" | "standardSizes" | "readyNowSizes" | "searchableTerms" | "relatedProductSlugs"
  | "standardEligible" | "customEligible" | "featured" | "allowCustomColour" | "price"
  | "colourOptions" | "images" | "materialTurnSets" | "merchandising";

export type Destination = "ignore" | "variant" | FieldKey;

type FieldDef = { key: FieldKey; label: string; kind: FieldKind; aliases: string[]; options?: string[] };

export const FIELD_DEFS: FieldDef[] = [
  { key: "name", label: "Name", kind: "text", aliases: ["name", "productname", "title"] },
  { key: "description", label: "Description", kind: "text", aliases: ["description", "longdescription", "productdescription", "shortdescription"] },
  { key: "fabric", label: "Fabric", kind: "text", aliases: ["fabric", "material", "materials"] },
  { key: "fit", label: "Fit", kind: "text", aliases: ["fit", "silhouette"] },
  { key: "colour", label: "Colour (display text)", kind: "text", aliases: ["colour", "color", "colours", "colors"] },
  { key: "composition", label: "Composition", kind: "text", aliases: ["composition", "fibrecontent", "fibercontent"] },
  { key: "care", label: "Care", kind: "text", aliases: ["care", "careinstructions"] },
  { key: "delivery", label: "Delivery", kind: "text", aliases: ["delivery", "deliverynote"] },
  { key: "returns", label: "Returns", kind: "text", aliases: ["returns", "returnsnote", "returnpolicy"] },
  { key: "tag", label: "Tag", kind: "text", aliases: ["tag", "badge"] },
  { key: "note", label: "Internal note", kind: "text", aliases: ["note", "notes", "internalnote"] },
  { key: "dispatchMessage", label: "Dispatch message", kind: "text", aliases: ["dispatchmessage", "dispatch"] },
  { key: "unavailableMessage", label: "Unavailable message", kind: "text", aliases: ["unavailablemessage"] },
  { key: "department", label: "Department", kind: "enum", aliases: ["department", "dept"], options: ["men", "women", "accessories"] },
  { key: "category", label: "Category (exact collection)", kind: "category", aliases: ["category", "collection"] },
  { key: "fulfilmentState", label: "Fulfilment state", kind: "enum", aliases: ["fulfilmentstate", "fulfillmentstate", "fulfilment", "fulfillment"], options: ["ready_now", "made_immediately", "unavailable"] },
  { key: "sizes", label: "Sizes (list)", kind: "list", aliases: ["sizes", "sizelist"] },
  { key: "standardSizes", label: "Standard sizes (list)", kind: "list", aliases: ["standardsizes"] },
  { key: "readyNowSizes", label: "Ready-now sizes (list)", kind: "list", aliases: ["readynowsizes", "readysizes"] },
  { key: "searchableTerms", label: "Search terms (list)", kind: "list", aliases: ["searchableterms", "searchterms", "keywords"] },
  { key: "relatedProductSlugs", label: "Related product slugs (list)", kind: "list", aliases: ["relatedproductslugs", "relatedproducts", "related"] },
  { key: "standardEligible", label: "Standard eligible", kind: "bool", aliases: ["standardeligible"] },
  { key: "customEligible", label: "Custom eligible", kind: "bool", aliases: ["customeligible"] },
  { key: "featured", label: "Featured", kind: "bool", aliases: ["featured"] },
  { key: "allowCustomColour", label: "Allow custom colour", kind: "bool", aliases: ["allowcustomcolour", "allowcustomcolor", "customcolour"] },
  { key: "price", label: "Price NGN (base, or per variant with Variant)", kind: "money", aliases: ["price", "baseprice", "pricengn", "amount"] },
  { key: "colourOptions", label: "Colour options (JSON)", kind: "json", aliases: ["colouroptionsjson", "coloroptionsjson"] },
  { key: "images", label: "Images (JSON, existing paths)", kind: "json", aliases: ["imagesjson"] },
  { key: "materialTurnSets", label: "Material turn sets (JSON)", kind: "json", aliases: ["materialturnsetsjson"] },
  { key: "merchandising", label: "Merchandising (JSON)", kind: "json", aliases: ["merchandisingjson"] },
];

export const VARIANT_ALIASES = ["variant", "variantlabel", "size", "sizelabel", "choice"];
/** Headings that name protected data. They are always ignored and reported. */
export const PROTECTED_HEADINGS = [
  "slug", "legacymigration", "releasestate", "approval", "approved", "businessapproval", "commercemappingconfirmation",
  "commerceproductid", "commercevariantids", "colourvisualizer", "colorvisualizer", "variantprices", "img",
];

export const PLACEHOLDER_TEXT = ["to be confirmed", "colour to confirm", "color to confirm", "to confirm", "tbd", "tbc", "not specified", "pending"];

const defOf = (k: FieldKey) => FIELD_DEFS.find((d) => d.key === k)!;
export const fieldLabel = (d: Destination) => d === "ignore" ? "Ignore" : d === "variant" ? "Variant / size label" : defOf(d).label;
export const normHeading = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
export const isProtectedHeading = (h: string) => h === ORIGINAL_VALUES_HEADING || PROTECTED_HEADINGS.includes(normHeading(h));

export function sheetHeadings(rows: UpdateRow[]): string[] {
  const seen: string[] = [];
  for (const r of rows) for (const k of Object.keys(r.fields)) if (!seen.includes(k) && normHeading(k) !== "slug" && k !== ORIGINAL_VALUES_HEADING) seen.push(k);
  return seen;
}

export function suggestMapping(headings: string[]): Record<string, Destination> {
  const out: Record<string, Destination> = {};
  const used = new Set<Destination>();
  for (const h of headings) {
    const n = normHeading(h);
    let d: Destination = "ignore";
    if (!isProtectedHeading(h)) {
      if (VARIANT_ALIASES.includes(n)) d = "variant";
      else d = FIELD_DEFS.find((f) => f.aliases.includes(n))?.key ?? "ignore";
    }
    if (d !== "ignore" && used.has(d)) d = "ignore";
    used.add(d);
    out[h] = d;
  }
  return out;
}

export function mappingErrors(mapping: Record<string, Destination>): string[] {
  const errs: string[] = [];
  const byDest = new Map<Destination, string[]>();
  for (const [h, d] of Object.entries(mapping)) {
    if (d === "ignore") continue;
    if (isProtectedHeading(h)) errs.push(`"${h}" is protected and cannot be imported.`);
    byDest.set(d, [...(byDest.get(d) ?? []), h]);
  }
  for (const [d, hs] of byDest) if (hs.length > 1) errs.push(`${hs.map((h) => `"${h}"`).join(" and ")} both map to ${fieldLabel(d)}. Set all but one to Ignore.`);
  // Variant is identity/reference metadata, also present on downloaded non-price sheets.
  if (![...byDest.keys()].some((d) => d !== "variant")) errs.push("Map at least one column to a field.");
  return errs;
}

// ---------- Value parsing ----------

export function parseMoney(raw: string): number | null {
  let s = raw.trim().replace(/^(NGN|₦)\s*/i, "").replace(/\s*NGN$/i, "").trim();
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return null;
  s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_MONEY_NGN) return null;
  return n;
}

export function parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "yes") return true;
  if (v === "false" || v === "no") return false;
  return null;
}

export function parseList(raw: string): string[] {
  const seen: string[] = [];
  for (const s of raw.split(/[|;]/).map((x) => x.trim()).filter(Boolean)) if (!seen.includes(s)) seen.push(s);
  return seen;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const validMedia = (m: unknown) => isObj(m) && isStr(m.src) && typeof m.alt === "string" && isObj(m.provenance) && isStr(m.provenance.source) && isStr(m.provenance.rights);

function parseJsonField(key: FieldKey, raw: string): { value?: unknown; error?: string } {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return { error: "is not valid JSON" }; }
  if (key === "merchandising") {
    if (!isObj(v) || typeof v.isNew !== "boolean" || typeof v.sortPriority !== "number" || !Number.isFinite(v.sortPriority) || (v.label !== undefined && typeof v.label !== "string"))
      return { error: "must be {\"isNew\":true|false,\"sortPriority\":number,\"label\"?:text}" };
    return { value: { isNew: v.isNew, sortPriority: v.sortPriority, ...(typeof v.label === "string" ? { label: v.label } : {}) } };
  }
  if (!Array.isArray(v) || v.length === 0) return { error: "must be a non-empty JSON array" };
  if (key === "colourOptions" && !v.every((c) => isObj(c) && isStr(c.id) && isStr(c.label) && typeof c.hex === "string" && /^#[0-9a-f]{6}$/i.test(c.hex)))
    return { error: "needs objects with id, label and #rrggbb hex" };
  if (key === "images" && !v.every(validMedia)) return { error: "needs objects with src, alt and provenance {source, rights} using already-uploaded paths" };
  if (key === "materialTurnSets" && !v.every((t) => isObj(t) && isStr(t.id) && isStr(t.label) && validMedia(t.front) && validMedia(t.back)))
    return { error: "needs objects with id, label, front and back media" };
  return { value: v };
}

export function parseFieldValue(key: FieldKey, raw: string): { value?: unknown; error?: string } {
  const d = defOf(key);
  const t = raw.trim();
  switch (d.kind) {
    case "text": case "category":
      return t.length > MAX_TEXT ? { error: `is longer than ${MAX_TEXT} characters` } : { value: t };
    case "enum": {
      const v = t.toLowerCase().replace(/[\s-]+/g, "_");
      return d.options!.includes(v) ? { value: v } : { error: `must be one of ${d.options!.join(", ")}` };
    }
    case "list": {
      const list = parseList(t);
      if (list.length === 0) return { error: "has no list items" };
      if (list.some((x) => x.length > MAX_LIST_ITEM)) return { error: `has an item longer than ${MAX_LIST_ITEM} characters` };
      return { value: list };
    }
    case "bool": { const b = parseBool(t); return b === null ? { error: "must be true, false, yes or no" } : { value: b }; }
    case "money": { const m = parseMoney(t); return m === null ? { error: "is not a valid NGN amount (above 0, at most 2 decimals, up to 1,000,000,000)" } : { value: m }; }
    case "json": return parseJsonField(key, t);
  }
}

// ---------- Missing detection ----------

export const isPlaceholderText = (s: string) => PLACEHOLDER_TEXT.includes(s.trim().toLowerCase());
export const isUnknownPrice = (p: CatalogProduct) => p.price === 1 && p.releaseState === "placeholder" && /PRICE UNKNOWN/.test(p.note ?? "");

export function isMissing(p: CatalogProduct, key: FieldKey): boolean {
  if (key === "price") return isUnknownPrice(p);
  const v = (p as Record<string, unknown>)[key];
  if (v === undefined || v === null) return true;
  if (typeof v === "boolean" || typeof v === "number") return false;
  if (typeof v === "string") return v.trim() === "" || isPlaceholderText(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return true;
    if (key === "colourOptions") return v.length === 1 && ["to-confirm", "not-specified"].includes((v[0] as { id: string }).id);
    return v.every((x) => typeof x === "string" && isPlaceholderText(x));
  }
  return false;
}

export function variantChoices(p: CatalogProduct): string[] {
  return [...p.standardSizes, ...(p.customEligible ? ["Custom"] : [])];
}

// ---------- Review ----------

export type ProposedChange = {
  id: string; slug: string; productName: string; field: FieldKey | "variantPrice"; label: string;
  variant?: string; before: string; after: string; value: unknown; rows: number[];
};
export type SkippedItem = { slug: string; label: string; reason: string; rows: number[] };
export type RowError = { rows: number[]; message: string };
export type UpdateReview = { changes: ProposedChange[]; skipped: SkippedItem[]; errors: RowError[]; unchanged: number; blankCells: number; blankVariantPrices: number; productCount: number };

const stable = (v: unknown) => JSON.stringify(v);

export function formatValue(v: unknown, money = false): string {
  if (v === undefined || v === null || v === "") return "(empty)";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return money ? `NGN ${v.toLocaleString("en-NG", { maximumFractionDigits: 2 })}` : String(v);
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v.length ? v.join(" | ") : "(empty)";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

type Collected = { slug: string; field: FieldKey | "variantPrice"; variant?: string; value: unknown; rows: number[] };

export function buildUpdateReview(input: {
  rows: UpdateRow[]; mapping: Record<string, Destination>; mode: UpdateMode;
  savedProducts: CatalogProduct[]; collections: { department: string; category: string }[];
}): UpdateReview {
  const { rows, mapping, mode, savedProducts, collections } = input;
  const errors: RowError[] = mappingErrors(mapping).map((message) => ({ rows: [], message }));
  const skipped: SkippedItem[] = [];
  const bySlug = new Map(savedProducts.map((p) => [p.slug, p]));
  const entries = Object.entries(mapping).filter((e): e is [string, Exclude<Destination, "ignore">] => e[1] !== "ignore");
  const variantHeading = entries.find(([, d]) => d === "variant")?.[0];
  const collected = new Map<string, Collected>();
  let blankCells = 0;
  let blankVariantPrices = 0;
  let unchanged = 0;

  const put = (c: Omit<Collected, "rows">, row: number) => {
    const key = `${c.slug}\u0000${c.field}\u0000${c.variant ?? ""}`;
    const prev = collected.get(key);
    if (!prev) { collected.set(key, { ...c, rows: [row] }); return; }
    if (stable(prev.value) !== stable(c.value)) {
      errors.push({ rows: [...prev.rows, row], message: `${c.slug}: conflicting values for ${c.variant ? `variant "${c.variant}" price` : fieldLabel(c.field as FieldKey)} (${formatValue(prev.value, c.field !== "variantPrice" ? c.field === "price" : true)} vs ${formatValue(c.value, c.field === "price" || c.field === "variantPrice")}).` });
      return;
    }
    prev.rows.push(row);
  };

  if (errors.length === 0) for (const r of rows) {
    const slug = r.slug.trim();
    if (!slug) { errors.push({ rows: [r.rowNumber], message: `Row ${r.rowNumber}: Slug is blank.` }); continue; }
    const product = bySlug.get(slug);
    if (!product) { errors.push({ rows: [r.rowNumber], message: `Row ${r.rowNumber}: no saved product has the exact slug "${slug}". This flow never creates products.` }); continue; }
    const variantRaw = variantHeading ? (r.fields[variantHeading] ?? "").trim() : "";
    let originals: Record<string, string> | undefined;
    if (Object.prototype.hasOwnProperty.call(r.fields, ORIGINAL_VALUES_HEADING)) {
      try {
        const ref = JSON.parse(r.fields[ORIGINAL_VALUES_HEADING]);
        if (ref.version !== 1 || ref.slug !== slug || ref.variant !== variantRaw || !isObj(ref.values)
          || !Object.values(ref.values).every((value) => typeof value === "string")) throw new Error();
        originals = ref.values;
      } catch {
        errors.push({ rows: [r.rowNumber], message: `Row ${r.rowNumber}: original-values reference is missing, changed or belongs to another product/variant. Download a fresh sheet.` });
        continue;
      }
    }
    for (const [heading, dest] of entries) {
      if (dest === "variant") continue;
      const raw = r.fields[heading] ?? "";
      if (!raw.trim()) { blankCells++; continue; }
      if (originals) {
        if (!Object.prototype.hasOwnProperty.call(originals, dest)) {
          errors.push({ rows: [r.rowNumber], message: `Row ${r.rowNumber}: column mapping no longer matches the exported ${heading} field.` }); continue;
        }
        const original = originals[dest].trim();
        const parsedReferenceValue = parseFieldValue(dest, raw);
        const typedValue = parsedReferenceValue.value;
        const canonical = parsedReferenceValue.error ? raw.trim()
          : Array.isArray(typedValue) && typedValue.every((value) => typeof value === "string") ? typedValue.join(" | ")
          : typeof typedValue === "object" ? JSON.stringify(typedValue) : String(typedValue).trim();
        // Populated but untouched cells must never revert newer merchant edits.
        if (fieldFingerprint(canonical) === original) { unchanged++; continue; }
        if (variantRaw && dest !== "price") {
          errors.push({ rows: [r.rowNumber], message: `Row ${r.rowNumber}: edit ${heading} on the product row with a blank Variant, not on a size-price row.` }); continue;
        }
        const current = exportFieldValue(product, dest, dest === "price" ? variantRaw : "").trim();
        if (fieldFingerprint(current) !== original && current !== canonical) {
          errors.push({ rows: [r.rowNumber], message: `Row ${r.rowNumber}: ${heading} changed in the catalogue after this download. Download a fresh sheet before replacing it.` }); continue;
        }
      }
      if (dest === "price" && variantRaw) {
        if (!variantChoices(product).includes(variantRaw)) {
          errors.push({ rows: [r.rowNumber], message: `Row ${r.rowNumber}: "${variantRaw}" is not an exact variant of ${slug}. Choices: ${variantChoices(product).join(", ") || "none"}.` });
          continue;
        }
        const m = parseMoney(raw);
        if (m === null) { errors.push({ rows: [r.rowNumber], message: `Row ${r.rowNumber}: ${heading} "${raw}" is not a valid NGN amount.` }); continue; }
        put({ slug, field: "variantPrice", variant: variantRaw, value: m }, r.rowNumber);
        continue;
      }
      const parsed = parseFieldValue(dest, raw);
      if (parsed.error) { errors.push({ rows: [r.rowNumber], message: `Row ${r.rowNumber}: ${heading} ${parsed.error}.` }); continue; }
      put({ slug, field: dest, value: parsed.value }, r.rowNumber);
    }
    // Empty optional size-price cells are no-ops, not rejected or skipped edits.
    // Count them only when a price column is actually mapped.
    if (variantRaw && entries.some(([, d]) => d === "price")
      && !entries.some(([h, d]) => d === "price" && (r.fields[h] ?? "").trim())) blankVariantPrices++;
  }

  const changes: ProposedChange[] = [];
  for (const c of collected.values()) {
    const p = bySlug.get(c.slug)!;
    const label = c.field === "variantPrice" ? `Price · ${c.variant}` : fieldLabel(c.field);
    if (c.field === "relatedProductSlugs") {
      const bad = (c.value as string[]).filter((s) => s === c.slug || !bySlug.has(s));
      if (bad.length) { errors.push({ rows: c.rows, message: `${c.slug}: related slugs must be other saved products (${bad.join(", ")}).` }); continue; }
    }
    if (c.field === "category" || c.field === "department") {
      const dep = c.field === "department" ? c.value as string : (collected.get(`${c.slug}\u0000department\u0000`)?.value as string | undefined) ?? p.department;
      const cat = c.field === "category" ? c.value as string : (collected.get(`${c.slug}\u0000category\u0000`)?.value as string | undefined) ?? p.category;
      if (!collections.some((x) => x.department === dep && x.category === cat)) {
        errors.push({ rows: c.rows, message: `${c.slug}: "${cat}" is not an existing ${dep} collection. Department and category must match a saved collection exactly.` });
        continue;
      }
    }
    const before = c.field === "variantPrice" ? p.variantPrices?.[c.variant!] : (p as Record<string, unknown>)[c.field];
    const money = c.field === "price" || c.field === "variantPrice";
    if (stable(before) === stable(c.value)) { unchanged++; continue; }
    const missing = c.field === "variantPrice" ? before === undefined : isMissing(p, c.field);
    if (mode === "fill" && !missing) {
      skipped.push({ slug: c.slug, label, reason: `Already has ${formatValue(before, money)}. Use Replace supplied fields to correct it.`, rows: c.rows });
      continue;
    }
    changes.push({
      id: `${c.slug}::${c.field}::${c.variant ?? ""}`, slug: c.slug, productName: p.name, field: c.field, label,
      variant: c.variant, before: formatValue(before, money), after: formatValue(c.value, money), value: c.value, rows: c.rows,
    });
  }
  return { changes, skipped, errors, unchanged, blankCells, blankVariantPrices, productCount: new Set(changes.map((c) => c.slug)).size };
}

/** Applies only the selected changes to clones of saved products. Returns only modified products. */
export function applySelectedChanges(savedProducts: CatalogProduct[], changes: ProposedChange[], selected: ReadonlySet<string>,
  collections: { department: string; category: string }[]): CatalogProduct[] {
  const picked = changes.filter((c) => selected.has(c.id));
  const slugs = [...new Set(picked.map((c) => c.slug))];
  if (slugs.length > MAX_UPDATE_PRODUCTS) throw new Error(`Select changes for at most ${MAX_UPDATE_PRODUCTS} products per save (currently ${slugs.length}).`);
  return slugs.map((slug) => {
    const saved = savedProducts.find((p) => p.slug === slug);
    if (!saved) throw new Error(`${slug} is no longer in the saved catalogue. Rebuild the review.`);
    const next = structuredClone(saved) as CatalogProduct;
    const bag = next as unknown as Record<string, unknown>;
    for (const c of picked.filter((x) => x.slug === slug)) {
      if (c.field === "variantPrice") next.variantPrices = { ...(next.variantPrices ?? {}), [c.variant!]: c.value as number };
      else bag[c.field] = structuredClone(c.value);
    }
    if (!collections.some((x) => x.department === next.department && x.category === next.category))
      throw new Error(`${slug}: selected department/category (${next.department as ProductDepartment} / ${next.category}) is not a saved collection. Select both changes together.`);
    delete next.commerceMappingConfirmation;
    if (next.slug !== slug || next.releaseState !== saved.releaseState) throw new Error(`${slug}: protected field changed.`);
    return next;
  });
}

export function productsDiffer(a: CatalogProduct[], b: CatalogProduct[]): boolean {
  return a.length !== b.length || stable(a) !== stable(b);
}
