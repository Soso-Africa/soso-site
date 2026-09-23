import assert from "node:assert/strict";
import { access, copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { legacyJournalPosts } from "../src/data/legacy-content.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist/public");
const generator = resolve(root, "scripts/generate-seo-assets.mjs");

function runGenerator(outputDirectory, environment) {
  const result = spawnSync("pnpm", ["--dir", resolve(root, "../../scripts"), "exec", "tsx", generator], {
    cwd: root,
    env: { ...process.env, ...environment, SOSO_SEO_OUTPUT_DIR: outputDirectory },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the Journal approval-gate regression check.");
}

const publicJournalDisabled = {
  VITE_PUBLIC_SITE_URL: "https://shopsoso.co",
  VITE_SOSO_INDEXING_ENABLED: "true",
  VITE_SOSO_CATALOG_APPROVED: "false",
  VITE_SOSO_POLICIES_APPROVED: "false",
  VITE_SOSO_JOURNAL_APPROVED: "false",
};
const privateBuild = {
  VITE_PUBLIC_SITE_URL: "",
  VITE_SOSO_INDEXING_ENABLED: "false",
  VITE_SOSO_CATALOG_APPROVED: "false",
  VITE_SOSO_POLICIES_APPROVED: "false",
  VITE_SOSO_JOURNAL_APPROVED: "false",
};
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let publishedArticles = [];

try {
  const result = await pool.query(
    "select slug, title, body from soso_journal_posts where status = 'published' and published_at is not null order by published_at desc",
  );
  publishedArticles = result.rows;
} finally {
  await pool.end();
}
assert.ok(publishedArticles.length > 0, "The approval-gate regression check requires at least one published Journal fixture.");

const temporaryRoot = await mkdtemp(join(tmpdir(), "soso-seo-approval-"));
const isolatedOut = resolve(temporaryRoot, "public");
await mkdir(isolatedOut, { recursive: true });
await copyFile(resolve(out, "spa-fallback.html"), resolve(isolatedOut, "index.html"));
await copyFile(resolve(out, "spa-fallback.html"), resolve(isolatedOut, "spa-fallback.html"));

try {
  runGenerator(isolatedOut, publicJournalDisabled);
  const manifest = JSON.parse(await readFile(resolve(isolatedOut, "seo-manifest.json"), "utf8"));
  assert.deepEqual(manifest.journalEntries, []);
  assert.ok(manifest.routes.every((route) => !route.path.startsWith("/journal")));

  for (const file of ["feed.xml", "atom.xml", "feed.json", "journal.html"]) {
    await assert.rejects(access(resolve(isolatedOut, file)), undefined, `${file} leaked while Journal approval was disabled.`);
  }

  const textFiles = (await readdir(isolatedOut, { recursive: true }))
    .filter((file) => /\.(?:html|xml|json|txt)$/.test(file));
  const generatedText = (await Promise.all(textFiles.map((file) => readFile(resolve(isolatedOut, file), "utf8")))).join("\n");
  for (const article of publishedArticles) {
    assert.ok(!generatedText.includes(article.slug), `Journal slug leaked while approval was disabled: ${article.slug}`);
    assert.ok(!generatedText.includes(article.title), `Journal title leaked while approval was disabled: ${article.title}`);
    const bodyFingerprint = String(article.body).replace(/\s+/g, " ").trim().slice(0, 120);
    if (bodyFingerprint) {
      assert.ok(!generatedText.replace(/\s+/g, " ").includes(bodyFingerprint), `Journal body leaked while approval was disabled: ${article.slug}`);
    }
  }

  const publicIndex = await readFile(resolve(isolatedOut, "index.html"), "utf8");
  assert.match(publicIndex, /name="robots" content="index, follow"/i);
  const publicManifest = JSON.parse(await readFile(resolve(isolatedOut, "seo-manifest.json"), "utf8"));
  const approvedAboutPaths = [
    "/about/our-story",
    "/about/the-architect-of-the-modern-man",
    "/about/the-client",
    "/about/craftsmanship",
    "/about/legacy-vision",
    "/about/soso-foundation",
    "/about/partner-with-us",
  ];
  for (const path of approvedAboutPaths) {
    assert.ok(publicManifest.routes.some((route) => route.path === path), `Approved About route missing from public manifest: ${path}`);
    const html = await readFile(resolve(isolatedOut, `${path.slice(1)}.html`), "utf8");
    assert.match(html, /name="robots" content="index, follow"/i);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://shopsoso.co${path}"`));
  }
  const partnerHtml = await readFile(resolve(isolatedOut, "about/partner-with-us.html"), "utf8");
  assert.doesNotMatch(partnerHtml, /\$(?:867|1\.76|73\.59|14\.72|500)\s*[BT]/i);
  assert.match(partnerHtml, /not an investment offer, franchise offer, forecast/i);

  const tamperedArticle = {
    ...legacyJournalPosts[0],
    seoTitle: `${legacyJournalPosts[0].seoTitle} — unsupported market claim`,
  };
  const tamperedFixturePath = resolve(temporaryRoot, "tampered-journal.json");
  await writeFile(tamperedFixturePath, JSON.stringify([tamperedArticle]));
  runGenerator(isolatedOut, {
    ...publicJournalDisabled,
    NODE_ENV: "test",
    VITE_SOSO_JOURNAL_APPROVED: "true",
    SOSO_SEO_JOURNAL_FIXTURE_PATH: tamperedFixturePath,
  });
  const tamperedManifest = JSON.parse(await readFile(resolve(isolatedOut, "seo-manifest.json"), "utf8"));
  assert.ok(
    tamperedManifest.routes.every((route) => route.path !== `/journal/${tamperedArticle.slug}`),
    "A metadata-only edit inherited the legacy route approval.",
  );
  await assert.rejects(
    access(resolve(isolatedOut, `journal/${tamperedArticle.slug}.html`)),
    undefined,
    "A metadata-only edit generated a crawlable legacy article.",
  );

  runGenerator(isolatedOut, privateBuild);
  const restoredPrivateIndex = await readFile(resolve(isolatedOut, "index.html"), "utf8");
  assert.match(restoredPrivateIndex, /name="robots" content="noindex, nofollow"/i);
  assert.doesNotMatch(restoredPrivateIndex, /rel="canonical"/i);
  assert.doesNotMatch(restoredPrivateIndex, /data-soso-crawler-content/);
  await assert.rejects(access(resolve(isolatedOut, "sitemap.xml")), undefined, "Public sitemap survived the private transition.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

process.stdout.write("Journal approval and public-to-private transition gates passed in isolated output.\n");