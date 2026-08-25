import type { CatalogProduct, PlatformContent } from "../data/platformContent";

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
    product.commerceProductId
      && Number.isFinite(product.price)
      && product.price >= 0
      && ["ready_now", "made_immediately", "unavailable"].includes(product.fulfilmentState),
  );
  const availability = product.fulfilmentState === "unavailable"
    ? "https://schema.org/OutOfStock"
    : product.fulfilmentState === "ready_now"
      ? "https://schema.org/InStock"
      : "https://schema.org/PreOrder";

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
        "@type": "Offer",
        url: urls.absoluteUrl(path),
        priceCurrency: "NGN",
        price: product.price,
        availability,
        seller: { "@id": `${urls.siteUrl}/#organization` },
      },
    } : {}),
  };
}