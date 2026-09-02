import type { PlatformContent } from "./platform-content";
import { CloudinaryStorageService } from "./cloudinary-storage";
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
};
export type HeroMediaInspector = (path: string) => Promise<HeroMediaInspection | null>;
export type HeroMediaValidationIssue = { path: string[]; message: string };

const storage = new CloudinaryStorageService();

export const inspectStoredHeroMedia: HeroMediaInspector = async (path) => {
  const uploadedPrefix = "/api/storage/objects/";
  if (path.startsWith(uploadedPrefix)) {
    return storage.inspectUploadedMedia(path.slice(uploadedPrefix.length));
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
  const assets = [
    { key: "imageUrl", path: hero.imageUrl, kind: "poster" as const },
    { key: "mobileImageUrl", path: hero.mobileImageUrl, kind: "poster" as const },
    ...(hero.mediaMode === "video" ? [
      { key: "videoUrl", path: hero.videoUrl!, kind: "video" as const },
      { key: "mobileVideoUrl", path: hero.mobileVideoUrl!, kind: "video" as const },
    ] : []),
  ];

  for (const asset of assets) {
    try {
      const inspected = await inspect(asset.path);
      if (!inspected) continue;
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