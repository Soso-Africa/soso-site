import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const runner = new URL("./with-shared-build-lock.mjs", import.meta.url).pathname;
function run(...args) {
  const child = spawn(process.execPath, [runner, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let error = "";
  child.stderr.on("data", (part) => { error += part; });
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, error }));
  });
}

test("generation and competing shared builds cannot overlap", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soso-build-lock-test-"));
  try {
    const log = join(dir, "events");
    const command = (name) => `
      const fs = require('node:fs');
      fs.appendFileSync(${JSON.stringify(log)}, ${JSON.stringify(name + ":start\n")});
      setTimeout(() => fs.appendFileSync(${JSON.stringify(log)}, ${JSON.stringify(name + ":end\n")}), 150);
    `;
    const results = await Promise.all(["generation", "store", "api"].map((name) =>
      run(process.execPath, "-e", command(name))));
    assert.ok(results.every((r) => r.code === 0), JSON.stringify(results));
    const lines = (await readFile(log, "utf8")).trim().split("\n");
    assert.equal(lines.length, 6);
    for (let i = 0; i < lines.length; i += 2) {
      assert.equal(lines[i + 1], lines[i].replace(":start", ":end"));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("command failure propagates and does not leave a stale lock", async () => {
  assert.equal((await run(process.execPath, "-e", "process.exit(17)")).code, 17);
  assert.equal((await run(process.execPath, "-e", "process.exit(0)")).code, 0);
});
