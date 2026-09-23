import type { CatalogProduct } from "../../../data/platformContent";
import type { MappingSuggestion } from "../PlatformEditorCatalogue";

type ProductMapping = Pick<CatalogProduct, "commerceMappingConfirmation">;

export function isConfirmedMappingCurrent(
  product: ProductMapping,
  suggestion: MappingSuggestion | undefined,
  isWebhookStale: boolean,
): boolean {
  return !isWebhookStale
    && Boolean(
      product.commerceMappingConfirmation
      && suggestion
      && product.commerceMappingConfirmation.productHash === suggestion.productHash
      && product.commerceMappingConfirmation.localHash === suggestion.localHash,
    );
}

export function canConfirmMapping(
  product: ProductMapping,
  suggestion: MappingSuggestion | undefined,
  isWebhookStale: boolean,
): boolean {
  return suggestion?.status === "confident"
    && (!isConfirmedMappingCurrent(product, suggestion, isWebhookStale));
}

export function isMappingPreviewFreshForReview(
  previewGeneration: number,
  requiredGeneration: number,
): boolean {
  return previewGeneration >= requiredGeneration;
}