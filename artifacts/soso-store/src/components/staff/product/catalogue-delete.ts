import type { PlatformContent } from "../../../data/platformContent";
import { stable } from "./product-state";

function pointsToProduct(value: string, slug: string): boolean {
  try { return new URL(value, "https://soso.invalid").pathname === `/product/${slug}`; }
  catch { return false; }
}

/** Apply the committed delta, retaining local edits at field / stable item identity level. */
function mergeDeletion(before: unknown, committed: unknown, local: unknown): unknown {
  if (stable(local) === stable(before)) return structuredClone(committed);
  if (stable(committed) === stable(before)) return structuredClone(local);
  if (Array.isArray(before) && Array.isArray(committed) && Array.isArray(local)) {
    // Products, collections and menu groups must not be matched by array position.
    const items = [...before, ...committed, ...local];
    const key = ["slug", "id"].find((field) => items.length && items.every((item) =>
      item && typeof item === "object" && typeof item[field] === "string")
      && [before, committed, local].every((array) => new Set(array.map((item) => item[field])).size === array.length));
    if (key) {
      const old = new Map(before.map((item) => [item[key], item]));
      const saved = new Map(committed.map((item) => [item[key], item]));
      const merged = local.filter((item) => !old.has(item[key]) || saved.has(item[key]))
        .map((item) => old.has(item[key]) && saved.has(item[key])
          ? mergeDeletion(old.get(item[key]), saved.get(item[key]), item) : structuredClone(item));
      for (const item of committed) {
        if (!old.has(item[key]) && !local.some((entry) => entry[key] === item[key])) merged.push(structuredClone(item));
      }
      return merged;
    }
    // Unkeyed local list edits win; the domain repair below removes stale links.
    return structuredClone(local);
  }
  if ([before, committed, local].every((value) => value && typeof value === "object" && !Array.isArray(value))) {
    const old = before as Record<string, unknown>, saved = committed as Record<string, unknown>, current = local as Record<string, unknown>;
    return Object.fromEntries([...new Set([...Object.keys(old), ...Object.keys(saved), ...Object.keys(current)])]
      .map((key) => [key, mergeDeletion(old[key], saved[key], current[key])])
      .filter(([, value]) => value !== undefined));
  }
  return structuredClone(local);
}

/**
 * The server owns the deletion and saved baseline; the editor owns unrelated work.
 * Recheck references in the latest editor, including edits delivered during DELETE.
 * This is editor reconciliation only, never a substitute for server validation.
 */
export function reconcileDraftProductDeletion(
  before: PlatformContent, committed: PlatformContent, latest: PlatformContent, slug: string,
): PlatformContent {
  const result = mergeDeletion(before, committed, latest) as PlatformContent;
  result.products = result.products.filter((product) => product.slug !== slug);
  for (const product of result.products) {
    if (product.relatedProductSlugs) product.relatedProductSlugs = product.relatedProductSlugs.filter((item) => item !== slug);
  }
  for (const group of result.site.megaMenu) {
    const removed = group.featuredProductSlugs.includes(slug);
    group.featuredProductSlugs = group.featuredProductSlugs.filter((item) => item !== slug);
    if (removed && group.visible && group.department && !group.featuredProductSlugs.length) {
      const replacement = result.products.find((product) => product.department === group.department
        && (product.fulfilmentState !== "unavailable" || group.department === "accessories") && product.img);
      if (replacement) group.featuredProductSlugs.push(replacement.slug);
      else group.visible = false;
    }
  }
  if (result.homepage.newArrival?.productSlug === slug) {
    result.homepage.newArrival.productSlug = result.products[0]?.slug ?? committed.products[0]!.slug;
  }
  const repairLinks = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === "href" && typeof entry === "string" && pointsToProduct(entry, slug)) {
        (value as Record<string, unknown>)[key] = "/shop";
      } else if (key === "productSlug" && entry === slug) {
        delete (value as Record<string, unknown>)[key];
      } else repairLinks(entry);
    }
  };
  repairLinks(result);
  const seen = new Set<string>();
  result.site.header.searchSuggestions = result.site.header.searchSuggestions.filter(({ href }) => {
    if (seen.has(href)) return false;
    seen.add(href);
    return true;
  });
  const featured = result.homepage.featured;
  if (featured.productSlugs.includes(slug)) {
    const current = [...new Set(featured.productSlugs.filter((item) => item !== slug))];
    const choices = [...current, ...result.products.map((product) => product.slug).filter((item) => !current.includes(item))].slice(0, 4);
    featured.productSlugs = Array.from({ length: 4 }, (_, index) => choices[index % choices.length]!);
  }
  return result;
}

/** Find references outside the product itself before removing it from a draft. */
export function productDeletionReferences(content: PlatformContent, slug: string): string[] {
  const remaining = { ...content, products: content.products.filter((product) => product.slug !== slug) };
  const references: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (typeof value === "string") {
      if (value === slug || pointsToProduct(value, slug)) {
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