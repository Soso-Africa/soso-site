import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(packageRoot, "dist/public");
const rawSiteUrl = (process.env.VITE_PUBLIC_SITE_URL || "").trim();
const indexingEnabled = process.env.VITE_SOSO_INDEXING_ENABLED === "true";
const catalogApproved = process.env.VITE_SOSO_CATALOG_APPROVED === "true";
const policiesApproved = process.env.VITE_SOSO_POLICIES_APPROVED === "true";
const journalApproved = process.env.VITE_SOSO_JOURNAL_APPROVED === "true";

function normalizeSiteUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    if (url.username || url.password || url.search || url.hash) return "";
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".replit.dev")) {
      return "";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function xmlEscape(value) {
  return value.replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    "\"": "&quot;",
  }[character]));
}

const siteUrl = normalizeSiteUrl(rawSiteUrl);
const canIndex = Boolean(siteUrl) && indexingEnabled;

const robots = canIndex
  ? [
      "User-agent: *",
      "Allow: /",
      "Disallow: /checkout",
      "Disallow: /staff",
      "Disallow: /sign-in",
      "Disallow: /sign-up",
      `Sitemap: ${siteUrl}/sitemap.xml`,
      "",
    ].join("\n")
  : [
      "User-agent: *",
      "Disallow: /",
      "",
      "# Indexing stays disabled until the approved domain and launch inputs are configured.",
      "",
    ].join("\n");

await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "robots.txt"), robots);

let productEntries = [];
let journalEntries = [];
if (canIndex && (catalogApproved || journalApproved)) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to generate approved database-backed SEO metadata.");
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    if (catalogApproved) {
      const result = await pool.query(
        "select published from soso_site_content where key = 'platform' and published_at is not null limit 1",
      );
      const products = result.rows[0]?.published?.products;
      if (!Array.isArray(products) || products.length === 0) {
        throw new Error("Could not generate approved catalogue SEO metadata because no platform products are published.");
      }
      productEntries = products.map((product) => ({
        slug: product.slug,
        name: product.name,
        image: product.images?.[0]?.src ?? product.img,
        price: product.price,
        description: product.description,
      }));
    }
    if (journalApproved) {
      const result = await pool.query(
        `select slug, title, excerpt, seo_title as "seoTitle",
                seo_description as "seoDescription", author_name as "authorName",
                published_at as "publishedAt", updated_at as "updatedAt",
                cover_image_url as "coverImageUrl"
           from soso_journal_posts
          where status = 'published' and published_at is not null
          order by published_at desc`,
      );
      journalEntries = result.rows.map((article) => ({
        ...article,
        canonicalPath: `/journal/${article.slug}`,
        title: article.seoTitle ?? article.title,
        excerpt: article.seoDescription ?? article.excerpt,
        publishedAt: new Date(article.publishedAt).toISOString(),
        updatedAt: new Date(article.updatedAt).toISOString(),
      }));
    }
  } finally {
    await pool.end();
  }
}

for (const product of productEntries) {
  if (
    !product
    || typeof product.slug !== "string"
    || typeof product.name !== "string"
    || typeof product.image !== "string"
    || !Number.isInteger(product.price)
    || product.price <= 0
    || typeof product.description !== "string"
  ) {
    throw new Error("Each published product SEO entry must include slug, name, image, positive price, and description.");
  }
}

for (const article of journalEntries) {
  if (
    !article
    || typeof article.slug !== "string"
    || typeof article.title !== "string"
    || typeof article.excerpt !== "string"
    || typeof article.authorName !== "string"
    || typeof article.publishedAt !== "string"
    || typeof article.canonicalPath !== "string"
  ) {
    throw new Error("Each approved Journal SEO entry must include slug, title, excerpt, authorName, and publishedAt.");
  }
}

await writeFile(
  resolve(outputDirectory, "seo-manifest.json"),
  `${JSON.stringify({ products: productEntries, journalEntries }, null, 2)}\n`,
);

const sitemapPath = resolve(outputDirectory, "sitemap.xml");
if (!canIndex) {
  await rm(sitemapPath, { force: true });
  process.stdout.write("SEO assets remain private: no approved public domain/indexing switch was supplied.\n");
  process.exit(0);
}

const urls = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
];

if (catalogApproved) {
  urls.push({ path: "/shop", changefreq: "weekly", priority: "0.9" });

  for (const product of productEntries) {
    urls.push({ path: `/product/${product.slug}`, changefreq: "weekly", priority: "0.8" });
  }
}

if (policiesApproved) {
  for (const path of ["/policies", "/privacy", "/terms", "/delivery-returns", "/care"]) {
    urls.push({ path, changefreq: "monthly", priority: "0.5" });
  }
}

if (journalApproved && journalEntries.length > 0) {
  urls.push({ path: "/journal", changefreq: "weekly", priority: "0.6" });
  for (const article of journalEntries) {
    urls.push({ path: `/journal/${article.slug}`, changefreq: "monthly", priority: "0.5" });
  }
}

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.flatMap(({ path, changefreq, priority }) => [
    "  <url>",
    `    <loc>${xmlEscape(`${siteUrl}${path}`)}</loc>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ]),
  "</urlset>",
  "",
].join("\n");

await writeFile(sitemapPath, sitemap);
process.stdout.write(`SEO assets generated for ${siteUrl}.\n`);