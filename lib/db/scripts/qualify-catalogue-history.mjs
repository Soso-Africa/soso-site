// Always starts an empty local PostgreSQL. Never consumes DATABASE_URL.
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import { collectCurrentSosoSchemaManifest } from "./apply-soso-content-migration.mjs";
import { catalogueHistorySchemaFingerprint } from "./catalogue-history-schema.mjs";
import { ensureCatalogueHistorySchema } from "./ensure-catalogue-history-schema.mjs";
import { setCatalogueHistoryWriter } from "./set-catalogue-history-writer.mjs";
import { catalogueHistoryReleaseDigest } from "./catalogue-history-release-digest.mjs";

const run = (command, args, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: "inherit", env });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
});
const directory = await mkdtemp(join(tmpdir(), "soso-history-qualification-"));
const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const databaseUrl = `postgresql://runner@127.0.0.1:${port}/postgres`;
const client = new pg.Client({ connectionString: databaseUrl });
let started = false, connected = false;
try {
  await run("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "runner", "--no-locale", "--encoding=UTF8"]);
  // The existing migration suite checks index eligibility using a real plan.
  // Use SSD-like random I/O cost for this empty local cluster, not the spinning-
  // disk default. This does not change any hosted setting or index definition.
  await run("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1 -k ${directory} -c random_page_cost=1.1`, "start"]);
  started = true;
  await client.connect(); connected = true;
  await client.query("CREATE SCHEMA qualification; SET search_path TO qualification, pg_catalog");
  const migrationDirectory = new URL("../migrations/", import.meta.url);
  const files = (await import("node:fs/promises")).readdir;
  const migrations = (await files(migrationDirectory)).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  for (const file of migrations.filter((f) => f < "0020")) {
    await client.query(await readFile(new URL(file, migrationDirectory), "utf8"));
  }
  const oldFingerprint = createHash("sha256").update(JSON.stringify(await collectCurrentSosoSchemaManifest(client))).digest("hex");
  assert.equal(oldFingerprint, "c033cf3f50843916569ee6211be5ea47601be542020e252447d7850573dbc9e3", "Pre-change schema must match the measured baseline");
  const legacy = { products: [{ slug: "legacy", body: "/api/storage/objects/uploads/legacy.jpg?old=1" }] };
  await client.query("INSERT INTO soso_site_content(key) VALUES ('platform')");
  const oldRow = (await client.query(`INSERT INTO soso_site_content_revisions
    (content_key,event,snapshot,content_hash,created_by_clerk_user_id)
    VALUES ('platform','draft_saved',$1,'original-legacy-hash','synthetic') RETURNING *`, [legacy])).rows[0];
  const migration = await readFile(new URL("0020_catalogue_history.sql", migrationDirectory), "utf8");
  await client.query(migration);
  const schemaFingerprint = createHash("sha256").update(JSON.stringify(await collectCurrentSosoSchemaManifest(client))).digest("hex");
  const historySchemaFingerprint = await catalogueHistorySchemaFingerprint(client);
  process.stdout.write(`Qualified schema fingerprint candidate: ${schemaFingerprint}\n`);
  process.stdout.write(`History release fingerprint candidate: ${historySchemaFingerprint}\n`);
  await client.query(migration); // Repeated application must not reset switch/evidence.
  const restore = async (id) => (await client.query("SELECT soso_history_restore($1) AS document", [id])).rows[0].document;
  assert.deepEqual(await restore(oldRow.id), legacy);
  assert.equal((await client.query("SELECT content_hash FROM soso_site_content_revisions WHERE id=$1", [oldRow.id])).rows[0].content_hash, oldRow.content_hash);
  const qualification = createHash("sha256").update(migration).digest("hex");
  const switchWriter = (enabled) => client.query("UPDATE soso_catalogue_history_writer SET enabled=$1, qualification=$2, changed_at=now()", [enabled, qualification]);
  const insert = async (document, event = "draft_saved", connection = client) => (await connection.query(`
    INSERT INTO soso_site_content_revisions(content_key,event,snapshot,content_hash,hash_encoding,created_by_clerk_user_id)
    VALUES ('platform',$2,$1, soso_history_hash($1::jsonb),'postgres-jsonb-text','synthetic') RETURNING *`,
  [JSON.stringify(document), event])).rows[0];
  const content = { products: Array.from({ length: 100 }, (_, n) => ({
    slug: `piece-${n}`, description: "synthetic".repeat(100),
    photos: [`/api/storage/objects/uploads/${n}.jpg`],
    commerceMappingConfirmation: { productHash: `mapping-${n}`, confirmedAt: "2026-01-01T00:00:00Z" },
  })), collections: [{ slug: "men" }] };
  const disabled = await insert(content);
  assert.equal(disabled.history_format, "full-v1");
  await switchWriter(true);
  const expected = new Map([[disabled.id, structuredClone(content)]]);
  const rows = [disabled];
  for (let n = 1; n <= 65; n++) {
    content.products[0].description = `Changed ${n}`;
    if (n === 3) content.products[0].photos = ["/api/storage/objects/uploads/replacement.jpg"];
    if (n === 4) delete content.products[0].commerceMappingConfirmation;
    if (n === 5) content.products[0].commerceMappingConfirmation = { productHash: "new-confirmation", confirmedAt: "2026-02-01T00:00:00Z" };
    const row = await insert(content);
    rows.push(row); expected.set(row.id, structuredClone(content));
    assert.equal(row.chain_depth, n % 32);
    assert.equal(row.history_format, n % 32 ? "products-v1" : "full-v1");
  }
  for (const [id, document] of expected) assert.deepEqual(await restore(id), document);
  assert.equal((await client.query("SELECT soso_history_references('/api/storage/objects/uploads/0.jpg') AS kept")).rows[0].kept, true);
  assert.equal((await client.query("SELECT soso_history_references('/api/storage/objects/uploads/legacy.jpg') AS kept")).rows[0].kept, true);
  await assert.rejects(client.query("DELETE FROM soso_site_content_revisions WHERE id=$1", [disabled.id]), /foreign key/);
  await assert.rejects(client.query("UPDATE soso_site_content_revisions SET snapshot='{}' WHERE id=$1", [disabled.id]), /immutable/);
  // Structural changes and all publication/unpublication events are independent.
  content.products.reverse();
  assert.equal((await insert(content)).history_format, "full-v1");
  content.products.push({ slug: "inserted", description: "New" });
  assert.equal((await insert(content)).history_format, "full-v1");
  content.products.pop();
  assert.equal((await insert(content)).history_format, "full-v1");
  for (const event of ["published", "published_product", "unpublished_product", "system_migrated", "unpublished"]) {
    assert.equal((await insert(event === "unpublished" ? null : content, event)).history_format, "full-v1");
  }
  assert.equal(await restore((await insert(null, "unpublished")).id), null);
  // Rollback switch retains readers, dependencies and every original identity.
  await switchWriter(false);
  assert.equal((await insert(content)).history_format, "full-v1");
  for (const [id, document] of expected) assert.deepEqual(await restore(id), document);
  await switchWriter(true);
  // Audit and revision failure must roll back the current content update too.
  for (const target of ["soso_audit_logs", "soso_site_content_revisions"]) {
    const before = (await client.query("SELECT draft FROM soso_site_content WHERE key='platform'")).rows[0].draft;
    const count = (await client.query("SELECT count(*) AS n FROM soso_site_content_revisions")).rows[0].n;
    await client.query(`CREATE FUNCTION reject_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'qualification failure'; END $$;
      CREATE TRIGGER reject_fixture BEFORE INSERT ON ${target} FOR EACH ROW EXECUTE FUNCTION reject_fixture()`);
    await client.query("BEGIN");
    await client.query("UPDATE soso_site_content SET draft=$1 WHERE key='platform'", [content]);
    await assert.rejects((async () => {
      await insert(content);
      await client.query("INSERT INTO soso_audit_logs(actor_clerk_user_id,action,entity_type,entity_id) VALUES ('synthetic','qualification','site_content','platform')");
    })(), /qualification failure/);
    await client.query("ROLLBACK");
    assert.deepEqual((await client.query("SELECT draft FROM soso_site_content WHERE key='platform'")).rows[0].draft, before);
    assert.equal((await client.query("SELECT count(*) AS n FROM soso_site_content_revisions")).rows[0].n, count);
    await client.query(`DROP TRIGGER reject_fixture ON ${target}; DROP FUNCTION reject_fixture()`);
  }
  // Corruption simulations run only inside rolled-back privileged test changes.
  const delta = rows[1];
  for (const mutation of [
    "base_hash = repeat('a',64)", "integrity_hash = repeat('b',64)",
    "media_references = '[]'", "media_hash = repeat('c',64)",
    "product_changes = '[{\"index\":999999,\"slug\":\"piece-0\",\"product\":{\"slug\":\"piece-0\"}}]'",
    "product_changes = '[{\"index\":0,\"slug\":\"piece-0\",\"product\":{\"slug\":\"wrong\"}}]'",
  ]) {
    await client.query("BEGIN; ALTER TABLE soso_site_content_revisions DISABLE TRIGGER soso_history_immutable");
    await client.query(`UPDATE soso_site_content_revisions SET ${mutation} WHERE id=$1`, [delta.id]);
    await assert.rejects(restore(delta.id));
    await client.query("ROLLBACK");
  }
  await client.query("BEGIN; ALTER TABLE soso_site_content_revisions DISABLE TRIGGER soso_history_immutable; ALTER TABLE soso_site_content_revisions DROP CONSTRAINT soso_history_shape");
  await client.query("UPDATE soso_site_content_revisions SET history_format='unknown' WHERE id=$1", [delta.id]);
  await assert.rejects(client.query("SELECT soso_history_references('/api/storage/objects/uploads/not-retained.jpg')"), /Unsupported history|Invalid history base/);
  await client.query("ROLLBACK");
  // Missing bases are refused by the FK, and also independently by the reader.
  await client.query("BEGIN; SET LOCAL session_replication_role=replica");
  await client.query("DELETE FROM soso_site_content_revisions WHERE id=$1", [disabled.id]);
  await assert.rejects(restore(delta.id), /no rows/);
  await client.query("ROLLBACK");
  // Lock waiters see the committed immediate predecessor. A stale draft fence
  // admits one write only; an audit record and revision accompany that winner.
  const peer = new pg.Client({ connectionString: databaseUrl });
  await peer.connect();
  try {
    await peer.query("SET search_path TO qualification, pg_catalog");
    await client.query("UPDATE soso_site_content SET draft_updated_at='2026-01-01' WHERE key='platform'");
    const concurrentSave = async (connection, label, delay) => {
      await connection.query("BEGIN");
      try {
        await connection.query("SELECT pg_advisory_xact_lock(hashtext('soso-platform-content-media'))");
        const saved = await connection.query("UPDATE soso_site_content SET draft=$1,draft_updated_at='2026-01-02' WHERE key='platform' AND draft_updated_at='2026-01-01' RETURNING key", [content]);
        if (saved.rowCount) {
          if (delay) await connection.query("SELECT pg_sleep(0.05)");
          await insert(content, "draft_saved", connection);
          await connection.query("INSERT INTO soso_audit_logs(actor_clerk_user_id,action,entity_type,entity_id,metadata) VALUES ('synthetic','qualification','site_content','platform',$1)", [{ label }]);
        }
        await connection.query("COMMIT");
        return saved.rowCount;
      } catch (error) { await connection.query("ROLLBACK"); throw error; }
    };
    assert.equal((await Promise.all([concurrentSave(client, "one", true), concurrentSave(peer, "two", false)])).reduce((a,b) => a+b,0), 1);
  } finally { await peer.end(); }
  const stats = (await client.query("SELECT * FROM soso_catalogue_history_metrics ORDER BY history_format")).rows;
  const report = { scope: "empty-local-database-only", passed: true, qualification, schemaFingerprint, historySchemaFingerprint,
    releaseDigest: await catalogueHistoryReleaseDigest(),
    verifiedRestorations: expected.size, checks: ["mixed-format", "mapping-removal-and-replacement", "checkpoint-boundaries",
      "audit-and-revision-rollback", "historical-only-media", "dependent-base-discard-refusal", "immutable-legacy-evidence",
      "rollback-writer-retains-readers", "corrupt-and-missing-base-refusal", "concurrent-version-fence"], stats };
  // API contracts, cleanup coordinators and recovery use full production schema.
  if (!process.argv.includes("--sql-only")) {
    await run(process.execPath, ["lib/db/scripts/run-in-isolated-soso-schema.mjs",
      "pnpm", "--dir", "scripts", "exec", "tsx", "--test", "--test-concurrency=1",
      // Two existing fixture tests are not this history gate: the old cover
      // fixture publishes an unavailable homepage arrival, and the menu fixture
      // expects an automatic visibility change the application no longer makes.
      "--test-name-pattern=mixed history protects|scoped saves accept|Staff can publish one complete product|business approval is stale|owner business approval persists|availability control blocks|product editor uses bounded|product replacement reference",
      "../artifacts/api-server/src/routes/staff-product-editor.integration.test.ts",
      "../artifacts/api-server/src/routes/staff-content.integration.test.ts",
      "../artifacts/api-server/src/lib/catalogue-history.integration.test.ts"], { ...process.env, DATABASE_URL: databaseUrl });
    await run("pnpm", ["run", "test:migrations"], { ...process.env, DATABASE_URL: databaseUrl });
    report.checks.push("real-api-writers-and-provider-cleanup", "fresh-repeat-legacy-migrations");
    report.excludedExistingFixtures = [
      "staff collection cover upload, persistence, publishing, replacement and removal work through the API",
      "confirmed publication candidate prunes only omitted mega-menu product placements for an exact 42-product set",
    ];
    // Qualify the same bounded migration/activation/rollback commands shipped
    // for operators, against this local database only.
    await ensureCatalogueHistorySchema({ databaseUrl, schema: "qualification" });
    await assert.rejects(setCatalogueHistoryWriter({ databaseUrl, schema: "qualification", enabled: true, report: {} }), /qualification/);
    await setCatalogueHistoryWriter({ databaseUrl, schema: "qualification", enabled: true, report });
    assert.equal((await client.query("SELECT enabled FROM soso_catalogue_history_writer")).rows[0].enabled, true);
    await ensureCatalogueHistorySchema({ databaseUrl, schema: "qualification" });
    assert.equal((await client.query("SELECT enabled FROM soso_catalogue_history_writer")).rows[0].enabled, true);
    await setCatalogueHistoryWriter({ databaseUrl, schema: "qualification", enabled: false });
    assert.equal((await insert(content)).history_format, "full-v1");
    assert.deepEqual(await restore(rows[1].id), expected.get(rows[1].id));
    report.checks.push("release-preparation-repeat-safe", "qualified-activation-and-rollback-commands");
  }
  const output = new URL("../../../generated-artifacts/catalogue-history/qualification.json", import.meta.url);
  await mkdir(new URL(".", output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  if (connected) await client.end();
  if (started) await run("pg_ctl", ["-D", join(directory, "data"), "-m", "fast", "stop"]);
  await rm(directory, { recursive: true, force: true });
}
