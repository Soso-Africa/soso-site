import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { S3Client } from "@aws-sdk/client-s3";
import { MediaNotFoundError } from "./cloudinary-storage";
import { createMediaStorageService } from "./media-storage";
import { normalizeR2MediaPath, r2MediaKey, type R2MediaConfig } from "./r2-media-config";
import { R2MediaIO } from "./r2-media-io";
import { R2StorageService } from "./r2-storage";
import { createR2UploadTicket, verifyR2UploadTicket } from "./r2-upload-ticket";
import { authorizeR2Renditions } from "./r2-renditions";

const config: R2MediaConfig = {
  accountId: "0".repeat(32), accessKeyId: "1".repeat(32), secretAccessKey: "2".repeat(64),
  privateBucket: "soso-media-private", publicBucket: "soso-media-public", namespace: "isolated-test",
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/l3xZ5QAAAABJRU5ErkJggg==", "base64");
const notFound = () => Object.assign(new Error("missing"), { $metadata: { httpStatusCode: 404 } });
const head = { ContentLength: png.length, ContentType: "image/png", ETag: '"strong"' };
function fakeClient(send: (command: { input: Record<string, unknown>; constructor: { name: string } }) => Promise<unknown>): S3Client {
  return { send } as unknown as S3Client;
}

test("interrupted responsive uploads skip only matching owned source copies and never overwrite them", async () => {
  const storage = new R2StorageService(config, fakeClient(async () => { throw new Error("No network calls expected"); }));
  storage.verifyFinalization = async () => undefined;
  storage.inspectUploadedMedia = async () => ({
    size: png.length, contentType: "image/png", declaredContentType: "image/png", width: 1, height: 1, animated: false,
  });
  let wrongOwner = false;
  storage.io.head = async (_bucket, key) => key.endsWith("/photo.png")
    ? { ...head, $metadata: {} }
    : { ...head, $metadata: {}, Metadata: {
      "soso-upload-owner": wrongOwner ? "another-owner" : "owner",
      "soso-source-etag": head.ETag,
      "soso-requested-width": String([480, 768, 1280, 1600].find((w) => key.includes(String(w)))),
    } };
  const renditions = [480, 768, 1280, 1600].map((width) => ({ width: width as 480, size: png.length, contentType: "image/png" as const }));
  const result = await authorizeR2Renditions(storage, "/api/storage/objects/uploads/photo.png", "transient", "owner", renditions);
  assert.equal(result.uploads.length, 4);
  assert.ok(result.uploads.every((u) => u.uploaded && u.uploadURL === "unused"));
  wrongOwner = true;
  await assert.rejects(authorizeR2Renditions(storage, "/api/storage/objects/uploads/photo.png", "transient", "owner", renditions), /differs from this owner/);
});

test("R2 preserves logical media paths and confines keys to the chosen namespace", () => {
  assert.equal(r2MediaKey(config, "uploads/photo.jpg", "uploads"), "isolated-test/uploads/photo.jpg");
  assert.equal(r2MediaKey(config, "posts/photo.png", "public"), "isolated-test/public/posts/photo.png");
  for (const path of ["../photo.jpg", "uploads/../photo.jpg", "/uploads/photo.jpg", "uploads//photo.jpg",
    "uploads/photo.jpg?private=true", "uploads/a%2fb.jpg", "uploads/photo.svg", "public/photo.jpg"]) {
    assert.throws(() => normalizeR2MediaPath(path, "uploads"), MediaNotFoundError);
  }
});

test("media selection stays Cloudinary by default and R2 cannot activate accidentally", () => {
  const provider = process.env.MEDIA_STORAGE_PROVIDER;
  const approved = process.env.R2_MEDIA_ACTIVATION_APPROVED;
  try {
    delete process.env.MEDIA_STORAGE_PROVIDER;
    assert.equal(createMediaStorageService().provider, "cloudinary");
    process.env.MEDIA_STORAGE_PROVIDER = "r2";
    delete process.env.R2_MEDIA_ACTIVATION_APPROVED;
    assert.throws(createMediaStorageService, /release gate/);
    process.env.MEDIA_STORAGE_PROVIDER = "unknown";
    assert.throws(createMediaStorageService, /Unsupported/);
  } finally {
    if (provider === undefined) delete process.env.MEDIA_STORAGE_PROVIDER; else process.env.MEDIA_STORAGE_PROVIDER = provider;
    if (approved === undefined) delete process.env.R2_MEDIA_ACTIVATION_APPROVED; else process.env.R2_MEDIA_ACTIVATION_APPROVED = approved;
  }
});

test("upload tickets bind exact owner, object, size and storage scope", () => {
  const secret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "unit-test-secret-not-a-real-credential";
  try {
    const data = { path: "/api/storage/objects/uploads/photo.png", ownerId: "staff-one", size: png.length, contentType: "image/png" };
    const token = createR2UploadTicket(config, data);
    assert.equal(verifyR2UploadTicket(config, token, data.path, data.ownerId).size, png.length);
    assert.throws(() => verifyR2UploadTicket(config, token, data.path, "staff-two"));
    assert.throws(() => verifyR2UploadTicket(config, token, `${data.path}x`, data.ownerId));
    assert.throws(() => verifyR2UploadTicket({ ...config, namespace: "different" }, token, data.path, data.ownerId));
    const [payload, signature] = token.split(".");
    const altered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), size: 1 })).toString("base64url");
    assert.throws(() => verifyR2UploadTicket(config, `${altered}.${signature}`, data.path, data.ownerId));
    assert.throws(() => verifyR2UploadTicket(config, undefined, data.path, data.ownerId));
  } finally {
    if (secret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = secret;
  }
});

test("signed direct uploads cannot overwrite and bind the declared MIME and byte length", async () => {
  const secret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "unit-test-secret-not-a-real-credential";
  const storage = new R2StorageService(config);
  try {
    const signed = await storage.createMediaUpload("authentic.png", "image/png", { size: png.length, ownerId: "staff-one" });
    assert.equal(signed.uploadMethod, "PUT");
    assert.deepEqual(signed.uploadHeaders, {
      "Content-Type": "image/png", "If-None-Match": "*",
      "x-amz-meta-soso-upload-owner": "staff-one", "x-amz-meta-soso-upload-size": String(png.length),
      "x-amz-meta-soso-upload-type": "image/png",
    });
    const url = new URL(signed.uploadURL);
    assert.equal(url.hostname, `${config.privateBucket}.${config.accountId}.r2.cloudflarestorage.com`);
    assert.match(url.searchParams.get("X-Amz-SignedHeaders")!, /content-length/);
    assert.match(url.searchParams.get("X-Amz-SignedHeaders")!, /content-type/);
    assert.match(url.searchParams.get("X-Amz-SignedHeaders")!, /if-none-match/);
    assert.match(url.searchParams.get("X-Amz-SignedHeaders")!, /x-amz-meta-soso-upload-owner/);
    assert.equal(url.searchParams.has("x-amz-meta-soso-upload-owner"), false);
    assert.ok(signed.finalizeToken);
    await assert.rejects(storage.createMediaUpload("large.mp4", "video/mp4", { size: 9 * 1024 * 1024, ownerId: "staff-one" }));
    await assert.rejects(storage.createMediaUpload("image.svg", "image/svg+xml", { size: 10, ownerId: "staff-one" }));
  } finally {
    storage.io.client.destroy();
    if (secret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = secret;
  }
});

test("inspection verifies complete bytes once, revalidates ETags and never reuses a failed read", async () => {
  let getCount = 0;
  let missing = false;
  let etag = head.ETag;
  const io = new R2MediaIO(fakeClient(async (command) => {
    if (missing) throw notFound();
    if (command.constructor.name === "HeadObjectCommand") return { ...head, ETag: etag };
    getCount++;
    return { ...head, ETag: etag, Body: Readable.from([png]) };
  }));
  assert.equal((await io.inspect(config.privateBucket, "test.png")).contentType, "image/png");
  await io.inspect(config.privateBucket, "test.png");
  assert.equal(getCount, 1);
  etag = '"changed"';
  await io.inspect(config.privateBucket, "test.png");
  assert.equal(getCount, 2);
  missing = true;
  await assert.rejects(io.inspect(config.privateBucket, "test.png"), MediaNotFoundError);
  missing = false;
  await io.inspect(config.privateBucket, "test.png");
  assert.equal(getCount, 3);
});

test("bounded reads reject oversize, truncated and changed objects", async () => {
  const oversized = new R2MediaIO(fakeClient(async () => ({ ...head, ContentLength: 13 * 1024 * 1024 })));
  await assert.rejects(oversized.inspect(config.privateBucket, "test.png"), /bounded/);
  for (const invalid of [
    { ...head, Body: Readable.from([png.subarray(0, 2)]) },
    { ...head, ETag: '"different"', Body: Readable.from([png]) },
    { ...head, Body: Readable.from([Buffer.alloc(png.length + 1)]) },
  ]) {
    const io = new R2MediaIO(fakeClient(async (command) => command.constructor.name === "HeadObjectCommand" ? head : invalid));
    await assert.rejects(io.inspect(config.privateBucket, "test.png"));
  }
});

test("unapproved uploads are hidden publicly and only receive no-store Staff previews", async () => {
  const client = new S3Client({
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`, region: "auto",
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  client.send = (async (command: { input: { Bucket: string; Key: string } }) => {
    if (command.input.Bucket === config.publicBucket) throw notFound();
    if (command.input.Key.endsWith("/manifest.json")) throw notFound();
    return head;
  }) as typeof client.send;
  const storage = new R2StorageService(config, client);
  try {
    await assert.rejects(storage.resolveDelivery("uploads/photo.png", "uploads", { allowPrivate: false }), MediaNotFoundError);
    const preview = await storage.resolveDelivery("uploads/photo.png", "uploads", { allowPrivate: true, width: 480 });
    assert.equal(preview.cacheControl, "private, no-store");
    assert.equal(new URL(preview.url).searchParams.get("X-Amz-Expires"), "300");
  } finally { client.destroy(); }
});

test("approved media deletion is refused rather than guessing retained-reference safety", async () => {
  let deletes = 0;
  const storage = new R2StorageService(config, fakeClient(async (command) => {
    if (command.constructor.name === "DeleteObjectCommand") deletes++;
    return head;
  }));
  await assert.rejects(storage.deleteUploadedMedia("uploads/photo.png"), /retained-reference/);
  assert.equal(deletes, 0);
});
