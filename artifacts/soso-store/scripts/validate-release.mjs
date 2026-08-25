import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const out = resolve(root, "dist/public");
for (const file of ["index.html", "robots.txt"]) await access(resolve(out, file));
const index = await readFile(resolve(out, "index.html"), "utf8");
assert.match(index, /<meta[^>]+name="viewport"/i);
assert.match(index, /<script[^>]+src="\/assets\/[^"]+"/i);
assert.doesNotMatch(index, /localhost:\d+|127\.0\.0\.1:\d+/i);
const robots = await readFile(resolve(out, "robots.txt"), "utf8");
const sitemap = resolve(out, "sitemap.xml");
let publicBuild = true;
try { await access(sitemap); } catch { publicBuild = false; }
if (!publicBuild) {
  assert.match(robots, /Disallow:\s*\//i, "Private builds must disallow all crawlers.");
  for (const file of ["feed.xml", "atom.xml", "feed.json", "llms.txt", "seo-manifest.json"]) {
    await assert.rejects(access(resolve(out, file)), undefined, `${file} must not exist in a private build.`);
  }
} else {
  assert.match(robots, /Sitemap:\s*https:\/\/shopsoso\.co\/sitemap\.xml/i);
  const map = await readFile(sitemap, "utf8");
  assert.match(map, /<loc>https:\/\/shopsoso\.co\//);
  assert.match(map, /<lastmod>[^<]+<\/lastmod>/);
  for (const [file, type] of [["feed.xml", /<rss/], ["atom.xml", /<feed/], ["feed.json", /"version": "https:\/\/jsonfeed\.org/], ["llms.txt", /# SOSO Africa/]]) {
    const body = await readFile(resolve(out, file), "utf8"); assert.match(body, type, `${file} is malformed.`);
  }
  const manifest = JSON.parse(await readFile(resolve(out, "seo-manifest.json"), "utf8"));
  for (const route of manifest.routes) {
    const file = route.path === "/" ? "index.html" : `${route.path.slice(1)}.html`;
    await access(resolve(out, file));
    assert.ok(!file.endsWith("/index.html"), `Prerender ${file} is not a clean-URL HTML file.`);
    const page = await readFile(resolve(out, file), "utf8");
    assert.match(page, /<h1>/);
    assert.match(page, new RegExp(`rel="canonical" href="https://shopsoso\\.co${route.path === "/" ? "/" : route.path}"`));
    assert.match(page, /name="robots" content="index, follow"/);
  }
}
const assets = await readdir(resolve(out, "assets"));
for (const asset of assets) {
  const info = await stat(resolve(out, "assets", asset));
  assert.ok(info.size <= 1024 * 1024, `Built asset ${asset} exceeds 1 MiB.`);
  assert.ok(!asset.endsWith(".map"), `Source map ${asset} is present.`);
}
process.stdout.write("Release validation passed: private/public SEO gate, sitemap lastmod, feeds, llms, metadata, and asset safeguards are valid.\n");