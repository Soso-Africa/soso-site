import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to apply the SOSO content CMS migration");
}

const migrationUrl = new URL("../migrations/0001_soso_content_cms.sql", import.meta.url);
const sql = await fs.readFile(fileURLToPath(migrationUrl), "utf8");
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();

try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  process.stdout.write("Applied 0001_soso_content_cms.sql\n");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}