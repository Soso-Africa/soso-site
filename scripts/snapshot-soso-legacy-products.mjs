import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const origin = "https://shopsoso.co";
const productSitemapUrl = `${origin}/product-sitemap.xml`;
const categorySitemapUrl = `${origin}/product_cat-sitemap.xml`;
const outputPath = new URL("../docs/soso-legacy-product-inventory.json", import.meta.url);

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to snapshot ${url}: ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to snapshot ${url}: ${response.status}`);
  return response.json();
}

function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

function plainText(html = "") {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function allStoreProducts() {
  const products = [];
  for (let page = 1; ; page += 1) {
    const rows = await fetchJson(`${origin}/wp-json/wc/store/v1/products?per_page=100&page=${page}`);
    products.push(...rows);
    if (rows.length < 100) return products;
  }
}

const [productSitemapXml, categorySitemapXml, products, categories] = await Promise.all([
  fetchText(productSitemapUrl),
  fetchText(categorySitemapUrl),
  allStoreProducts(),
  fetchJson(`${origin}/wp-json/wc/store/v1/products/categories?per_page=100`),
]);

const productSitemapUrls = sitemapUrls(productSitemapXml);
const categorySitemapUrls = sitemapUrls(categorySitemapXml);
const snapshot = {
  audit: {
    sourceOrigin: origin,
    capturedAt: new Date().toISOString(),
    sources: [
      productSitemapUrl,
      categorySitemapUrl,
      `${origin}/wp-json/wc/store/v1/products`,
      `${origin}/wp-json/wc/store/v1/products/categories`,
    ],
    productSitemapUrlCount: productSitemapUrls.length,
    productPageCount: products.length,
    productIndexUrlCount: productSitemapUrls.filter((url) => new URL(url).pathname === "/shop/").length,
    categoryCount: categories.length,
    note: "The product sitemap contains the shop index plus the individual product pages. Counts are preserved separately so the inventory never invents a product.",
  },
  productSitemapUrls,
  categorySitemapUrls,
  categories: categories.map((category) => ({
    legacyId: category.id,
    name: category.name,
    slug: category.slug,
    sourceUrl: `${origin}/product-category/${category.slug}/`,
    productCount: category.count,
    targetUrl: `/shop?category=${encodeURIComponent(category.name)}`,
    approvalStatus: "business-approval-required",
    browseStatus: "not-published",
  })),
  products: products.map((product) => ({
    legacyId: product.id,
    sku: product.sku || null,
    name: product.name,
    slug: product.slug,
    sourceUrl: product.permalink,
    lastModifiedUrl: product._links?.self?.[0]?.href ?? null,
    description: plainText(product.description),
    shortDescription: plainText(product.short_description),
    legacyPrice: {
      amountMinor: product.prices?.price ?? null,
      regularAmountMinor: product.prices?.regular_price ?? null,
      saleAmountMinor: product.prices?.sale_price ?? null,
      currency: product.prices?.currency_code ?? null,
      minorUnit: product.prices?.currency_minor_unit ?? null,
    },
    categories: product.categories?.map(({ id, name, slug }) => ({ legacyId: id, name, slug })) ?? [],
    options: product.attributes?.map((attribute) => ({
      name: attribute.name,
      hasVariations: attribute.has_variations,
      values: attribute.terms?.map((term) => term.name) ?? [],
    })) ?? [],
    sourceImages: product.images?.map((image) => ({
      legacyId: image.id,
      sourceUrl: image.src,
      alt: image.alt || image.name || product.name,
      mirrorPath: null,
      sha256: null,
      mirrorStatus: "awaiting-business-approval",
    })) ?? [],
    targetUrl: `/shop?q=${encodeURIComponent(product.name)}`,
    redirectStatus: 301,
    approvalStatus: "business-approval-required",
    browseStatus: "not-published",
    checkoutStatus: "disabled-unmapped",
    justiceSure: {
      productId: null,
      variantIdsByOption: {},
      verifiedPriceMinor: null,
      verifiedCurrency: null,
      verifiedAvailability: null,
      endToEndVerifiedAt: null,
    },
  })),
};

snapshot.audit.sha256 = createHash("sha256")
  .update(JSON.stringify({ productSitemapUrls, categorySitemapUrls, products, categories }))
  .digest("hex");

await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Snapshotted ${products.length} products and ${categories.length} categories from ${productSitemapUrls.length} product sitemap URLs.`);