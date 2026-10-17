// Read-only real storefront probes plus one exact temporary private synthetic pixel.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { operatorBucket } from "../workers/soso-media-operations/node-adapter.mjs";
import { checkDelivery } from "../workers/soso-media-operations/delivery.mjs";
const source = operatorBucket("soso-media-private", "source");
const key = `uploads/_soso_ops_private_${randomBytes(16).toString("hex")}.png`;
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGNQMHD4DwAClAGQJla1dAAAAABJRU5ErkJggg==", "base64");
let report;
try {
  assert.ok(await source.put(key, pixel, {
    onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "image/png" },
    customMetadata: { "soso-owner": "isolated-delivery-verification" },
  }));
  report = await checkDelivery({ SOURCE: source, PRIVACY_CANARY_KEY: key });
  assert.equal(report.status, "healthy", report.message || "Delivery verification failed");
} finally {
  await source.removeFixture(key, key);
  const cleaned = !await source.head(key);
  report = { ...report, cleanupVerified: cleaned, databaseWrites: 0, publicWrites: 0, schedulerActivated: false };
  await writeFile(new URL("../generated-artifacts/media-migration/r2-delivery-monitor-verification.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  source.close();
}
console.log(JSON.stringify(report));
