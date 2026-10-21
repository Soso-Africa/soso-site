import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { ensureCatalogueImportSchema } from "./ensure-catalogue-import-schema.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("A scoped development DATABASE_URL is required");
const schema = "soso_import_release_test_" + randomUUID().replaceAll("-", "");
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}", pg_catalog`);
  await client.query("CREATE TABLE soso_staff_users(id text); CREATE TABLE soso_site_content(id text)");
  await client.query("INSERT INTO soso_site_content VALUES ('merchant-content-must-not-change')");
  await ensureCatalogueImportSchema({ databaseUrl, schema });
  await client.query("INSERT INTO soso_catalogue_import_sessions(owner_id,review) VALUES ('synthetic', '{\"kept\":true}')");
  await ensureCatalogueImportSchema({ databaseUrl, schema });
  assert.deepEqual((await client.query("SELECT review FROM soso_catalogue_import_sessions")).rows[0].review, { kept: true });
  assert.equal((await client.query("SELECT id FROM soso_site_content")).rows[0].id, "merchant-content-must-not-change");
  await client.query("ALTER TABLE soso_catalogue_import_uploads ALTER COLUMN hash DROP NOT NULL");
  await assert.rejects(ensureCatalogueImportSchema({ databaseUrl, schema }), /column differs: hash/);
  await client.query("ALTER TABLE soso_catalogue_import_uploads ALTER COLUMN hash SET NOT NULL");
  await client.query("ALTER TABLE soso_catalogue_import_uploads DROP CONSTRAINT soso_catalogue_import_uploads_hash_check");
  await assert.rejects(ensureCatalogueImportSchema({ databaseUrl, schema }), /constraints differ/);
  await client.query("ALTER TABLE soso_catalogue_import_uploads ADD CHECK (hash ~ '^[a-f0-9]{64}$')");
  await client.query("DROP INDEX soso_import_upload_owner_hash_idx; CREATE INDEX soso_import_upload_owner_hash_idx ON soso_catalogue_import_uploads(hash, owner_id)");
  await assert.rejects(ensureCatalogueImportSchema({ databaseUrl, schema }), /lookup index differs/);
  console.log("Import release schema: fresh/repeat preparation, retained rows, and invalid columns/constraints/index refusal passed.");
} finally {
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await client.end();
}
