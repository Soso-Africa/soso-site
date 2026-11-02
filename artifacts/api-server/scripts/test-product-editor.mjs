import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

// Always create an empty, local PostgreSQL instance. Never inherit DATABASE_URL
// for this qualification, even when a developer has a live connection configured.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "soso-product-editor-"));
const data = join(directory, "data");
const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", ...options });
  child.once("error", reject);
  child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (${signal ?? code})`)));
});
const reserve = createServer();
await new Promise((resolve, reject) => { reserve.once("error", reject); reserve.listen(0, "127.0.0.1", resolve); });
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
let started = false;
try {
  await run("initdb", ["-D", data, "-A", "trust", "-U", "runner", "--no-locale", "--encoding=UTF8"]);
  await run("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1 -k ${directory}`, "start"]);
  started = true;
  await run(process.execPath, [
    "lib/db/scripts/run-in-isolated-soso-schema.mjs", "pnpm", "--dir", "scripts", "exec",
    "node", "--import", "tsx", "--test", "../artifacts/api-server/src/routes/staff-product-editor.integration.test.ts",
  ], { env: { ...process.env, DATABASE_URL: `postgresql://runner@127.0.0.1:${port}/postgres` } });
} finally {
  if (started) await run("pg_ctl", ["-D", data, "stop", "-m", "fast"]);
  await rm(directory, { recursive: true, force: true });
}
