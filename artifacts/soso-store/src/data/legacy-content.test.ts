import assert from "node:assert/strict";
import test from "node:test";
import { legacyAboutPages, legacyJournalPosts, legacyJournalSourcePosts } from "./legacy-content";
import { legacyRedirects } from "./legacy-redirects";

test("legacy migration preserves every audited About page and journal article", () => {
  assert.equal(legacyAboutPages.length, 7);
  assert.equal(legacyJournalPosts.length, 14);
  assert.equal(legacyJournalSourcePosts.length, 14);
  assert.equal(new Set(legacyAboutPages.map(({ slug }) => slug)).size, 7);
  assert.equal(new Set(legacyJournalPosts.map(({ slug }) => slug)).size, 14);

  for (const item of [...legacyAboutPages, ...legacyJournalPosts]) {
    assert.match(item.sourceUrl, /^https:\/\/shopsoso\.co\//);
    assert.ok(item.title.length > 2);
    assert.ok(item.body.length > 100);
    assert.ok(item.seoTitle);
    assert.ok(item.seoDescription);
    assert.ok(item.mediaUrls.every((url) => url.startsWith("https://shopsoso.co/wp-content/uploads/")));
  }
});

test("journal presentation records are cloned without changing the source archive", () => {
  for (const source of legacyJournalSourcePosts) {
    const presentation = legacyJournalPosts.find(({ slug }) => slug === source.slug);
    assert.ok(presentation);
    assert.notEqual(presentation, source, `${source.slug} must be a cloned presentation record`);
    assert.equal(source.takeaway, undefined, `${source.slug} source must not receive a presentation takeaway`);
    assert.equal(source.relatedArticleSlugs.length, 0, `${source.slug} source links must remain imported values`);
    assert.ok(!source.seoTitle.includes("| SOSO Africa"), `${source.slug} source SEO title must remain imported`);
  }
  const sourceHub = legacyJournalSourcePosts.find(({ slug }) => slug === "abuja-modern-menswear-hub");
  const presentationHub = legacyJournalPosts.find(({ slug }) => slug === "abuja-modern-menswear-hub");
  assert.ok(sourceHub && presentationHub);
  assert.ok(!sourceHub.body.startsWith("## A new era of kaftan style"));
  assert.ok(presentationHub.body.startsWith("## A new era of kaftan style"));
});

test("every legacy journal article has complete editorial SEO and restrained conversion paths", () => {
  const journalSlugs = new Set(legacyJournalPosts.map(({ slug }) => slug));
  for (const article of legacyJournalPosts) {
    assert.equal(article.canonicalPath, `/journal/${article.slug}`);
    assert.ok(article.takeaway && article.takeaway.length >= 40, `${article.slug} needs a near-opening answer`);
    assert.ok(article.body.includes("## "), `${article.slug} needs logical article headings`);
    assert.ok(article.seoTitle.includes("SOSO Africa"), `${article.slug} needs a branded SEO title`);
    assert.ok(article.seoDescription.length >= 40, `${article.slug} needs a useful meta description`);
    assert.ok(article.coverImageAlt.length >= 12 && article.coverImageAlt !== article.title, `${article.slug} needs descriptive image alt text`);
    assert.ok(article.relatedArticleSlugs.length > 0, `${article.slug} needs related reading`);
    assert.ok(article.relatedArticleSlugs.every((slug) => journalSlugs.has(slug) && slug !== article.slug), `${article.slug} has an invalid related article`);
  }
});
test("every preserved source has a permanent redirect and canonical destination", () => {
  for (const item of [...legacyAboutPages, ...legacyJournalPosts]) {
    const sourcePath = new URL(item.sourceUrl).pathname;
    const redirect = legacyRedirects.find(({ fromPath }) => fromPath === sourcePath);
    assert.equal(redirect?.toPath, item.canonicalPath);
    assert.equal(redirect?.statusCode, 301);
  }
  assert.deepEqual(
    legacyRedirects.find(({ fromPath }) => fromPath === "/danshiki/"),
    { fromPath: "/danshiki/", toPath: "/collections/dashikis", statusCode: 301 },
  );
});

test("redirect map contains no obsolete WordPress test or plugin pages", () => {
  const retired = ["/sample-page/", "/shop1111/", "/shop11111/", "/shopsoso/", "/wishlist/", "/success/"];
  for (const path of retired) assert.equal(legacyRedirects.some(({ fromPath }) => fromPath === path), false);
});