import assert from "node:assert/strict";
import test from "node:test";
import { inspectDeliveryUrl, MediaNotFoundError } from "./cloudinary-storage";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=", "base64");

test("Cloudinary inspection reuse requires live byte validation and never falls back on errors", async () => {
  const originalFetch = globalThis.fetch;
  const url = "https://res.cloudinary.com/synthetic/image/upload/inspection.png";
  const sentHeaders: Headers[] = [];
  let mode: "full" | "unchanged" | "changed" | "failed" | "missing" = "full";
  globalThis.fetch = (async (_url, init) => {
    sentHeaders.push(new Headers(init?.headers));
    if (mode === "unchanged") return new Response(null, { status: 304, headers: { etag: '"bytes-a"' } });
    if (mode === "failed") return new Response(null, { status: 503 });
    if (mode === "missing") return new Response(null, { status: 404 });
    return new Response(new Uint8Array(png), {
      status: 200,
      headers: { etag: mode === "changed" ? '"bytes-b"' : '"bytes-a"', "content-type": "image/png", "content-length": String(png.length) },
    });
  }) as typeof fetch;
  try {
    const first = await inspectDeliveryUrl(url);
    assert.equal(first.contentType, "image/png");
    assert.equal(first.width, 1);
    assert.equal(first.size, png.length);
    first.contentType = "mutated";
    mode = "unchanged";
    assert.equal((await inspectDeliveryUrl(url)).contentType, "image/png", "Caller mutation cannot alter the verified cache");
    assert.equal(sentHeaders.at(-1)?.get("if-none-match"), '"bytes-a"');
    mode = "changed";
    assert.equal((await inspectDeliveryUrl(url)).size, png.length);
    mode = "failed";
    await assert.rejects(inspectDeliveryUrl(url), /503/);
    assert.equal(sentHeaders.at(-1)?.get("if-none-match"), '"bytes-b"', "A changed response replaces the byte validator");
    mode = "full";
    await inspectDeliveryUrl(url);
    assert.equal(sentHeaders.at(-1)?.get("if-none-match"), null, "Failed validation clears the old inspection");
    mode = "missing";
    await assert.rejects(inspectDeliveryUrl(url), MediaNotFoundError);
    mode = "unchanged";
    await assert.rejects(inspectDeliveryUrl(url), /unverified/, "Missing media cannot revive an old inspection");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("weak or missing Cloudinary validators never authorize inspection reuse", async () => {
  const originalFetch = globalThis.fetch;
  const url = "https://res.cloudinary.com/synthetic/image/upload/weak.png";
  let conditional = false;
  globalThis.fetch = (async (_url, init) => {
    conditional ||= new Headers(init?.headers).has("if-none-match");
    return new Response(new Uint8Array(png), { headers: { etag: 'W/"weak"', "content-type": "image/png" } });
  }) as typeof fetch;
  try {
    await inspectDeliveryUrl(url);
    await inspectDeliveryUrl(url);
    assert.equal(conditional, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("contradictory 304 validators and MIME headers are rejected", async () => {
  const originalFetch = globalThis.fetch;
  const url = "https://res.cloudinary.com/synthetic/image/upload/contradiction.png";
  let mode: "full" | "etag" | "mime" = "full";
  globalThis.fetch = (async () => mode === "full"
    ? new Response(new Uint8Array(png), { headers: { etag: '"bytes-a"', "content-type": "image/png" } })
    : new Response(null, {
      status: 304,
      headers: mode === "etag" ? { etag: '"unexpected-bytes"' } : { etag: '"bytes-a"', "content-type": "text/html" },
    })) as typeof fetch;
  try {
    await inspectDeliveryUrl(url);
    mode = "etag";
    await assert.rejects(inspectDeliveryUrl(url), /unverified/);
    mode = "full";
    await inspectDeliveryUrl(url);
    mode = "mime";
    await assert.rejects(inspectDeliveryUrl(url), /unverified/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
