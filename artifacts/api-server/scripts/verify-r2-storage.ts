// A synthetic namespace only; never activates R2 or changes storefront content.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { MediaNotFoundError } from "../src/lib/cloudinary-storage";
import { requiredR2MediaConfig, r2MediaKey } from "../src/lib/r2-media-config";
import { R2StorageService } from "../src/lib/r2-storage";

const storage = new R2StorageService({
  ...requiredR2MediaConfig(), namespace: `adapter-check-${randomUUID()}`,
});
const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/l3xZ5QAAAABJRU5ErkJggg==", "base64");
let key: string | undefined;
let responsiveKeys: string[] = [];
let report: Record<string, unknown> | undefined;
try {
  const signed = await storage.createMediaUpload("diagnostic.png", "image/png", { size: bytes.length, ownerId: "isolated-diagnostic" });
  const relative = signed.objectPath.slice("/api/storage/objects/".length);
  key = r2MediaKey(storage.config, relative, "uploads");
  const upload = await fetch(signed.uploadURL, {
    method: signed.uploadMethod, headers: signed.uploadHeaders, body: bytes, signal: AbortSignal.timeout(20_000),
  });
  assert.equal(upload.status, 200, `Signed upload failed (${upload.status})`);
  const overwrite = await fetch(signed.uploadURL, {
    method: signed.uploadMethod, headers: signed.uploadHeaders, body: bytes, signal: AbortSignal.timeout(20_000),
  });
  assert.equal(overwrite.status, 412, "The signed upload must refuse overwrites");
  await assert.rejects(storage.verifyFinalization(signed.objectPath, signed.finalizeToken, "another-owner"));
  await storage.verifyFinalization(signed.objectPath, signed.finalizeToken, "isolated-diagnostic");
  const inspected = await storage.inspectUploadedMedia(relative);
  assert.equal(inspected.contentType, "image/png");
  assert.equal(inspected.declaredContentType, "image/png");
  assert.equal(inspected.size, bytes.length);
  await assert.rejects(storage.finalizeRenditions(signed.objectPath, signed.finalizeToken, "isolated-diagnostic"));
  const widths = [480, 768, 1280, 1600] as const;
  responsiveKeys = [...widths.map((width) => storage.variantKey(relative, "uploads", width)), storage.manifestKey(relative, "uploads")];
  const responsive = await storage.createRenditionUploads(signed.objectPath, signed.finalizeToken!, "isolated-diagnostic",
    widths.map((width) => ({ width, size: bytes.length, contentType: "image/png" })));
  for (const upload of responsive.uploads) {
    const response = await fetch(upload.uploadURL, {
      method: "PUT", headers: upload.uploadHeaders, body: bytes, signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 200, "A signed responsive upload failed");
  }
  await storage.finalizeRenditions(signed.objectPath, responsive.finalizeToken, "isolated-diagnostic");
  await assert.rejects(storage.resolveDelivery(relative, "uploads", { allowPrivate: false }), MediaNotFoundError);
  const preview = await storage.resolveDelivery(relative, "uploads", { allowPrivate: true });
  assert.equal(preview.cacheControl, "private, no-store");
  const partial = await fetch(preview.url, { headers: { Range: "bytes=0-7" }, signal: AbortSignal.timeout(20_000) });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), `bytes 0-7/${bytes.length}`);
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(0, 8));
  await storage.stageApprovedOriginal(relative, "uploads");
  await storage.stageApprovedRenditions(relative, "uploads");
  const approved = await storage.resolveDelivery(relative, "uploads", { allowPrivate: false });
  const delivered = await fetch(approved.url, { signal: AbortSignal.timeout(20_000) });
  assert.equal(delivered.status, 200);
  assert.deepEqual(Buffer.from(await delivered.arrayBuffer()), bytes);
  const resized = await storage.resolveDelivery(relative, "uploads", { allowPrivate: false, width: 480 });
  const resizedResponse = await fetch(resized.url, { signal: AbortSignal.timeout(20_000) });
  assert.equal(resizedResponse.status, 200);
  assert.deepEqual(Buffer.from(await resizedResponse.arrayBuffer()), bytes);
  report = {
    capturedAt: new Date().toISOString(), signedUploadVerified: true,
    overwriteRefused: true, ownerBoundFinalizationVerified: true, actualBytesVerified: true,
    unapprovedPublicAccessRefused: true, privatePreviewRangeVerified: true,
    governedOriginalCopyVerified: true, temporaryObjectsRemoved: false,
    responsiveBypassRefused: true, fourResponsiveCopiesVerified: true,
    liveProviderChanged: false, sourceObjectsChanged: false, nameserversChanged: false,
  };
} finally {
  if (key) for (const bucket of [storage.config.privateBucket, storage.config.publicBucket]) {
    for (const objectKey of [key, ...responsiveKeys]) {
      await storage.io.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }), {
        abortSignal: AbortSignal.timeout(20_000),
      });
    }
  }
  storage.io.client.destroy();
}
assert.ok(report);
report.temporaryObjectsRemoved = true;
await writeFile(new URL("../../../generated-artifacts/media-migration/r2-adapter-check.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
