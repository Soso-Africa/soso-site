import assert from "node:assert/strict";
import test from "node:test";
import { readDrivePhoto, scanDriveFolder } from "./catalogue-import-drive";

const folderId = "folder_identifier123";
const fileId = "file_identifier12345";
const jpeg = Buffer.from([255, 216, 255, 224, 1, 2, 3, 4]);
const photo = { id: fileId, name: "Different product wording - 01.jpg", mimeType: "image/jpeg", size: String(jpeg.length), parents: [folderId] };
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });

test("Drive groups by actual parent folder and exhausts pagination, not product-name similarity", async () => {
  const calls: string[] = [];
  const folder = await scanDriveFolder(folderId, async (path) => {
    calls.push(path);
    if (path.startsWith(`/drive/v3/files/${folderId}?`)) return response({ name: "Product folder", mimeType: "application/vnd.google-apps.folder" });
    if (path.includes("pageToken=next")) return response({ files: [{ ...photo, id: "file_second12345678" }] });
    return response({ files: [photo, { id: "other", name: "Nested folder", mimeType: "application/vnd.google-apps.folder" }], nextPageToken: "next" });
  });
  assert.equal(folder.files.length, 2);
  assert.equal(calls.length, 3);
  assert.ok(folder.warnings.some((warning) => warning.includes("Nested folder")));
});

test("partial Drive listings and unsafe IDs fail explicitly", async () => {
  await assert.rejects(scanDriveFolder("../credentials"), /Invalid/);
  await assert.rejects(scanDriveFolder(folderId, async (path) => path.includes("pageSize=")
    ? response({ incompleteSearch: true, files: [] }) : response({ mimeType: "application/vnd.google-apps.folder" })), /incomplete/);
});

test("Drive photo download enforces folder membership and actual image bytes", async () => {
  const result = await readDrivePhoto(folderId, fileId, async (path) => path.includes("alt=media")
    ? new Response(jpeg, { headers: { "content-type": "image/jpeg" } }) : response(photo));
  assert.deepEqual(result.bytes, jpeg);
  await assert.rejects(readDrivePhoto(folderId, fileId, async () => response({ ...photo, parents: ["different"] })), /no longer belongs/);
  await assert.rejects(readDrivePhoto(folderId, fileId, async (path) => path.includes("alt=media")
    ? new Response(Buffer.alloc(jpeg.length)) : response(photo)), /bytes do not match/);
  await assert.rejects(readDrivePhoto(folderId, fileId, async (path) => path.includes("alt=media")
    ? new Response(jpeg.subarray(0, 4)) : response(photo)), /interrupted/);
});

test("Drive metadata prevents over-budget or permission-restricted downloads", async () => {
  for (const value of [{ ...photo, size: String(13 * 1024 * 1024) }, { ...photo, capabilities: { canDownload: false } }]) {
    let calls = 0;
    await assert.rejects(readDrivePhoto(folderId, fileId, async () => { calls++; return response(value); }), /cannot be downloaded/);
    assert.equal(calls, 1);
  }
});

test("Drive scans stop empty or repeated pagination and body bytes cannot exceed the limit", async () => {
  let pages = 0;
  await assert.rejects(scanDriveFolder(folderId, async (path) => {
    if (!path.includes("pageSize=")) return response({ mimeType: "application/vnd.google-apps.folder" });
    pages++;
    return response({ files: [], nextPageToken: "same-page-again" });
  }), /page budget/);
  assert.equal(pages, 10);
  let cancelled = false;
  await assert.rejects(readDrivePhoto(folderId, fileId, async (path) => {
    if (!path.includes("alt=media")) return response(photo);
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(12 * 1024 * 1024 + 1)); },
      cancel() { cancelled = true; },
    }));
  }), /download budget/);
  assert.equal(cancelled, true);
});
