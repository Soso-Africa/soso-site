import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const productSource = await readFile(resolve(packageRoot, "src/data/products.ts"), "utf8");
const productEntries = [...productSource.matchAll(
  /\{\s*slug:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*img:\s*"([^"]+)",\s*price:\s*(\d+),.*?description:\s*"([^"]+)"/g,
)].map((match) => ({
  slug: match[1],
  name: match[2],
  image: match[3],
  price: Number(match[4]),
  description: match[5],
}));

if (productEntries.length === 0) {
  throw new Error("Could not generate SEO metadata because no catalogue products were found.");
}

const journalSource = JSON.parse(await readFile(resolve(packageRoot, "src/data/journal-seo.json"), "utf8"));
const journalEntries = Array.isArray(journalSource.articles)
  ? journalSource.articles
  : [];
for (const article of journalEntries) {
  if (
    !article
    || typeof article.slug !== "string"
    || typeof article.title !== "string"
    || typeof article.excerpt !== "string"
    || typeof article.authorName !== "string"
    || typeof article.publishedAt !== "string"
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