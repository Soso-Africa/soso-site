import type { MegaMenuGroup, PlatformCollection } from "../data/platformContent";

const menCollectionSlugs = ["kaftans", "agbadas", "shirts", "dashikis", "two-piece"];

// Older saved menus contain only three links. Complete the existing collection
// column from published collections without changing Staff labels or other links.
// Staff uses this same projection in its unsaved editor; this never writes content.
export function completeMenCollections(
  groups: MegaMenuGroup[],
  collections: Pick<PlatformCollection, "slug" | "label" | "department">[],
): MegaMenuGroup[] {
  return groups.map((group) => {
    if (group.id !== "men") return group;
    const approvedTargets = new Set(menCollectionSlugs.map((slug) => `/collections/${slug}`));
    // Destination identity survives Staff renaming or moving the column.
    let columnIndex = group.columns.findIndex((column) =>
      column.heading.trim().toLowerCase() === "collections");
    if (columnIndex < 0) {
      const counts = group.columns.map((column) =>
        column.links.filter((link) => approvedTargets.has(link.href)).length);
      const largest = Math.max(0, ...counts);
      if (largest > 0) columnIndex = counts.indexOf(largest);
    }
    const existing = new Set(group.columns.flatMap((column) => column.links.map((link) => link.href)));
    const missing = menCollectionSlugs.flatMap((slug) => {
      const collection = collections.find((item) => item.slug === slug && item.department === "men");
      const href = `/collections/${slug}`;
      return collection && !existing.has(href) ? [{ label: collection.label, href }] : [];
    });
    if (!missing.length) return group;
    if (columnIndex < 0) return {
      ...group, columns: [...group.columns, { heading: "Collections", links: missing }],
    };
    return { ...group, columns: group.columns.map((item, index) =>
      index === columnIndex ? { ...item, links: [...item.links, ...missing] } : item) };
  });
}
