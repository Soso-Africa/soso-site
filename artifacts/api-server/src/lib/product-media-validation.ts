import { open } from "node:fs/promises";
import { resolve } from "node:path";
import type { PlatformContent } from "./platform-content";
import { inspectStoredHeroMedia, type HeroMediaInspection } from "./hero-media-validation";
import {
  detectMediaContentType,
  imageDimensions,
  IMAGE_MEDIA_TYPES,
  MAX_UPLOADED_IMAGE_BYTES,
  mediaMimeTypeForPath,
} from "./media-files";

export type ProductMediaInspector = (path: string) => Promise<HeroMediaInspection | null>;
export type ProductMediaValidationIssue = { path: (string | number)[]; message: string };

async function inspectBundledProductImage(path: string): Promise<HeroMediaInspection | null> {
  if (!path.startsWith("/images/") || path.includes("..") || path.includes("\\")) return null;
  const relativePath = path.replace(/^\/+/, "");
  const candidates = [
    resolve(process.cwd(), "artifacts/soso-store/public", relativePath),
    resolve(process.cwd(), "../artifacts/soso-store/public", relativePath),
    resolve(process.cwd(), "../../artifacts/soso-store/public", relativePath),
    resolve(process.cwd(), "../soso-store/public", relativePath),
  ];

  for (const candidate of candidates) {
    let file;
    try {
      file = await open(candidate, "r");
      const metadata = await file.stat();
      const bytes = Buffer.alloc(Math.min(metadata.size, 65_536));
      await file.read(bytes, 0, bytes.length, 0);
      const expectedType = mediaMimeTypeForPath(path) ?? undefined;
      const contentType = detectMediaContentType(bytes) ?? "";
      const dimensions = imageDimensions(bytes, contentType);
      return {
        contentType,
        declaredContentType: expectedType,
        size: metadata.size,
        ...(dimensions ?? {}),
      };
    } catch {
      // Try the next workspace layout before reporting an invalid path.
    } finally {
      await file?.close();
    }
  }
  return null;
}

export const inspectProductMedia: ProductMediaInspector = async (path) => (
  await inspectStoredHeroMedia(path) ?? await inspectBundledProductImage(path)
);

export async function validateManagedImageAsset(
  path: string,
  inspect: ProductMediaInspector = inspectProductMedia,
): Promise<string | null> {
  try {
    const inspected = await inspect(path);
    if (!inspected) return "Image must be a verified bundled or SOSO Cloudinary asset";
    const expectedType = mediaMimeTypeForPath(path);
    if (!Number.isSafeInteger(inspected.size) || inspected.size < 1 || inspected.size > MAX_UPLOADED_IMAGE_BYTES) {
      return `Image exceeds its ${MAX_UPLOADED_IMAGE_BYTES} byte publishing budget`;
    }
    if (
      !expectedType
      || !IMAGE_MEDIA_TYPES.has(expectedType)
      || inspected.contentType !== expectedType
      || inspected.declaredContentType !== expectedType
    ) {
      return "Image bytes, MIME type, and configured file extension must match";
    }
    return null;
  } catch {
    return "Stored image could not be verified";
  }
}

export async function validateProductMediaAssets(
  content: PlatformContent,
  inspect: ProductMediaInspector = inspectProductMedia,
): Promise<ProductMediaValidationIssue[]> {
  type AssetLocation = { path: (string | number)[]; label: string };
  const uniqueAssets = new Map<string, AssetLocation[]>();
  const addAsset = (source: string, location: AssetLocation) => {
    const locations = uniqueAssets.get(source);
    if (locations) locations.push(location);
    else uniqueAssets.set(source, [location]);
  };
  content.products.forEach((product, productIndex) => {
    product.images.forEach((image, imageIndex) => {
      if (!image.src) return; // An unpublished, unavailable placeholder may have an unfinished image row.
      addAsset(image.src, {
        path: ["products", productIndex, "images", imageIndex, "src"], label: "Product",
      });
    });
    product.materialTurnSets.forEach((turnSet, turnSetIndex) => {
      (["front", "back"] as const).forEach((side) => {
        addAsset(turnSet[side].src, {
          path: ["products", productIndex, "materialTurnSets", turnSetIndex, side, "src"],
          label: `Material turn ${side} image`,
        });
      });
    });
    product.colourOptions.forEach((option, colourIndex) => {
      if (option.previewImageSrc) {
        addAsset(option.previewImageSrc, {
          path: ["products", productIndex, "colourOptions", colourIndex, "previewImageSrc"], label: "Colour preview",
        });
      }
    });
    // Historical mask references stay archived, but never participate in
    // publication or replace the owner's actual product photographs.
  });

  const results = await Promise.all([...uniqueAssets.entries()].map(async ([path, locations]) => {
    const issue = await validateManagedImageAsset(path, inspect);
    return locations.flatMap((location) => {
      const productIssue = issue ? `${issue.slice(0, 1).toLowerCase()}${issue.slice(1)}` : null;
      return productIssue ? [{ path: location.path, message: `${location.label} ${productIssue}` }] : [];
    });
  }));

  return results.flat();
}

export async function validateCollectionMediaAssets(
  content: PlatformContent,
  inspect: ProductMediaInspector = inspectProductMedia,
): Promise<ProductMediaValidationIssue[]> {
  const issues: ProductMediaValidationIssue[] = [];
  await Promise.all(content.collections.map(async (collection, collectionIndex) => {
    if (!collection.showCover || !collection.cover) return;
    await Promise.all(([
      ["cover", collection.cover],
      ["mobileCover", collection.mobileCover],
    ] as const).map(async ([field, asset]) => {
      if (!asset) return;
      const issue = await validateManagedImageAsset(asset.src, inspect);
      if (issue) {
        issues.push({
          path: ["collections", collectionIndex, field, "src"],
          message: `Collection ${field === "mobileCover" ? "phone cover" : "cover"}: ${issue}`,
        });
      }
    }));
  }));
  return issues.sort((a, b) => a.path.join(".").localeCompare(b.path.join(".")));
}
