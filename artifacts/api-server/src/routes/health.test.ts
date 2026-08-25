import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import app from "../app";

async function listen(): Promise<{ server: Server; baseUrl: string }> {
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test("GET /api/readyz reports a reachable PostgreSQL database without error details", async () => {
  const { server, baseUrl } = await listen();
  try {
    const response = await fetch(`${baseUrl}/api/readyz`);
    const body = await response.json() as unknown;

    assert.equal(response.status, 200);
    assert.deepEqual(body, { status: "ok", database: "ok" });
    assert.doesNotMatch(JSON.stringify(body), /error|exception|message|detail|postgres|database_url/i);
  } finally {
    server.close();
    await once(server, "close");
  }
});