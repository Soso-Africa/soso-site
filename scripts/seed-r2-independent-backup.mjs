// Dry-run by default. Seed only the verified pre-existing original mapping.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { operatorBucket } from "../workers/soso-media-operations/node-adapter.mjs";
const directory = new URL("../generated-artifacts/media-migration/", import.meta.url);
const load = async name => JSON.parse(await readFile(new URL(name, directory), "utf8"));
const [runtime, archive] = await Promise.all([load("r2-runtime-private-state.json"), load("r2-original-backup-state.json")]);
assert.ok(runtime.complete && archive.complete && archive.remoteManifestsVerified);
assert.equal(Object.keys(runtime.failures).length, 0);
assert.equal(Object.keys(archive.failures).length, 0);
const prefix = "r2-runtime/v1";
const known = {};
for (const [asset, original] of Object.entries(runtime.verified)) {
  const backup = archive.verified[asset];
  assert.ok(backup && original.sha256 === backup.sha256 && original.bytes === backup.bytes && original.md5 === backup.md5);
  assert.match(original.key, /^(uploads|public)\/[A-Za-z0-9_./-]+\.(jpg|png|webp|gif|mp4|webm)$/);
  assert.match(original.md5, /^[a-f0-9]{32}$/);
  known[original.key] = { etag: original.md5, size: original.bytes, legacyBackupKey: backup.key, sha256: backup.sha256 };
}
const state = {
  version: 1, prefix, known, reservations: {}, reservedBytes: 4_000_000,
  status: "warning", pending: null, lastSuccessAt: null,
  failures: ["The existing independent originals are mapped; the scheduled service has not completed its first scan."],
};
const bytes = JSON.stringify(state);
assert.ok(Buffer.byteLength(bytes) < 4_000_000);
let written = false;
if (process.argv.includes("--seed")) {
  const bucket = operatorBucket("soso-media-backup", "backup");
  try {
    assert.ok(!await bucket.head(`${prefix}/checkpoint.json`), "A checkpoint already exists; never overwrite its history or reservations");
    assert.ok(await bucket.put(`${prefix}/checkpoint.json`, bytes, {
      onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" },
    }));
    written = true;
  } finally { bucket.close(); }
}
console.log(JSON.stringify({ dryRun: !written, independentlyVerifiedOriginals: Object.keys(known).length,
  checkpointBytes: Buffer.byteLength(bytes), newOriginalCopies: 0, schedulesEnabled: false }));
