import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
const api = JSON.parse(await readFile(new URL("../artifacts/api-server/package.json", import.meta.url)));
const store = JSON.parse(await readFile(new URL("../artifacts/soso-store/package.json", import.meta.url)));
const paymentRoutes = await readFile(new URL("../artifacts/api-server/src/routes/payment.ts", import.meta.url), "utf8");

test("public commerce discovery remains readable without activating payment writes", () => {
  for (const route of ["catalog", "locations", "discovery"]) {
    const start = paymentRoutes.indexOf(`router.get("/payment/${route}"`);
    assert(start >= 0);
    const handler = paymentRoutes.slice(start, paymentRoutes.indexOf("\n});", start));
    assert.match(handler, /new JusticeSureCommerceClient\(undefined, true\)/);
  }
  const quote = paymentRoutes.slice(paymentRoutes.indexOf('router.post("/payment/quote"'));
  assert.match(quote, /new JusticeSureCommerceClient\(\)/);
});

test("local releases run isolated checkout regressions; hosted builds keep validation non-mutating", () => {
  assert.equal(root.scripts["validate:checkout"],
    "pnpm run test:checkout-gate && pnpm --filter @workspace/api-spec run codegen && pnpm --filter @workspace/api-server run typecheck && pnpm --filter @workspace/soso-store run typecheck && pnpm --filter @workspace/api-server run test:payment-contract");
  assert.match(api.scripts["test:payment-contract"], /^node .*run-in-isolated-soso-schema\.mjs .*payment\.contract\.test\.ts$/);
  assert.ok(store.scripts["validate:release"].startsWith("pnpm -w run validate:checkout && "));
  assert.ok(store.scripts["validate:client-review"].startsWith("pnpm -w run validate:checkout:hosted && "));
  assert.doesNotMatch(root.scripts["validate:checkout:hosted"], /codegen|payment-contract|run-in-isolated|test:shopper-auth/);
  assert.match(root.scripts["validate:checkout:hosted"], /test:checkout-gate/);
  assert.match(root.scripts["validate:checkout:hosted"], /api-server run typecheck/);
  assert.match(root.scripts["validate:checkout:hosted"], /soso-store run typecheck/);
  for (const name of ["validate:release", "validate:client-review"]) assert.match(store.scripts[name], /test:product-photo-browser/);
  assert.ok(root.scripts["validate:soso-client-review"].startsWith("pnpm run typecheck:libs && "));
  assert.match(root.scripts["validate:soso-client-review"], /run validate:client-review/);
  assert.ok(root.scripts["vercel:build"].startsWith("pnpm run validate:soso-client-review && "));
});

test("post-merge runs from the root and stops before schema writes when checkout fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soso-merge-gate-"));
  try {
    const log = join(dir, "commands");
    for (const command of ["pnpm", "node"]) {
      const path = join(dir, command);
      await writeFile(path, `#!/bin/bash
printf '%s:%s:%s\\n' '${command}' "$PWD" "$*" >> "$GATE_LOG"
if [[ "$*" == "run validate:checkout" ]]; then exit "\${GATE_EXIT:-0}"; fi
`);
      await chmod(path, 0o755);
    }
    const hook = new URL("./post-merge.sh", import.meta.url).pathname;
    const run = (exit) => spawnSync("bash", [hook], {
      cwd: dir, encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GATE_LOG: log, GATE_EXIT: exit },
    });
    assert.equal(run("7").status, 7);
    let calls = (await readFile(log, "utf8")).trim().split("\n");
    assert.equal(calls.length, 2);
    assert.ok(calls[0].endsWith(":install --frozen-lockfile"));
    assert.ok(calls[1].endsWith(":run validate:checkout"));
    assert.ok(calls.every((line) => line.includes(`:${new URL("..", import.meta.url).pathname.replace(/\/$/, "")}:`)));
    await writeFile(log, "");
    assert.equal(run("0").status, 0);
    calls = (await readFile(log, "utf8")).trim().split("\n");
    assert.equal(calls.length, 4);
    assert.ok(calls[2].endsWith(":lib/db/scripts/ensure-shopper-schema.mjs"));
    assert.ok(calls[3].endsWith(":--filter @workspace/db run push"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
