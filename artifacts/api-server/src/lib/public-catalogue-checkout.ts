import type { PlatformContent } from "./platform-content";

/**
 * Catalogue approval is not payment activation. Staff retains exact mappings;
 * an inactive payment integration must not expose cart-eligible public mappings.
 */
export function publicCatalogueContent(content: PlatformContent, checkoutActive: boolean): PlatformContent {
  if (checkoutActive) return content;
  return {
    ...content,
    products: content.products.map((product) => {
      const {
        commerceProductId: _productId,
        commerceVariantIds: _variantIds,
        commerceMappingConfirmation: _confirmation,
        ...publicProduct
      } = product;
      return publicProduct;
    }),
  };
}