import type { CatalogProduct } from "../../../data/platformContent";
import type { MappingSuggestion } from "../PlatformEditorCatalogue";
import { stable } from "./product-state";

/** Exact server payload row for one product. */
export function toMappingProduct(p: CatalogProduct) {
  return {
    slug: p.slug,
    name: p.name,
    price: p.price,
    standardEligible: p.standardEligible,
    customEligible: p.customEligible,
    standardSizes: p.standardSizes,
    fulfilmentState: p.fulfilmentState,
    commerceProductId: p.commerceProductId,
    commerceVariantIds: p.commerceVariantIds,
  };
}

/** Fingerprint of every input that the mapping analysis depends on. */
export function mappingInputFingerprint(p: CatalogProduct): string {
  return stable(toMappingProduct(p));
}

export type ReviewedSuggestion = MappingSuggestion & { inputFingerprint?: string };

/** A suggestion is usable only if it was produced from exactly the current editor inputs. */
export function suggestionIfCurrent<T extends ReviewedSuggestion>(suggestion: T | undefined, product: CatalogProduct): T | undefined {
  return suggestion && suggestion.inputFingerprint === mappingInputFingerprint(product) ? suggestion : undefined;
}

/** A response may be applied only if no newer request/edit happened for the slug and inputs still match. */
export function shouldAcceptReview(a: {
  submittedFp: string; currentFp: string | undefined; requestGen: number; currentGen: number;
  /** Catalogue invalidation epoch captured at launch / current epoch. Omitted epochs are treated as equal. */
  requestEpoch?: number; currentEpoch?: number;
}): boolean {
  return a.currentFp !== undefined && a.submittedFp === a.currentFp && a.requestGen === a.currentGen
    && (a.requestEpoch ?? 0) === (a.currentEpoch ?? 0);
}

export function applyReviewSuccess(prev: ReviewedSuggestion[], slug: string, incoming: MappingSuggestion, submittedFp: string): ReviewedSuggestion[] {
  return [...prev.filter((s) => s.slug !== slug), { ...incoming, inputFingerprint: submittedFp }];
}

/** A failed review must not leave an older analysis available for Confirm. */
export function applyReviewFailure(prev: ReviewedSuggestion[], slug: string): ReviewedSuggestion[] {
  return prev.filter((s) => s.slug !== slug);
}

export type WholeSubmission = Record<string, { fp: string; gen: number }>;

/** Whole-catalogue results never overwrite rows that changed or got a newer per-product request meanwhile. */
export function mergeWholeAnalysis(
  prev: ReviewedSuggestion[],
  result: MappingSuggestion[],
  submitted: WholeSubmission,
  current: Record<string, { fp: string; gen: number }>,
): ReviewedSuggestion[] {
  const accepted = new Map<string, ReviewedSuggestion>();
  for (const s of result) {
    const sub = submitted[s.slug];
    const cur = current[s.slug];
    if (sub && cur && sub.fp === cur.fp && sub.gen === cur.gen) accepted.set(s.slug, { ...s, inputFingerprint: sub.fp });
  }
  const kept = prev.filter((s) => !accepted.has(s.slug) && current[s.slug] && s.inputFingerprint === current[s.slug]!.fp);
  return [...kept, ...accepted.values()];
}
