import assert from "node:assert/strict";
import test from "node:test";
import { RequestUploadUrlBody } from "@workspace/api-zod";
import { isAnimatedImage } from "../lib/media-files";
import {
  cloudinaryDeliveryUrlForPath,
  createCloudinarySignature,
  cloudinaryUploadPolicyForContentType,
  CloudinaryStorageService,
  MediaNotFoundError,
} from "../lib/cloudinary-storage";
import { detectMediaContentType, parseMediaByteRange } from "./storage";

test("stored media detection accepts only approved image and video signatures", () => {
  assert.equal(detectMediaContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectMediaContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(detectMediaContentType(Buffer.from("GIF89a", "ascii")), "image/gif");
  assert.equal(detectMediaContentType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")])), "image/webp");
  const mp4 = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftypisom", "ascii"),
    Buffer.alloc(12),
    Buffer.from([0, 0, 0, 8]),
    Buffer.from("moov", "ascii"),
  ]);
  const webm = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.from("webm", "ascii"),
    Buffer.from([0x18, 0x53, 0x80, 0x67, 0x16, 0x54, 0xae, 0x6b]),
  ]);
  assert.equal(detectMediaContentType(mp4), "video/mp4");
  assert.equal(detectMediaContentType(webm), "video/webm");
  assert.equal(detectMediaContentType(Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.alloc(8)])), null);
  assert.equal(detectMediaContentType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42])), null);
  assert.equal(detectMediaContentType(Buffer.from("<script>alert(1)</script>", "utf8")), null);
  assert.equal(detectMediaContentType(Buffer.from("<svg onload=alert(1)>", "utf8")), null);
});

test("video byte ranges support bounded, open-ended, and suffix requests", () => {
  assert.deepEqual(parseMediaByteRange("bytes=100-199", 1_000), { start: 100, end: 199 });
  assert.deepEqual(parseMediaByteRange("bytes=900-", 1_000), { start: 900, end: 999 });
  assert.deepEqual(parseMediaByteRange("bytes=-250", 1_000), { start: 750, end: 999 });
  assert.deepEqual(parseMediaByteRange("bytes=-2000", 1_000), { start: 0, end: 999 });
  assert.equal(parseMediaByteRange("bytes=1000-", 1_000), null);
  assert.equal(parseMediaByteRange("bytes=200-100", 1_000), null);
  assert.equal(parseMediaByteRange("bytes=0-1,4-5", 1_000), null);
});

test("the generated upload contract accepts governed video metadata", () => {
  assert.equal(RequestUploadUrlBody.safeParse({
    name: "homepage-hero.mp4",
    size: 4_000_000,
    contentType: "video/mp4",
  }).success, true);
  assert.equal(RequestUploadUrlBody.safeParse({
    name: "homepage-hero.mov",
    size: 4_000_000,
    contentType: "video/quicktime",
  }).success, false);
});

test("Cloudinary signatures are deterministic and exclude transport-only fields", () => {
  assert.equal(
    createCloudinarySignature({ timestamp: 1_700_000_000, public_id: "soso-store/uploads/example" }, "secret"),
    createCloudinarySignature({ public_id: "soso-store/uploads/example", timestamp: 1_700_000_000 }, "secret"),
  );
});

test("Cloudinary upload policies enforce separate formats and byte limits", () => {
  assert.deepEqual(cloudinaryUploadPolicyForContentType("image/webp"), {
    resourceType: "image",
    preset: "soso-governed-image-v1",
    allowedFormats: ["jpg", "jpeg", "png", "webp", "gif"],
    maxFileSize: 12 * 1024 * 1024,
  });
  assert.deepEqual(cloudinaryUploadPolicyForContentType("video/mp4"), {
    resourceType: "video",
    preset: "soso-governed-video-v1",
    allowedFormats: ["mp4", "webm"],
    maxFileSize: 8 * 1024 * 1024,
  });
  assert.throws(() => cloudinaryUploadPolicyForContentType("image/svg+xml"));
});

test("the production diagnostic attempts cleanup after an ambiguous upload failure", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
  const requestedURLs: string[] = [];
  process.env.CLOUDINARY_CLOUD_NAME = "diagnostic-cloud";
  process.env.CLOUDINARY_API_KEY = "diagnostic-key";
  process.env.CLOUDINARY_API_SECRET = "diagnostic-secret";
  globalThis.fetch = async (input): Promise<Response> => {
    const url = String(input);
    requestedURLs.push(url);
    if (url.includes("/upload_presets/")) return new Response(null, { status: 200 });
    if (url.endsWith("/image/upload")) throw new Error("connection reset after remote acceptance");
    if (url.endsWith("/image/destroy")) return new Response(null, { status: 200 });
    throw new Error(`Unexpected diagnostic request: ${url}`);
  };

  try {
    await assert.rejects(
      new CloudinaryStorageService().runDiagnostic(),
      /connection reset after remote acceptance/,
    );
    assert.equal(requestedURLs.some((url) => url.endsWith("/image/upload")), true);
    assert.equal(requestedURLs.some((url) => url.endsWith("/image/destroy")), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnvironment.cloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
    else process.env.CLOUDINARY_CLOUD_NAME = originalEnvironment.cloudName;
    if (originalEnvironment.apiKey === undefined) delete process.env.CLOUDINARY_API_KEY;
    else process.env.CLOUDINARY_API_KEY = originalEnvironment.apiKey;
    if (originalEnvironment.apiSecret === undefined) delete process.env.CLOUDINARY_API_SECRET;
    else process.env.CLOUDINARY_API_SECRET = originalEnvironment.apiSecret;
  }
});

test("legacy storage paths resolve only to SOSO-owned Cloudinary delivery URLs", () => {
  assert.equal(
    cloudinaryDeliveryUrlForPath("uploads/example-photo.jpg", "uploads", "demo"),
    "https://res.cloudinary.com/demo/image/upload/soso-store/uploads/example-photo.jpg",
  );
  assert.equal(
    cloudinaryDeliveryUrlForPath("uploads/hero.webm", "uploads", "demo"),
    "https://res.cloudinary.com/demo/video/upload/soso-store/uploads/hero.webm",
  );
  assert.throws(
    () => cloudinaryDeliveryUrlForPath("../private.jpg", "uploads", "demo"),
    MediaNotFoundError,
  );
  assert.throws(
    () => cloudinaryDeliveryUrlForPath("uploads/payload.svg", "uploads", "demo"),
    MediaNotFoundError,
  );
});

test("hero image inspection identifies GIF, APNG, and animated WebP", () => {
  assert.equal(isAnimatedImage(Buffer.from("GIF89a", "ascii"), "image/gif"), true);
  assert.equal(isAnimatedImage(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("acTL", "ascii"),
  ]), "image/png"), true);
  const animatedWebp = Buffer.alloc(24);
  animatedWebp.write("RIFF", 0, "ascii");
  animatedWebp.write("WEBP", 8, "ascii");
  animatedWebp.write("VP8X", 12, "ascii");
  animatedWebp[20] = 0x02;
  assert.equal(isAnimatedImage(animatedWebp, "image/webp"), true);
  assert.equal(isAnimatedImage(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg"), false);
});