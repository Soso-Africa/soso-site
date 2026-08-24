import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const imageDirectory = resolve(packageRoot, "public/images");
const sourceDirectory = resolve(packageRoot, "src");
const maxImageBytes = 512 * 1024;
const maxTotalImageBytes = 1024 * 1024;
const supportedImageExtensions = new Set([".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"]);

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
  totalImageBytes += size;
}
assert.ok(totalImageBytes <= maxTotalImageBytes, `Public images total ${totalImageBytes} bytes; the budget is ${maxTotalImageBytes} bytes.`);

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
}

process.stdout.write(
  `Performance/media validation passed: ${imagePaths.length} public images total ${totalImageBytes} bytes, within static budgets; image markup reserves layout and avoids embedded image data.\n`,
);