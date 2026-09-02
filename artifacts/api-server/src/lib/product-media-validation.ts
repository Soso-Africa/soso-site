import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import type { PlatformContent } from "./platform-content";
import { inspectStoredHeroMedia, type HeroMediaInspection } from "./hero-media-validation";
import { CloudinaryStorageService } from "./cloudinary-storage";
import {
  detectMediaContentType,
  imageDimensions,
  IMAGE_MEDIA_TYPES,
  MAX_GARMENT_MASK_PIXELS,
  MAX_UPLOADED_IMAGE_BYTES,
  mediaMimeTypeForPath,
} from "./media-files";

export type ProductMediaInspector = (path: string) => Promise<HeroMediaInspection | null>;
export type ProductMediaValidationIssue = { path: (string | number)[]; message: string };
const storage = new CloudinaryStorageService();

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

async function bundledImageBytes(path: string): Promise<Buffer | null> {
  if (!path.startsWith("/images/") || path.includes("..") || path.includes("\\")) return null;
  const relativePath = path.replace(/^\/+/, "");
  for (const candidate of [
    resolve(process.cwd(), "artifacts/soso-store/public", relativePath),
    resolve(process.cwd(), "../artifacts/soso-store/public", relativePath),
    resolve(process.cwd(), "../../artifacts/soso-store/public", relativePath),
    resolve(process.cwd(), "../soso-store/public", relativePath),
  ]) {
    let file;
    try {
      file = await open(candidate, "r");
      const metadata = await file.stat();
      if (metadata.size < 1 || metadata.size > MAX_UPLOADED_IMAGE_BYTES) return null;
      const bytes = Buffer.alloc(metadata.size);
      await file.read(bytes, 0, bytes.length, 0);
      return bytes;
    } catch {
      // Try the next workspace layout.
    } finally {
      await file?.close();
    }
  }
  return null;
}

async function maskBytes(path: string, inspected: HeroMediaInspection): Promise<Buffer | null> {
  if (inspected.bytes) return inspected.bytes;
  if (path.startsWith("/api/storage/objects/uploads/")) {
    return storage.readUploadedImageBytes(path.slice("/api/storage/objects/".length), MAX_UPLOADED_IMAGE_BYTES);
  }
  return bundledImageBytes(path);
}

async function validateGarmentMask(path: string, inspect: ProductMediaInspector): Promise<string | null> {
  const generalIssue = await validateManagedImageAsset(path, inspect);
  if (generalIssue) return generalIssue;
  try {
    const inspected = await inspect(path);
    if (!inspected || inspected.contentType !== "image/png") return "Garment mask must be a verified PNG image";
    const bytes = await maskBytes(path, inspected);
    if (!bytes || bytes.length < 26 || bytes.length > MAX_UPLOADED_IMAGE_BYTES) return "Garment mask bytes could not be read safely";
    // IHDR is the first PNG chunk; its colour-type byte is at offset 25.
    const colourType = bytes[25];
    if (colourType !== 4 && colourType !== 6) return "Garment mask PNG must use an alpha-capable colour type";
    const dimensions = imageDimensions(bytes, "image/png");
    if (
      !dimensions
      || dimensions.width < 1
      || dimensions.height < 1
      || dimensions.width * dimensions.height > MAX_GARMENT_MASK_PIXELS
    ) return `Garment mask must not exceed ${MAX_GARMENT_MASK_PIXELS} decoded pixels`;
    const decoded = PNG.sync.read(bytes);
    let transparent = 0;
    let opaque = 0;
    for (let index = 3; index < decoded.data.length; index += 4) {
      if (decoded.data[index] === 0) transparent += 1;
      if (decoded.data[index] === 255) opaque += 1;
    }
    const pixels = decoded.width * decoded.height;
    if (transparent / pixels >= 0.01 && opaque / pixels >= 0.01) return null;
    return "Garment mask PNG must contain meaningful transparent background and opaque garment coverage";
  } catch {
    return "Garment mask PNG could not be decoded safely";
  }
}

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
  type AssetLocation = { path: (string | number)[]; label: string; mask?: boolean };
  const uniqueAssets = new Map<string, AssetLocation[]>();
  const addAsset = (source: string, location: AssetLocation) => {
    const locations = uniqueAssets.get(source);
    if (locations) locations.push(location);
    else uniqueAssets.set(source, [location]);
  };
  content.products.forEach((product, productIndex) => {
    product.images.forEach((image, imageIndex) => {
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
    if (product.colourVisualizer?.baseImageSrc) {
      addAsset(product.colourVisualizer.baseImageSrc, {
        path: ["products", productIndex, "colourVisualizer", "baseImageSrc"], label: "Colour visualizer base image",
      });
    }
    if (product.colourVisualizer?.garmentMaskSrc) {
      addAsset(product.colourVisualizer.garmentMaskSrc, {
        path: ["products", productIndex, "colourVisualizer", "garmentMaskSrc"], label: "Colour visualizer garment mask", mask: true,
      });
    }
  });

  const results = await Promise.all([...uniqueAssets.entries()].map(async ([path, locations]) => {
    const [generalIssue, maskIssue] = await Promise.all([
      locations.some((location) => !location.mask) ? validateManagedImageAsset(path, inspect) : null,
      locations.some((location) => location.mask) ? validateGarmentMask(path, inspect) : null,
    ]);
    return locations.flatMap((location) => {
      const issue = location.mask ? maskIssue : generalIssue;
      const productIssue = issue ? `${issue.slice(0, 1).toLowerCase()}${issue.slice(1)}` : null;
      return productIssue ? [{ path: location.path, message: `${location.label} ${productIssue}` }] : [];
    });
  }));

  const visualizerResults = await Promise.all(content.products.map(async (product, productIndex) => {
    const visualizer = product.colourVisualizer;
    if (!visualizer) return [];
    try {
      const [base, mask] = await Promise.all([
        inspect(visualizer.baseImageSrc),
        inspect(visualizer.garmentMaskSrc),
      ]);
      if (
        !base
        || !mask
        || !Number.isSafeInteger(base.width)
        || !Number.isSafeInteger(base.height)
        || !Number.isSafeInteger(mask.width)
        || !Number.isSafeInteger(mask.height)
      ) {
        return [{
          path: ["products", productIndex, "colourVisualizer", "garmentMaskSrc"],
          message: "Colour visualizer base and mask dimensions could not be verified",
        }];
      }
      if (base.width !== mask.width || base.height !== mask.height) {
        return [{
          path: ["products", productIndex, "colourVisualizer", "garmentMaskSrc"],
          message: "Colour visualizer garment mask dimensions must exactly match its base image",
        }];
      }
      return [];
    } catch {
      return [{
        path: ["products", productIndex, "colourVisualizer", "garmentMaskSrc"],
        message: "Colour visualizer base and mask dimensions could not be verified",
      }];
    }
  }));

  return [...results.flat(), ...visualizerResults.flat()];
}
