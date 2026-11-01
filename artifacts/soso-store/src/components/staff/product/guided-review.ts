import type { CatalogProduct, PlatformContent } from "../../../data/platformContent";
import type { MappingPreview } from "../PlatformEditorCatalogue";
import { toMappingProduct } from "./review-state";
import { platformActionError } from "../platform-action-error";

export type SavedPlatformRow = {
  draft: PlatformContent | null; published: PlatformContent | null;
  draftUpdatedAt: string | null; publishedAt: string | null;
};
export type GuidedResult = { ok: boolean; message: string; publishedSlugs: string[] };

/** One explicit Staff action; server gates remain authoritative at every stage. */
export async function runGuidedReview(input: {
  products: CatalogProduct[]; row: SavedPlatformRow; publish: boolean;
  request: <T>(path: string, body: unknown) => Promise<T>;
  committed: (next: SavedPlatformRow, before: SavedPlatformRow) => void;
}): Promise<GuidedResult> {
  let row = input.row;
  const publishedSlugs: string[] = [];
  let saved = false;
  try {
    if (!row.draft || !row.draftUpdatedAt) throw new Error("Reload the saved draft first.");
    if (!input.products.length || new Set(input.products.map((p) => p.slug)).size !== input.products.length) throw new Error("Choose distinct products to review.");
    const needsMapping = input.products.filter((p) => p.commerceProductId || p.fulfilmentState !== "unavailable");
    let products = structuredClone(input.products);
    if (needsMapping.length) {
      const preview = await input.request<MappingPreview>("/api/staff/commerce/catalogue-mapping/preview", { products: needsMapping.map(toMappingProduct) });
      if (!preview.snapshotHash || !preview.fetchedAt || !Array.isArray(preview.suggestions)) throw new Error("The size check was incomplete. Try again; nothing has been saved.");
      products = products.map((product) => {
        if (!needsMapping.some((p) => p.slug === product.slug)) return product;
        const match = preview.suggestions.find((s) => s.slug === product.slug);
        if (!match || match.status !== "confident" || match.confidence < 95 || !match.productId || !match.productHash || !match.localHash) {
          throw new Error(`${product.name}: ${match?.issues?.join("; ") || match?.evidence?.join("; ") || "choose the correct sizes and JusticeSure product, then try again."}`);
        }
        const choices = [...(product.standardEligible ? product.standardSizes : []),
          ...(product.customEligible && product.fulfilmentState !== "unavailable" ? ["Custom"] : [])];
        if (!match.variantIds || choices.some((choice) => !match.variantIds[choice])) {
          throw new Error(`${product.name}: the size check did not return every enabled size. Check the size links and try again.`);
        }
        return { ...product, commerceProductId: match.productId, commerceVariantIds: match.variantIds,
          commerceMappingConfirmation: {
            productHash: match.productHash, localHash: match.localHash, snapshotHash: preview.snapshotHash,
            snapshotFetchedAt: preview.fetchedAt, confirmedAt: new Date().toISOString(),
            confidence: match.confidence, source: "manual" as const, evidence: match.evidence, choiceLabels: match.choiceLabels,
          } };
      });
    }
    const beforeSave = row;
    row = await input.request<SavedPlatformRow>("/api/staff/content/platform/catalogue/draft", {
      expectedDraftUpdatedAt: row.draftUpdatedAt, collections: row.draft.collections,
      upserts: products.map((product) => ({ slug: product.slug, product })), deletions: [],
    });
    saved = true;
    input.committed(row, beforeSave);
    if (!input.publish) return { ok: true, message: `${products.length} product${products.length === 1 ? "" : "s"} checked and saved to draft. Nothing was published.`, publishedSlugs };
    if (!row.draftUpdatedAt || !row.publishedAt) throw new Error("The store must have an initial published version before product-only publishing.");
    const mapped = products.filter((p) => p.commerceProductId);
    if (mapped.length) await input.request("/api/staff/content/platform/catalogue/approve", {
      slugs: mapped.map((p) => p.slug), expectedDraftUpdatedAt: row.draftUpdatedAt, acknowledged: true,
    });
    for (const product of products) {
      const beforePublish = row;
      row = await input.request<SavedPlatformRow>(`/api/staff/content/platform/products/${encodeURIComponent(product.slug)}/publish`, {
        expectedDraftUpdatedAt: row.draftUpdatedAt, expectedPublishedAt: row.publishedAt,
      });
      publishedSlugs.push(product.slug);
      input.committed(row, beforePublish);
    }
    return { ok: true, message: `${publishedSlugs.length} product${publishedSlugs.length === 1 ? " is" : "s are"} now live. Other products and store settings were not published.`, publishedSlugs };
  } catch (error) {
    const reason = platformActionError(error, "The check could not finish. Try again.");
    return { ok: false, message: `${publishedSlugs.length ? `${publishedSlugs.length} products are already live (${publishedSlugs.join(", ")}). ` : ""}${saved ? "Your draft was saved. " : "Your edits are kept in the form. "}${reason}${publishedSlugs.length ? " Remaining products were not published." : " Nothing was published."}`, publishedSlugs };
  }
}
