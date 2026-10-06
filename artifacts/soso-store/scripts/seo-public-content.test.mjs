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
      products: [{ slug: "test-piece", name: "Test Piece", description: "Approved description", img: "", images: [{ src: "/photo.jpg" }] }],
    };
    const mock = `export default { Pool: class { async query(sql) {
      if(sql.includes("soso_site_content")) return {rows:[{published:${JSON.stringify(published)}}]};
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
    const result = spawnSync("pnpm", ["--dir", new URL("../../../scripts", import.meta.url).pathname, "exec", "tsx", "--experimental-loader", join(folder, "loader.mjs"), new URL("./generate-seo-assets.mjs", import.meta.url).pathname], {
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "postgres://synthetic-test-only",
        SOSO_SEO_OUTPUT_DIR: folder, VITE_PUBLIC_SITE_URL: "https://shopsoso.co",
        VITE_SOSO_INDEXING_ENABLED: "true", VITE_SOSO_POLICIES_APPROVED: "true",
        VITE_SOSO_CATALOG_APPROVED: "true", VITE_SOSO_JOURNAL_APPROVED: "false",
        VITE_SOSO_SOCIAL_IMAGE_PATH: "", SOSO_SEO_JOURNAL_FIXTURE_PATH: "" },
    });
    assert.equal(result.status, 0, result.stderr);
    const faq = await readFile(join(folder, "faq.html"), "utf8");
    assert.match(faq, /<h2>When do I pay\?<\/h2>/);
    assert.match(faq, /Pay first, then atelier confirmation/);
    assert.match(faq, /Approved FAQ title/);
    assert.match(faq, /"@type":"FAQPage"/);
    assert.match(await readFile(join(folder, "privacy.html"), "utf8"), /Marketing requires consent/);
    assert.match(await readFile(join(folder, "index.html"), "utf8"), /Approved home title/);
    assert.match(await readFile(join(folder, "product/test-piece.html"), "utf8"), /property="og:image" content="https:\/\/shopsoso.co\/photo.jpg"/);
    const sitemap = await readFile(join(folder, "sitemap.xml"), "utf8");
    assert.match(sitemap, /https:\/\/shopsoso.co\/privacy/);
    assert.doesNotMatch(sitemap, /\/policies\/(?:hidden|future)/);
    const robots = await readFile(join(folder, "robots.txt"), "utf8");
    assert.match(robots, /Disallow: \/checkout/);
    assert.match(robots, /Disallow: \/staff/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
