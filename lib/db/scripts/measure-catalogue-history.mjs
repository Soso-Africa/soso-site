// Always starts an empty local database; never reads DATABASE_URL or production.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import { canonical, encodeRevision, fingerprint, restoreRevision } from "./catalogue-history-prototype.mjs";

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: "inherit" });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
});
const directory = await mkdtemp(join(tmpdir(), "soso-history-assessment-"));
const data = join(directory, "data");
const reserve = createServer();
await new Promise((resolve, reject) => { reserve.once("error", reject); reserve.listen(0, "127.0.0.1", resolve); });
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const client = new pg.Client({ host: "127.0.0.1", port, user: "runner", database: "postgres", ssl: false });
let started = false;
let connected = false;
const output = new URL("../../../generated-artifacts/catalogue-history/results.json", import.meta.url);
try {
  await run("initdb", ["-D", data, "-A", "trust", "-U", "runner", "--no-locale", "--encoding=UTF8"]);
  await run("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1 -k ${directory}`, "start"]);
  started = true;
  await client.connect(); connected = true;
  await run(process.execPath, ["--test", new URL("./catalogue-history-prototype.test.mjs", import.meta.url).pathname]);
  const version = (await client.query("select version() as version")).rows[0].version;
  const compression = (await client.query("show default_toast_compression")).rows[0].default_toast_compression;
  const results = [];
  const metrics = async (table) => (await client.query(`
    select count(*)::int as rows, sum(octet_length(snapshot::text))::bigint::text as "logicalBytes",
      sum(pg_column_size(snapshot))::bigint::text as "storedColumnBytes",
      pg_total_relation_size('${table}')::text as "relationBytes"
    from ${table}`)).rows[0];
  for (const productCount of [100, 1000]) {
    for (const name of ["baseline", "candidate", "audit"]) {
      await client.query(`drop table if exists ${name}`);
      await client.query(`create table ${name} (
        id uuid primary key default gen_random_uuid(), content_key text not null default 'platform',
        event text not null default 'draft_saved', snapshot jsonb, content_hash text not null,
        created_by_clerk_user_id text not null default 'synthetic-editor',
        created_at timestamptz not null default now())`);
      await client.query(`create index ${name}_key_created_idx on ${name} (content_key,created_at)`);
    }
    const noise = (label) => Array.from({ length: 12 }, (_, n) =>
      createHash("sha256").update(`${label}:${n}`).digest("hex")).join(" ");
    let content = {
      collections: [{ slug: "men", cover: { src: "/api/storage/objects/uploads/collection-cover" } }],
      products: Array.from({ length: productCount }, (_, i) => ({
        slug: `product-${i}`, name: `Synthetic product ${i}`, description: noise(i),
        price: 10000 + i, photos: [`/api/storage/objects/uploads/photo-${i}`],
        commerceProductId: `commerce-${i}`,
        commerceMappingConfirmation: { productHash: fingerprint(i), confirmedAt: "2026-01-01T00:00:00Z", confidence: "confirmed" },
      })),
    };
    let previous = null;
    const expected = new Map(), checkpoints = [];
    for (let edit = 0; edit <= 96; edit++) {
      const before = edit ? content : null;
      content = structuredClone(content);
      const product = content.products[edit % productCount];
      product.description = noise(`edit-${edit}`);
      // Mapping and media changes must be recoverable at their exact revision.
      if (edit % 8 === 0) product.commerceMappingConfirmation.productHash = fingerprint(`mapping-${edit}`);
      if (edit % 12 === 0) product.photos = [`/api/storage/objects/uploads/replacement-${edit}`];
      if (edit === 50) delete product.commerceMappingConfirmation;
      const row = encodeRevision({ id: `${edit}`, before, after: content, previous });
      expected.set(row.id, fingerprint(content));
      if (row.kind === "checkpoint") checkpoints.push(edit);
      for (const [table, snapshot] of [["baseline", content], ["candidate", row]]) {
        await client.query(`insert into ${table} (snapshot,content_hash) values ($1,$2)`, [JSON.stringify(snapshot), row.contentHash]);
      }
      // Conservatively charge both alternatives the current full mapping audit,
      // instead of pretending a smaller revision eliminates this separate cost.
      const mappings = content.products.filter((p) => p.commerceMappingConfirmation).map((p) => ({
        slug: p.slug, ...p.commerceMappingConfirmation,
      }));
      await client.query("insert into audit (snapshot,content_hash) values ($1,$2)", [
        JSON.stringify({ scope: "product", slug: product.slug, revisionId: row.id,
          contentHash: row.contentHash, confirmedCommerceMappings: mappings }), row.contentHash,
      ]);
      previous = row;
    }
    // Read JSONB back, so restoration does not depend on JS key insertion order.
    const stored = (await client.query("select snapshot from candidate")).rows.map((r) => r.snapshot);
    const records = new Map(stored.map((row) => [row.id, row]));
    let maxRestoreMs = 0;
    for (const [id, hash] of expected) {
      const start = performance.now();
      const restored = restoreRevision(records, id);
      maxRestoreMs = Math.max(maxRestoreMs, performance.now() - start);
      assert.equal(fingerprint(restored), hash, `JSONB restoration ${productCount}/${id}`);
    }
    results.push({ productCount, saves: expected.size, verifiedRestorations: expected.size, checkpoints,
      maxRestoreMs: Math.round(maxRestoreMs), baseline: await metrics("baseline"),
      candidate: await metrics("candidate"), sharedAudit: await metrics("audit") });
  }
  await mkdir(new URL(".", output), { recursive: true });
  const report = { scope: "synthetic-local-only; no live history read or modified",
    version, compression, checkpointInterval: 32, results };
  await writeFile(output, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  if (connected) await client.end();
  if (started) await run("pg_ctl", ["-D", data, "stop", "-m", "fast"]);
  await rm(directory, { recursive: true, force: true });
}
