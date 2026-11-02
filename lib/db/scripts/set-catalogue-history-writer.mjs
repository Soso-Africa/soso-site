import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { catalogueHistorySchemaFingerprint, EXPECTED_HISTORY_SCHEMA } from "./catalogue-history-schema.mjs";
import { catalogueHistoryReleaseDigest } from "./catalogue-history-release-digest.mjs";

export async function setCatalogueHistoryWriter({ databaseUrl, schema = "public", enabled, report }) {
  if (!databaseUrl || !/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Database and exact schema required");
  let qualification = null;
  if (enabled) {
    const migration = await readFile(new URL("../migrations/0020_catalogue_history.sql", import.meta.url), "utf8");
    qualification = createHash("sha256").update(migration).digest("hex");
    const required = ["real-api-writers-and-provider-cleanup", "fresh-repeat-legacy-migrations", "concurrent-version-fence",
      "audit-and-revision-rollback", "historical-only-media", "dependent-base-discard-refusal", "checkpoint-boundaries"];
    if (report?.passed !== true || report.scope !== "empty-local-database-only"
      || report.qualification !== qualification || report.historySchemaFingerprint !== EXPECTED_HISTORY_SCHEMA
      || report.releaseDigest !== await catalogueHistoryReleaseDigest()
      || !required.every((check) => report.checks?.includes(check))) {
      throw new Error("Complete current-release isolated qualification is required before enabling deltas");
    }
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    await client.query("SET LOCAL lock_timeout TO '5s'; SET LOCAL statement_timeout TO '60s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('soso-platform-content-media'))");
    if (await catalogueHistorySchemaFingerprint(client) !== EXPECTED_HISTORY_SCHEMA) throw new Error("History release schema differs; switch unchanged");
    // Before activation, verify existing new-format history in PostgreSQL only.
    if (enabled) await client.query("SELECT count(soso_history_restore(id)) FROM soso_site_content_revisions WHERE history_format <> 'legacy-full'");
    await client.query(`UPDATE soso_catalogue_history_writer SET enabled=$1,
      qualification=coalesce($2,qualification),changed_at=now() WHERE singleton`, [enabled, qualification]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, reportPath] = process.argv.slice(2);
  if (!["--enable", "--disable"].includes(action)) throw new Error("Use --enable <qualification.json> or --disable");
  await setCatalogueHistoryWriter({
    databaseUrl: process.env.DATABASE_URL, enabled: action === "--enable",
    report: reportPath ? JSON.parse(await readFile(reportPath, "utf8")) : undefined,
  });
  console.log(action === "--enable" ? "Future delta writes enabled; existing evidence unchanged." : "Future writes use verified full checkpoints; mixed-format readers and dependencies retained.");
}
