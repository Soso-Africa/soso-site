import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir, constants } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Orval cleans generated source directories before recreating them. Readers
// compiling those packages must wait until generation (and other builds) ends.
// flock is provided by the Linux runtime; the kernel releases it on process exit.
const command = process.argv.slice(2);
if (!command.length) throw new Error("Usage: node scripts/with-shared-build-lock.mjs COMMAND [ARGUMENTS]");
const root = fileURLToPath(new URL("../", import.meta.url));
const identity = createHash("sha256").update(root).digest("hex").slice(0, 16);
const lock = join(tmpdir(), `soso-shared-build-${identity}.lock`);
const child = spawn("flock", ["--exclusive", "--timeout", "120", lock, ...command], { stdio: "inherit" });
child.on("error", (error) => {
  console.error("Unable to start the shared API build lock:", error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 128 + constants.signals[signal] : 1);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
