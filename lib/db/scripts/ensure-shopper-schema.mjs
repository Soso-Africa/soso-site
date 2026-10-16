import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";

/** Bounded, additive SOSO-local identity/auth schema only. Never changes existing customers or Staff data. */
export async function ensureShopperSchema({ databaseUrl, schema = "public" }) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid schema");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    await client.query("SELECT pg_advisory_xact_lock(hashtext('soso-content-migrations'))");
    const result = await client.query("SELECT to_regclass('soso_staff_users') AS staff");
    if (!result.rows[0]?.staff) throw new Error("Existing SOSO database is required");
    await client.query(await fs.readFile(new URL("../migrations/0014_shopper_customers.sql", import.meta.url), "utf8"));
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'soso_shopper_customers'
      ORDER BY column_name
    `, [schema]);
    const expectedColumns = [
      ["auth_issuer", "text", "NO"], ["auth_subject", "text", "NO"],
      ["commerce_origin", "text", "NO"], ["created_at", "timestamp with time zone", "NO"],
      ["environment", "text", "NO"], ["external_id", "text", "NO"],
      ["id", "uuid", "NO"], ["merchant_scope", "text", "NO"],
      ["remote_customer_id", "uuid", "NO"], ["verified_email", "text", "NO"],
    ];
    if (JSON.stringify(columns.rows.map((row) => [row.column_name, row.data_type, row.is_nullable])) !== JSON.stringify(expectedColumns)) {
      throw new Error("Existing shopper columns differ from the approved binding schema");
    }
    const indexes = await client.query(`
      SELECT index_relation.relname AS name, idx.indisunique AS is_unique,
        idx.indisvalid AS is_valid, idx.indpred IS NULL AS not_partial,
        idx.indexprs IS NULL AS not_expression,
        array_agg(attribute.attname::text ORDER BY key.ordinality) AS columns
      FROM pg_index idx
      JOIN pg_class index_relation ON index_relation.oid = idx.indexrelid
      CROSS JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS key(attnum, ordinality)
      JOIN pg_attribute attribute ON attribute.attrelid = idx.indrelid AND attribute.attnum = key.attnum
      WHERE idx.indrelid = 'soso_shopper_customers'::regclass
      GROUP BY index_relation.relname, idx.indisunique, idx.indisvalid, idx.indpred, idx.indexprs
    `);
    const required = {
      soso_shopper_customers_pkey: ["id"],
      soso_shopper_identity_unique: ["merchant_scope", "commerce_origin", "environment", "auth_issuer", "auth_subject"],
      soso_shopper_external_unique: ["merchant_scope", "commerce_origin", "environment", "external_id"],
      soso_shopper_remote_unique: ["merchant_scope", "commerce_origin", "environment", "remote_customer_id"],
    };
    for (const [name, expected] of Object.entries(required)) {
      const index = indexes.rows.find((row) => row.name === name);
      if (!index?.is_unique || !index.is_valid || !index.not_partial || !index.not_expression
        || JSON.stringify(index.columns) !== JSON.stringify(expected)) {
        throw new Error("Existing shopper identity uniqueness differs from the approved schema");
      }
    }
    await client.query(await fs.readFile(new URL("../migrations/0015_shopper_auth.sql", import.meta.url), "utf8"));
    await client.query(await fs.readFile(new URL("../migrations/0016_shopper_session_devices.sql", import.meta.url), "utf8"));
    const expectedAuthColumns = {
      soso_shopper_users: [
        ["created_at", "timestamp with time zone", "NO"], ["email", "text", "NO"],
        ["email_verified_at", "timestamp with time zone", "YES"], ["id", "uuid", "NO"],
        ["name", "text", "NO"], ["password_hash", "text", "NO"],
      ],
      soso_shopper_sessions: [
        ["created_at", "timestamp with time zone", "NO"], ["device_label", "text", "NO"], ["expires_at", "timestamp with time zone", "NO"],
        ["id", "uuid", "NO"], ["last_active_at", "timestamp with time zone", "NO"],
        ["token_hash", "text", "NO"], ["user_id", "uuid", "NO"],
      ],
      soso_shopper_auth_tokens: [
        ["consumed_at", "timestamp with time zone", "YES"], ["created_at", "timestamp with time zone", "NO"],
        ["expires_at", "timestamp with time zone", "NO"], ["password_version", "text", "NO"],
        ["purpose", "text", "NO"], ["token_hash", "text", "NO"], ["user_id", "uuid", "NO"],
      ],
      soso_shopper_auth_limits: [
        ["expires_at", "timestamp with time zone", "NO"], ["hits", "integer", "NO"], ["key", "text", "NO"],
      ],
    };
    for (const [table, expected] of Object.entries(expectedAuthColumns)) {
      const actual = await client.query(`SELECT column_name,data_type,is_nullable FROM information_schema.columns
        WHERE table_schema=$1 AND table_name=$2 ORDER BY column_name`, [schema, table]);
      if (JSON.stringify(actual.rows.map((row) => [row.column_name, row.data_type, row.is_nullable])) !== JSON.stringify(expected)) {
        throw new Error(`Existing ${table} columns differ from the approved shopper authentication schema`);
      }
    }
    const authConstraints = (await client.query(`
      SELECT rel.relname AS table_name,c.contype,pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_class rel ON rel.oid=c.conrelid
      JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      WHERE ns.nspname=$1 AND rel.relname=ANY($2)
    `, [schema, Object.keys(expectedAuthColumns)])).rows;
    const mustHave = [
      ["soso_shopper_users", "p", "PRIMARY KEY (id)"],
      ["soso_shopper_users", "u", "UNIQUE (email)"],
      ["soso_shopper_sessions", "p", "PRIMARY KEY (token_hash)"],
      ["soso_shopper_sessions", "f", "FOREIGN KEY (user_id) REFERENCES soso_shopper_users(id) ON DELETE CASCADE"],
      ["soso_shopper_auth_tokens", "p", "PRIMARY KEY (token_hash)"],
      ["soso_shopper_auth_tokens", "f", "FOREIGN KEY (user_id) REFERENCES soso_shopper_users(id) ON DELETE CASCADE"],
      ["soso_shopper_auth_tokens", "c", "CHECK ((purpose = ANY (ARRAY['verify_email'::text, 'reset_password'::text])))"],
      ["soso_shopper_auth_limits", "p", "PRIMARY KEY (key)"],
    ];
    if (authConstraints.length !== mustHave.length || mustHave.some(([table, type, definition]) =>
      !authConstraints.some((row) => row.table_name === table && row.contype === type && row.definition === definition))) {
      throw new Error("Existing shopper authentication ownership or uniqueness constraints differ from the approved schema");
    }
    const sessionIdIndex = (await client.query(`SELECT i.indisunique,i.indisvalid,
      i.indpred IS NULL AS not_partial,i.indexprs IS NULL AS not_expression,
      pg_get_indexdef(i.indexrelid,1,true) AS column_name, i.indnkeyatts
      FROM pg_index i JOIN pg_class r ON r.oid=i.indexrelid
      WHERE i.indrelid='soso_shopper_sessions'::regclass AND r.relname='soso_shopper_sessions_id_unique'`)).rows[0];
    if (!sessionIdIndex?.indisunique || !sessionIdIndex.indisvalid || !sessionIdIndex.not_partial
      || !sessionIdIndex.not_expression || sessionIdIndex.column_name !== "id" || sessionIdIndex.indnkeyatts !== 1) {
      throw new Error("Existing shopper session IDs differ from the approved uniqueness index");
    }
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
    await ensureShopperSchema({ databaseUrl: process.env.DATABASE_URL });
    console.log("Verified additive SOSO shopper authentication schema; existing Staff and customer data unchanged.");
  } else {
    console.log("Production shopper schema preparation skipped outside a production deployment.");
  }
}
