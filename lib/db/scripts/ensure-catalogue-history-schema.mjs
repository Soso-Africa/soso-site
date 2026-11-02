import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { catalogueHistorySchemaFingerprint, EXPECTED_HISTORY_SCHEMA } from "./catalogue-history-schema.mjs";

/** Only the additive history migration; does not enable deltas or touch old rows. */
export async function ensureCatalogueHistorySchema({ databaseUrl, schema = "public" }) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid schema");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    await client.query("SET LOCAL lock_timeout TO '5s'; SET LOCAL statement_timeout TO '30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('soso-content-migrations'))");
    // Same lock ordering as every save/cleanup.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('soso-platform-content-media'))");
    await client.query(await fs.readFile(new URL("../migrations/0020_catalogue_history.sql", import.meta.url), "utf8"));
    if (await catalogueHistorySchemaFingerprint(client) !== EXPECTED_HISTORY_SCHEMA) {
      throw new Error("Catalogue history schema differs from the qualified release; no activation or repair performed");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK"); throw error;
  } finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.VERCEL_ENV === "production" || process.argv.includes("--development")) {
    await ensureCatalogueHistorySchema({ databaseUrl: process.env.DATABASE_URL });
    console.log("Verified additive mixed-history schema; writer switch and retained evidence unchanged.");
  }
}
