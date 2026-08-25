import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import pg from "pg";
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
        await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
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

  return result;
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