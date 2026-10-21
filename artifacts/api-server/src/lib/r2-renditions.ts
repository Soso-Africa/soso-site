import { createHash } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { RenditionAuthorizationResponse, RenditionUploadMetadata } from "@workspace/api-zod";
import { MediaNotFoundError } from "./cloudinary-storage";
import { MAX_UPLOADED_IMAGE_BYTES, mediaMimeTypeForPath } from "./media-files";
import type { MediaArea } from "./media-storage-types";
import { r2MediaKey } from "./r2-media-config";
import { signR2MediaPut } from "./r2-signed-upload";
import type { R2StorageService } from "./r2-storage";
import { createR2UploadTicket, verifyR2UploadTicket } from "./r2-upload-ticket";
import { RESPONSIVE_PHOTO_WIDTHS } from "./responsive-media";

export type R2RenditionManifest = {
  v: 1; sourceEtag: string;
  renditions: Array<{ width: number; key: string; size: number; etag: string; contentType: string; pixelWidth: number; pixelHeight: number }>;
};

function validateMetadata(path: string, renditions: RenditionUploadMetadata[]): void {
  if (!/\.(?:jpg|png)$/.test(path) || renditions.length !== RESPONSIVE_PHOTO_WIDTHS.length
    || new Set(renditions.map((r) => r.width)).size !== RESPONSIVE_PHOTO_WIDTHS.length
    || renditions.some((r) => !(RESPONSIVE_PHOTO_WIDTHS as readonly number[]).includes(r.width)
      || r.contentType !== mediaMimeTypeForPath(path)
      || !Number.isSafeInteger(r.size) || r.size < 1 || r.size > MAX_UPLOADED_IMAGE_BYTES)
    || renditions.reduce((sum, r) => sum + r.size, 0) > 24 * 1024 * 1024) {
    throw new Error("Provide four bounded, format-preserving responsive copies");
  }
}

export async function authorizeR2Renditions(
  storage: R2StorageService, objectPath: string, token: string, ownerId: string, renditions: RenditionUploadMetadata[],
): Promise<RenditionAuthorizationResponse> {
  await storage.verifyFinalization(objectPath, token, ownerId);
  const path = objectPath.slice("/api/storage/objects/".length);
  validateMetadata(path, renditions);
  const original = await storage.inspectUploadedMedia(path);
  if (original.animated || !original.width || !original.height || original.width * original.height > 64_000_000
    || original.contentType !== mediaMimeTypeForPath(path) || original.declaredContentType !== original.contentType) {
    throw new Error("Responsive copies require a verified, bounded static source photo");
  }
  const head = await storage.io.head(storage.config.privateBucket, r2MediaKey(storage.config, path, "uploads"));
  if (!head.ETag) throw new Error("The source photo has no byte validator");
  const uploads = [];
  for (const rendition of renditions) {
    const key = storage.variantKey(path, "uploads", rendition.width);
    try {
      const existing = await storage.io.head(storage.config.privateBucket, key);
      if (existing.Metadata?.["soso-upload-owner"] !== ownerId
        || existing.Metadata?.["soso-source-etag"] !== head.ETag
        || existing.Metadata?.["soso-requested-width"] !== String(rendition.width)
        || existing.ContentType !== rendition.contentType || existing.ContentLength !== rendition.size) {
        throw new Error("Existing responsive upload differs from this owner and source. Cleanup is required before replacement.");
      }
      // Finalization still inspects complete bytes and dimensions. HEAD only
      // establishes that retrying a non-overwriting PUT is unnecessary.
      uploads.push({ width: rendition.width, uploaded: true, uploadURL: "unused", uploadHeaders: {} });
      continue;
    } catch (error) { if (!(error instanceof MediaNotFoundError)) throw error; }
    const signed = await signR2MediaPut(storage.io.client, {
      bucket: storage.config.privateBucket, key,
      contentType: rendition.contentType, size: rendition.size,
      metadata: { "soso-upload-owner": ownerId, "soso-source-etag": head.ETag, "soso-requested-width": String(rendition.width) },
    });
    uploads.push({ width: rendition.width, ...signed });
  }
  return {
    uploads,
    finalizeToken: createR2UploadTicket(storage.config, {
      path: objectPath, ownerId, size: original.size, contentType: original.contentType,
      sourceEtag: head.ETag, renditions,
    }),
  };
}

export async function finalizeR2Renditions(
  storage: R2StorageService, objectPath: string, token: string | undefined, ownerId: string,
): Promise<void> {
  const path = objectPath.slice("/api/storage/objects/".length);
  if (!/\.(?:jpg|png)$/.test(path)) return;
  const ticket = verifyR2UploadTicket(storage.config, token, objectPath, ownerId);
  if (!ticket.renditions || !ticket.sourceEtag) throw new Error("Responsive photo uploads must complete before finalization");
  validateMetadata(path, ticket.renditions);
  const original = await storage.inspectUploadedMedia(path);
  const source = await storage.io.head(storage.config.privateBucket, r2MediaKey(storage.config, path, "uploads"));
  if (source.ETag !== ticket.sourceEtag || !original.width || !original.height || original.animated) {
    throw new Error("The source photo changed before responsive verification");
  }
  const verified: R2RenditionManifest["renditions"] = [];
  for (const rendition of ticket.renditions) {
    const key = storage.variantKey(path, "uploads", rendition.width);
    const inspected = await storage.io.inspect(storage.config.privateBucket, key);
    const head = await storage.io.head(storage.config.privateBucket, key);
    const expectedWidth = Math.min(rendition.width, original.width);
    const expectedHeight = Math.round(original.height * expectedWidth / original.width);
    if (head.Metadata?.["soso-upload-owner"] !== ownerId || head.Metadata?.["soso-source-etag"] !== source.ETag
      || head.Metadata?.["soso-requested-width"] !== String(rendition.width) || !head.ETag
      || inspected.contentType !== rendition.contentType || inspected.declaredContentType !== rendition.contentType
      || inspected.size !== rendition.size || inspected.animated
      || inspected.width !== expectedWidth || Math.abs((inspected.height ?? 0) - expectedHeight) > 1) {
      throw new Error("Responsive bytes, dimensions, ownership or source identity do not match");
    }
    verified.push({
      width: rendition.width, key, size: inspected.size, etag: head.ETag, contentType: inspected.contentType,
      pixelWidth: inspected.width, pixelHeight: inspected.height!,
    });
  }
  const manifest: R2RenditionManifest = { v: 1, sourceEtag: source.ETag!, renditions: verified };
  const key = storage.manifestKey(path, "uploads");
  try {
    const existing = JSON.parse((await storage.io.read(storage.config.privateBucket, key, 8192)).toString());
    if (JSON.stringify(existing) !== JSON.stringify(manifest)) throw new Error("An immutable responsive manifest already differs");
    return;
  } catch (error) { if (!(error instanceof MediaNotFoundError)) throw error; }
  const bytes = Buffer.from(JSON.stringify(manifest));
  await storage.io.client.send(new PutObjectCommand({
    Bucket: storage.config.privateBucket, Key: key, Body: bytes,
    ContentType: "application/json", ContentLength: bytes.length, IfNoneMatch: "*",
    ContentMD5: createHash("md5").update(bytes).digest("base64"),
    Metadata: { "source-etag": source.ETag!, "soso-kind": "verified-renditions-v1" },
  }), { abortSignal: AbortSignal.timeout(20_000) });
}

export async function readR2RenditionManifest(
  storage: R2StorageService, path: string, area: MediaArea,
): Promise<R2RenditionManifest> {
  const key = storage.manifestKey(path, area);
  const source = await storage.io.head(storage.config.privateBucket, r2MediaKey(storage.config, path, area));
  if (!source.ETag || !/^"[^"\r\n]+"$/.test(source.ETag)) throw new Error("A strong source byte validator is required");
  const head = await storage.io.head(storage.config.privateBucket, key);
  if (head.Metadata?.["source-etag"] !== source.ETag || head.Metadata?.["soso-kind"] !== "verified-renditions-v1") {
    throw new Error("The responsive manifest is not verified against the source");
  }
  const manifest: R2RenditionManifest = JSON.parse((await storage.io.read(storage.config.privateBucket, key, 8192, head)).toString());
  if (manifest.v !== 1 || manifest.sourceEtag !== source.ETag || !Array.isArray(manifest.renditions)
    || manifest.renditions.length !== 4 || new Set(manifest.renditions.map((r) => r.width)).size !== 4) {
    throw new Error("The responsive manifest is incomplete");
  }
  for (const rendition of manifest.renditions) {
    if (!(RESPONSIVE_PHOTO_WIDTHS as readonly number[]).includes(rendition.width)
      || rendition.key !== storage.variantKey(path, area, rendition.width)
      || !Number.isSafeInteger(rendition.size) || rendition.size < 1 || rendition.size > MAX_UPLOADED_IMAGE_BYTES) {
      throw new Error("The responsive manifest contains an invalid object reference");
    }
    const actual = await storage.io.head(storage.config.privateBucket, rendition.key);
    if (actual.ETag !== rendition.etag || actual.ContentLength !== rendition.size
      || actual.ContentType !== mediaMimeTypeForPath(path) || actual.ContentType !== rendition.contentType) {
      throw new Error("A responsive object changed after verification");
    }
  }
  return manifest;
}
