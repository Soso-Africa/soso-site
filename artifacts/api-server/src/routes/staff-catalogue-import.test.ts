import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import { db, siteContentTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensurePlatformContent } from "../lib/platform-content";
import contentRouter from "./staff-content";
import importRouter from "./staff-catalogue-import";

test("five-product draft import is atomic, repeat-safe, role-restricted and cannot publish or overwrite", async () => {
  await ensurePlatformContent();
  const [before] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform"));
  assert.ok(before?.draft);
  const document = before.draft as { products: Record<string, unknown>[] };
  const original = structuredClone(document.products[0]);
  assert.ok(original);
  const products = Array.from({ length: 5 }, (_, index) => {
    const product = { ...structuredClone(original),
      slug: `isolated-import-${randomUUID()}-${index}`, releaseState: "placeholder", fulfilmentState: "unavailable",
      standardEligible: false, customEligible: false, allowCustomColour: false, standardSizes: [], readyNowSizes: [],
      sizes: ["To confirm"], unavailableMessage: "Awaiting atelier review.",
    };
    for (const key of ["commerceProductId", "commerceVariantIds", "commerceMappingConfirmation", "variantPrices", "legacyMigration"]) delete (product as Record<string, unknown>)[key];
    return product;
  });
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    if (req.headers["x-test-role"] !== "anonymous") {
      req.staff = { id: randomUUID(), clerkUserId: "isolated-import-contract", role: req.headers["x-test-role"] ?? "owner", isActive: true } as typeof req.staff;
    }
    req.log = { warn: () => undefined } as unknown as typeof req.log;
    next();
  });
  app.use(importRouter, contentRouter);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const root = `http://127.0.0.1:${address.port}`;
  const request = async (body: unknown, role = "owner") => {
    const response = await fetch(root + "/staff/content/platform/import/draft", {
      method: "POST", headers: { "content-type": "application/json", "x-test-role": role }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as {
      draft: { products: Record<string, unknown>[] }; published: unknown; publishedAt: string | null; draftUpdatedAt: string;
    } };
  };
  try {
    const input = { expectedDraftUpdatedAt: before.draftUpdatedAt.toISOString(), products };
    assert.equal((await request(input, "anonymous")).status, 401);
    assert.equal((await request(input, "fulfilment")).status, 403);
    assert.equal((await request({ ...input, products: Array(11).fill(products[0]) })).status, 400);
    for (const patch of [
      { releaseState: "approved" }, { fulfilmentState: "ready_now" }, { customEligible: true },
      { commerceProductId: randomUUID() }, { department: "unisex" }, { images: [] },
    ]) {
      assert.equal((await request({ ...input, products: [{ ...products[0], ...patch }] })).status, 400, JSON.stringify(patch));
    }
    const saved = await request(input);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.draft.products.length, document.products.length + 5);
    assert.deepEqual(saved.body.draft.products.slice(0, document.products.length), document.products);
    assert.deepEqual(saved.body.published, before.published);
    assert.equal(saved.body.publishedAt, before.publishedAt?.toISOString() ?? null);
    // Exact repeat after a lost response must fail without adding another copy.
    assert.equal((await request(input)).status, 409);
    assert.equal((await request({ ...input, expectedDraftUpdatedAt: saved.body.draftUpdatedAt })).status, 409);
    // A stale writer cannot append a different product.
    assert.equal((await request({ ...input, products: [{ ...products[0], slug: `stale-${randomUUID()}` }] })).status, 409);
    const [after] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform"));
    assert.deepEqual(after!.published, before.published);
    assert.equal((after!.draft as typeof document).products.length, document.products.length + 5);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
