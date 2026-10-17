import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { operatorBucket } from "../workers/soso-media-operations/node-adapter.mjs";
const receipt = new URL("../generated-artifacts/media-migration/r2-operations-canary.json", import.meta.url);
let existing;
try { existing = JSON.parse(await readFile(receipt, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const source = operatorBucket("soso-media-private", "source");
try {
  const key = existing?.key || `uploads/_soso_ops_private_${randomBytes(16).toString("hex")}.png`;
  assert.match(key, /^uploads\/_soso_ops_private_[a-f0-9]+\.png$/);
  if (!existing) {
    const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGNQMHD4DwAClAGQJla1dAAAAABJRU5ErkJggg==", "base64");
    assert.ok(await source.put(key, pixel, { onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "image/png" }, customMetadata: { "soso-owner": "media-operations-canary" } }));
    await writeFile(receipt, JSON.stringify({ key, createdAt: new Date().toISOString() }) + "\n", { mode: 0o600 });
  }
  assert.ok(await source.head(key));
  console.log(JSON.stringify({ privateCanaryReady: true }));
} finally { source.close(); }
