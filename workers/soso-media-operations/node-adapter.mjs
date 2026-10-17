// Operator-only adapter. Never import this credential-bearing module into the app.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
const require = createRequire(new URL("../../scripts/package.json", import.meta.url));
const { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require("@aws-sdk/client-s3");

export function installDigestStream() {
  if (crypto.DigestStream) return;
  Object.defineProperty(crypto, "DigestStream", { value: class extends WritableStream {
    constructor() {
      const hash = createHash("sha256");
      let resolve;
      const digest = new Promise(done => { resolve = done; });
      super({ write(chunk) { hash.update(chunk); }, close() {
        const bytes = hash.digest();
        resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      } });
      this.digest = digest;
    }
  } });
}
export function operatorBucket(bucket, kind) {
  if (!["source", "backup"].includes(kind)
    || bucket !== (kind === "source" ? "soso-media-private" : "soso-media-backup")) throw new Error("Invalid operator bucket scope");
  const account = process.env.R2_ACCOUNT_ID;
  const key = process.env[kind === "source" ? "R2_MEDIA_ACCESS_KEY_ID" : "R2_ACCESS_KEY_ID"];
  const secret = process.env[kind === "source" ? "R2_MEDIA_SECRET_ACCESS_KEY" : "R2_SECRET_ACCESS_KEY"];
  if (!/^[a-f0-9]{32}$/i.test(account || "") || !/^[a-f0-9]{32}$/i.test(key || "") || !/^[a-f0-9]{64}$/i.test(secret || "")) {
    throw new Error("The scoped operator credentials are unavailable");
  }
  const client = new S3Client({
    endpoint: `https://${account}.r2.cloudflarestorage.com`, region: "auto",
    credentials: { accessKeyId: key, secretAccessKey: secret }, maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
  });
  const send = command => client.send(command, { abortSignal: AbortSignal.timeout(30_000) });
  const shape = (key, object) => ({
    key, size: object.ContentLength, etag: String(object.ETag).replace(/^"|"$/g, ""),
    uploaded: object.LastModified, customMetadata: object.Metadata || {},
    httpMetadata: { contentType: object.ContentType, cacheControl: object.CacheControl },
  });
  const missing = error => error?.$metadata?.httpStatusCode === 404;
  return {
    async head(key) {
      try { return shape(key, await send(new HeadObjectCommand({ Bucket: bucket, Key: key }))); }
      catch (error) { if (missing(error)) return null; throw error; }
    },
    async get(key, options = {}) {
      let object;
      try {
        object = await send(new GetObjectCommand({ Bucket: bucket, Key: key,
          ...(options.onlyIf?.etagMatches ? { IfMatch: `"${options.onlyIf.etagMatches}"` } : {}) }));
      } catch (error) { if (missing(error)) return null; throw error; }
      const identity = shape(key, object);
      const body = Readable.toWeb(object.Body);
      return { ...identity, body,
        checksums: { md5: Uint8Array.from(Buffer.from(identity.etag, "hex")).buffer },
        json: async () => new Response(body).json(),
      };
    },
    async put(key, body, options = {}) {
      let bytes;
      if (typeof body === "string") bytes = Buffer.from(body);
      else if (body instanceof ReadableStream) {
        const chunks = []; let total = 0;
        for await (const part of body) {
          total += part.length;
          if (total > 64 * 1024 * 1024) throw new Error("Operator copy exceeded its object budget");
          chunks.push(Buffer.from(part));
        }
        bytes = Buffer.concat(chunks);
      } else bytes = Buffer.from(body);
      try {
        const result = await send(new PutObjectCommand({
          Bucket: bucket, Key: key, Body: bytes, ContentLength: bytes.length,
          ContentMD5: createHash("md5").update(bytes).digest("base64"),
          ContentType: options.httpMetadata?.contentType, CacheControl: options.httpMetadata?.cacheControl,
          Metadata: options.customMetadata,
          ...(options.onlyIf?.etagDoesNotMatch === "*" ? { IfNoneMatch: "*" } : {}),
          ...(options.onlyIf?.etagMatches ? { IfMatch: `"${options.onlyIf.etagMatches}"` } : {}),
        }));
        return { etag: String(result.ETag).replace(/^"|"$/g, "") };
      } catch (error) { if (error?.$metadata?.httpStatusCode === 412) return null; throw error; }
    },
    async list(options) {
      const result = await send(new ListObjectsV2Command({
        Bucket: bucket, Prefix: options.prefix, MaxKeys: options.limit, ContinuationToken: options.cursor,
      }));
      return { objects: (result.Contents || []).map(row => ({ key: row.Key, size: row.Size, etag: String(row.ETag).replace(/^"|"$/g, "") })),
        truncated: Boolean(result.IsTruncated), cursor: result.NextContinuationToken };
    },
    async removeFixture(key, allowedPrefix) {
      if (/^uploads\/_soso_ops_private_[a-f0-9]+\.png$/.test(allowedPrefix)) {
        if (key !== allowedPrefix) throw new Error("Private canary cleanup must identify one exact object");
        await send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        return;
      }
      if (!/^isolated-(media-ops|restore)-[a-f0-9]+\//.test(allowedPrefix)
        && !/^r2-runtime\/v1-test-[a-f0-9]+\//.test(allowedPrefix)) throw new Error("Fixture cleanup scope is not isolated");
      if (!key.startsWith(allowedPrefix)) throw new Error("Fixture cleanup escaped its exact namespace");
      await send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    close() { client.destroy(); },
  };
}
