import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { execFileSync } from "node:child_process";
import { runInIsolatedSosoSchema } from "./run-in-isolated-soso-schema.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
for (const exitCode of [0, 7]) {
  // Pure database fixtures: no upload authorization or external object is made.
  const source = `
    import assert from 'node:assert/strict'; import {randomUUID} from 'node:crypto';
    const {pool:c}=await import(${JSON.stringify(new URL("../src/index.ts", import.meta.url).href)});
    const {processPendingCollectionCoverCleanup}=await import(${JSON.stringify(new URL("../../../artifacts/api-server/src/lib/collection-cover-cleanup.ts", import.meta.url).href)});
    const owner=randomUUID();await c.query(
      "insert into soso_staff_users(id,clerk_user_id,email,role) values($1,$2,$3,'editor')",
      [owner,'synthetic-'+owner,owner+'@example.test']);
    const path='/api/storage/objects/uploads/synthetic-'+randomUUID()+'.jpg';
    await c.query("insert into soso_catalogue_import_uploads(owner_id,source_identity,source_version,hash,name,size,path) values($1,'drive:synthetic',$2,$2,'fixture.jpg',1,$3)",
      [owner,'a'.repeat(64),path]);
    await c.query("insert into soso_audit_logs(actor_clerk_user_id,action,entity_type,entity_id,metadata) values($1,'platform_media.cleanup_queued','platform_media',$2,'{}')",
      ['synthetic-'+owner,path.slice('/api/storage/objects/'.length)]);
    const cleanup=await processPendingCollectionCoverCleanup({
      provider:'cloudinary',deleteUploadedMedia:async()=>{throw new Error('Fresh imported media must never reach external deletion');}
    });
    assert.equal(cleanup.deferred,1);assert.equal(cleanup.deleted,0);assert.equal(cleanup.failed,0);
    assert.equal((await c.query('select status from soso_catalogue_import_uploads where owner_id=$1',[owner])).rows[0].status,'pending');
    await c.end();process.exitCode=${exitCode};
  `;
  const result = await runInIsolatedSosoSchema({
    databaseUrl: process.env.DATABASE_URL, command: "pnpm",
    args: ["--dir", resolve(root, "scripts"), "exec", "node", "--import", "tsx", "--input-type=module", "-e", source],
  });
  assert.equal(result.code, exitCode);
  assert.ok(result.retainedRecoveryFile, "Both successful and failed verification must retain owned recovery records");
  const manifest = JSON.parse(await fs.readFile(result.retainedRecoveryFile, "utf8"));
  const waitingOutput = execFileSync(process.execPath, [
    resolve(root, "lib/db/scripts/cleanup-retained-import-ledger.mjs"), result.retainedRecoveryFile,
  ], { cwd: root, env: process.env, encoding: "utf8", timeout: 60_000 });
  assert.match(waitingOutput, /"state":"waiting"/, "The real resume command must report waiting without touching storage or dropping its ledger");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    assert.match(manifest.schema, /^soso_api_test_[a-f0-9]{32}$/);
    const rows = await c.query(`select u.path,s.is_active from "${manifest.schema}".soso_catalogue_import_uploads u
      join "${manifest.schema}".soso_staff_users s on s.id::text=u.owner_id`);
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0].path, manifest.uploads[0].path);
    assert.equal(rows.rows[0].is_active, true);
    assert.ok(new Date(manifest.notBefore).getTime() > Date.now());
    assert.equal(JSON.stringify(manifest).includes("DATABASE_URL"), false);
    // Only this test's never-uploaded synthetic row is removed. Real recovery
    // goes through cleanup-retained-import-ledger and the locked media checker.
    await c.query(`drop schema "${manifest.schema}" cascade`);
    await fs.unlink(result.retainedRecoveryFile);
  } finally { await c.end(); }
}
console.log("Validated deferred verification retention for successful and interrupted child runs.");
