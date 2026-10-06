import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";

/**
 * Bounded production release step: create only the verified-purchase claim
 * table. Never run other pending migrations or replace merchant data.
 */
export async function ensurePurchaseConversionSchema({ databaseUrl, schema = "public" }) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the production purchase reporting release");
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid purchase schema");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    await client.query("SELECT pg_advisory_xact_lock(hashtext('soso-content-migrations'))");
    const prerequisite = await client.query("SELECT to_regclass('soso_commerce_checkout_attempts') AS attempts");
    if (!prerequisite.rows[0]?.attempts) throw new Error("Existing SOSO checkout schema is required; refusing database initialization");
    const migration = await fs.readFile(new URL("../migrations/0012_verified_purchase_claims.sql", import.meta.url), "utf8");
    await client.query(migration);
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'soso_purchase_conversion_claims'
      ORDER BY ordinal_position
    `, [schema]);
    const expected = [
      ["attempt_id", "uuid", "NO", null],
      ["event_id", "uuid", "NO", null],
      ["claimed_at", "timestamp with time zone", "NO", "now()"],
    ];
    if (JSON.stringify(columns.rows.map((row) => [row.column_name, row.data_type, row.is_nullable, row.column_default])) !== JSON.stringify(expected)) {
      throw new Error("Existing purchase claim columns differ from the approved schema");
    }
    const constraints = await client.query(`
      SELECT contype, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'soso_purchase_conversion_claims'::regclass
    `);
    const definitions = constraints.rows;
    if (definitions.length !== 3
      || !definitions.some((row) => row.contype === "p" && row.definition === "PRIMARY KEY (attempt_id)")
      || !definitions.some((row) => row.contype === "u" && row.definition === "UNIQUE (event_id)")
      || !definitions.some((row) => row.contype === "f" && row.definition === "FOREIGN KEY (attempt_id) REFERENCES soso_commerce_checkout_attempts(id) ON DELETE CASCADE")) {
      throw new Error("Existing purchase claim deduplication or ownership constraints differ from the approved schema");
    }
    await client.query("COMMIT");
    return { verified: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.VERCEL_ENV === "production") {
    await ensurePurchaseConversionSchema({ databaseUrl: process.env.DATABASE_URL });
    console.log("Verified production purchase claim schema; no order data was changed.");
  } else {
    console.log("Production purchase migration skipped outside a production deployment.");
  }
}
