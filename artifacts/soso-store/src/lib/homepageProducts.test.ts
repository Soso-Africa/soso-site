import test from "node:test";
import assert from "node:assert/strict";
import { resolveProductMedia, resolveMobileFrames } from "./homepageProducts";

const prov = { source: "s", rights: "r" };
const products = [{ slug: "a-kaftan", name: "A Kaftan", img: "/a1.jpg", images: [{ src: "/a1.jpg", alt: "front", provenance: prov }, { src: "/a2.jpg", alt: "back", provenance: prov }] }];

test("binds frames, name and PDP to the product", () => {
  const r = resolveProductMedia("a-kaftan", products, ["/a2.jpg", "/a1.jpg", "/x.jpg"])!;
  assert.deepEqual(r.frames, ["/a2.jpg", "/a1.jpg"]);
  assert.equal(r.pdpHref, "/product/a-kaftan");
  assert.equal(r.name, "A Kaftan");
  assert.equal(r.primaryAlt, "back");
});
test("defaults to primary and caps at 4", () => {
  assert.deepEqual(resolveProductMedia("a-kaftan", products)!.frames, ["/a1.jpg"]);
});
test("caps selected frames at 4", () => {
  const many = [{ slug: "m", name: "M", img: "/1.jpg", images: [1,2,3,4,5].map((n) => ({ src: `/${n}.jpg`, alt: "a", provenance: prov })) }];
  assert.equal(resolveProductMedia("m", many, ["/1.jpg","/2.jpg","/3.jpg","/4.jpg","/5.jpg"])!.frames.length, 4);
});
test("unknown slug has no legacy fallback", () => {
  assert.equal(resolveProductMedia("gone", products, ["/a1.jpg"]), null);
  assert.equal(resolveProductMedia(undefined, products), null);
});
test("mobile frames use any same-product image, not others", () => {
  assert.deepEqual(resolveMobileFrames("a-kaftan", products, ["/a2.jpg", "/other.jpg"]), ["/a2.jpg"]);
  assert.deepEqual(resolveMobileFrames("gone", products, ["/a2.jpg"]), []);
});
