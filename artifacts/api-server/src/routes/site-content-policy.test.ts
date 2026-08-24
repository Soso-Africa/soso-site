import assert from "node:assert/strict";
import test from "node:test";
import {
  publicSiteContent,
  publishSiteDraft,
  saveSiteDraft,
  type SiteContentState,
} from "./site-content-policy";

const published = { heroTitle: "Published title" };
const base: SiteContentState = {
  key: "site",
  draft: { heroTitle: "Draft title" },
  published,
};

test("public reads expose only the published payload", () => {
  assert.deepEqual(publicSiteContent(base), { content: published });
  assert.equal("draft" in publicSiteContent(base), false);
});

test("saving a draft leaves the published payload unchanged", () => {
  const saved = saveSiteDraft(base, { heroTitle: "New draft" }, "editor-1", new Date("2026-08-24T12:00:00.000Z"));
  assert.deepEqual(saved.draft, { heroTitle: "New draft" });
  assert.deepEqual(saved.published, published);
  assert.deepEqual(publicSiteContent(saved), { content: published });
});

test("publishing copies the draft and emits the audit event", () => {
  const result = publishSiteDraft(base, "editor-1", new Date("2026-08-24T12:00:00.000Z"));
  assert.deepEqual(result.row.published, base.draft);
  assert.equal(result.row.publishedByClerkUserId, "editor-1");
  assert.deepEqual(result.audit, {
    actorClerkUserId: "editor-1",
    action: "site_content.published",
    entityType: "site_content",
    entityId: "site",
    metadata: { publishedAt: "2026-08-24T12:00:00.000Z" },
  });
});