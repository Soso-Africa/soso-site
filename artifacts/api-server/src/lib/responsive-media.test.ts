import assert from "node:assert/strict";
import { test } from "node:test";
import { responsivePhotoDelivery } from "./responsive-media";

test("authentic photos get bounded, non-cropping delivery variants", () => {
  const original = "https://res.cloudinary.com/soso/image/upload/soso-store/uploads/photo.jpg";
  assert.equal(responsivePhotoDelivery(original, 480),
    "https://res.cloudinary.com/soso/image/upload/c_limit,w_480,q_auto:good,f_auto/soso-store/uploads/photo.jpg");
  assert.equal(responsivePhotoDelivery(original, 123), original);
});
test("signed deliveries, video, animation and unrelated providers remain untouched", () => {
  for (const original of [
    "https://res.cloudinary.com/soso/image/upload/s--signed--/photo.jpg",
    "https://res.cloudinary.com/soso/video/upload/hero.mp4",
    "https://res.cloudinary.com/soso/image/upload/animation.gif",
    "https://res.cloudinary.com/soso/image/upload/animation.webp",
    "https://example.com/image/upload/photo.jpg",
  ]) assert.equal(responsivePhotoDelivery(original, 768), original);
});
