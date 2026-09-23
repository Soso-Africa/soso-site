import assert from "node:assert/strict";
import test from "node:test";
import { legacyJournalEditorialPosts, legacyJournalPosts } from "../data/legacy-content";
import { isResolvedLegacyJournalIndexable, mergeApprovedJournalPosts } from "./legacy-journal-indexing";
import { seoExposure } from "./seo-exposure";

const legacyPost = legacyJournalEditorialPosts[0]!;

test("legacy journal metadata stays private while CMS resolution is pending or failed", () => {
  const pendingExposure = seoExposure(isResolvedLegacyJournalIndexable({
    legacyPost,
    isLoading: true,
    isError: false,
  }));
  assert.deepEqual(pendingExposure, {
    robots: "noindex, follow",
    canonical: false,
    structuredData: false,
  });
  const failedExposure = seoExposure(isResolvedLegacyJournalIndexable({
    legacyPost,
    apiPost: legacyPost,
    isLoading: false,
    isError: true,
    errorStatus: 503,
  }));
  assert.deepEqual(failedExposure, pendingExposure);
});

test("changed CMS content cannot inherit a migrated slug approval", () => {
  const exposure = seoExposure(isResolvedLegacyJournalIndexable({
    legacyPost,
    apiPost: { ...legacyPost, seoTitle: `${legacyPost.seoTitle} — unreviewed` },
    isLoading: false,
    isError: false,
  }));
  assert.deepEqual(exposure, {
    robots: "noindex, follow",
    canonical: false,
    structuredData: false,
  });
});

test("exact CMS content or a definitive 404 can resolve the legacy indexing gate", () => {
  assert.equal(isResolvedLegacyJournalIndexable({
    legacyPost,
    apiPost: legacyPost,
    isLoading: false,
    isError: false,
  }), true);
  assert.equal(isResolvedLegacyJournalIndexable({
    legacyPost,
    isLoading: false,
    isError: true,
    errorStatus: 404,
  }), true);
});

test("indexable journal surfaces omit a legacy CMS record changed outside its summary fields", () => {
  const changedCmsPost = {
    ...legacyPost,
    body: `${legacyPost.body}\n\nUnreviewed business claim.`,
    seoDescription: `${legacyPost.seoDescription} Unreviewed metadata.`,
  };
  const newCmsPost = {
    ...legacyPost,
    slug: "new-approved-cms-post",
    canonicalPath: "/journal/new-approved-cms-post",
  };
  const visible = mergeApprovedJournalPosts([changedCmsPost, newCmsPost], true);
  assert.equal(visible.some(({ slug }) => slug === legacyPost.slug), false);
  assert.equal(visible.some(({ slug }) => slug === newCmsPost.slug), true);
});

test("indexable journal surfaces accept an exact reviewed CMS revision", () => {
  const visible = mergeApprovedJournalPosts([legacyPost], true);
  assert.equal(visible.filter(({ slug }) => slug === legacyPost.slug).length, 1);
  assert.equal(visible.find(({ slug }) => slug === legacyPost.slug), legacyPost);
});

test("indexable journal surfaces show no bundled cards while CMS resolution is pending or failed", () => {
  assert.deepEqual(mergeApprovedJournalPosts([], false), []);
  assert.deepEqual(mergeApprovedJournalPosts([legacyPost], false), []);
});

test("a successful empty CMS response enables only independently published archival cards", () => {
  const visible = mergeApprovedJournalPosts([], true);
  assert.deepEqual(visible, legacyJournalPosts);
});

test("database and API timestamp representations retain exact legacy approval", () => {
  const databasePost = {
    ...legacyPost,
    publishedAt: new Date(`${legacyPost.publishedAt}Z`),
    updatedAt: new Date(`${legacyPost.updatedAt}Z`),
  };
  const apiPost = {
    ...legacyPost,
    publishedAt: databasePost.publishedAt.toISOString(),
    updatedAt: databasePost.updatedAt.toISOString(),
  };
  assert.equal(isResolvedLegacyJournalIndexable({
    legacyPost,
    apiPost: databasePost,
    isLoading: false,
    isError: false,
  }), true);
  assert.equal(isResolvedLegacyJournalIndexable({
    legacyPost,
    apiPost,
    isLoading: false,
    isError: false,
  }), true);
  assert.equal(mergeApprovedJournalPosts([databasePost], true).some(({ slug }) => slug === legacyPost.slug), true);
  assert.equal(mergeApprovedJournalPosts([apiPost], true).some(({ slug }) => slug === legacyPost.slug), true);
  assert.equal(
    mergeApprovedJournalPosts(
      [{ ...apiPost, body: `${apiPost.body}\nChanged claim.` }],
      true,
    ).some(({ slug }) => slug === legacyPost.slug),
    false,
  );
});
