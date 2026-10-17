// Controlled real-provider copy/retry/restore. No merchant documents or public writes.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { copyOriginal, runBackup, checkpointKey, recordKey, dataKey } from "../workers/soso-media-operations/backup.mjs";
import { operatorBucket, installDigestStream } from "../workers/soso-media-operations/node-adapter.mjs";

installDigestStream();
const id = randomBytes(12).toString("hex");
const namespace = `isolated-media-ops-${id}`;
const restoreNamespace = `isolated-restore-${id}`;
const prefix = `r2-runtime/v1-test-${id}`;
const SOURCE = operatorBucket("soso-media-private", "source");
const BACKUP = operatorBucket("soso-media-backup", "backup");
const env = { SOURCE, BACKUP, BACKUP_PREFIX: prefix, SOURCE_NAMESPACE: namespace };
env.EXECUTOR = { copy: job => copyOriginal(env, job) };
const original = `${namespace}/uploads/backup-canary.png`;
const restored = `${restoreNamespace}/uploads/restored.png`;
const bytes = randomBytes(1024 * 1024);
const etag = createHash("md5").update(bytes).digest("hex");
const job = { key: original, etag, size: bytes.length };
const report = { startedAt: new Date().toISOString(), complete: false, databaseWrites: 0, publicWrites: 0,
  originalBytes: bytes.length, completeReadBack: false, resumableFailure: false, controlledRestore: false, cleanupVerified: false };
const backupKeys = [checkpointKey(prefix), recordKey(prefix, original, etag), dataKey(prefix, original, etag)];
try {
  assert.ok(await SOURCE.put(original, bytes, { onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "image/png" }, customMetadata: { "soso-owner": "isolated-backup-verification" } }));
  assert.ok(await BACKUP.put(checkpointKey(prefix), JSON.stringify({
    version: 1, prefix, known: {}, reservations: {}, reservedBytes: 4_000_000, status: "healthy",
  }), { onlyIf: { etagDoesNotMatch: "*" } }));
  // Simulate interruption after immutable data copy but before recovery metadata.
  const put = BACKUP.put.bind(BACKUP);
  let interrupted = false;
  BACKUP.put = async (key, ...args) => {
    if (key === recordKey(prefix, original, etag) && !interrupted) { interrupted = true; throw new Error("Isolated interruption"); }
    return put(key, ...args);
  };
  const first = await runBackup(env);
  assert.equal(first.status, "warning");
  assert.equal(first.lastSuccessAt, null);
  const second = await runBackup(env);
  assert.equal(second.status, "healthy");
  assert.equal(second.reservedBytes, first.reservedBytes);
  report.resumableFailure = true;
  const record = await (await BACKUP.get(recordKey(prefix, original, etag))).json();
  assert.equal(record.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(record.customMetadata["soso-owner"], "isolated-backup-verification");
  const copy = await BACKUP.get(record.backupKey);
  assert.ok(await SOURCE.put(restored, copy.body, { onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: record.httpMetadata, customMetadata: record.customMetadata }));
  const read = await SOURCE.get(restored);
  const restoredBytes = Buffer.from(await new Response(read.body).arrayBuffer());
  assert.ok(restoredBytes.equals(bytes));
  assert.equal(read.customMetadata["soso-owner"], record.customMetadata["soso-owner"]);
  report.completeReadBack = true;
  report.controlledRestore = true;
  report.complete = true;
} finally {
  await Promise.all([
    ...[original, restored].map(key => SOURCE.removeFixture(key, `${key.startsWith(namespace) ? namespace : restoreNamespace}/`)),
    ...backupKeys.map(key => BACKUP.removeFixture(key, `${prefix}/`)),
  ]);
  const remaining = await Promise.all([SOURCE.head(original), SOURCE.head(restored), ...backupKeys.map(key => BACKUP.head(key))]);
  report.cleanupVerified = remaining.every(value => value === null);
  report.complete &&= report.cleanupVerified;
  report.finishedAt = new Date().toISOString();
  await writeFile(new URL("../generated-artifacts/media-migration/r2-independent-backup-verification.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  SOURCE.close(); BACKUP.close();
}
console.log(JSON.stringify(report));
assert.ok(report.complete);
