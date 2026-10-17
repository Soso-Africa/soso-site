import { GetObjectCommand, HeadObjectCommand, type HeadObjectCommandOutput, type S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { MediaNotFoundError } from "./cloudinary-storage";
import { detectMediaContentType, isAnimatedImage, MAX_UPLOADED_IMAGE_BYTES } from "./media-files";
import { orientedImageDimensions } from "./r2-image-geometry";
import type { MediaInspection } from "./media-storage-types";

export function r2Missing(error: unknown): boolean {
  return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404;
}

/** Strong validators authorize reuse, never a failed request or time-to-live. */
export class R2MediaIO {
  private readonly inspections = new Map<string, { etag: string; size: number; mime?: string; inspection: MediaInspection }>();
  constructor(readonly client: S3Client) {}

  async head(bucket: string, key: string): Promise<HeadObjectCommandOutput> {
    try {
      return await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      this.inspections.delete(`${bucket}/${key}`);
      if (r2Missing(error)) throw new MediaNotFoundError();
      throw new Error("R2 media metadata could not be verified");
    }
  }

  async read(bucket: string, key: string, maxBytes: number, known?: HeadObjectCommandOutput): Promise<Buffer> {
    const head = known ?? await this.head(bucket, key);
    const size = head.ContentLength;
    if (!Number.isSafeInteger(size) || !size || size < 1 || size > maxBytes) throw new Error("R2 media exceeds the bounded validation read");
    const object = await this.client.send(new GetObjectCommand({
      Bucket: bucket, Key: key, Range: `bytes=0-${size - 1}`,
      ...(head.ETag ? { IfMatch: head.ETag } : {}),
    }), { abortSignal: AbortSignal.timeout(25_000) });
    const body = object.Body;
    if (!(body instanceof Readable) || object.ContentLength !== size || (head.ETag && object.ETag !== head.ETag)) {
      if (body instanceof Readable) body.destroy();
      throw new Error("R2 media changed during validation");
    }
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of body) {
      received += chunk.length;
      if (received > maxBytes || received > size) {
        body.destroy();
        throw new Error("R2 media exceeded the bounded validation read");
      }
      chunks.push(Buffer.from(chunk));
    }
    if (received !== size) throw new Error("R2 media did not return complete validation bytes");
    return Buffer.concat(chunks);
  }

  async inspect(bucket: string, key: string): Promise<MediaInspection> {
    const cacheKey = `${bucket}/${key}`;
    const head = await this.head(bucket, key);
    const cached = this.inspections.get(cacheKey);
    if (head.ETag && /^"[^"\r\n]+"$/.test(head.ETag)
      && cached?.etag === head.ETag && cached.size === head.ContentLength && cached.mime === head.ContentType) {
      return { ...cached.inspection };
    }
    this.inspections.delete(cacheKey);
    const bytes = await this.read(bucket, key, MAX_UPLOADED_IMAGE_BYTES, head);
    const contentType = detectMediaContentType(bytes) ?? "";
    const inspection: MediaInspection = {
      contentType, declaredContentType: head.ContentType?.split(";", 1)[0]?.trim(),
      size: bytes.length,
      animated: contentType.startsWith("image/") && isAnimatedImage(bytes, contentType),
      ...(orientedImageDimensions(bytes, contentType) ?? {}),
    };
    if (head.ETag && /^"[^"\r\n]+"$/.test(head.ETag)) {
      this.inspections.set(cacheKey, { etag: head.ETag, size: bytes.length, mime: head.ContentType, inspection });
      if (this.inspections.size > 512) this.inspections.delete(this.inspections.keys().next().value!);
    }
    return { ...inspection };
  }

  invalidate(bucket: string, key: string): void {
    this.inspections.delete(`${bucket}/${key}`);
  }
}
