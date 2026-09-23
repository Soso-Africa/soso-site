import assert from "node:assert/strict";
import test from "node:test";
import {
  legacyAboutBySlug,
  legacyAboutPages,
  isLegacyEditoriallyApproved,
  legacyContentRevision,
  legacyEditorialReviewBySlug,
  legacyEditorialReviews,
  legacyJournalBySlug,
  legacyJournalEditorialPosts,
  legacyJournalPosts,
  legacyJournalSourcePosts,
  publishedLegacyAboutPages,
  publishedLegacyJournalPosts,
  verifiedEditorialMedia,
} from "./legacy-content";
import inventory from "../../../../docs/soso-legacy-content-inventory.json";
import { legacyRedirects } from "./legacy-redirects";

test("legacy migration preserves every audited About page and journal article", () => {
  assert.equal(legacyAboutPages.length, 7);
  assert.equal(legacyJournalEditorialPosts.length, 14);
  assert.equal(legacyJournalPosts.length, 0);
  assert.equal(legacyJournalSourcePosts.length, 14);
  assert.equal(new Set(legacyAboutPages.map(({ slug }) => slug)).size, 7);
  assert.equal(new Set(legacyJournalEditorialPosts.map(({ slug }) => slug)).size, 14);

  for (const item of [...legacyAboutPages, ...legacyJournalEditorialPosts]) {
    assert.match(item.sourceUrl, /^https:\/\/shopsoso\.co\//);
    assert.ok(item.title.length > 2);
    assert.ok(item.body.length > 100);
    assert.ok(item.seoTitle);
    assert.ok(item.seoDescription);
    assert.ok(item.mediaUrls.every((url) => url.startsWith("https://shopsoso.co/wp-content/uploads/")));
  }
});

test("pending editorial records are inaccessible to public routes", () => {
  assert.equal(publishedLegacyAboutPages.length, 0);
  assert.equal(publishedLegacyJournalPosts.length, 0);
  assert.equal(legacyJournalPosts.length, 0);
  assert.equal(legacyAboutBySlug.size, 0);
  assert.equal(legacyJournalBySlug.size, 0);
});

test("editorial approval requires verified mirrors and exposes only SOSO-owned paths", () => {
  const record = structuredClone(inventory.items.find((item) => item.mediaUrls.length > 0)!) as {
    sourceUrl: string;
    approvalStatus: string;
    mediaUrls: string[];
    mirroredMedia?: Array<{ sourceUrl: string; mirrorPath: string; sha256: string }>;
  };
  record.approvalStatus = "approved";
  assert.equal(verifiedEditorialMedia(record), null);
  record.mirroredMedia = record.mediaUrls.map((sourceUrl, index) => ({
    sourceUrl,
    mirrorPath: `/api/storage/objects/legacy-editorial/image-${index}.webp`,
    sha256: "b".repeat(64),
  }));
  const mirrors = verifiedEditorialMedia(record);
  assert.ok(mirrors);
  assert.deepEqual([...mirrors.values()], record.mirroredMedia.map(({ mirrorPath }) => mirrorPath));
  assert.ok([...mirrors.values()].every((path) => !path.includes("shopsoso.co")));
});

test("journal presentation records are cloned without changing the source archive", () => {
  for (const source of legacyJournalSourcePosts) {
    const presentation = legacyJournalEditorialPosts.find(({ slug }) => slug === source.slug);
    assert.ok(presentation);
    assert.notEqual(presentation, source, `${source.slug} must be a cloned presentation record`);
    assert.equal(source.takeaway, undefined, `${source.slug} source must not receive a presentation takeaway`);
    assert.equal(source.relatedArticleSlugs.length, 0, `${source.slug} source links must remain imported values`);
    assert.ok(!source.seoTitle.includes("| SOSO Africa"), `${source.slug} source SEO title must remain imported`);
  }
  const sourceHub = legacyJournalSourcePosts.find(({ slug }) => slug === "abuja-modern-menswear-hub");
  const presentationHub = legacyJournalEditorialPosts.find(({ slug }) => slug === "abuja-modern-menswear-hub");
  assert.ok(sourceHub && presentationHub);
  assert.ok(!sourceHub.body.startsWith("## A new era of kaftan style"));
  assert.ok(presentationHub.body.startsWith("## A new era of kaftan style"));
});

test("every legacy journal article has complete editorial SEO and restrained conversion paths", () => {
  const journalSlugs = new Set(legacyJournalEditorialPosts.map(({ slug }) => slug));
  for (const article of legacyJournalEditorialPosts) {
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

test("every migrated destination has a complete editorial approval record", () => {
  const migrated = [...legacyAboutPages, ...legacyJournalEditorialPosts];
  assert.equal(legacyEditorialReviews.length, migrated.length);
  assert.equal(new Set(legacyEditorialReviews.map(({ slug }) => slug)).size, migrated.length);

  for (const item of migrated) {
    const review = legacyEditorialReviewBySlug.get(item.slug);
    assert.equal(review?.status, "approved");
    assert.equal(review?.reviewedAt, "2026-09-01");
    assert.ok(review?.evidence.includes(item.sourceUrl));
    assert.ok((review?.decisions.length ?? 0) > 0);
    assert.equal(review?.revision, legacyContentRevision(item));
    assert.equal(isLegacyEditoriallyApproved(item), true);
  }
});

test("legacy approval fails closed for missing, pending, and edited revisions", () => {
  const item = legacyJournalEditorialPosts[0]!;
  const approval = legacyEditorialReviewBySlug.get(item.slug);
  assert.ok(approval);
  assert.equal(isLegacyEditoriallyApproved(item, new Map()), false);
  assert.equal(isLegacyEditoriallyApproved(item, new Map([[item.slug, { ...approval, status: "pending" }]])), false);
  assert.equal(isLegacyEditoriallyApproved({ ...item, body: `${item.body}\nUnreviewed claim.` }), false);
  assert.equal(isLegacyEditoriallyApproved({ ...item, seoTitle: `${item.seoTitle} — unreviewed claim` }), false);
  assert.equal(isLegacyEditoriallyApproved({ ...item, seoDescription: `${item.seoDescription} Unreviewed claim.` }), false);
  assert.equal(isLegacyEditoriallyApproved({ ...item, authorName: "Unreviewed author claim" }), false);
  assert.equal(isLegacyEditoriallyApproved({ ...item, canonicalPath: "/journal/unreviewed-destination" }), false);
});

test("reviewed partner copy excludes unsubstantiated investment and market claims", () => {
  const partner = legacyAboutPages.find(({ slug }) => slug === "partner-with-us");
  assert.ok(partner);
  assert.doesNotMatch(partner.body, /\$(?:867|1\.76|73\.59|14\.72|500)\s*[BT]/i);
  assert.doesNotMatch(partner.body, /first[- ]mover|projected 2034|positioned to scale/i);
  assert.match(partner.body, /not an investment offer, franchise offer, forecast/i);
});

test("reviewed About copy removes unsupported absolutes, totals, and guaranteed timelines", () => {
  const corpus = legacyAboutPages.map(({ body }) => body).join("\n");
  assert.doesNotMatch(corpus, /empowered dozens|finest mills across the globe|We release new collections in rhythm with the four seasons/i);
  assert.match(corpus, /supporting records|confirmed directly|when confirmed/i);
});

test("every preserved source has a permanent redirect and canonical destination", () => {
  for (const item of [...legacyAboutPages, ...legacyJournalEditorialPosts]) {
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
