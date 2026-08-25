import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist/public");
const generator = resolve(root, "scripts/generate-seo-assets.mjs");

function runGenerator(environment) {
  const result = spawnSync(process.execPath, [generator], {
    cwd: root,
    env: { ...process.env, ...environment },
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
const restorePrivate = {
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

try {
  runGenerator(publicJournalDisabled);
  const manifest = JSON.parse(await readFile(resolve(out, "seo-manifest.json"), "utf8"));
  assert.deepEqual(manifest.journalEntries, []);
  assert.ok(manifest.routes.every((route) => !route.path.startsWith("/journal")));

  for (const file of ["feed.xml", "atom.xml", "feed.json", "journal.html"]) {
    await assert.rejects(access(resolve(out, file)), undefined, `${file} leaked while Journal approval was disabled.`);
  }

  const textFiles = (await readdir(out, { recursive: true }))
    .filter((file) => /\.(?:html|xml|json|txt)$/.test(file));
  const generatedText = (await Promise.all(textFiles.map((file) => readFile(resolve(out, file), "utf8")))).join("\n");
  for (const article of publishedArticles) {
    assert.ok(!generatedText.includes(article.slug), `Journal slug leaked while approval was disabled: ${article.slug}`);
    assert.ok(!generatedText.includes(article.title), `Journal title leaked while approval was disabled: ${article.title}`);
    const bodyFingerprint = String(article.body).replace(/\s+/g, " ").trim().slice(0, 120);
    if (bodyFingerprint) {
      assert.ok(!generatedText.replace(/\s+/g, " ").includes(bodyFingerprint), `Journal body leaked while approval was disabled: ${article.slug}`);
    }
  }
} finally {
  runGenerator(restorePrivate);
}

process.stdout.write("Journal approval gate passed: public discovery output contains no unapproved Journal data.\n");