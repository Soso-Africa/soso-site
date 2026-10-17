import { createHash, randomUUID } from "node:crypto";
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MediaNotFoundError } from "./cloudinary-storage";
import { IMAGE_MEDIA_TYPES, MAX_HERO_VIDEO_BYTES, MAX_UPLOADED_IMAGE_BYTES, mediaMimeTypeForPath, VIDEO_MEDIA_TYPES } from "./media-files";
import type { MediaArea, MediaDelivery, MediaInspection, MediaStorage, MediaUpload, MediaUploadContext } from "./media-storage-types";
import { normalizeR2MediaPath, r2MediaKey, requiredR2MediaConfig } from "./r2-media-config";
import { R2MediaIO } from "./r2-media-io";
import { signR2MediaPut } from "./r2-signed-upload";
import { authorizeR2Renditions, finalizeR2Renditions, readR2RenditionManifest } from "./r2-renditions";
import { createR2UploadTicket, verifyR2UploadTicket } from "./r2-upload-ticket";
import { RESPONSIVE_PHOTO_WIDTHS } from "./responsive-media";
import { runR2StorageDiagnostic } from "./r2-storage-diagnostic";

export class R2StorageService implements MediaStorage {
  readonly provider = "r2" as const;
  readonly io: R2MediaIO;
  constructor(readonly config = requiredR2MediaConfig(), client?: S3Client) {
    this.io = new R2MediaIO(client ?? new S3Client({
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`, region: "auto",
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
      maxAttempts: 2,
    }));
  }

  async createMediaUpload(name: string, contentType: string, context?: MediaUploadContext): Promise<MediaUpload> {
    const maximum = VIDEO_MEDIA_TYPES.has(contentType) ? MAX_HERO_VIDEO_BYTES : MAX_UPLOADED_IMAGE_BYTES;
    if ((!IMAGE_MEDIA_TYPES.has(contentType) && !VIDEO_MEDIA_TYPES.has(contentType))
      || !context?.ownerId || !Number.isSafeInteger(context.size) || context.size < 1 || context.size > maximum) {
      throw new Error("Upload identity, content type and bounded size are required");
    }
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
      "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm",
    };
    const stem = name.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 120) || "media";
    const path = `uploads/${randomUUID()}-${stem}.${extensions[contentType]}`;
    const objectPath = `/api/storage/objects/${path}`;
    const key = r2MediaKey(this.config, path, "uploads");
    const signed = await signR2MediaPut(this.io.client, {
      bucket: this.config.privateBucket, key, contentType, size: context.size,
      metadata: { "soso-upload-owner": context.ownerId, "soso-upload-size": String(context.size), "soso-upload-type": contentType },
    });
    return {
      ...signed, uploadMethod: "PUT", uploadFields: {},
      objectPath,
      requiresRenditions: contentType === "image/jpeg" || contentType === "image/png",
      finalizeToken: createR2UploadTicket(this.config, { path: objectPath, ownerId: context.ownerId, size: context.size, contentType }),
    };
  }

  createRenditionUploads(
    objectPath: string, token: string, ownerId: string,
    renditions: import("@workspace/api-zod").RenditionUploadMetadata[],
  ): Promise<import("@workspace/api-zod").RenditionAuthorizationResponse> {
    return authorizeR2Renditions(this, objectPath, token, ownerId, renditions);
  }

  finalizeRenditions(objectPath: string, token: string | undefined, ownerId: string): Promise<void> {
    return finalizeR2Renditions(this, objectPath, token, ownerId);
  }

  async verifyFinalization(objectPath: string, token: string | undefined, ownerId: string): Promise<void> {
    const ticket = verifyR2UploadTicket(this.config, token, objectPath, ownerId);
    if (!objectPath.startsWith("/api/storage/objects/")) throw new Error("Upload path is invalid");
    const path = objectPath.slice("/api/storage/objects/".length);
    const head = await this.io.head(this.config.privateBucket, r2MediaKey(this.config, path, "uploads"));
    if (head.ContentLength !== ticket.size || head.ContentType !== ticket.contentType
      || head.Metadata?.["soso-upload-owner"] !== ownerId
      || head.Metadata?.["soso-upload-size"] !== String(ticket.size)
      || head.Metadata?.["soso-upload-type"] !== ticket.contentType) {
      throw new Error("Stored upload does not match its owner-bound authorization");
    }
  }

  inspectUploadedMedia(path: string): Promise<MediaInspection> {
    return this.io.inspect(this.config.privateBucket, r2MediaKey(this.config, path, "uploads"));
  }
  inspectPublicMedia(path: string): Promise<MediaInspection> {
    return this.io.inspect(this.config.privateBucket, r2MediaKey(this.config, path, "public"));
  }
  readUploadedImageBytes(path: string, maxBytes: number): Promise<Buffer> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_UPLOADED_IMAGE_BYTES) {
      throw new Error("A bounded image-validation size is required");
    }
    return this.io.read(this.config.privateBucket, r2MediaKey(this.config, path, "uploads"), maxBytes);
  }

  variantKey(path: string, area: MediaArea, width: number): string {
    normalizeR2MediaPath(path, area);
    if (!/\.(?:jpg|png)$/.test(path)) throw new Error("Only JPEG and PNG photos have responsive copies");
    if (!(RESPONSIVE_PHOTO_WIDTHS as readonly number[]).includes(width)) throw new Error("Unsupported R2 photo width");
    const identity = createHash("sha256").update(`${area}/${path}`).digest("hex");
    return `${this.config.namespace ? `${this.config.namespace}/` : ""}renditions/${identity}/${width}.${path.endsWith(".jpg") ? "jpg" : "png"}`;
  }

  manifestKey(path: string, area: MediaArea): string {
    return this.variantKey(path, area, 480).replace(/\/480\.(?:jpg|png)$/, "/manifest.json");
  }

  async resolveDelivery(path: string, area: MediaArea, options: { width?: number; allowPrivate: boolean }): Promise<MediaDelivery> {
    const originalKey = r2MediaKey(this.config, path, area);
    const isPhoto = /\.(?:jpg|png)$/.test(path);
    const key = options.width !== undefined && isPhoto ? this.variantKey(path, area, options.width) : originalKey;
    try {
      const head = await this.io.head(this.config.publicBucket, key);
      if (head.Metadata?.["soso-approved"] !== "1") throw new Error("R2 delivery object has not passed publication checks");
      if (this.config.publicOrigin) {
        return {
          url: `${this.config.publicOrigin}/${key.split("/").map(encodeURIComponent).join("/")}`,
          cacheControl: "public, max-age=31536000, immutable",
        };
      }
      if (process.env.NODE_ENV === "production") throw new Error("R2 custom domain is required");
      return {
        url: await getSignedUrl(this.io.client, new GetObjectCommand({ Bucket: this.config.publicBucket, Key: key }), { expiresIn: 300 }),
        cacheControl: "private, no-store",
      };
    } catch (error) {
      if (!(error instanceof MediaNotFoundError) || !options.allowPrivate) throw error;
      await this.io.head(this.config.privateBucket, originalKey);
      let previewKey = originalKey;
      if (options.width !== undefined && isPhoto) {
        let hasManifest = false;
        try { await this.io.head(this.config.privateBucket, this.manifestKey(path, area)); hasManifest = true; }
        catch (manifestError) { if (!(manifestError instanceof MediaNotFoundError)) throw manifestError; }
        if (hasManifest) {
          await readR2RenditionManifest(this, path, area);
          previewKey = key;
        }
      }
      return {
        url: await getSignedUrl(this.io.client, new GetObjectCommand({ Bucket: this.config.privateBucket, Key: previewKey }), { expiresIn: 300 }),
        cacheControl: "private, no-store",
      };
    }
  }

  /** Called only after the publication workflow has validated the candidate. */
  async stageApprovedOriginal(path: string, area: MediaArea): Promise<void> {
    const key = r2MediaKey(this.config, path, area);
    const before = await this.io.head(this.config.privateBucket, key);
    const inspection = await this.io.inspect(this.config.privateBucket, key);
    const expectedType = mediaMimeTypeForPath(path);
    const maximum = expectedType?.startsWith("video/") ? MAX_HERO_VIDEO_BYTES : MAX_UPLOADED_IMAGE_BYTES;
    if (!expectedType || inspection.contentType !== expectedType || inspection.declaredContentType !== expectedType
      || inspection.size > maximum) throw new Error("R2 publication bytes, MIME, extension or size do not match");
    const source = await this.io.head(this.config.privateBucket, key);
    if (!source.ETag || source.ETag !== before.ETag) throw new Error("R2 source byte validator changed during publication");
    await this.copyApprovedKey(key, expectedType, source.ETag);
  }

  async stageApprovedRenditions(path: string, area: MediaArea): Promise<void> {
    const manifest = await readR2RenditionManifest(this, path, area);
    for (const rendition of manifest.renditions) {
      await this.copyApprovedKey(rendition.key, rendition.contentType, rendition.etag);
    }
  }

  private async copyApprovedKey(key: string, expectedType: string, expectedEtag: string): Promise<void> {
    const source = await this.io.head(this.config.privateBucket, key);
    if (!source.ETag || source.ETag !== expectedEtag) throw new Error("R2 media changed before its approved copy");
    try {
      const current = await this.io.head(this.config.publicBucket, key);
      if (current.Metadata?.["soso-approved"] === "1" && current.Metadata["source-etag"] === source.ETag
        && current.ContentLength === source.ContentLength && current.ContentType === expectedType) return;
      throw new Error("Published immutable R2 media conflicts with the source");
    } catch (error) {
      if (!(error instanceof MediaNotFoundError)) throw error;
    }
    await this.io.client.send(new CopyObjectCommand({
      Bucket: this.config.publicBucket, Key: key,
      CopySource: `${this.config.privateBucket}/${key.split("/").map(encodeURIComponent).join("/")}`,
      CopySourceIfMatch: source.ETag,
      MetadataDirective: "REPLACE", ContentType: expectedType,
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: { "soso-approved": "1", "source-etag": source.ETag },
    }), { abortSignal: AbortSignal.timeout(25_000) });
    const copied = await this.io.head(this.config.publicBucket, key);
    if (copied.ContentLength !== source.ContentLength || copied.ETag !== source.ETag) {
      throw new Error("R2 published copy did not retain the source bytes");
    }
  }

  async deleteUploadedMedia(path: string): Promise<void> {
    const key = r2MediaKey(this.config, path, "uploads");
    try {
      await this.io.head(this.config.publicBucket, key);
      throw new Error("Approved R2 media requires retained-reference authorization before deletion");
    } catch (error) {
      if (!(error instanceof MediaNotFoundError)) throw error;
    }
    await this.io.client.send(new DeleteObjectCommand({ Bucket: this.config.privateBucket, Key: key }), {
      abortSignal: AbortSignal.timeout(20_000),
    });
    this.io.invalidate(this.config.privateBucket, key);
  }

  /** Only the locked, retained-reference-aware cleanup coordinator may call this. */
  async deleteUnreferencedUploadedMedia(path: string): Promise<void> {
    const keys = [r2MediaKey(this.config, path, "uploads")];
    if (/\.(?:jpg|png)$/.test(path)) {
      keys.push(...RESPONSIVE_PHOTO_WIDTHS.map((width) => this.variantKey(path, "uploads", width)), this.manifestKey(path, "uploads"));
    }
    for (const bucket of [this.config.publicBucket, this.config.privateBucket]) {
      for (const key of keys) {
        await this.io.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(20_000) });
        this.io.invalidate(bucket, key);
      }
    }
  }

  async runDiagnostic(): Promise<MediaInspection> {
    return runR2StorageDiagnostic(this);
  }
}
