import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { db } from "@workspace/db";
import { DEFAULT_PLATFORM_CONTENT } from "../lib/platform-content";
import contentRouter from "./content";

test("encoded public HTTP responses retain live version checks, activation checks and fail-closed behaviour", async () => {
  const originalSelect = db.select;
  let hash = "cpu-http-initial";
  let publishedAt: Date | null = new Date("2026-10-01T00:00:00Z");
  let unavailable = false;
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  let fullReads = 0;
  let versionReads = 0;
  let activationReads = 0;
  db.select = ((selection: Record<string, unknown>) => {
    return { from: () => ({ where: () => ({ limit: async () => {
      if (unavailable) throw new Error("synthetic source unavailable");
      if ("draft" in selection) {
        activationReads++;
        return [{ draft: { enabled: false } }];
      }
      if ("content" in selection) fullReads++;
      else versionReads++;
      return [{ fingerprint: hash, publishedAt, content: structuredClone(content) }];
    } }) }) };
  }) as unknown as typeof db.select;
  const app = express();
  app.use("/api", contentRouter);
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.set("Cache-Control", "no-store").status(503).json({ error: "Source unavailable" });
  });
  const server = app.listen(0, "127.0.0.1");
  try {
    if (!server.listening) await new Promise<void>((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const first = await fetch(`${origin}/api/content/platform`);
    const firstBody = await first.text();
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "no-store");
    assert.match(first.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(JSON.parse(firstBody).checkoutEnabled, false);
    const again = await fetch(`${origin}/api/content/platform`);
    assert.equal(await again.text(), firstBody);
    assert.equal(again.headers.get("etag"), first.headers.get("etag"));
    assert.equal(fullReads, 1);
    assert.equal(versionReads, 2);
    assert.equal(activationReads, 2, "Activation is not cached with the response");

    hash = "cpu-http-webhook-change";
    content.site.footer.description = "Approved replacement";
    const changed = await fetch(`${origin}/api/content/platform`);
    assert.notEqual(changed.headers.get("etag"), first.headers.get("etag"));
    assert.equal(JSON.parse(await changed.text()).content.site.footer.description, "Approved replacement");
    assert.equal(fullReads, 2);
    const site = await fetch(`${origin}/api/content/site`);
    assert.equal(JSON.parse(await site.text()).content.footer.description, "Approved replacement");
    // Undici otherwise adds no-cache to conditional fetches, which correctly
    // forces Express to return 200 rather than a conditional 304.
    const conditional = await fetch(`${origin}/api/content/site`, {
      headers: { "If-None-Match": site.headers.get("etag")!, "Cache-Control": "max-age=0" },
    });
    assert.equal(conditional.status, 304);
    assert.equal(conditional.headers.get("cache-control"), "no-store");

    publishedAt = null;
    const withdrawn = await fetch(`${origin}/api/content/platform`);
    assert.equal(withdrawn.status, 404);
    assert.equal(JSON.parse(await withdrawn.text()).content, undefined);
    publishedAt = new Date("2026-10-01T00:00:00Z");
    unavailable = true;
    const failed = await fetch(`${origin}/api/content/platform`);
    assert.equal(failed.status, 503);
    assert.equal(JSON.parse(await failed.text()).content, undefined, "Never serve the cached body on a failed source check");
  } finally {
    db.select = originalSelect;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
