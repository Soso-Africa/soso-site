import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = resolve(packageRoot, "dist/public");
const requiredFiles = ["index.html", "robots.txt", "seo-manifest.json"];

for (const file of requiredFiles) {
  await access(resolve(outputDirectory, file));
}

const indexHtml = await readFile(resolve(outputDirectory, "index.html"), "utf8");
assert.match(indexHtml, /<meta[^>]+name="viewport"/i, "Built HTML is missing a viewport declaration.");
assert.match(indexHtml, /<script[^>]+src="\/assets\/[^"]+"/i, "Built HTML does not reference a Vite client asset.");
assert.doesNotMatch(indexHtml, /localhost:\d+|127\.0\.0\.1:\d+/i, "Built HTML contains a local server address.");

const robots = await readFile(resolve(outputDirectory, "robots.txt"), "utf8");
try {
  await access(resolve(outputDirectory, "sitemap.xml"));
} catch {
  assert.match(
    robots,
    /Disallow:\s*\//i,
    "A build without a sitemap must retain the private robots fallback.",
  );
}

const assetsDirectory = resolve(outputDirectory, "assets");
const assets = await readdir(assetsDirectory);
assert.ok(assets.some((asset) => asset.endsWith(".js")), "Built output has no JavaScript asset.");
assert.ok(assets.some((asset) => asset.endsWith(".css")), "Built output has no CSS asset.");

for (const asset of assets) {
  const path = resolve(assetsDirectory, asset);
  const info = await stat(path);
  assert.ok(info.size <= 1024 * 1024, `Built asset ${asset} is ${info.size} bytes; split or optimize assets before release.`);
  assert.ok(!asset.endsWith(".map"), `Source map ${asset} is present in release output.`);
}

process.stdout.write("Local staging-like release validation passed: production build output, required release files, asset references, and asset-size safeguards are present.\n");