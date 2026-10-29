import type { CatalogProduct } from "../../../data/platformContent";
import type { ProposedChange } from "./update-model";

export type LinkedPrice = { productId: string; variantId?: string };
export type PriceCheck = {
  status: "match" | "mismatch" | "unmapped" | "unavailable";
  message: string;
  link?: LinkedPrice;
  amountKobo?: number;
  fetchedAt?: string;
};
type RemotePrice = { id: string; currency: string; amountKobo: number; variants: { id: string; amountKobo: number }[] };

export const isPriceChange = (change: ProposedChange) => change.field === "price" || change.field === "variantPrice";

/** Labels select an already-confirmed local ID only; never search remote labels. */
export function linkedPrice(change: ProposedChange, products: CatalogProduct[]): LinkedPrice | undefined {
  const product = products.find((p) => p.slug === change.slug);
  if (!isPriceChange(change) || !product?.commerceMappingConfirmation || !product.commerceProductId) return;
  if (change.field === "price") return { productId: product.commerceProductId };
  const choice = change.variant;
  const eligible = choice === "Custom" ? product.customEligible
    : product.standardEligible && !!choice && product.standardSizes.includes(choice);
  const variantId = choice && product.commerceVariantIds?.[choice];
  if (eligible && variantId) return { productId: product.commerceProductId, variantId };
  return undefined;
}

/** One explicit, uncached, read-only request. No draft or provider writes. */
export async function checkSelectedPrices(
  changes: ProposedChange[], products: CatalogProduct[], signal: AbortSignal,
  read: typeof fetch = fetch,
): Promise<Record<string, PriceCheck>> {
  const result: Record<string, PriceCheck> = {};
  const linked: { change: ProposedChange; link: LinkedPrice }[] = [];
  for (const change of changes.filter(isPriceChange)) {
    const link = linkedPrice(change, products);
    if (link) linked.push({ change, link });
    else result[change.id] = { status: "unmapped", message: "Unmapped — no confirmed eligible JusticeSure identifier. Review mapping in Catalogue Products." };
  }
  if (!linked.length) return result;
  try {
    const response = await read("/api/staff/commerce/catalogue", { credentials: "include", cache: "no-store", signal });
    if (!response.ok) throw new Error("Catalogue unavailable");
    const payload = await response.json() as { products?: RemotePrice[] };
    if (!Array.isArray(payload.products)) throw new Error("Invalid catalogue");
    const fetchedAt = new Date().toISOString();
    for (const { change, link } of linked) {
      const product = payload.products.find((p) => p.id === link.productId);
      const price = link.variantId ? product?.variants?.find((v) => v.id === link.variantId) : product;
      if (!product || product.currency !== "NGN" || !price || !Number.isSafeInteger(price.amountKobo) || price.amountKobo < 0) {
        result[change.id] = { status: "unavailable", message: "Unavailable — the exact linked NGN price was not returned. No label fallback was used.", link, fetchedAt };
        continue;
      }
      const match = Math.round(Number(change.value) * 100) === price.amountKobo;
      result[change.id] = { status: match ? "match" : "mismatch", message: match ? "Matches spreadsheet" : "Mismatch — review before publication",
        link, amountKobo: price.amountKobo, fetchedAt };
    }
  } catch {
    for (const { change, link } of linked) result[change.id] = {
      status: "unavailable", message: "Unavailable — fresh JusticeSure prices could not be fetched. Retry when connected; draft saving is still available.", link,
    };
  }
  return result;
}
