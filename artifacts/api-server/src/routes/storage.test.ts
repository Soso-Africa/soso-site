import assert from "node:assert/strict";
import test from "node:test";
import { detectImageContentType } from "./storage";

test("stored media detection accepts only approved raster image signatures", () => {
  assert.equal(detectImageContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectImageContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(detectImageContentType(Buffer.from("GIF89a", "ascii")), "image/gif");
  assert.equal(detectImageContentType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")])), "image/webp");
  assert.equal(detectImageContentType(Buffer.from("<script>alert(1)</script>", "utf8")), null);
  assert.equal(detectImageContentType(Buffer.from("<svg onload=alert(1)>", "utf8")), null);
});