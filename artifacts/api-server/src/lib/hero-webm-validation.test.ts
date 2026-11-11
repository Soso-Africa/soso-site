import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { pool } from "@workspace/db";
import { DEFAULT_PLATFORM_CONTENT, PlatformContentSchema, mergePlatformContentDefaults } from "./platform-content";
import { validateHomepageHeroMediaAssets } from "./hero-media-validation";
import { managedMediaReferences } from "./managed-media-references";
import { webmVideoCodec } from "./webm-codec";

after(async () => { await pool.end(); });
const original = "/api/storage/objects/uploads/merchant.mp4";
const webm = "/api/storage/objects/uploads/merchant.webm";
function fixture() {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  content.homepage.hero.videoUrl = original;
  content.homepage.hero.videoWebmAlternative = {
    sourceUrl: original, webmUrl: webm, sourceSha256: "a".repeat(64), webmSha256: "b".repeat(64), sameFootageApproved: true,
  };
  return content;
}
test("same-footage alternatives round-trip without being attached to unrelated legacy footage", () => {
  const content = fixture();
  assert.deepEqual(PlatformContentSchema.parse(content).homepage.hero.videoWebmAlternative, content.homepage.hero.videoWebmAlternative);
  assert.deepEqual((mergePlatformContentDefaults(content) as typeof content).homepage.hero.videoWebmAlternative, content.homepage.hero.videoWebmAlternative);
  assert.equal(DEFAULT_PLATFORM_CONTENT.homepage.hero.videoWebmAlternative, undefined);
  const refs = [...managedMediaReferences(content).values()];
  assert.ok(refs.some((ref) => ref.path === "uploads/merchant.webm"), "Normal publication/privacy/cleanup reference traversal must retain the alternate");
});
test("alternates require explicit approval, matching originals, and governed storage", () => {
  for (const change of [
    { sourceUrl: "/api/storage/objects/uploads/different.mp4" },
    { webmUrl: "https://example.com/other.webm" }, { webmUrl: "/media/unrelated.webm" },
    { sameFootageApproved: false }, { webmSha256: "fake" }, { sourceUrl: "/media/original.mp4" },
  ]) {
    const content = fixture();
    Object.assign(content.homepage.hero.videoWebmAlternative!, change);
    assert.equal(PlatformContentSchema.safeParse(content).success, false);
  }
  const image = fixture();
  image.homepage.hero.mediaMode = "image";
  delete image.homepage.hero.videoUrl;
  delete image.homepage.hero.mobileVideoUrl;
  assert.equal(PlatformContentSchema.safeParse(image).success, false);
});
test("draft and publishing validator checks both original hashes, VP9 identity, MIME and budgets", async () => {
  const content = fixture();
  const inspect = async (path: string) => path === original || path === webm ? {
    size: 1024,
    contentType: path === original ? "video/mp4" : "video/webm",
    declaredContentType: path === original ? "video/mp4" : "video/webm",
    sha256: (path === original ? "a" : "b").repeat(64),
    videoCodec: path === webm ? "V_VP9" : undefined,
  } : null;
  assert.deepEqual(await validateHomepageHeroMediaAssets(content, inspect), []);
  for (const [path, patch] of [
    [original, { sha256: "c".repeat(64) }],
    [webm, { sha256: "c".repeat(64) }],
    [webm, { videoCodec: "V_VP8" }],
    [webm, { size: 24 * 1024 * 1024 + 1 }],
    [webm, { contentType: "video/mp4" }],
    [webm, { declaredContentType: "application/octet-stream" }],
  ] as const) {
    const issues = await validateHomepageHeroMediaAssets(content, async (candidate) => {
      const result = await inspect(candidate);
      return candidate === path ? { ...result!, ...patch } : result;
    });
    assert.ok(issues.length > 0, JSON.stringify(patch));
  }
  assert.ok((await validateHomepageHeroMediaAssets(content, async () => null)).length > 0, "Identity inspection cannot silently skip unknown uploads");
});
test("codec evidence reads real WebM tracks, not arbitrary VP9 text", () => {
  for (const target of ["desktop", "mobile"]) {
    const bytes = readFileSync(new URL(`../../../soso-store/public/media/soso-craft-hero-${target}.webm`, import.meta.url));
    assert.equal(webmVideoCodec(bytes), "V_VP9");
    assert.equal(webmVideoCodec(bytes.subarray(0, 80)), undefined);
  }
  assert.equal(webmVideoCodec(Buffer.from("V_VP9 not a video")), undefined);
});
