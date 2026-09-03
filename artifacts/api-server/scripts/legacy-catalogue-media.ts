import { createHash } from "node:crypto";
import { CloudinaryStorageService, createCloudinarySignature } from "../src/lib/cloudinary-storage";
import { detectMediaContentType, MAX_UPLOADED_IMAGE_BYTES } from "../src/lib/media-files";
import {
  decodeHtml,
  extensionForType,
  requiredEnvironment,
  type LegacyImage,
  type LegacyProduct,
} from "./legacy-catalogue-source";

const CLOUDINARY_PRESET = "soso-governed-image-v1";

export type MediaInspection = Awaited<ReturnType<CloudinaryStorageService["inspectUploadedMedia"]>>;
export const legacyStorage = new CloudinaryStorageService();

export async function uploadLegacyImage(
  product: LegacyProduct,
  image: LegacyImage & { src: string },
  imageIndex: number,
): Promise<{ objectPath: string; inspection: MediaInspection }> {
  const response = await fetch(image.src, {
    headers: { accept: "image/jpeg,image/png,image/webp,image/gif" },
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Source image download failed for ${product.slug} (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1 || bytes.length > MAX_UPLOADED_IMAGE_BYTES) {
    throw new Error(`Source image for ${product.slug} exceeds the managed image budget`);
  }
  const contentType = detectMediaContentType(bytes);
  if (!contentType?.startsWith("image/")) throw new Error(`Source image bytes are invalid for ${product.slug}`);
  const extension = extensionForType(contentType);
  const digest = createHash("sha256").update(image.src).digest("hex").slice(0, 12);
  const relativePath = `uploads/legacy-catalogue/${product.id}/${imageIndex + 1}-${digest}.${extension}`;
  const objectPath = `/api/storage/objects/${relativePath}`;

  try {
    return { objectPath, inspection: await legacyStorage.inspectUploadedMedia(relativePath) };
  } catch {
    // The deterministic target does not exist yet; upload it below.
  }

  const cloudName = requiredEnvironment("CLOUDINARY_CLOUD_NAME");
  const apiKey = requiredEnvironment("CLOUDINARY_API_KEY");
  const apiSecret = requiredEnvironment("CLOUDINARY_API_SECRET");
  const publicId = `soso-store/${relativePath.replace(/\.[^.]+$/, "")}`;
  const timestamp = Math.floor(Date.now() / 1_000);
  const signed = {
    overwrite: "true",
    public_id: publicId,
    timestamp,
    upload_preset: CLOUDINARY_PRESET,
  };
  const form = new FormData();
  form.append("api_key", apiKey);
  Object.entries(signed).forEach(([key, value]) => form.append(key, String(value)));
  form.append("signature", createCloudinarySignature(signed, apiSecret));
  form.append("file", new Blob([new Uint8Array(bytes)], { type: contentType }), `${product.slug}-${imageIndex + 1}.${extension}`);
  const uploaded = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    { method: "POST", body: form, signal: AbortSignal.timeout(60_000) },
  );
  if (!uploaded.ok) {
    const detail = decodeHtml((await uploaded.text()).slice(0, 300));
    throw new Error(`Cloudinary upload failed for ${product.slug} (${uploaded.status}): ${detail}`);
  }
  const result = await uploaded.json() as {
    public_id?: string;
    format?: string;
    bytes?: number;
    width?: number;
    height?: number;
  };
  if (
    result.public_id !== publicId
    || result.format !== extension
    || !Number.isSafeInteger(result.bytes)
    || result.bytes! < 1
    || result.bytes! > MAX_UPLOADED_IMAGE_BYTES
  ) {
    throw new Error(`Cloudinary returned an unexpected asset identity for ${product.slug}`);
  }
  return {
    objectPath,
    inspection: {
      contentType,
      declaredContentType: contentType,
      size: result.bytes!,
      ...(Number.isSafeInteger(result.width) ? { width: result.width } : {}),
      ...(Number.isSafeInteger(result.height) ? { height: result.height } : {}),
    },
  };
}

export async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  map: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await map(values[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}