import assert from "node:assert/strict";
import test from "node:test";
import { buildSitemap, normalizeApprovedSiteUrl } from "./sitemap";

const approvedRelease = {
  VITE_PUBLIC_SITE_URL: "https://www.soso.example",
  VITE_SOSO_INDEXING_ENABLED: "true",
  VITE_SOSO_CATALOG_APPROVED: "true",
  VITE_SOSO_POLICIES_APPROVED: "true",
};

test("sitemap stays unavailable without an approved origin and indexing switch", () => {
  assert.equal(buildSitemap({ ...approvedRelease, VITE_SOSO_INDEXING_ENABLED: "false" }), null);
  assert.equal(buildSitemap({ ...approvedRelease, VITE_PUBLIC_SITE_URL: "" }), null);
  assert.equal(buildSitemap({ ...approvedRelease, VITE_PUBLIC_SITE_URL: "https://preview.replit.dev" }), null);
});

test("sitemap lists only routed and release-approved static pages", () => {
  const sitemap = buildSitemap(approvedRelease);
  assert.ok(sitemap);
  assert.match(sitemap, /https:\/\/www\.soso\.example\/collections\/kaftans/);
  assert.match(sitemap, /https:\/\/www\.soso\.example\/policies/);
  assert.doesNotMatch(sitemap, /\/sizing/);
  assert.doesNotMatch(sitemap, /\/checkout|\/staff|\/sign-in|\/journal\//);
  assert.doesNotMatch(sitemap, /<lastmod>/);
});

test("catalogue and policy URLs remain private until their individual approvals", () => {
  const sitemap = buildSitemap({
    ...approvedRelease,
    VITE_SOSO_CATALOG_APPROVED: "false",
    VITE_SOSO_POLICIES_APPROVED: "false",
  });
  assert.ok(sitemap);
  assert.doesNotMatch(sitemap, /\/shop|\/collections\/|\/policies|\/privacy|\/terms|\/delivery-returns|\/care/);
  assert.match(sitemap, /https:\/\/www\.soso\.example\/about/);
});

test("only a clean HTTPS canonical origin is accepted", () => {
  assert.equal(normalizeApprovedSiteUrl("http://www.soso.example"), "");
  assert.equal(normalizeApprovedSiteUrl("https://user:password@soso.example"), "");
  assert.equal(normalizeApprovedSiteUrl("https://soso.example/?campaign=test"), "");
  assert.equal(normalizeApprovedSiteUrl("https://soso.example/"), "https://soso.example");
});