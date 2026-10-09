import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { collectCurrentSosoSchemaManifest } from "../lib/db/scripts/apply-soso-content-migration.mjs";

const require = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
const schema = `soso_mail_qualification_${randomUUID().replaceAll("-", "")}`;
const baselineFingerprint = "42c2e100a32e20f84c73696a8e406311c82260fdf41f2e71a4fdc0a635e99f93";
const fingerprint = async () => createHash("sha256").update(JSON.stringify(await collectCurrentSosoSchemaManifest(client))).digest("hex");
try {
  await client.connect();
  await client.query("BEGIN");
  // Everything, including the temporary schema, is rolled back. Never touch
  // existing content, mailbox credentials, public schema or migration records.
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
  const directory = new URL("../lib/db/migrations/", import.meta.url);
  const files = (await fs.readdir(directory)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  for (const file of files.filter((name) => name < "0013_staff_mail_newsletters.sql")) {
    await client.query(await fs.readFile(new URL(file, directory), "utf8"));
  }
  const before = await fingerprint();
  if (before !== baselineFingerprint) throw new Error("Canonical pre-mail schema does not match its existing fingerprint.");
  await client.query(await fs.readFile(new URL("0013_staff_mail_newsletters.sql", directory), "utf8"));
  const after = await fingerprint();
  console.log(JSON.stringify({ baselineVerified: true, mailSchemaFingerprint: after, rollbackOnly: true }));
} catch {
  console.error("Mail schema qualification failed. No schema or data changes are committed.");
  process.exitCode = 1;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end().catch(() => {});
}
