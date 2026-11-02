import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { db, type StaffUser } from "@workspace/db";
import pino from "pino";
import router from "./staff-history-capacity";

test("only owners can read the capacity report; unavailable storage is explicit and never cached", async t => {
  let role: StaffUser["role"] | null = null;
  let reads = 0;
  t.mock.method(db, "transaction", async () => {
    reads++;
    throw new Error("simulated cache outage");
  });
  const app = express();
  app.use((req, _res, next) => {
    if (role) req.staff = { role, id: "synthetic", clerkUserId: "synthetic" } as StaffUser;
    req.log = pino({ enabled: false });
    next();
  });
  app.use(router);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/staff/catalogue-history-capacity`;
  assert.equal((await fetch(url)).status, 401);
  for (const next of ["administrator", "editor", "operations", "stylist", "analyst"] as const) {
    role = next;
    assert.equal((await fetch(url)).status, 403);
  }
  assert.equal(reads, 0, "denied requests must not measure or read capacity state");
  role = "owner";
  const response = await fetch(url);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json() as { error: string };
  assert.match(body.error, /does not mean usage is within budget/);
  assert.equal(reads, 1);
});
