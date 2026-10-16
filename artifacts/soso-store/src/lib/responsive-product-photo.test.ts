import assert from "node:assert/strict";
import test from "node:test";
import { responsiveProductPhoto } from "./responsive-product-photo";

test("managed photos use only the four bounded API delivery widths", () => {
  const photo = "/api/storage/objects/uploads/photo.jpg";
  const response = responsiveProductPhoto(photo, "96px");
  assert.equal(response.sizes, "96px");
  assert.equal(response.decoding, "async");
  assert.deepEqual(response.srcSet?.split(", "), [480, 768, 1280, 1600].map(w => `${photo}?w=${w} ${w}w`));
  assert.equal("src" in response, false, "Logical source and full-resolution zoom remain unchanged");
});

test("direct unsigned Cloudinary photos also get non-cropping bounded deliveries", () => {
  const original = "https://res.cloudinary.com/soso/image/upload/v123/soso-store/uploads/photo.png";
  const response = responsiveProductPhoto(original);
  assert.ok(response.srcSet?.includes("/upload/c_limit,w_480,q_auto:good,f_auto/v123/soso-store/uploads/photo.png 480w"));
  assert.ok(response.srcSet?.includes("w_1600"));
  assert.equal(response.srcSet?.includes("c_crop"), false);
});

test("signed, already transformed, animated, video and unrelated URLs are unchanged", () => {
  for (const original of [
    "https://res.cloudinary.com/soso/image/upload/s--signed--/photo.jpg",
    "https://res.cloudinary.com/soso/image/upload/c_fill,w_900/photo.jpg",
    "https://res.cloudinary.com/soso/image/upload/photo.jpg?token=opaque",
    "/api/storage/objects/uploads/animation.webp",
    "/api/storage/objects/uploads/animation.gif",
    "https://res.cloudinary.com/soso/video/upload/hero.mp4",
    "https://example.com/photo.png",
  ]) assert.deepEqual(responsiveProductPhoto(original), {});
});
