import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidenceDirectory = resolve(
  packageRoot,
  process.env.BACKUP_RESTORE_EVIDENCE_DIR ?? ".release-evidence/backup-restore",
);
const allowedEnvironments = new Set(["local", "staging", "preview", "test"]);

assert.notEqual(process.env.NODE_ENV, "production", "Backup/restore verification is intentionally disabled when NODE_ENV=production.");

const [backup, restored] = await Promise.all(
  ["backup-manifest.json", "restored-manifest.json"].map(async (file) => {
    const path = resolve(evidenceDirectory, file);
    assert.ok(path.startsWith(`${evidenceDirectory}/`), "Evidence files must remain within the evidence directory.");
    return JSON.parse(await readFile(path, "utf8"));
  }),
);

for (const [name, manifest] of [["backup", backup], ["restored", restored]]) {
  assert.ok(allowedEnvironments.has(manifest.environment), `${name} evidence must name local, staging, preview, or test as its environment.`);
  assert.equal(manifest.production, false, `${name} evidence must explicitly confirm production was not used.`);
  assert.equal(typeof manifest.snapshotId, "string", `${name} evidence requires a snapshotId.`);
  assert.equal(typeof manifest.integrityHash, "string", `${name} evidence requires an integrityHash.`);
  assert.ok(Number.isInteger(manifest.recordCount) && manifest.recordCount >= 0, `${name} evidence requires a non-negative integer recordCount.`);
}

assert.equal(backup.snapshotId, restored.snapshotId, "Restored evidence does not correspond to the backup snapshot.");
assert.equal(backup.integrityHash, restored.integrityHash, "Restored data integrity hash differs from the backup.");
assert.equal(backup.recordCount, restored.recordCount, "Restored record count differs from the backup.");

process.stdout.write(`Non-production backup/restore evidence verified for snapshot ${backup.snapshotId}. This command performs no network, database, or restore operations.\n`);