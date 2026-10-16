import assert from "node:assert/strict";
import test from "node:test";
import { previewPrefix, previewTarget, rewritePreviewAssets } from "./live-public-preview";

test("preview is limited to read-only published content and public assets", () => {
  assert.equal(previewTarget("/content", "GET"), "https://shopsoso.co/api/content/platform");
  assert.equal(previewTarget("/content", "HEAD"), "https://shopsoso.co/api/content/platform");
  assert.equal(previewTarget("/api/storage/objects/uploads/photo.jpg", "GET"), "https://shopsoso.co/api/storage/objects/uploads/photo.jpg");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(previewTarget("/content", method), null);
    assert.equal(previewTarget("/api/storage/objects/uploads/photo.jpg", method), null);
  }
  for (const path of ["/api/staff/content", "/api/commerce/quotes", "/api/auth/user", "https://other.example/images/a.jpg", "//other.example/media/a.webm", "//[invalid]", "/images/../api/staff/content"]) {
    assert.equal(previewTarget(path, "GET"), null);
  }
});

test("public media is routed through the same preview without changing links, commerce or content", () => {
  const original = {
    images: [{ src: "/api/storage/objects/uploads/photo.jpg", alt: "Product photo" }],
    video: "/media/hero.webm",
    image: "/images/soso/piece.jpg",
    cloudinary: "https://res.cloudinary.com/example/image.jpg",
    cta: { href: "/collections/new-arrivals" },
    product: { slug: "utility-navy-two-piece", commerceProductId: "existing-id", price: 250999 },
  };
  const rewritten = rewritePreviewAssets(original, "/__soso_live_preview") as typeof original;
  assert.equal(rewritten.images[0].src, "/__soso_live_preview/api/storage/objects/uploads/photo.jpg");
  assert.equal(rewritten.video, original.video);
  assert.equal(rewritten.image, original.image);
  assert.equal(rewritten.cloudinary, original.cloudinary);
  assert.deepEqual(rewritten.cta, original.cta);
  assert.deepEqual(rewritten.product, original.product);
  assert.equal(original.image, "/images/soso/piece.jpg");
});

test("preview respects the artifact base path", () => {
  assert.equal(previewPrefix("/"), "/__soso_live_preview");
  assert.equal(previewPrefix("/store/"), "/store/__soso_live_preview");
});
