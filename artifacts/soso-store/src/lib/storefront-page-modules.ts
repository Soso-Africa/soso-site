export const loadShopPage = () => import("@/pages/Shop");
export const loadProductPage = () => import("@/pages/ProductDetail");
let shop: Promise<unknown> | undefined;
let product: Promise<unknown> | undefined;

export function preloadStorefrontPage(path: string) {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;
  if (/^\/product\/[^/]+/.test(path) && !product) {
    product = loadProductPage().catch(() => { product = undefined; });
  } else if (/^\/shop(?:[?]|$)/.test(path) && !shop) {
    shop = loadShopPage().catch(() => { shop = undefined; });
  }
}
