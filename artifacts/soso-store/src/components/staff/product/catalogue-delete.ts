import type { PlatformContent } from "../../../data/platformContent";
import { stable } from "./product-state";

/**
 * Deletion deliberately discards the selected product, not other editor work.
 * Compare semantically: PostgreSQL/JSON serialization can reorder object keys.
 */
export function hasOtherDraftEditsForDeletion(
  editor: PlatformContent, saved: PlatformContent, slug: string,
): boolean {
  const withoutSelected = (document: PlatformContent) => ({
    ...document,
    products: document.products.filter((product) => product.slug !== slug),
  });
  return stable(withoutSelected(editor)) !== stable(withoutSelected(saved));
}

/** Find references outside the product itself before removing it from a draft. */
export function productDeletionReferences(content: PlatformContent, slug: string): string[] {
  const remaining = { ...content, products: content.products.filter((product) => product.slug !== slug) };
  const references: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (typeof value === "string") {
      let isProductUrl = false;
      try { isProductUrl = new URL(value, "https://soso.invalid").pathname === `/product/${slug}`; }
      catch { /* Unparseable text cannot be a product link. */ }
      if (value === slug || isProductUrl) {
        references.push(path);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key));
    }
  };
  visit(remaining, "");
  return references;
}