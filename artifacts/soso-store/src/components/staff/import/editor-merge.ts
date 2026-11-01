import type { CatalogProduct } from "../../../data/platformContent";
import { stable } from "../product/product-state";

/** Reject overlapping edits; unrelated editor work never blocks a reviewed sheet. */
export function assertSpreadsheetDoesNotOverwriteEditor(
  editor: CatalogProduct[], baseline: CatalogProduct[], updates: CatalogProduct[],
): void {
  for (const update of updates) {
    const saved = baseline.find((p) => p.slug === update.slug);
    const current = editor.find((p) => p.slug === update.slug);
    if (!saved || !current) throw new Error(`${update.slug}: the product was removed or renamed in the editor. Resolve that change first.`);
    for (const key of new Set([...Object.keys(saved), ...Object.keys(update)])) {
      if (key === "commerceMappingConfirmation") continue;
      const before = (saved as Record<string, unknown>)[key];
      const after = (update as Record<string, unknown>)[key];
      const edited = (current as Record<string, unknown>)[key];
      if (stable(before) !== stable(after) && stable(edited) !== stable(before) && stable(edited) !== stable(after)) {
        throw new Error(`${current.name}: "${key}" was also edited in the product form. Save that edit and rebuild the sheet review, or undo that field. Other edits are kept.`);
      }
    }
  }
}

/** Paint committed fields while retaining unsaved and in-flight edits field by field. */
export function reconcileSavedProducts(editor: CatalogProduct[], before: CatalogProduct[], after: CatalogProduct[]): CatalogProduct[] {
  return editor.map((current) => {
    const old = before.find((p) => p.slug === current.slug);
    const saved = after.find((p) => p.slug === current.slug);
    if (!old || !saved) return current;
    const next = { ...current } as Record<string, unknown>;
    for (const key of new Set([...Object.keys(old), ...Object.keys(saved)])) {
      if (stable((current as Record<string, unknown>)[key]) === stable((old as Record<string, unknown>)[key])) {
        if (Object.prototype.hasOwnProperty.call(saved, key)) next[key] = (saved as Record<string, unknown>)[key];
        else delete next[key];
      }
    }
    return next as CatalogProduct;
  });
}
