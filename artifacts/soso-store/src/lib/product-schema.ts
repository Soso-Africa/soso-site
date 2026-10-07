import type { CatalogProduct, PlatformContent } from "../data/platformContent";
import { isProductReleased, productPriceRange } from "./purchasing";

type StructuredSite = Pick<PlatformContent["site"], "name" | "logoAlt" | "structuredData">;

type ProductSchemaUrls = {
  siteUrl: string;
  absoluteUrl: (path: string) => string;
};

/** Product offers are emitted only for products connected to commerce inventory. */
export function buildProductStructuredData(
  product: CatalogProduct,
  site: StructuredSite,
  path: string,
  urls: ProductSchemaUrls,
): Record<string, unknown> {
  const hasAuthoritativeOffer = Boolean(
    isProductReleased(product)
      && product.fulfilmentState !== "unavailable"
      && product.commerceProductId
      && Number.isFinite(product.price)
      && product.price >= 0
      && ["ready_now", "made_immediately", "unavailable"].includes(product.fulfilmentState),
  );
  const availability = product.fulfilmentState === "unavailable"
    ? "https://schema.org/OutOfStock"
    : product.fulfilmentState === "ready_now"
      ? "https://schema.org/InStock"
      : "https://schema.org/PreOrder";
  const range = productPriceRange(product);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: urls.absoluteUrl(product.img),
    url: urls.absoluteUrl(path),
    brand: { "@type": "Brand", name: site.name },
    ...(hasAuthoritativeOffer ? {
      offers: {
        "@type": range.min !== range.max ? "AggregateOffer" : "Offer",
        url: urls.absoluteUrl(path),
        priceCurrency: "NGN",
        ...(range.min !== range.max ? { lowPrice: range.min, highPrice: range.max } : { price: range.min }),
        availability,
        seller: { "@id": `${urls.siteUrl}/#organization` },
      },
    } : {}),
  };
}