import assert from "node:assert/strict";
import test from "node:test";
import { deleteDraftProduct } from "./delete-draft-product";
import { DEFAULT_PLATFORM_CONTENT, PlatformContentSchema } from "./platform-content";

function fixture() {
  return PlatformContentSchema.parse(structuredClone(DEFAULT_PLATFORM_CONTENT));
}

test("deletion repairs required and optional homepage bindings without changing artwork or published inputs", () => {
  const saved = fixture(), slug = saved.homepage.newArrival.productSlug;
  const before = structuredClone(saved);
  saved.homepage.newArrival.editorial.productSlug = slug;
  saved.homepage.fit.productSlug = slug;
  saved.homepage.story.productSlug = slug;
  saved.homepage.categories.items[0]!.productSlug = slug;
  saved.homepage.occasions.items[0]!.productSlug = slug;
  const snapshot = structuredClone(saved);
  const next = deleteDraftProduct(saved, slug)!;
  assert.ok(next);
  assert.equal(next.products.some((product) => product.slug === slug), false);
  assert.ok(next.products.some((product) => product.slug === next.homepage.newArrival.productSlug));
  assert.equal(next.homepage.newArrival.editorial.productSlug, undefined);
  assert.equal(next.homepage.fit.productSlug, undefined);
  assert.equal(next.homepage.story.productSlug, undefined);
  assert.equal(next.homepage.categories.items[0]!.productSlug, undefined);
  assert.equal(next.homepage.occasions.items[0]!.productSlug, undefined);
  assert.equal(next.homepage.newArrival.editorial.imageUrl, before.homepage.newArrival.editorial.imageUrl);
  assert.equal(next.homepage.fit.imageUrl, before.homepage.fit.imageUrl);
  assert.equal(next.homepage.story.imageUrl, before.homepage.story.imageUrl);
  assert.deepEqual(saved, snapshot);
  assert.equal(PlatformContentSchema.safeParse(next).success, true);
});

test("deletion keeps missing-product and last-product safeguards and valid other bindings", () => {
  const saved = fixture();
  assert.equal(deleteDraftProduct(saved, "not-a-product"), null);
  assert.equal(deleteDraftProduct({ ...saved, products: [saved.products[0]!] }, saved.products[0]!.slug), null);
  const bound = saved.homepage.newArrival.productSlug;
  const other = saved.products.find((product) => product.slug !== bound)!;
  assert.equal(deleteDraftProduct(saved, other.slug)!.homepage.newArrival.productSlug, bound);
});
