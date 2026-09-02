import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "scripts/generate-seo-assets.mjs"), "utf8");
const main = await readFile(resolve(root, "src/main.tsx"), "utf8");
const vercel = await readFile(resolve(root, "../../vercel.json"), "utf8");
const legacySource = await readFile(resolve(root, "src/data/legacy-content.ts"), "utf8");
function legacyCollection(name) {
  const match = legacySource.match(new RegExp(`export const ${name}[^=]*= (\\[[\\s\\S]*?\\n\\]);`));
  assert.ok(match, `${name} must remain a JSON-literal shared source.`);
  return JSON.parse(match[1]);
}
const legacyAboutPages = legacyCollection("legacyAboutPages");
const legacyJournalPosts = legacyCollection("legacyJournalSourcePosts");

assert.match(source, /const approvedOrigin = "https:\/\/shopsoso\.co"/);
assert.match(source, /url\.hostname === "shopsoso\.co"/);
assert.match(source, /url\.hostname === "www\.shopsoso\.co"/);
assert.match(source, /if \(!canIndex\) \{/);
assert.match(source, /Private until the approved production canonical gate/);
assert.match(source, /rm\(resolve\(out, file\), \{ recursive: true, force: true \}\)/);
assert.match(source, /DATABASE_URL is required when public SEO generation is enabled/);
assert.match(source, /src\/data\/legacy-content\.ts/);
assert.match(source, /loadLegacyCollection\("legacyAboutPages"\)/);
assert.match(source, /loadLegacyCollection\("legacyJournalSourcePosts"\)/);
assert.match(source, /loadJournalRefresh\(\)/);
assert.match(source, /shared legacy content source must retain all 7 About pages and 14 Journal posts/);
assert.match(source, /duplicate archival slugs/);
assert.match(source, /Refusing to generate duplicate crawler routes/);
assert.match(source, /reviewed CMS entry always wins over an archival record/);
assert.match(source, /\.\.\.legacyJournalPosts\.map/);
assert.match(source, /\.\.\.cmsArticles\.map/);
assert.match(source, /legacyAboutRoutes/);
assert.match(source, /"@type": "AboutPage"/);
assert.match(source, /body, seo_title/);
assert.match(source, /related_product_slugs/);
assert.match(source, /sitemap\.xml/);
assert.match(source, /<lastmod>/);
assert.match(source, /feed\.json/);
assert.match(source, /feed\.xml/);
assert.match(source, /atom\.xml/);
assert.match(source, /llms\.txt/);
assert.match(source, /"@type": "ClothingStore"/);
assert.match(source, /`\$\{siteUrl\}\/#organization`/);
assert.match(source, /"@type": "WebSite"/);
assert.match(source, /`\$\{siteUrl\}\/#website`/);
assert.match(source, /"@type": "BreadcrumbList"/);
assert.match(source, /"@type": "Product"/);
assert.match(source, /"@type": "Offer"/);
assert.match(source, /"@type": "FAQPage"/);
assert.match(source, /"@type": "BlogPosting"/);
assert.match(source, /headline: article\.title/);
assert.match(source, /articleBody: article\.bodyText/);
assert.match(source, /publisher: \{ "@id": `\$\{siteUrl\}\/#organization` \}/);
assert.match(source, /<h1>/);
assert.match(source, /rel="canonical"/);
assert.match(source, /og:title/);
assert.match(source, /twitter:title/);
assert.match(source, /summary_large_image/);
assert.match(source, /og:site_name/);
assert.match(source, /article:published_time/);
assert.match(source, /id="soso-server-schema"/);
assert.match(source, /renderMarkdown\(article\.body\)/);
assert.match(source, /safeHref = \/\^\(\?:\\\/\(\?:journal\|product\|collections\)/);
const allowedInternalLink = /^(?:\/(?:journal|product|collections)\/[a-z0-9]+(?:-[a-z0-9]+)*|\/(?:shop|faq|about))$/;
for (const href of ["/shop", "/faq", "/about", "/journal/a-post", "/product/a-product", "/collections/a-collection"]) assert.ok(allowedInternalLink.test(href), `${href} should be allowed.`);
for (const href of ["/staff", "/checkout", "/journal/preview/a-post", "/shop?q=x", "/about#team", "/../staff", "https://shopsoso.co/shop", "//example.com"]) assert.ok(!allowedInternalLink.test(href), `${href} must remain plain text.`);
assert.match(source, /bodyText: stripMarkdown\(row\.body\)/);
assert.match(source, /product\.commerceProductId && authoritativeState/);
assert.match(source, /brand: \{ "@type": "Brand", name: platform\.site\?\.name/);
assert.match(source, /\.\.\.\(product\.img \? \{ image: absolute\(product\.img\) \}/);
assert.match(source, /https:\/\/schema\.org\/OutOfStock/);
assert.match(source, /"@type": "CollectionPage"/);
assert.match(source, /product\.department === collection\.department && product\.category === collection\.category/);
assert.match(source, /resolve\(out, `\$\{path\.slice\(1\)\}\.html`\)/);
assert.match(source, /await clearPrerenders\(\)/);
assert.match(source, /hydrationAsset/);
assert.match(source, /data-soso-crawler-content/);
assert.match(source, /assertNoIndexFallback\(builtShell\)/);
assert.match(source, /writeFile\(resolve\(out, "index\.html"\), builtShell\)/);
assert.match(source, /SOSO_SEO_OUTPUT_DIR/);
assert.match(main, /rootElement\.replaceChildren\(\)/);
const vercelConfig = JSON.parse(vercel);
assert.equal(vercelConfig.cleanUrls, true);
assert.equal(vercelConfig.routes[0].src, "/api");
assert.match(vercel, /www\.shopsoso\.co/);
const previewGuard = vercelConfig.routes.find((route) => route.headers?.["X-Robots-Tag"]);
assert.equal(previewGuard?.headers?.["X-Robots-Tag"], "noindex, nofollow");
assert.equal(previewGuard?.continue, true);
assert.match(previewGuard?.has?.[0]?.value || "", /vercel/);
const filesystemIndex = vercelConfig.routes.findIndex((route) => route.handle === "filesystem");
assert.ok(filesystemIndex > vercelConfig.routes.indexOf(previewGuard));
assert.deepEqual(vercelConfig.routes.slice(0, 2), [
  { src: "/api", dest: "/api/handler" },
  { src: "/api/(.*)", dest: "/api/handler?__soso_path=$1" },
]);
assert.deepEqual(vercelConfig.routes.slice(filesystemIndex + 1), [{ src: "/(.*)", dest: "/spa-fallback" }]);
// Historical product-category redirects are an intentional edge migration, not
// a rewrite of current clean /product/:slug routes. Only reject explicit
// current route rewrites that would bypass the filesystem prerenders.
assert.ok(!vercelConfig.routes.some((route) => /\/\((?:\?:)?(?:journal|product|collections)\//.test(route.src || "")), "Prerenders must use clean URL filesystem routing, not explicit rewrites.");
assert.equal(legacyAboutPages.length, 7, "Every archived About route must remain in the shared source.");
assert.equal(legacyJournalPosts.length, 14, "Every archived Journal route must remain in the shared source.");
for (const [name, records, prefix] of [
  ["About", legacyAboutPages, "/about/"],
  ["Journal", legacyJournalPosts, "/journal/"],
]) {
  const paths = records.map((record) => record.canonicalPath);
  assert.equal(new Set(paths).size, paths.length, `${name} archival routes must not duplicate canonical paths.`);
  for (const record of records) {
    assert.equal(record.canonicalPath, `${prefix}${record.slug}`, `${name} ${record.slug} must have a clean canonical route.`);
    assert.ok(record.title && record.seoTitle && record.seoDescription && record.body, `${name} ${record.slug} must have crawler content.`);
  }
}
process.stdout.write("SEO source validation passed: canonical gate, private fallback, crawlable route files, feeds, schema, social metadata, and www redirect are present.\n");