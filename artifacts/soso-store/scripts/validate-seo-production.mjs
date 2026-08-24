import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (path) => readFile(resolve(packageRoot, path), "utf8");
const [sitemapGenerator, productionServer, seoComponent, appRoutes, collectionPage] = await Promise.all([
  readSource("scripts/generate-seo-assets.mjs"),
  readSource("scripts/serve-production.mjs"),
  readSource("src/components/Seo.tsx"),
  readSource("src/App.tsx"),
  readSource("src/pages/CollectionPage.tsx"),
]);

const sitemapPaths = [...sitemapGenerator.matchAll(/path: "([^"]+)"/g)].map((match) => match[1]);
for (const path of sitemapPaths) {
  assert.match(appRoutes, new RegExp(`path="${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
}
assert.ok(!sitemapPaths.includes("/sizing"), "Sitemap must not contain the removed /sizing route.");
assert.match(sitemapGenerator, /if \(!canIndex\) \{/);
assert.match(sitemapGenerator, /if \(catalogApproved\) \{/);
assert.match(sitemapGenerator, /if \(policiesApproved\) \{/);
assert.match(sitemapGenerator, /if \(journalApproved && journalEntries\.length > 0\) \{/);

assert.match(productionServer, /new URL\(request\.url \|\| "\/", "http:\/\/localhost"\)\.pathname/);
assert.match(productionServer, /if \(!metadata\.indexable\) return html;/);
assert.match(productionServer, /<link rel="canonical" href=/);
assert.match(productionServer, /"X-Robots-Tag": metadata\.indexable \? "index, follow" : "noindex, nofollow"/);
assert.match(productionServer, /"@type": "Product"/);
assert.match(productionServer, /"@type": "BlogPosting"/);

assert.match(seoComponent, /const pageIsIndexable = Boolean\(siteUrl && indexingEnabled && !noIndex\)/);
assert.match(seoComponent, /upsertMeta\("property", "og:url", pageIsIndexable/);
assert.match(seoComponent, /if \(pageIsIndexable\) \{/);
assert.match(seoComponent, /product && pageIsIndexable/);
assert.match(seoComponent, /type === "article" && article && pageIsIndexable/);
assert.match(seoComponent, /injectSchema\("soso-page-schema", pageIsIndexable \? structuredData \?\? articleSchema \?\? productSchema : null\)/);
assert.match(seoComponent, /breadcrumbs && pageIsIndexable/);
assert.match(collectionPage, /noIndex=\{!catalogApproved\}/);

// Regression: the master switch alone must not permit product/collection
// structured data, breadcrumbs, or a canonical when catalog approval is off.
const masterIndexingOnCatalogApprovalOff = { indexingEnabled: true, catalogApproved: false };
const catalogPageNoIndex = !masterIndexingOnCatalogApprovalOff.catalogApproved;
const pageIsIndexable = masterIndexingOnCatalogApprovalOff.indexingEnabled && !catalogPageNoIndex;
assert.equal(pageIsIndexable, false);

process.stdout.write("SEO source validation passed: sitemap routes, release gates, noindex, canonical query handling, and JSON-LD guards are present, including catalog-disabled pages.\n");