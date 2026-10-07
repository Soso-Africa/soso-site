import type { MegaMenuGroup, PlatformCollection } from "../data/platformContent";

const menCollectionSlugs = ["kaftans", "agbadas", "shirts", "dashikis", "two-piece"];

// Older saved menus contain only three links. Complete the existing collection
// column from published collections without changing Staff labels or other links.
export function completeMenCollections(
  groups: MegaMenuGroup[],
  collections: Pick<PlatformCollection, "slug" | "label" | "department">[],
): MegaMenuGroup[] {
  return groups.map((group) => {
    if (group.id !== "men") return group;
    const columnIndex = group.columns.findIndex((column) =>
      column.heading.toLowerCase() === "collections");
    if (columnIndex < 0) return group;
    const column = group.columns[columnIndex];
    const existing = new Set(column.links.map((link) => link.href));
    const missing = menCollectionSlugs.flatMap((slug) => {
      const collection = collections.find((item) => item.slug === slug && item.department === "men");
      const href = `/collections/${slug}`;
      return collection && !existing.has(href) ? [{ label: collection.label, href }] : [];
    });
    if (!missing.length) return group;
    return { ...group, columns: group.columns.map((item, index) =>
      index === columnIndex ? { ...item, links: [...item.links, ...missing] } : item) };
  });
}
