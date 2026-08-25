import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDirectory = resolve(packageRoot, "public");
const imageDirectory = resolve(packageRoot, "public/images");
const sourceDirectory = resolve(packageRoot, "src");
const maxImageBytes = 512 * 1024;
const maxTotalImageBytes = 1024 * 1024;
const maxVideoBytes = 8 * 1024 * 1024;
const maxTotalVideoBytes = 8 * 1024 * 1024;
const supportedImageExtensions = new Set([".avif", ".jpg", ".jpeg", ".png", ".svg", ".webp"]);
const supportedVideoExtensions = new Set([".mp4", ".webm"]);

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  }));
  return nested.flat();
}

const imagePaths = await filesUnder(imageDirectory);
let totalImageBytes = 0;
for (const path of imagePaths) {
  const extension = extname(path).toLowerCase();
  assert.ok(supportedImageExtensions.has(extension), `Unsupported public image type: ${relative(packageRoot, path)}`);

  const { size } = await stat(path);
  assert.ok(size <= maxImageBytes, `${relative(packageRoot, path)} is ${size} bytes; the per-image budget is ${maxImageBytes} bytes.`);
  const bytes = await readFile(path);
  if (extension === ".png") {
    assert.equal(bytes.includes(Buffer.from("acTL", "ascii")), false, `${relative(packageRoot, path)} is animated; public fallback images must be static.`);
  }
  if (extension === ".webp") {
    const hasAnimationChunk = bytes.includes(Buffer.from("ANIM", "ascii"));
    const animationFlag = bytes.length > 20
      && bytes.subarray(12, 16).toString("ascii") === "VP8X"
      && (bytes[20] & 0x02) !== 0;
    assert.equal(hasAnimationChunk || animationFlag, false, `${relative(packageRoot, path)} is animated; public fallback images must be static.`);
  }
  totalImageBytes += size;
}
assert.ok(totalImageBytes <= maxTotalImageBytes, `Public images total ${totalImageBytes} bytes; the budget is ${maxTotalImageBytes} bytes.`);

const videoPaths = (await filesUnder(publicDirectory))
  .filter((path) => supportedVideoExtensions.has(extname(path).toLowerCase()));
let totalVideoBytes = 0;
for (const path of videoPaths) {
  const { size } = await stat(path);
  assert.ok(size <= maxVideoBytes, `${relative(packageRoot, path)} is ${size} bytes; the per-video budget is ${maxVideoBytes} bytes.`);
  totalVideoBytes += size;
}
assert.ok(totalVideoBytes <= maxTotalVideoBytes, `Public videos total ${totalVideoBytes} bytes; the budget is ${maxTotalVideoBytes} bytes.`);

const sourcePaths = (await filesUnder(sourceDirectory)).filter((path) => /\.(?:tsx|ts|css)$/.test(path));
for (const path of sourcePaths) {
  const source = await readFile(path, "utf8");
  assert.doesNotMatch(source, /data:image\//i, `${relative(packageRoot, path)} embeds image bytes instead of serving a cacheable asset.`);

  for (const tag of source.match(/<img\b[\s\S]*?\/?>/g) ?? []) {
    assert.match(tag, /\balt\s*=/, `${relative(packageRoot, path)} has an image without alternative text.`);
    assert.match(
      tag,
      /\b(?:width|height)\s*=|className\s*=\s*["'][^"']*\b(?:aspect-|w-|h-|absolute)/,
      `${relative(packageRoot, path)} has an image without an explicit or CSS-reserved layout.`,
    );
  }
  for (const tag of source.match(/<video\b[\s\S]*?>/g) ?? []) {
    assert.match(tag, /\bmuted\b/, `${relative(packageRoot, path)} has video that is not muted.`);
    assert.match(tag, /\bloop\b/, `${relative(packageRoot, path)} has hero video that does not loop.`);
    assert.match(tag, /\bplaysInline\b/, `${relative(packageRoot, path)} has video that may force fullscreen playback.`);
    assert.match(tag, /\bpreload="none"/, `${relative(packageRoot, path)} has video that preloads outside the motion gate.`);
    assert.match(tag, /\bposter=/, `${relative(packageRoot, path)} has video without an approved poster.`);
  }
}

process.stdout.write(
  `Performance/media validation passed: ${imagePaths.length} public images total ${totalImageBytes} bytes and ${videoPaths.length} public videos total ${totalVideoBytes} bytes; responsive media stays within static budgets and avoids embedded bytes.\n`,
);