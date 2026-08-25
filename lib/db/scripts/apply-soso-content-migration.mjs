import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to apply the SOSO content CMS migration");
}

const migrationFiles = [
  "0001_soso_content_cms.sql",
  "0002_faq_history_pagination.sql",
];
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();

try {
  await client.query("BEGIN");
  for (const migrationFile of migrationFiles) {
    const migrationUrl = new URL(`../migrations/${migrationFile}`, import.meta.url);
    const sql = await fs.readFile(fileURLToPath(migrationUrl), "utf8");
    await client.query(sql);
  }
  await client.query("COMMIT");
  process.stdout.write(`Applied ${migrationFiles.join(", ")}\n`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}