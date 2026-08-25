import { open } from "node:fs/promises";
import { resolve } from "node:path";
import type { PlatformContent } from "./platform-content";
import { inspectStoredHeroMedia, type HeroMediaInspection } from "./hero-media-validation";
import {
  detectMediaContentType,
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
      return {
        contentType: detectMediaContentType(bytes) ?? "",
        declaredContentType: expectedType,
        size: metadata.size,
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
  const uniqueAssets = new Map<string, { productIndex: number; imageIndex: number }>();
  content.products.forEach((product, productIndex) => {
    product.images.forEach((image, imageIndex) => {
      if (!uniqueAssets.has(image.src)) uniqueAssets.set(image.src, { productIndex, imageIndex });
    });
  });

  const results = await Promise.all([...uniqueAssets.entries()].map(async ([path, location]) => {
    const issuePath = ["products", location.productIndex, "images", location.imageIndex, "src"];
    const issue = await validateManagedImageAsset(path, inspect);
    const productIssue = issue ? `${issue.slice(0, 1).toLowerCase()}${issue.slice(1)}` : null;
    return productIssue ? [{ path: issuePath, message: `Product ${productIssue}` }] : [];
  }));

  return results.flat();
}