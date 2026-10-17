import assert from "node:assert/strict";
import test from "node:test";
import { S3Client } from "@aws-sdk/client-s3";
import { managedMediaReferences } from "./managed-media-references";
import { prepareMediaForPublication } from "./media-publication";
import { R2StorageService } from "./r2-storage";
import { readR2RenditionManifest } from "./r2-renditions";
import { inventoryR2StorageBucket } from "./r2-storage-usage";

const config = {
  accountId: "0".repeat(32), accessKeyId: "1".repeat(32), secretAccessKey: "2".repeat(64),
  privateBucket: "soso-media-private", publicBucket: "soso-media-public", namespace: "isolated-test",
};
function storage(send: (input: Record<string, unknown>) => Promise<unknown> = async () => { throw new Error("Unexpected storage read"); }) {
  return new R2StorageService(config, { send: (command: { input: Record<string, unknown> }) => send(command.input) } as unknown as S3Client);
}
const photo = { contentType: "image/webp", declaredContentType: "image/webp", size: 100, animated: false };

test("managed references include embedded Journal URLs but exclude external lookalikes", () => {
  const refs = managedMediaReferences({
    nested: [{ src: "/api/storage/objects/uploads/photo.jpg" }],
    body: 'A cover ![Alt](/api/storage/public-objects/posts/cover.png?w=480).',
    remote: "https://other.example/api/storage/objects/uploads/private.jpg",
    misleading: "/api/storage/objects/uploads/file.jpg/other",
  });
  assert.deepEqual([...refs.keys()], ["uploads/uploads/photo.jpg", "public/posts/cover.png"]);
});

test("publication touches only references absent from the previously published candidate", async () => {
  const s = storage();
  const inspected: string[] = [];
  const copied: string[] = [];
  s.inspectUploadedMedia = async (path) => { inspected.push(path); return photo; };
  s.stageApprovedOriginal = async (path) => { copied.push(path); };
  const previous = { src: "/api/storage/objects/uploads/old.webp" };
  const candidate = { old: previous, src: "/api/storage/objects/uploads/new.webp" };
  await prepareMediaForPublication(candidate, previous, s);
  assert.deepEqual(inspected, ["uploads/new.webp"]);
  assert.deepEqual(copied, ["uploads/new.webp"]);
});

test("failed preflight exposes no new copies and awaits other in-flight validations", async () => {
  const s = storage();
  let settled = false;
  let copies = 0;
  s.inspectUploadedMedia = async (path) => {
    if (path.includes("bad")) throw new Error("bad source");
    await new Promise((resolve) => setTimeout(resolve, 15));
    settled = true;
    return photo;
  };
  s.stageApprovedOriginal = async () => { copies++; };
  await assert.rejects(prepareMediaForPublication([
    "/api/storage/objects/uploads/bad.webp", "/api/storage/objects/uploads/other.webp",
  ], undefined, s), /bad source/);
  assert.equal(settled, true);
  assert.equal(copies, 0);
});

test("a copy failure does not release publication while another approved copy is still running", async () => {
  const s = storage();
  let settled = false;
  s.inspectUploadedMedia = async () => photo;
  s.stageApprovedOriginal = async (path) => {
    if (path.includes("bad")) throw new Error("copy failed");
    await new Promise((resolve) => setTimeout(resolve, 15));
    settled = true;
  };
  await assert.rejects(prepareMediaForPublication([
    "/api/storage/objects/uploads/bad.webp", "/api/storage/objects/uploads/other.webp",
  ], undefined, s), /copy failed/);
  assert.equal(settled, true);
});

test("a responsive manifest cannot be trusted without a strong source validator", async () => {
  const s = storage(async () => ({ ContentLength: 100 }));
  await assert.rejects(readR2RenditionManifest(s, "uploads/photo.png", "uploads"), /strong source/);
});

test("R2 storage inventory follows bounded pages and never reads object bodies", async () => {
  const inputs: Record<string, unknown>[] = [];
  const s = storage(async (input) => {
    inputs.push(input);
    return inputs.length === 1
      ? { Contents: [{ Size: 10 }, { Size: 20 }], IsTruncated: true, NextContinuationToken: "next" }
      : { Contents: [{ Size: 30 }], IsTruncated: false };
  });
  assert.deepEqual(await inventoryR2StorageBucket(s, config.privateBucket), { bytes: 60, objects: 3 });
  assert.equal(inputs.length, 2);
  assert.ok(inputs.every((input) => input.Bucket === config.privateBucket && input.Prefix === "isolated-test/"));
  assert.equal(inputs[1]!.ContinuationToken, "next");
});

test("R2 storage inventory refuses missing sizes and repeated page cursors", async () => {
  await assert.rejects(inventoryR2StorageBucket(storage(async () => ({ Contents: [{}] })), config.privateBucket), /object sizes/);
  const repeated = storage(async () => ({ Contents: [], IsTruncated: true, NextContinuationToken: "repeat" }));
  await assert.rejects(inventoryR2StorageBucket(repeated, config.privateBucket), /pagination/);
});
