import test from "node:test";
import assert from "node:assert/strict";
import { buildProductStructuredData } from "../lib/product-schema";
import type { CatalogProduct, PlatformContent } from "../data/platformContent";

const site: Pick<PlatformContent["site"], "name" | "logoAlt" | "structuredData"> = {
  name: "SOSO Africa",
  logoAlt: "SOSO Africa",
  structuredData: {
    organizationDescription: "Tailoring",
    locality: "Lagos",
    country: "Nigeria",
    countryCode: "NG",
    websiteDescription: "Clothing",
  },
};

const product: CatalogProduct = {
  slug: "tailored-jacket", name: "Tailored Jacket", img: "/jacket.jpg", images: [],
  price: 100000, tag: "", note: "", category: "Jackets", department: "men",
  description: "A jacket", sizes: [], colour: "Black", fabric: "Wool", fit: "Tailored",
  searchableTerms: [], merchandising: { isNew: false, sortPriority: 0 },
  standardEligible: true, customEligible: false, standardSizes: [], readyNowSizes: [],
  fulfilmentState: "ready_now", dispatchMessage: "",
};

test("product schema only exposes an offer for commerce-authoritative inventory", () => {
  const urls = {
    siteUrl: "https://shopsoso.co",
    absoluteUrl: (path: string) => `https://shopsoso.co${path}`,
  };
  const unlinked = buildProductStructuredData(product, site, "/product/tailored-jacket", urls);
  assert.equal("offers" in unlinked, false);

  const linked = buildProductStructuredData(
    { ...product, commerceProductId: "prod_123" },
    site,
    "/product/tailored-jacket",
    urls,
  );
  assert.equal((linked.offers as { priceCurrency: string }).priceCurrency, "NGN");
  assert.equal((linked.offers as { price: number }).price, 100000);
  assert.equal((linked.offers as { availability: string }).availability, "https://schema.org/InStock");
});
