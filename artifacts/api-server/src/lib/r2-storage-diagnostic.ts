import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { MediaInspection } from "./media-storage-types";
import { r2MediaKey } from "./r2-media-config";
import type { R2StorageService } from "./r2-storage";
import { RESPONSIVE_PHOTO_WIDTHS } from "./responsive-media";

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGNQMHD4DwAClAGQJla1dAAAAABJRU5ErkJggg==", "base64");

/** Fixed synthetic bytes only; no encoding, database writes or merchant media. */
export async function runR2StorageDiagnostic(storage: R2StorageService): Promise<MediaInspection> {
  const owner = "isolated-runtime-diagnostic";
  const signed = await storage.createMediaUpload("storage-diagnostic.png", "image/png", { size: PIXEL.length, ownerId: owner });
  const path = signed.objectPath.slice("/api/storage/objects/".length);
  const originalKey = r2MediaKey(storage.config, path, "uploads");
  const variants = RESPONSIVE_PHOTO_WIDTHS.map((width) => storage.variantKey(path, "uploads", width));
  const manifest = storage.manifestKey(path, "uploads");
  try {
    const upload = await fetch(signed.uploadURL, {
      method: "PUT", headers: signed.uploadHeaders, body: PIXEL, signal: AbortSignal.timeout(20_000),
    });
    if (upload.status !== 200) throw new Error("R2 diagnostic signed upload failed");
    await storage.verifyFinalization(signed.objectPath, signed.finalizeToken, owner);
    const responsive = await storage.createRenditionUploads(signed.objectPath, signed.finalizeToken!, owner,
      RESPONSIVE_PHOTO_WIDTHS.map((width) => ({ width, size: PIXEL.length, contentType: "image/png" })));
    for (const authorized of responsive.uploads) {
      const response = await fetch(authorized.uploadURL, {
        method: "PUT", headers: authorized.uploadHeaders, body: PIXEL, signal: AbortSignal.timeout(20_000),
      });
      if (response.status !== 200) throw new Error("R2 diagnostic responsive upload failed");
    }
    await storage.finalizeRenditions(signed.objectPath, responsive.finalizeToken, owner);
    const inspected = await storage.inspectUploadedMedia(path);
    await storage.stageApprovedRenditions(path, "uploads");
    await storage.stageApprovedOriginal(path, "uploads");
    const original = await storage.resolveDelivery(path, "uploads", { allowPrivate: false });
    const range = await fetch(original.url, { headers: { Range: "bytes=0-7" }, signal: AbortSignal.timeout(20_000) });
    if (range.status !== 206 || range.headers.get("content-range") !== `bytes 0-7/${PIXEL.length}`
      || !Buffer.from(await range.arrayBuffer()).equals(PIXEL.subarray(0, 8))) {
      throw new Error("R2 diagnostic approved delivery did not preserve byte ranges");
    }
    for (const width of RESPONSIVE_PHOTO_WIDTHS) {
      const delivery = await storage.resolveDelivery(path, "uploads", { allowPrivate: false, width });
      const response = await fetch(delivery.url, { signal: AbortSignal.timeout(20_000) });
      if (response.status !== 200 || !Buffer.from(await response.arrayBuffer()).equals(PIXEL)) {
        throw new Error("R2 diagnostic approved responsive delivery failed");
      }
    }
    return inspected;
  } finally {
    let cleanupFailed = false;
    for (const [bucket, keys] of [
      [storage.config.privateBucket, [originalKey, ...variants, manifest]],
      [storage.config.publicBucket, [originalKey, ...variants]],
    ] as const) {
      for (const key of keys) {
        try {
          await storage.io.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(20_000) });
          storage.io.invalidate(bucket, key);
        } catch { cleanupFailed = true; }
      }
    }
    if (cleanupFailed) throw new Error("R2 diagnostic temporary-object cleanup could not be confirmed");
  }
}
