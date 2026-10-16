import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PLATFORM_CONTENT } from "./platform-content";
import { createPublicContentResponses } from "./public-content-responses";
import type { PublicSnapshot } from "./public-platform-cache";

function snapshot(): PublicSnapshot {
  return { content: structuredClone(DEFAULT_PLATFORM_CONTENT), publishedAt: new Date("2026-10-01T00:00:00Z") };
}

test("unchanged snapshots reuse the exact encoded body and ETag", () => {
  const responses = createPublicContentResponses();
  const published = snapshot();
  assert.strictEqual(responses.site(published), responses.site(published));
  assert.strictEqual(responses.platform(published, true), responses.platform(published, true));
  assert.strictEqual(responses.platform(published, false), responses.platform(published, false));
  const response = responses.platform(published, true);
  const parsed = JSON.parse(response.body.toString());
  assert.equal(parsed.publishedAt, published.publishedAt.toISOString());
  assert.equal(parsed.checkoutEnabled, true);
  assert.equal(parsed.content.homepage.seo.title, "SOSO Africa | Premium African Fashion");
  assert.deepEqual(JSON.parse(responses.site(published).body.toString()), { content: published.content.site });
});

test("live checkout activation selects a separate body and never leaks disabled mappings", () => {
  const responses = createPublicContentResponses();
  const published = snapshot();
  published.content.products[0].commerceProductId = "upstream-product";
  published.content.products[0].commerceVariantIds = { s: "upstream-size" };
  const enabled = responses.platform(published, true);
  const disabled = responses.platform(published, false);
  assert.notEqual(disabled.etag, enabled.etag);
  const product = JSON.parse(disabled.body.toString()).content.products[0];
  assert.equal(product.commerceProductId, undefined);
  assert.equal(product.commerceVariantIds, undefined);
  assert.equal(product.commerceMappingConfirmation, undefined);
  assert.equal(JSON.parse(disabled.body.toString()).checkoutEnabled, false);
  assert.equal(JSON.parse(enabled.body.toString()).content.products[0].commerceProductId, "upstream-product");
  assert.strictEqual(responses.platform(published, true), enabled);
  assert.strictEqual(responses.platform(published, false), disabled);
});

test("new snapshots invalidate both bodies even when publishedAt does not change", () => {
  const responses = createPublicContentResponses();
  const before = snapshot();
  const oldSite = responses.site(before);
  const oldPlatform = responses.platform(before, false);
  const after = snapshot();
  after.content.site.footer.description = "New approved description";
  const newSite = responses.site(after);
  const newPlatform = responses.platform(after, false);
  assert.notStrictEqual(newSite, oldSite);
  assert.notEqual(newSite.etag, oldSite.etag);
  assert.notEqual(newPlatform.etag, oldPlatform.etag);
  assert.equal(JSON.parse(newPlatform.body.toString()).content.site.footer.description, "New approved description");
});
