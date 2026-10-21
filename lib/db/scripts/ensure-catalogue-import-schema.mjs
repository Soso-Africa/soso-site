import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";

const tables = ["soso_catalogue_import_uploads", "soso_catalogue_import_sessions"];
const normalize = (value) => value.toLowerCase().replace(/::text/g, "").replace(/[()\s"]/g, "");
const expected = {
  soso_catalogue_import_uploads: {
    id: ["uuid", true, "gen_random_uuid()"],
    owner_id: ["text", true, ""], source_identity: ["text", true, ""],
    source_version: ["text", true, ""], hash: ["text", true, ""],
    name: ["text", true, ""], size: ["integer", true, ""],
    path: ["text", true, ""], status: ["text", true, "'pending'::text"],
    created_at: ["timestamp with time zone", true, "now()"],
    authorized_at: ["timestamp with time zone", true, "now()"],
  },
  soso_catalogue_import_sessions: {
    owner_id: ["text", true, ""], review: ["jsonb", false, ""],
    version: ["integer", true, "0"], updated_at: ["timestamp with time zone", true, "now()"],
  },
};
const constraints = [
  "soso_catalogue_import_uploads:PRIMARY KEY (id)",
  "soso_catalogue_import_uploads:CHECK (hash ~ '^[a-f0-9]{64}$'::text)",
  "soso_catalogue_import_uploads:CHECK (size >= 1 AND size <= 12582912)",
  "soso_catalogue_import_uploads:UNIQUE (path)",
  "soso_catalogue_import_uploads:CHECK (path ~~ '/api/storage/objects/uploads/%'::text AND path !~ '[?#]'::text)",
  "soso_catalogue_import_uploads:CHECK (status = ANY (ARRAY['pending'::text, 'complete'::text, 'deleted'::text]))",
  "soso_catalogue_import_sessions:PRIMARY KEY (owner_id)",
].map(normalize).sort();

/** Only this additive migration; never run the full migration queue on production. */
export async function ensureCatalogueImportSchema({ databaseUrl, schema = "public" }) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid schema");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    await client.query("SET LOCAL lock_timeout TO '5s'");
    await client.query("SET LOCAL statement_timeout TO '15s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('soso-content-migrations'))");
    const existing = (await client.query("SELECT to_regclass('soso_staff_users') AS staff, to_regclass('soso_site_content') AS content")).rows[0];
    if (!existing.staff || !existing.content) throw new Error("Existing SOSO database is required");
    await client.query(await fs.readFile(new URL("../migrations/0019_catalogue_import_ledger.sql", import.meta.url), "utf8"));
    const columns = (await client.query(`
      SELECT c.relname AS table_name, a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type,
        a.attnotnull AS required, coalesce(pg_get_expr(d.adbin,d.adrelid),'') AS default_value
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname=$1 AND c.relname=ANY($2) AND a.attnum>0 AND NOT a.attisdropped
    `, [schema, tables])).rows;
    if (columns.length !== Object.values(expected).reduce((n, v) => n + Object.keys(v).length, 0)) throw new Error("Import schema column count differs");
    for (const column of columns) {
      const wanted = expected[column.table_name]?.[column.name];
      if (!wanted || column.type !== wanted[0] || column.required !== wanted[1]
        || normalize(column.default_value) !== normalize(wanted[2])) throw new Error("Import schema column differs: " + column.name);
    }
    const actual = (await client.query(`
      SELECT c.relname AS table_name, pg_get_constraintdef(x.oid,true) AS definition
      FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relname=ANY($2) AND x.contype<>'n'
    `, [schema, tables])).rows.map((r) => normalize(`${r.table_name}:${r.definition}`)).sort();
    if (JSON.stringify(actual) !== JSON.stringify(constraints)) throw new Error("Import schema constraints differ");
    const index = (await client.query(`
      SELECT i.indisvalid AND NOT i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL
        AND i.indnatts=2 AND i.indnkeyatts=2 AND am.amname='btree'
        AND pg_get_indexdef(i.indexrelid,1,true)='owner_id'
        AND pg_get_indexdef(i.indexrelid,2,true)='hash' AS approved
      FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_am am ON am.oid=c.relam
      WHERE n.nspname=$1 AND c.relname='soso_import_upload_owner_hash_idx'
    `, [schema])).rows[0];
    if (!index?.approved) throw new Error("Import recovery lookup index differs");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.VERCEL_ENV === "production") {
    await ensureCatalogueImportSchema({ databaseUrl: process.env.DATABASE_URL });
    console.log("Verified additive catalogue recovery schema; existing catalogue and Staff data unchanged.");
  } else {
    console.log("Production catalogue recovery schema preparation skipped outside production.");
  }
}
