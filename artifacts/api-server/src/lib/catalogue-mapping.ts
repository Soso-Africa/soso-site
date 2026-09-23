import { createHash } from "node:crypto";
import type { JusticeSureCatalogProduct, JusticeSureCatalogVariant } from "./justicesureCommerce.js";

export type LocalCatalogueProduct = {
  slug: string;
  name: string;
  price: number;
  eligibility: boolean | "standard" | "custom" | "unavailable" | { standard?: boolean; custom?: boolean };
  standardSizes: string[];
  commerceProductId?: string;
  commerceVariantIds?: Record<string, string>;
};

export type CatalogueSnapshot = {
  hash: string;
  fetchedAt: string;
  products: Record<string, string>;
};

export type CatalogueMapping = {
  slug: string;
  status: "matched" | "ambiguous" | "unmatched" | "unsafe";
  confidence: number;
  evidence: string[];
  productId?: string;
  variantIds: Record<string, string>;
  choiceLabels: Record<string, string>;
  productHash?: string;
  localHash?: string;
};

export type CatalogueIssue = {
  slug: string;
  code:
    | "product_not_found"
    | "ambiguous_product"
    | "name_mismatch"
    | "parent_mismatch"
    | "price_mismatch"
    | "product_out_of_stock"
    | "variant_not_found"
    | "ambiguous_variant"
    | "variant_duplicate"
    | "variant_parent_mismatch"
    | "variant_out_of_stock"
    | "existing_variant_mismatch";
  message: string;
  expected?: string | number;
  actual?: string | number;
};

export type CatalogueValidation = {
  issues: CatalogueIssue[];
  mappings: CatalogueMapping[];
  snapshot: CatalogueSnapshot;
};

export type ConfirmedCatalogueMapping = {
  slug: string;
  productId: string;
  variantIds: string[];
  confirmedAt: Date;
};

export type CatalogueWebhookInvalidation = {
  identifiers: string[];
  occurredAt: Date;
};

export function findWebhookStaleMappings(
  mappings: ConfirmedCatalogueMapping[],
  invalidations: CatalogueWebhookInvalidation[],
): string[] {
  const stale = new Set<string>();
  for (const mapping of mappings) {
    const identifiers = new Set([mapping.productId, ...mapping.variantIds]);
    if (invalidations.some((event) =>
      event.occurredAt > mapping.confirmedAt
      && event.identifiers.some((identifier) => identifiers.has(identifier)))) {
      stale.add(mapping.slug);
    }
  }
  return [...stale].sort();
}

const SIZE_ALIASES: Record<string, string> = {
  s: "small", small: "small", m: "medium", medium: "medium", l: "large", large: "large",
  xl: "extra large", "extra large": "extra large", xxl: "2xl", "2xl": "2xl",
  xxxl: "3xl", "3xl": "3xl", xs: "xs", custom: "custom",
  "made to measure": "custom", bespoke: "custom",
};

function normalizedText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizedSize(value: string): string {
  const text = normalizedText(value);
  return SIZE_ALIASES[text] ?? text;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }

type MappingVariant = Pick<JusticeSureCatalogVariant, "id" | "name" | "label" | "attributes" | "amountKobo" | "inStock">;
type MappingProduct = Pick<JusticeSureCatalogProduct, "id" | "name" | "amountKobo" | "inStock"> & { variants: MappingVariant[] };

export function catalogueProductHash(product: MappingProduct): string {
  return hash({
    id: product.id, name: product.name, amountKobo: product.amountKobo, inStock: product.inStock,
    variants: [...product.variants].sort((a, b) => a.id.localeCompare(b.id)).map((variant) => ({
      id: variant.id, name: variant.name, label: variant.label, attributes: variant.attributes,
      amountKobo: variant.amountKobo, inStock: variant.inStock,
    })),
  });
}

export function buildCatalogueSnapshot(catalog: JusticeSureCatalogProduct[], fetchedAt = new Date()): CatalogueSnapshot {
  const products = Object.fromEntries([...catalog].sort((a, b) => a.id.localeCompare(b.id)).map((product) => [product.id, catalogueProductHash(product)]));
  return { hash: hash(products), fetchedAt: fetchedAt.toISOString(), products };
}

function isAvailable(local: LocalCatalogueProduct): boolean {
  if (local.eligibility === false || local.eligibility === "unavailable") return false;
  if (typeof local.eligibility === "object") return local.eligibility.standard === true || local.eligibility.custom === true;
  return true;
}

function variantTerms(variant: MappingVariant): string[] {
  const allowedAttributeKeys = new Set(["size", "option", "variant", "measurement", "type"]);
  const sizeAttributes = Object.entries(variant.attributes)
    .filter(([key, value]) => allowedAttributeKeys.has(normalizedText(key)) && (typeof value === "string" || typeof value === "number"))
    .map(([, value]) => String(value));
  const sources = sizeAttributes.length > 0 ? sizeAttributes : [variant.name, variant.label];
  return sources.map(normalizedSize).filter(Boolean);
}

export function variantMatchesChoice(variant: MappingVariant, choice: string): boolean {
  return variantTerms(variant).includes(normalizedSize(choice));
}

function choices(local: LocalCatalogueProduct): Array<{ key: string; semantic: string }> {
  const sizes = local.standardSizes.map(String);
  if (local.eligibility === "custom" || (typeof local.eligibility === "object" && local.eligibility.custom)) {
    if (!sizes.some((size) => normalizedSize(size) === "custom")) sizes.push("Custom");
  }
  return sizes.map((size) => ({ key: size, semantic: normalizedSize(size) }));
}

export function localMappingHash(local: LocalCatalogueProduct): string {
  return hash({
    slug: local.slug,
    name: normalizedText(local.name),
    price: local.price,
    eligibility: local.eligibility,
    standardSizes: [...local.standardSizes],
    commerceProductId: local.commerceProductId ?? null,
    commerceVariantIds: local.commerceVariantIds ?? {},
  });
}

function makeMapping(local: LocalCatalogueProduct, catalog: JusticeSureCatalogProduct[], snapshot: CatalogueSnapshot): CatalogueMapping {
  const base = { slug: local.slug, confidence: 0, evidence: [] as string[], variantIds: {} as Record<string, string>, choiceLabels: {} as Record<string, string> };
  const named = catalog.filter((product) => normalizedText(product.name) === normalizedText(local.name));
  const candidates = local.commerceProductId ? catalog.filter((product) => product.id === local.commerceProductId) : named;
  if (!candidates.length) return { ...base, status: "unmatched", evidence: ["No catalogue product matched the normalized name or existing product ID."] };
  if (candidates.length > 1) return { ...base, status: "ambiguous", evidence: ["Multiple catalogue products have the same normalized name; no guess was made."] };
  const product = candidates[0]!;
  const evidence: string[] = [];
  const unsafe: CatalogueMapping["status"] = "unsafe";
  if (!local.commerceProductId && named.length !== 1) return { ...base, status: "ambiguous", evidence: ["Duplicate normalized product names are ambiguous; no guess was made."] };
  if (normalizedText(product.name) !== normalizedText(local.name)) {
    return { ...base, status: unsafe, evidence: ["Existing product UUID points to a JusticeSure product with a different normalized name."], productId: product.id, productHash: snapshot.products[product.id] };
  }
  evidence.push("Product name matched exactly after normalization.");
  if (local.commerceProductId) evidence.push("Existing product UUID selected the parent.");
  if (local.commerceProductId && product.id !== local.commerceProductId) return { ...base, status: unsafe, evidence: ["Existing product UUID does not match the selected parent."], productId: product.id, productHash: snapshot.products[product.id] };
  if (product.amountKobo !== Math.round(local.price * 100)) return { ...base, status: unsafe, evidence: ["Product price does not exactly match NGN converted to kobo."], productId: product.id, productHash: snapshot.products[product.id] };
  if (isAvailable(local) && !product.inStock) return { ...base, status: unsafe, evidence: ["Available local product has no product stock."], productId: product.id, productHash: snapshot.products[product.id] };
  const used = new Set<string>();
  for (const choice of choices(local)) {
    const matches = product.variants.filter((variant) => variantTerms(variant).includes(choice.semantic));
    if (matches.length === 0) return { ...base, status: unsafe, evidence: [...evidence, `No unique variant matched ${choice.key}.`], productId: product.id, productHash: snapshot.products[product.id] };
    if (matches.length > 1) return { ...base, status: "ambiguous", evidence: [...evidence, `Multiple variants matched ${choice.key}; no guess was made.`], productId: product.id, productHash: snapshot.products[product.id] };
    const variant = matches[0]!;
    if (used.has(variant.id)) return { ...base, status: unsafe, evidence: [...evidence, "Two choices would assign the same variant."], productId: product.id, productHash: snapshot.products[product.id] };
    if (isAvailable(local) && !variant.inStock) return { ...base, status: unsafe, evidence: [...evidence, `Variant ${choice.key} has no stock.`], productId: product.id, productHash: snapshot.products[product.id] };
    if (variant.amountKobo !== Math.round(local.price * 100)) return { ...base, status: unsafe, evidence: [...evidence, `Variant ${choice.key} price does not exactly match NGN converted to kobo.`], productId: product.id, productHash: snapshot.products[product.id] };
    const existing = Object.entries(local.commerceVariantIds ?? {}).find(([key]) => normalizedSize(key) === choice.semantic)?.[1];
    if (existing && existing !== variant.id) return { ...base, status: unsafe, evidence: [...evidence, `Existing variant ID for ${choice.key} does not match.`], productId: product.id, productHash: snapshot.products[product.id] };
    used.add(variant.id); base.variantIds[choice.key] = variant.id; base.choiceLabels[choice.key] = variant.label;
  }
  evidence.push("Every eligible choice has one parented, stocked variant and exact price.");
  return {
    ...base,
    status: "matched",
    confidence: 97,
    evidence,
    productId: product.id,
    productHash: snapshot.products[product.id],
    localHash: localMappingHash({
      ...local,
      commerceProductId: product.id,
      commerceVariantIds: base.variantIds,
    }),
  };
}

export function suggestCatalogueMappings(localProducts: LocalCatalogueProduct[], catalog: JusticeSureCatalogProduct[], snapshot = buildCatalogueSnapshot(catalog)): CatalogueMapping[] {
  return localProducts.map((local) => makeMapping(local, catalog, snapshot));
}

export function validateCatalogueMappings(localProducts: LocalCatalogueProduct[], catalog: JusticeSureCatalogProduct[]): CatalogueValidation {
  const snapshot = buildCatalogueSnapshot(catalog);
  const mappings = suggestCatalogueMappings(localProducts, catalog, snapshot);
  const issues: CatalogueIssue[] = [];
  for (const mapping of mappings) {
    if (mapping.status === "matched") continue;
    const evidence = mapping.evidence.join(" ");
    const code: CatalogueIssue["code"] = evidence.includes("Duplicate normalized") || evidence.includes("Multiple catalogue") ? "ambiguous_product"
      : evidence.includes("No catalogue") ? "product_not_found"
      : evidence.includes("price") ? "price_mismatch"
      : evidence.includes("stock") ? "product_out_of_stock"
      : evidence.includes("variant") && evidence.includes("Multiple") ? "ambiguous_variant"
      : evidence.includes("variant") ? "variant_not_found" : "name_mismatch";
    issues.push({ slug: mapping.slug, code, message: evidence || "Catalogue mapping is not safe." });
  }
  return { issues, mappings, snapshot };
}