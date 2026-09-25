import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import app from "./app";

test("Staff platform drafts have a bounded larger JSON limit and readable 413 errors", async () => {
  const server: Server = app.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = async (path: string, bytes: number, method: "PUT" | "POST") =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ content: "x".repeat(bytes) }),
    });

  try {
    // The previous default JSON limit rejected this before Staff authorization.
    const acceptedByParser = await send("/api/staff/content/platform", 110_000, "PUT");
    assert.equal(acceptedByParser.status, 401);

    // Other endpoints must not silently inherit the larger draft allowance.
    const otherRoute = await send("/api/storage/uploads/request-url", 110_000, "POST");
    assert.equal(otherRoute.status, 413);
    assert.equal(otherRoute.headers.get("content-type")?.includes("application/json"), true);
    assert.deepEqual(await otherRoute.json(), { error: "Request body is too large." });

    const oversizedDraft = await send("/api/staff/content/platform", 1_048_576, "PUT");
    assert.equal(oversizedDraft.status, 413);
    assert.equal(oversizedDraft.headers.get("content-type")?.includes("application/json"), true);
    const error = await oversizedDraft.json() as { error: string };
    assert.match(error.error, /draft exceeds the 1 MB save limit/i);
  } finally {
    server.close();
    await once(server, "close");
  }
});