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
    try {
      const inspected = await inspect(path);
      if (!inspected) {
        return [{ path: issuePath, message: "Product image must be a verified bundled or SOSO App Storage asset" }];
      }
      const expectedType = mediaMimeTypeForPath(path);
      const issues: ProductMediaValidationIssue[] = [];
      if (!Number.isSafeInteger(inspected.size) || inspected.size < 1 || inspected.size > MAX_UPLOADED_IMAGE_BYTES) {
        issues.push({ path: issuePath, message: `Product image exceeds its ${MAX_UPLOADED_IMAGE_BYTES} byte publishing budget` });
      }
      if (
        !expectedType
        || !IMAGE_MEDIA_TYPES.has(expectedType)
        || inspected.contentType !== expectedType
        || inspected.declaredContentType !== expectedType
      ) {
        issues.push({ path: issuePath, message: "Product image bytes, MIME type, and configured file extension must match" });
      }
      return issues;
    } catch {
      return [{ path: issuePath, message: "Stored product image could not be verified" }];
    }
  }));

  return results.flat();
}