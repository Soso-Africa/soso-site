import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import pg from "pg";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { applySosoContentMigrations } from "./apply-soso-content-migration.mjs";

const forwardedSignals = ["SIGINT", "SIGTERM"];

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function databaseUrlForSchema(databaseUrl, schema) {
  const url = new URL(databaseUrl);
  const existingOptions = url.searchParams.get("options");
  const searchPathOption = `-c search_path=${schema},pg_catalog`;
  url.searchParams.set(
    "options",
    existingOptions ? `${existingOptions} ${searchPathOption}` : searchPathOption,
  );
  return url.toString();
}

function runCommand(command, args, env, onSpawn) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
    });
    onSpawn(child);
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

export async function runInIsolatedSosoSchema({
  databaseUrl,
  command,
  args = [],
}) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run database-backed tests");
  }
  if (!command) {
    throw new Error("A test command is required");
  }

  const schema = `soso_api_test_${randomUUID().replaceAll("-", "")}`;
  const quotedSchema = quoteIdentifier(schema);
  const client = new pg.Client({ connectionString: databaseUrl });
  let child;
  let connected = false;
  let requestedSignal;
  let result;
  let retainedRecoveryFile;
  const runId = randomUUID();
  let runError;
  let cleanupError;

  const signalHandlers = new Map(
    forwardedSignals.map((signal) => [
      signal,
      () => {
        requestedSignal ??= signal;
        if (child && child.exitCode === null && child.signalCode === null) {
          child.kill(signal);
        }
      },
    ]),
  );
  for (const [signal, handler] of signalHandlers) {
    process.on(signal, handler);
  }

  try {
    await client.connect();
    connected = true;
    await client.query(`CREATE SCHEMA ${quotedSchema}`);
    await applySosoContentMigrations({ databaseUrl, schema });
    await client.query(`CREATE TABLE ${quotedSchema}.import_verification_guard (run_id uuid PRIMARY KEY)`);
    await client.query(`INSERT INTO ${quotedSchema}.import_verification_guard VALUES ($1)`, [runId]);

    if (requestedSignal) {
      result = { code: null, signal: requestedSignal };
    } else {
      result = await runCommand(
        command,
        args,
        {
          ...process.env,
          DATABASE_URL: databaseUrlForSchema(databaseUrl, schema),
        },
        (spawnedChild) => {
          child = spawnedChild;
        },
      );
    }
  } catch (error) {
    runError = error;
  } finally {
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler);
    }

    try {
      if (connected) {
        // Verification schemas are disposable; externally stored photo objects
        // are not. Export their exact ledger identities before schema teardown,
        // including when the child exits unsuccessfully or is interrupted.
        const table = await client.query("select to_regclass($1) as ledger", [`${schema}.soso_catalogue_import_uploads`]);
        if (table.rows[0]?.ledger) {
          const remaining = await client.query(`select id, owner_id, source_identity, source_version, hash, path, status, authorized_at
            from ${quotedSchema}.soso_catalogue_import_uploads where status <> 'deleted'`);
          if (remaining.rows.length) {
            const output = new URL(`../../../generated-artifacts/import-ledgers/${schema}.json`, import.meta.url);
            const revisions = await client.query(`
              select distinct r.id, r.content_hash from ${quotedSchema}.soso_site_content_revisions r
              join ${quotedSchema}.soso_staff_users s on s.clerk_user_id = r.created_by_clerk_user_id
              join ${quotedSchema}.soso_catalogue_import_uploads u on u.owner_id = s.id::text
              where u.status <> 'deleted' and r.content_key = 'platform' and r.event = 'draft_saved'
                and strpos(r.snapshot::text, u.path) > 0
            `);
            await fs.mkdir(new URL(".", output), { recursive: true });
            await fs.writeFile(output, JSON.stringify({
              schema, runId, uploads: remaining.rows, draftRevisions: revisions.rows,
              notBefore: new Date(Math.max(...remaining.rows.map((r) => new Date(r.authorized_at).getTime())) + 2 * 60 * 60_000).toISOString(),
            }, null, 2), { mode: 0o600 });
            retainedRecoveryFile = fileURLToPath(output);
            console.error(`Cleanup deferred; isolated database and owned ledger retained: ${retainedRecoveryFile}`);
            console.error("After notBefore, run: node lib/db/scripts/cleanup-retained-import-ledger.mjs <that-file> --discard-verification-draft-history");
          }
        }
        if (!retainedRecoveryFile) await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
      }
    } catch (error) {
      cleanupError = error;
    }

    try {
      await client.end();
    } catch (error) {
      cleanupError ??= error;
    }
  }

  if (runError && cleanupError) {
    throw new AggregateError(
      [runError, cleanupError],
      "The database-backed test run and isolated schema cleanup both failed",
    );
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;

  return { ...result, ...(retainedRecoveryFile ? { retainedRecoveryFile } : {}) };
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const [command, ...args] = process.argv.slice(2);
  const result = await runInIsolatedSosoSchema({
    databaseUrl: process.env.DATABASE_URL,
    command,
    args,
  });

  if (result.signal) {
    process.kill(process.pid, result.signal);
  } else {
    process.exitCode = result.code ?? 1;
  }
}