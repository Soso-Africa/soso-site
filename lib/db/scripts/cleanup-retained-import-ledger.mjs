import fs from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";

// Reuses the configured development database and media environment. No session
// cookies, passwords, signed URLs or finalize tokens are saved or requested.
const file = process.argv[2];
if (!file || !process.env.DATABASE_URL) throw new Error("Pass a retained import manifest and use the original verification environment");
const manifest = JSON.parse(await fs.readFile(file, "utf8"));
if (!/^soso_api_test_[a-f0-9]{32}$/.test(manifest.schema) || !/^[a-f0-9-]{36}$/.test(manifest.runId)) {
  throw new Error("Only a generated isolated verification manifest is accepted");
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const namespace = await client.query("select to_regnamespace($1) as schema", [manifest.schema]);
  if (!namespace.rows[0]?.schema) {
    if (!manifest.completedAt) throw new Error("Retained database is missing; no cleanup success can be claimed");
    console.log("This verification recovery is already complete.");
  } else {
    const guard = await client.query(`select run_id from "${manifest.schema}".import_verification_guard`);
    if (guard.rows.length !== 1 || guard.rows[0].run_id !== manifest.runId) throw new Error("Retained schema identity does not match");
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const scoped = new URL(process.env.DATABASE_URL);
    scoped.searchParams.set("options", `-c search_path=${manifest.schema},pg_catalog`);
    const child = spawnSync("pnpm", ["--dir", resolve(root, "scripts"), "exec", "tsx",
      resolve(root, "artifacts/api-server/scripts/cleanup-verification-imports.ts"), resolve(file),
      ...process.argv.slice(3).filter((v) => v === "--discard-verification-draft-history")], {
      cwd: root, encoding: "utf8", env: { ...process.env, DATABASE_URL: scoped.toString() }, maxBuffer: 1_000_000,
    });
    const marker = child.stdout?.split(/\r?\n/).find((line) => line.startsWith("IMPORT_RECOVERY_RESULT:"));
    if (!marker) throw new Error("Cleanup was not confirmed. The isolated database and owned ledger remain retained.");
    const result = JSON.parse(marker.slice("IMPORT_RECOVERY_RESULT:".length));
    if (result.state !== "complete") {
      console.log(JSON.stringify(result));
      if (result.state === "blocked") process.exitCode = 1;
    } else {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext('soso-platform-content-media'))");
      const remaining = await client.query(`select count(*)::integer as count from "${manifest.schema}".soso_catalogue_import_uploads where status <> 'deleted'`);
      if (remaining.rows[0].count !== 0) throw new Error("New retained uploads appeared; database removal withheld");
      // Save completion evidence before dropping the now fully reclaimed schema.
      manifest.completedAt = new Date().toISOString();
      await fs.writeFile(file, JSON.stringify(manifest, null, 2), { mode: 0o600 });
      await client.query(`drop schema "${manifest.schema}" cascade`);
      await client.query("commit");
      const pilotDir = new URL("../../../generated-artifacts/catalogue-import-pilot/", import.meta.url);
      // Clear the pilot preflight only when every recorded path belongs to this
      // completed recovery. Do not erase evidence from a different pilot.
      try {
        const outstandingFile = new URL("outstanding-paths.json", pilotDir);
        const outstanding = JSON.parse(await fs.readFile(outstandingFile, "utf8"));
        const paths = new Set(manifest.uploads.map((r) => r.path));
        if (outstanding.every((p) => paths.has(p))) {
          await fs.writeFile(outstandingFile, "[]");
          const createdFile = new URL("created-paths.json", pilotDir);
          const created = JSON.parse(await fs.readFile(createdFile, "utf8"));
          for (const path of created.createdPaths ?? []) {
            if (paths.has(path)) created.cleanup[path] = { deleted: true, state: "deleted" };
          }
          await fs.writeFile(createdFile, JSON.stringify(created, null, 2));
        }
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      console.log("All exact owned verification uploads were reclaimed; the retained isolated database was removed.");
    }
  }
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
