import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { copyOriginal, runBackup, checkpointKey, TOTAL_BYTES } from "./backup.mjs";
import { checkDelivery, photoReferences } from "./delivery.mjs";

Object.defineProperty(crypto, "DigestStream", { configurable: true, value: class extends WritableStream {
  constructor() {
    const hash = createHash("sha256");
    let resolve;
    const digest = new Promise(done => { resolve = done; });
    super({ write(bytes) { hash.update(bytes); }, close() {
      const bytes = hash.digest();
      resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    } });
    this.digest = digest;
  }
} });
const md5 = bytes => createHash("md5").update(bytes).digest("hex");
class Bucket {
  objects = new Map();
  writes = 0;
  async put(key, body, options = {}) {
    const previous = this.objects.get(key);
    if (options.onlyIf?.etagDoesNotMatch === "*" && previous
      || options.onlyIf?.etagMatches && previous?.etag !== options.onlyIf.etagMatches) return null;
    const bytes = typeof body === "string" ? Buffer.from(body)
      : body instanceof ReadableStream ? Buffer.from(await new Response(body).arrayBuffer()) : Buffer.from(body);
    const object = { key, bytes, size: bytes.length, etag: md5(bytes), uploaded: new Date(),
      httpMetadata: options.httpMetadata || {}, customMetadata: options.customMetadata || {} };
    this.objects.set(key, object);
    this.writes++;
    return object;
  }
  async head(key) { return this.objects.get(key) || null; }
  async get(key, options = {}) {
    const object = await this.head(key);
    if (!object) return null;
    if (options.onlyIf?.etagMatches && object.etag !== options.onlyIf.etagMatches) return { ...object };
    return { ...object, body: new Response(object.bytes).body,
      checksums: { md5: Uint8Array.from(Buffer.from(object.etag, "hex")).buffer },
      json: async () => JSON.parse(object.bytes.toString()), arrayBuffer: async () => object.bytes };
  }
  async list({ prefix }) { return { objects: [...this.objects.values()].filter(o => o.key.startsWith(prefix)), truncated: false }; }
}
async function fixture() {
  const env = { SOURCE: new Bucket(), BACKUP: new Bucket(), BACKUP_PREFIX: "r2-runtime/v1-test-a123", SOURCE_NAMESPACE: "" };
  env.EXECUTOR = { copy: job => copyOriginal(env, job) };
  await env.BACKUP.put(checkpointKey(env.BACKUP_PREFIX), JSON.stringify({
    version: 1, prefix: env.BACKUP_PREFIX, known: {}, reservations: {}, reservedBytes: 4_000_000, status: "healthy",
  }));
  const source = await env.SOURCE.put("uploads/new.jpg", Buffer.from("real source bytes"), {
    httpMetadata: { contentType: "image/jpeg" }, customMetadata: { "soso-owner": "synthetic-owner" },
  });
  return { env, job: { key: source.key, size: source.size, etag: source.etag } };
}
test("new originals and recovery ownership metadata stay private and pass full SHA-256 read-back", async () => {
  const { env, job } = await fixture();
  const writes = env.SOURCE.writes;
  const result = await copyOriginal(env, job);
  const record = await (await env.BACKUP.get(result.recoveryKey)).json();
  assert.equal(record.customMetadata["soso-owner"], "synthetic-owner");
  assert.equal(record.sha256, createHash("sha256").update("real source bytes").digest("hex"));
  assert.equal(env.SOURCE.writes, writes, "Backup cannot mutate source objects");
  assert.equal((await copyOriginal(env, job)).resumed, true);
});
test("changed source versions fail before any independent copy", async () => {
  const { env, job } = await fixture();
  const writes = env.BACKUP.writes;
  await assert.rejects(copyOriginal(env, { ...job, etag: "0".repeat(32) }), /Source changed/);
  assert.equal(env.BACKUP.writes, writes);
});
test("daily and cumulative guards leave explicit pending warnings without copying", async () => {
  for (const cap of ["daily", "storage"]) {
    const { env } = await fixture();
    const key = checkpointKey(env.BACKUP_PREFIX);
    const state = await (await env.BACKUP.get(key)).json();
    if (cap === "daily") { state.day = new Date().toISOString().slice(0, 10); state.attemptedBytes = 100_000_000; }
    else state.reservedBytes = TOTAL_BYTES;
    await env.BACKUP.put(key, JSON.stringify(state));
    env.EXECUTOR.copy = async () => { throw new Error("Must not copy beyond a limit"); };
    const result = await runBackup(env);
    assert.equal(result.status, "warning");
    assert.equal(result.pending, 1);
    assert.match(result.messages[0], /limit/);
  }
});
test("failed copies resume without reserving storage twice or claiming a successful backup", async () => {
  const { env } = await fixture();
  env.EXECUTOR.copy = async () => { throw new Error("temporary storage failure"); };
  const first = await runBackup(env);
  assert.equal(first.status, "warning");
  assert.equal(first.lastSuccessAt, null);
  env.EXECUTOR.copy = job => copyOriginal(env, job);
  const second = await runBackup(env);
  assert.equal(second.status, "healthy");
  assert.equal(second.pending, 0);
  assert.equal(second.reservedBytes, first.reservedBytes);
  assert.ok(second.lastSuccessAt);
});
test("a missing verified baseline and an active lease both fail closed", async () => {
  const { env } = await fixture();
  const key = checkpointKey(env.BACKUP_PREFIX);
  const state = await (await env.BACKUP.get(key)).json();
  state.leaseUntil = new Date(Date.now() + 60_000).toISOString();
  await env.BACKUP.put(key, JSON.stringify(state));
  await assert.rejects(runBackup(env), /lease/);
  env.BACKUP.objects.clear();
  await assert.rejects(runBackup(env), /baseline/);
});
test("approved photo extraction excludes external lookalikes", () => {
  assert.equal(photoReferences({ good: "/api/storage/objects/uploads/x.jpg",
    external: "https://other.example/api/storage/objects/uploads/private.jpg" }).length, 1);
});
async function deliveryFixture(failure) {
  const source = new Bucket();
  const path = "uploads/test.jpg";
  await source.put(path, Buffer.alloc(32));
  const identity = createHash("sha256").update(`uploads/${path}`).digest("hex");
  const canary = "uploads/_soso_ops_private_abc123.png";
  await source.put(canary, Buffer.from("private"));
  await source.put(`renditions/${identity}/manifest.json`, JSON.stringify({
    renditions: [480, 1600].map(width => ({ width, size: 16, key: `renditions/${identity}/${width}.jpg` })),
  }));
  const fetcher = async (input, options = {}) => {
    const url = new URL(input);
    if (failure === "dns") throw new Error("DNS lookup failed");
    if (url.pathname === "/api/content/platform") return Response.json({ src: `/api/storage/objects/${path}` });
    if (url.pathname.includes("_soso_ops_private_")) return new Response(null, { status: failure === "privacy" ? 200 : 404 });
    const width = url.searchParams.get("w");
    const key = width ? `renditions/${identity}/${width}.jpg` : path;
    if (url.hostname === "shopsoso.co") return new Response(null, { status: 302, headers: { Location: `https://media.shopsoso.co/${key}` } });
    if (failure === "access") return new Response(null, { status: 403 });
    if (failure === "rendition" && url.pathname.includes("renditions/")) return new Response(null, { status: 404 });
    const size = url.pathname.includes("renditions/") ? 16 : 32;
    if (options.headers?.Range) return new Response(new Uint8Array(8), { status: 206,
      headers: { "Content-Range": `bytes 0-7/${size}` } });
    return new Response(null, { headers: { "Content-Type": failure === "mime" ? "text/html" : "image/jpeg", "Content-Length": String(size) } });
  };
  return checkDelivery({ SOURCE: source, PRIVACY_CANARY_KEY: canary }, fetcher);
}
test("hourly checks validate current unsigned paths, responsive sizes, ranges and known private denial", async () => {
  const result = await deliveryFixture();
  assert.equal(result.status, "healthy");
  assert.equal(result.checkedCases, 3);
  assert.equal(result.privateDenial, true);
});
test("later DNS, access, rendition, MIME and privacy failures never report healthy", async () => {
  for (const failure of ["dns", "access", "rendition", "mime", "privacy"]) {
    const result = await deliveryFixture(failure);
    assert.equal(result.status, "failed", failure);
    assert.ok(result.message);
  }
});
