// Prepare isolated edge-runtime verification; cleanup is a separate explicit mode.
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { operatorBucket } from "../workers/soso-media-operations/node-adapter.mjs";
import { checkpointKey, dataKey, recordKey } from "../workers/soso-media-operations/backup.mjs";
const directory = new URL("../generated-artifacts/media-migration/", import.meta.url);
const receipt = new URL("r2-worker-canary-fixture.json", directory);
const source = operatorBucket("soso-media-private", "source");
const backup = operatorBucket("soso-media-backup", "backup");
try {
  if (process.argv.includes("--cleanup")) {
    const fixture = JSON.parse(await readFile(receipt, "utf8"));
    for (const job of fixture.jobs) {
      await source.removeFixture(job.key, `${fixture.namespace}/`);
      for (const key of [dataKey(fixture.prefix, job.key, job.etag), recordKey(fixture.prefix, job.key, job.etag)]) {
        await backup.removeFixture(key, `${fixture.prefix}/`);
      }
    }
    await backup.removeFixture(checkpointKey(fixture.prefix), `${fixture.prefix}/`);
    await source.removeFixture(fixture.canary, fixture.canary);
    fixture.cleaned = true;
    await writeFile(receipt, JSON.stringify(fixture, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify({ cleaned: true }));
  } else {
    const id = randomBytes(12).toString("hex");
    const namespace = `isolated-media-ops-${id}`;
    const prefix = `r2-runtime/v1-test-${id}`;
    const fixture = { namespace, prefix, canary: `uploads/_soso_ops_private_${id}.png`, jobs: [], cleaned: false };
    for (const size of [1024 * 1024, 12 * 1024 * 1024]) {
      const bytes = randomBytes(size);
      const key = `${namespace}/uploads/runtime-${size}.png`;
      assert.ok(await source.put(key, bytes, { onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "image/png" }, customMetadata: { "soso-owner": "isolated-worker-verification" } }));
      fixture.jobs.push({ key, size, etag: createHash("md5").update(bytes).digest("hex") });
      await writeFile(receipt, JSON.stringify(fixture, null, 2) + "\n", { mode: 0o600 });
    }
    assert.ok(await backup.put(checkpointKey(prefix), JSON.stringify({
      version: 1, prefix, known: {}, reservations: {}, reservedBytes: 4_000_000, status: "warning",
    }), { onlyIf: { etagDoesNotMatch: "*" } }));
    const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGNQMHD4DwAClAGQJla1dAAAAABJRU5ErkJggg==", "base64");
    assert.ok(await source.put(fixture.canary, pixel, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "image/png" } }));
    await writeFile(receipt, JSON.stringify(fixture, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify({ prepared: true, isolatedOriginals: fixture.jobs.length, largestOriginalBytes: 12 * 1024 * 1024 }));
  }
} finally { source.close(); backup.close(); }
