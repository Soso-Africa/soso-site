import type { CatalogProduct } from "@/data/platformContent";

export function filterAndSortProducts(
  products: CatalogProduct[],
  options: {
    department?: string | null;
    category?: string | null;
    fulfillment?: string | null;
    size?: string | null;
    colour?: string | null;
    minPrice?: number | null;
    maxPrice?: number | null;
    searchQuery?: string | null;
    sort?: string | null;
  }
): CatalogProduct[] {
  let result = products;

  if (options.department && options.department !== "__all") {
    result = result.filter((product) => product.department === options.department);
  }

  if (options.category && options.category !== "__all") {
    result = result.filter(p => p.category === options.category);
  }

  if (options.fulfillment && options.fulfillment !== "__all") {
    result = result.filter(p => p.fulfilmentState === options.fulfillment);
  }

  if (options.size && options.size !== "__all") {
    result = result.filter((product) => options.size === "Custom"
      ? product.customEligible
      : product.standardEligible && product.standardSizes.includes(options.size!));
  }

  if (options.colour && options.colour !== "__all") {
    result = result.filter((product) => product.colour === options.colour);
  }

  if (options.minPrice != null && Number.isFinite(options.minPrice)) {
    result = result.filter((product) => product.price >= options.minPrice!);
  }

  if (options.maxPrice != null && Number.isFinite(options.maxPrice)) {
    result = result.filter((product) => product.price <= options.maxPrice!);
  }

  if (options.searchQuery && options.searchQuery.trim()) {
    const q = options.searchQuery.toLowerCase().trim();
    result = result.filter((product) => [
      product.name,
      product.description,
      product.category,
      product.colour,
      product.fabric,
      product.fit,
      ...product.searchableTerms,
    ].some((value) => value.toLowerCase().includes(q)));
  }

  result = [...result].sort((a, b) => {
    switch (options.sort) {
      case "price_asc": return a.price - b.price;
      case "price_desc": return b.price - a.price;
      case "newest":
        return Number(b.merchandising.isNew) - Number(a.merchandising.isNew)
          || b.merchandising.sortPriority - a.merchandising.sortPriority;
      case "featured": 
      default:
        return b.merchandising.sortPriority - a.merchandising.sortPriority;
    }
  });

  return result;
}