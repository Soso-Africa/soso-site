import type { PlatformContent } from "./platform-content";
import { createHash } from "node:crypto";
import { webmVideoCodec } from "./webm-codec";
import { createMediaStorageService } from "./media-storage";
import {
  MAX_HERO_POSTER_BYTES,
  MAX_HERO_VIDEO_BYTES,
  mediaMimeTypeForPath,
} from "./media-files";

export type HeroMediaInspection = {
  contentType: string;
  declaredContentType?: string;
  size: number;
  animated?: boolean;
  /** Present only for bounded mask validation reads. */
  bytes?: Buffer;
  width?: number;
  height?: number;
  sha256?: string;
  videoCodec?: string;
};
export type HeroMediaInspector = (path: string, verifyIdentity?: boolean) => Promise<HeroMediaInspection | null>;
export type HeroMediaValidationIssue = { path: string[]; message: string };

const storage = createMediaStorageService();

export const inspectStoredHeroMedia: HeroMediaInspector = async (path, verifyIdentity = false) => {
  const uploadedPrefix = "/api/storage/objects/";
  if (path.startsWith(uploadedPrefix)) {
    const relative = path.slice(uploadedPrefix.length);
    const inspection = await storage.inspectUploadedMedia(relative);
    // R2 already reads the complete bounded object and revalidates its strong
    // ETag on cache hits. Reuse that evidence instead of downloading it twice.
    if (!verifyIdentity || inspection.sha256) return inspection;
    // Both providers support a bounded original-byte read. Never read a
    // transformation, public backup or delivery rendition to establish identity.
    const bytes = await storage.readUploadedImageBytes(relative, MAX_HERO_VIDEO_BYTES);
    return {
      ...inspection,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      videoCodec: inspection.contentType === "video/webm" ? webmVideoCodec(bytes) : undefined,
    };
  }
  const publicPrefix = "/api/storage/public-objects/";
  if (path.startsWith(publicPrefix)) {
    return storage.inspectPublicMedia(path.slice(publicPrefix.length));
  }
  return null;
};

export async function validateHomepageHeroMediaAssets(
  content: PlatformContent,
  inspect: HeroMediaInspector = inspectStoredHeroMedia,
): Promise<HeroMediaValidationIssue[]> {
  const { hero } = content.homepage;
  const issues: HeroMediaValidationIssue[] = [];
  const inspections = new Map<string, Promise<HeroMediaInspection | null>>();
  const assets = [
    { key: "imageUrl", path: hero.imageUrl, kind: "poster" as const },
    { key: "mobileImageUrl", path: hero.mobileImageUrl, kind: "poster" as const },
    ...(hero.mediaMode === "video" ? [
      { key: "videoUrl", path: hero.videoUrl!, kind: "video" as const, hash: hero.videoWebmAlternative?.sourceSha256 },
      { key: "mobileVideoUrl", path: hero.mobileVideoUrl!, kind: "video" as const, hash: hero.mobileVideoWebmAlternative?.sourceSha256 },
      ...(["videoWebmAlternative", "mobileVideoWebmAlternative"] as const).flatMap((key) => {
        const alternate = hero[key];
        return alternate ? [{ key, path: alternate.webmUrl, kind: "video" as const, hash: alternate.webmSha256, vp9: true }] : [];
      }),
    ] : []),
  ];

  for (const asset of assets) {
    try {
      const hash = "hash" in asset ? asset.hash : undefined;
      const identity = `${Boolean(hash)}:${asset.path}`;
      let pending = inspections.get(identity);
      if (!pending) {
        pending = inspect(asset.path, Boolean(hash));
        inspections.set(identity, pending);
      }
      const inspected = await pending;
      if (!inspected) {
        if (hash) throw new Error("Alternative identity must be stored and verifiable");
        continue;
      }
      if (hash && (inspected.sha256 !== hash || ("vp9" in asset && inspected.videoCodec !== "V_VP9"))) {
        issues.push({
          path: ["homepage", "hero", asset.key],
          message: "Alternative approval must match the exact stored original and VP9 WebM bytes; re-approve changed files",
        });
      }
      const expectedType = mediaMimeTypeForPath(asset.path);
      const maxBytes = asset.kind === "poster" ? MAX_HERO_POSTER_BYTES : MAX_HERO_VIDEO_BYTES;
      if (!Number.isSafeInteger(inspected.size) || inspected.size < 1 || inspected.size > maxBytes) {
        issues.push({
          path: ["homepage", "hero", asset.key],
          message: `${asset.kind === "poster" ? "Hero poster" : "Hero video"} exceeds its ${maxBytes} byte publishing budget`,
        });
      }
      if (
        !expectedType
        || inspected.contentType !== expectedType
        || inspected.declaredContentType !== expectedType
      ) {
        issues.push({
          path: ["homepage", "hero", asset.key],
          message: `Stored ${asset.kind} bytes, MIME type, and configured file extension must match`,
        });
      }
      if (asset.kind === "poster" && inspected.animated === true) {
        issues.push({
          path: ["homepage", "hero", asset.key],
          message: "Hero posters and fallbacks must be static for reduced-motion and data-saving visitors",
        });
      }
    } catch {
      issues.push({
        path: ["homepage", "hero", asset.key],
        message: "Stored hero media could not be verified",
      });
    }
  }
  return issues;
}