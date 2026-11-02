import type { CatalogProduct, PlatformCollection } from "../../../data/platformContent";
import { sameProduct } from "./product-state";

export type ProductIndexItem = Pick<CatalogProduct, "slug" | "name">;
export type ProductIndexPage = { items: ProductIndexItem[]; nextCursor: string | null };
export type FocusedCollection = Pick<PlatformCollection, "slug" | "label" | "category" | "department">;

export type ProductEditorResponse = {
  product: CatalogProduct;
  publishedProduct: CatalogProduct | null;
  collections: FocusedCollection[];
  relatedProducts: ProductIndexItem[];
  draftUpdatedAt: string;
  publishedAt: string | null;
};

export type ProductEditorSaveResponse = {
  product: CatalogProduct;
  draftUpdatedAt: string;
  publishedAt: string | null;
};

export type FocusedEntry = {
  slug: string;
  /** Last product the server confirmed for this slug (loaded or saved). */
  base: CatalogProduct;
  /** Local editor state; never replaced by a server response without explicit confirmation. */
  local: CatalogProduct;
  published: CatalogProduct | null;
  collections: FocusedCollection[];
  relatedProducts: ProductIndexItem[];
  /** Expected version sent with the next save. Only a successful save or an explicit reload advances it. */
  draftUpdatedAt: string;
  publishedAt: string | null;
  conflict: string;
};

export function entryFromResponse(slug: string, response: ProductEditorResponse): FocusedEntry {
  return {
    slug,
    base: response.product,
    local: response.product,
    published: response.publishedProduct,
    collections: response.collections,
    relatedProducts: response.relatedProducts,
    draftUpdatedAt: response.draftUpdatedAt,
    publishedAt: response.publishedAt,
    conflict: "",
  };
}

export function isEntryDirty(entry: FocusedEntry | undefined): boolean {
  return Boolean(entry && !sameProduct(entry.local, entry.base));
}

/**
 * A detail response may replace an entry only when it answers the latest request for that slug,
 * and either no entry exists yet, or the user explicitly asked to replace it (refresh/discard).
 */
export function shouldAcceptLoad(input: {
  requestId: number;
  latestRequestId: number;
  hasEntry: boolean;
  explicitReplace: boolean;
}): boolean {
  if (input.requestId !== input.latestRequestId) return false;
  return !input.hasEntry || input.explicitReplace;
}

/** Explicit "keep my edits" after a conflict: adopt the latest server version as base but keep local edits. */
export function rebaseOntoLatest(entry: FocusedEntry, latest: ProductEditorResponse): FocusedEntry {
  return {
    ...entry,
    base: latest.product,
    published: latest.publishedProduct,
    collections: latest.collections,
    relatedProducts: mergeKnown(entry.relatedProducts, latest.relatedProducts),
    draftUpdatedAt: latest.draftUpdatedAt,
    publishedAt: latest.publishedAt,
    conflict: "",
  };
}

/** Reconcile only the saved product and timestamps; edits typed during the save are preserved. */
export function applySaveSuccess(entry: FocusedEntry, submitted: CatalogProduct, response: ProductEditorSaveResponse): FocusedEntry {
  return {
    ...entry,
    base: response.product,
    local: sameProduct(entry.local, submitted) ? response.product : entry.local,
    draftUpdatedAt: response.draftUpdatedAt,
    publishedAt: response.publishedAt,
    conflict: "",
  };
}

/**
 * After our own save of one product advanced the global draft timestamp from `submittedVersion`
 * to `newVersion`, other entries that were fenced on exactly `submittedVersion` are still current
 * (only the saved product changed under global CAS). Entries on any other, older version stay as-is
 * so their next save reports a real conflict.
 */
export function advanceSiblingVersions(
  entries: Record<string, FocusedEntry>,
  savedSlug: string,
  submittedVersion: string,
  newVersion: string,
): Record<string, FocusedEntry> {
  const next: Record<string, FocusedEntry> = {};
  for (const [slug, entry] of Object.entries(entries)) {
    next[slug] = slug !== savedSlug && entry.draftUpdatedAt === submittedVersion
      ? { ...entry, draftUpdatedAt: newVersion }
      : entry;
  }
  return next;
}

/** A conflict keeps local edits and the old expected version; the user decides what happens next. */
export function applySaveConflict(entry: FocusedEntry, message: string): FocusedEntry {
  return { ...entry, conflict: message };
}

export function isVersionConflict(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 409;
}

export function mergeKnown(a: ProductIndexItem[], b: ProductIndexItem[]): ProductIndexItem[] {
  const map = new Map<string, ProductIndexItem>();
  for (const item of a) map.set(item.slug, item);
  for (const item of b) map.set(item.slug, item);
  return Array.from(map.values());
}

/**
 * Candidates for ProductEditor's related list and validators. Linked slugs are always present
 * (absence from a search page never means a product was deleted).
 */
export function relatedCandidates(
  local: CatalogProduct,
  known: Map<string, string>,
  visible: ProductIndexItem[],
): ProductIndexItem[] {
  const out = new Map<string, ProductIndexItem>();
  out.set(local.slug, { slug: local.slug, name: local.name });
  for (const slug of local.relatedProductSlugs ?? []) {
    if (!out.has(slug)) out.set(slug, { slug, name: known.get(slug) ?? slug });
  }
  for (const item of visible) if (!out.has(item.slug)) out.set(item.slug, item);
  return Array.from(out.values());
}
