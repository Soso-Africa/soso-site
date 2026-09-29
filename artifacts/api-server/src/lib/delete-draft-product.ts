import type { PlatformContent } from "./platform-content";

function pointsToProduct(value: string, slug: string): boolean {
  try {
    return new URL(value, "https://soso.invalid").pathname === `/product/${slug}`;
  } catch {
    return false;
  }
}

/** Remove a draft product and its draft-only storefront links in one revision. */
export function deleteDraftProduct(content: PlatformContent, slug: string): PlatformContent | null {
  if (!content.products.some((product) => product.slug === slug) || content.products.length < 2) return null;
  const draft = structuredClone(content);
  draft.products = draft.products.filter((product) => product.slug !== slug);

  // A removed product cannot remain in related-product lists or navigation links.
  for (const product of draft.products) {
    if (product.relatedProductSlugs) {
      product.relatedProductSlugs = product.relatedProductSlugs.filter((item) => item !== slug);
    }
  }
  for (const group of draft.site.megaMenu) {
    group.featuredProductSlugs = group.featuredProductSlugs.filter((item) => item !== slug);
    if (group.visible && group.department && group.featuredProductSlugs.length === 0) {
      const replacement = draft.products.find((product) =>
        product.department === group.department
        && (product.fulfilmentState !== "unavailable" || group.department === "accessories")
        && product.img);
      if (replacement) group.featuredProductSlugs.push(replacement.slug);
      else group.visible = false;
    }
  }
  const replaceLinks = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(replaceLinks);
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (key === "href" && typeof entry === "string" && pointsToProduct(entry, slug)) {
        (value as Record<string, unknown>)[key] = "/shop";
      } else {
        replaceLinks(entry);
      }
    }
  };
  replaceLinks(draft);
  // Search suggestions must have unique targets, including after redirection.
  const seenSuggestions = new Set<string>();
  draft.site.header.searchSuggestions = draft.site.header.searchSuggestions.filter(({ href }) => {
    if (seenSuggestions.has(href)) return false;
    seenSuggestions.add(href);
    return true;
  });

  // The homepage always has four slots. Preserve its order, then fill vacated
  // slots with other saved products. Legacy small catalogues repeat only after
  // each remaining product has appeared once.
  const featured = draft.homepage.featured;
  const current = [...new Set(featured.productSlugs.filter((item) => item !== slug))];
  const choices = [...current, ...draft.products.map((product) => product.slug).filter((item) => !current.includes(item))];
  const firstFour = choices.slice(0, 4);
  featured.productSlugs = Array.from({ length: 4 }, (_, index) => firstFour[index] ?? firstFour[index % firstFour.length]!);
  if (draft.products.length < 4) featured.legacySparseCompatibility = true;
  else delete featured.legacySparseCompatibility;
  return draft;
}