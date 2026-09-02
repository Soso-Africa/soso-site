import type { CatalogProduct, PlatformCollection } from "@/data/platformContent";

/** Selects current public pieces; ProductCard still fails checkout closed when commerce mapping is absent. */
export function selectCollectionProducts(
  collection: Pick<PlatformCollection, "slug" | "department" | "category">,
  products: CatalogProduct[],
): CatalogProduct[] {
  return products
    .filter((product) => product.fulfilmentState !== "unavailable")
    .filter((product) => collection.slug === "new-arrivals"
      ? product.merchandising.isNew
      : product.department === collection.department && product.category === collection.category)
    .sort((left, right) => left.merchandising.sortPriority - right.merchandising.sortPriority || left.slug.localeCompare(right.slug));
}