import type { CatalogProduct } from "../../../data/platformContent";
import type { FieldKey } from "./update-model";

export const ORIGINAL_VALUES_HEADING = "SOSO originals";
export const MAX_UPDATE_SHEET_BYTES = 2 * 1024 * 1024;
export const MAX_UPDATE_SHEET_ROWS = 10_000;

/** Change-detection fingerprint, not an authorization signature. Server draft CAS remains authoritative. */
export function fieldFingerprint(text: string): string {
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (const character of text.trim()) {
    const code = character.codePointAt(0)!;
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function exportFieldValue(product: CatalogProduct, field: FieldKey, variant = ""): string {
  const value = field === "price" && variant ? product.variantPrices?.[variant] : product[field];
  if (value === undefined || value === null) return "";
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.join(" | ");
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
