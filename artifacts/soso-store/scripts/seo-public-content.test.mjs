import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { publishedFaqContent, renderFaqContent, publishedPolicyPages, publishedProductImage } from "./seo-public-content.mjs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("FAQ answer text is present in HTML as well as structured data, without executable markup", () => {
  const items = publishedFaqContent([{ question: "When do I pay?", answer: "Pay first.\n<script>bad()</script>" }]);
  const html = renderFaqContent(items);
  assert.match(html, /<h2>When do I pay\?<\/h2>/);
  assert.match(html, /Pay first\.<br>&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.throws(() => publishedFaqContent([{ question: "Question", answer: "" }]));
});

const policy = { slug: "privacy", title: "Privacy", summary: "Your privacy.", version: 1,
  status: "published", effectiveAt: "2026-01-01", updatedAt: "2026-01-02",
  sections: [{ id: "choices", heading: "Your choices", paragraphs: ["Marketing requires consent."], bullets: ["You may withdraw."] }] };

test("policy pages use only the latest published effective version and contain full policy text", () => {
  const pages = publishedPolicyPages([policy, { ...policy, version: 2, summary: "Updated." },
    { ...policy, version: 3, status: "draft" }, { ...policy, version: 4, effectiveAt: "2099-01-01" }], Date.parse("2026-10-06"));
  assert.equal(pages.length, 1);
  assert.equal(pages[0].description, "Updated.");
  assert.equal(pages[0].path, "/privacy");
  assert.match(pages[0].bodyHtml, /Marketing requires consent/);
  assert.match(pages[0].bodyHtml, /<li>You may withdraw/);
  assert.equal(pages[0].lastmod, "2026-01-02T00:00:00.000Z");
  assert.equal(publishedPolicyPages([{ ...policy, status: "draft" }]).length, 0);
});

test("an invalid latest published policy fails rather than silently reverting to an old version", () => {
  assert.throws(() => publishedPolicyPages([policy, { ...policy, version: 2, sections: [] }]));
  assert.throws(() => publishedPolicyPages([{ ...policy, effectiveAt: "invalid" }]));
});

test("product imagery respects the published primary image and supports the published gallery", () => {
  assert.equal(publishedProductImage({ img: "/primary.png", images: [{ src: "/alternate.png" }] }), "/primary.png");
  assert.equal(publishedProductImage({ img: "", images: [{ src: "/actual.png" }] }), "/actual.png");
  assert.equal(publishedProductImage({ images: [] }), "");
});

test("generator reads public tables, preserves approval gates and emits answers with matching FAQ schema", async () => {
  const source = await readFile(new URL("./generate-seo-assets.mjs", import.meta.url), "utf8");
  assert.match(source, /where is_published = true order by sort_order, created_at/);
  assert.match(source, /status = 'published' and effective_at is not null and effective_at <= now\(\)/);
  assert.match(source, /policiesApproved \? pool\.query/);
  assert.match(source, /bodyHtml: renderFaqContent\(faq\)/);
  assert.match(source, /item\.path === "\/faq" && faq\.length/);
  assert.match(source, /const policyPages = publishedPolicyPages\(policyRows\)/);
  assert.doesNotMatch(source, /platform\.faq\?\.items/);
});

test("public generator emits full FAQ and policy HTML, correct metadata and only effective policy routes without touching a database", async () => {
  const folder = await mkdtemp(join(tmpdir(), "soso-seo-test-"));
  try {
    const published = {
      site: { name: "SOSO Africa", logoUrl: "/images/soso/logo.png", structuredData: { organizationDescription: "Published brand description." } },
      homepage: { seo: { title: "Approved home title", description: "Approved home description" } },
      pages: { faq: { seo: { title: "Approved FAQ title", description: "Approved FAQ description" } } },
      products: [
        { slug: "test-piece", name: "Test Piece", description: "Approved description", img: "", images: [{ src: "/photo.jpg" }],
          department: "men", category: "Kaftans", fabric: "Approved cotton", fit: "Regular", colour: "Ivory",
          composition: "Published composition.", care: "Published product care.", delivery: "Published delivery.",
          returns: "Published returns.", price: 120000, variantPrices: { S: 130000, M: 150000 },
          standardEligible: true, standardSizes: ["S", "M"], customEligible: false, commerceProductId: "published-id",
          fulfilmentState: "made_immediately", releaseState: "placeholder", merchandising: { isNew: true, sortPriority: 2 } },
        { slug: "planned-bag", name: "Planned Bag", description: "An approved browse-only preview.", department: "accessories",
          category: "Bags", price: 987654, releaseState: "placeholder", fulfilmentState: "unavailable",
          merchandising: { isNew: true, sortPriority: 1 } },
      ],
      collections: [
        { slug: "kaftans", label: "Kaftans", h1: "Kaftans", intro: "Approved collection introduction.", department: "men", category: "Kaftans" },
        { slug: "new-arrivals", h1: "New Arrivals", intro: "Approved new arrivals.", department: "men", category: "New Arrivals" },
        { slug: "accessories", h1: "Accessories", intro: "Approved accessories.", department: "accessories", category: "Accessories" },
      ],
    };
    const mock = `export default { Pool: class { async query(sql) {
      if(sql.includes("soso_site_content")) return {rows:[{published:${JSON.stringify(published)},draft:{products:[{slug:"private-draft-piece",description:"DRAFT SECRET SENTINEL"}]}}]};
      if(sql.includes("soso_faq_items")) return {rows:[{question:"When do I pay?",answer:"Pay first, then atelier confirmation."}]};
      if(sql.includes("soso_policy_documents")) return {rows:${JSON.stringify([policy, { ...policy, slug: "hidden", status: "draft" }, { ...policy, slug: "future", effectiveAt: "2099-01-01" }])}};
      return {rows:[]};
    } async end() {} }};`;
    const loader = `export async function resolve(specifier, context, next) {
      if(specifier === "pg") return {url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(mock)}`)},shortCircuit:true};
      return next(specifier, context);
    }`;
    await writeFile(join(folder, "loader.mjs"), loader);
    await writeFile(join(folder, "index.html"), '<!doctype html><html><head><meta data-soso-managed="robots" name="robots" content="noindex, nofollow"><link rel="stylesheet" href="/assets/test.css"><script type="module" src="/assets/test.js"></script></head><body><div id="root"></div></body></html>');
    const runGenerator = (overrides = {}) => spawnSync("pnpm", ["--dir", new URL("../../../scripts", import.meta.url).pathname, "exec", "tsx", "--experimental-loader", join(folder, "loader.mjs"), new URL("./generate-seo-assets.mjs", import.meta.url).pathname], {
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "postgres://synthetic-test-only",
        SOSO_SEO_OUTPUT_DIR: folder, VITE_PUBLIC_SITE_URL: "https://shopsoso.co",
        VITE_SOSO_INDEXING_ENABLED: "true", VITE_SOSO_POLICIES_APPROVED: "true",
        VITE_SOSO_CATALOG_APPROVED: "true", VITE_SOSO_JOURNAL_APPROVED: "false",
        VITE_SOSO_SOCIAL_IMAGE_PATH: "", SOSO_SEO_JOURNAL_FIXTURE_PATH: "", ...overrides },
    });
    const result = runGenerator();
    assert.equal(result.status, 0, result.stderr);
    const faq = await readFile(join(folder, "faq.html"), "utf8");
    assert.match(faq, /<h2>When do I pay\?<\/h2>/);
    assert.match(faq, /Pay first, then atelier confirmation/);
    assert.match(faq, /Approved FAQ title/);
    assert.match(faq, /"@type":"FAQPage"/);
    assert.match(await readFile(join(folder, "privacy.html"), "utf8"), /Marketing requires consent/);
    assert.match(await readFile(join(folder, "index.html"), "utf8"), /Approved home title/);
    const product = await readFile(join(folder, "product/test-piece.html"), "utf8");
    assert.match(product, /property="og:image" content="https:\/\/shopsoso.co\/photo.jpg"/);
    const productBody = product.split("<body>")[1];
    for (const value of ["Approved cotton", "Published composition.", "Published product care.", "Published delivery.",
      "Published returns.", "S, M", "130,000", "150,000", 'href="/collections/kaftans"']) assert.ok(productBody.includes(value), value);
    assert.match(product, /"@type":"AggregateOffer"/);
    assert.match(product, /"lowPrice":130000,"highPrice":150000/);
    for (const path of ["index.html", "shop.html", "collections/kaftans.html", "collections/new-arrivals.html"]) {
      const html = await readFile(join(folder, path), "utf8");
      assert.match(html.split("<body>")[1], /<a href="\/product\/test-piece">Test Piece<\/a>/, path);
      assert.doesNotMatch(html, /DRAFT SECRET SENTINEL|private-draft-piece/);
    }
    const newArrivals = await readFile(join(folder, "collections/new-arrivals.html"), "utf8");
    assert.doesNotMatch(newArrivals, /planned-bag/);
    const accessories = await readFile(join(folder, "collections/accessories.html"), "utf8");
    assert.match(accessories.split("<body>")[1], /href="\/product\/planned-bag"/);
    assert.doesNotMatch(accessories, /987654|987,654/);
    const placeholder = await readFile(join(folder, "product/planned-bag.html"), "utf8");
    assert.doesNotMatch(placeholder, /"offers":|987654|987,654/);
    const sitemap = await readFile(join(folder, "sitemap.xml"), "utf8");
    assert.match(sitemap, /https:\/\/shopsoso.co\/privacy/);
    assert.doesNotMatch(sitemap, /\/policies\/(?:hidden|future)/);
    const robots = await readFile(join(folder, "robots.txt"), "utf8");
    assert.match(robots, /Disallow: \/checkout/);
    assert.match(robots, /Disallow: \/staff/);
    const catalogueDisabled = runGenerator({ VITE_SOSO_CATALOG_APPROVED: "false" });
    assert.equal(catalogueDisabled.status, 0, catalogueDisabled.stderr);
    for (const path of ["index.html", "seo-manifest.json", "sitemap.xml", "llms.txt"]) {
      assert.doesNotMatch(await readFile(join(folder, path), "utf8"), /test-piece|planned-bag|Approved cotton|\/collections\/kaftans/);
    }
    await assert.rejects(readFile(join(folder, "product/test-piece.html")));
    const privateBuild = runGenerator({ VITE_SOSO_INDEXING_ENABLED: "false" });
    assert.equal(privateBuild.status, 0, privateBuild.stderr);
    assert.match(await readFile(join(folder, "index.html"), "utf8"), /noindex, nofollow/);
    assert.match(await readFile(join(folder, "robots.txt"), "utf8"), /Disallow: \//);
    await assert.rejects(readFile(join(folder, "seo-manifest.json")));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
