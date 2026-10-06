import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { db, commerceCheckoutAttemptsTable, purchaseConversionClaimsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import router from "./purchase-conversions";
import { JusticeSureCommerceClient, type JusticeSureOrder } from "../lib/justicesureCommerce";
import { verifiedPurchase } from "../lib/verified-purchase";

const orderId = randomUUID();
const paidOrder = {
  id: orderId, status: "completed", currency: "NGN",
  payment: { status: "paid" }, fulfillment: { status: "pending" },
  amounts: { subtotalKobo: 123456, totalKobo: 123456, paidKobo: 123456, refundedKobo: 0 },
} as JusticeSureOrder;

test("only fully paid, matching, non-refunded authoritative NGN orders qualify", () => {
  assert.deepEqual(verifiedPurchase(paidOrder, orderId), { value: 1234.56, currency: "NGN" });
  for (const order of [
    { ...paidOrder, id: randomUUID() },
    { ...paidOrder, payment: { status: "pending" } },
    { ...paidOrder, status: "cancelled" },
    { ...paidOrder, currency: "USD" },
    { ...paidOrder, amounts: { ...paidOrder.amounts, paidKobo: 1 } },
    { ...paidOrder, amounts: { ...paidOrder.amounts, totalKobo: 0, paidKobo: 0 } },
    { ...paidOrder, amounts: { ...paidOrder.amounts, refundedKobo: 1 } },
  ]) assert.equal(verifiedPurchase(order as JusticeSureOrder, orderId), null);
});

test("isolated payment simulator: pending, cancelled, paid, concurrent refresh, ownership and consent", async () => {
  // Tests must run via the temporary-schema wrapper, never in public.
  const schema = await db.execute<{ schema: string }>(sql`select current_schema() as schema`);
  assert.match(schema.rows[0]!.schema, /^soso_api_test_/);
  const attemptId = randomUUID();
  const token = randomUUID();
  let currentOrder = structuredClone(paidOrder);
  let remoteReads = 0;
  const original = JusticeSureCommerceClient.prototype.getOrder;
  JusticeSureCommerceClient.prototype.getOrder = async () => { remoteReads += 1; return currentOrder; };
  const previous = process.env.JUSTICESURE_COMMERCE_TEST_API_KEY;
  const previousBase = process.env.JUSTICESURE_COMMERCE_API_BASE_URL;
  process.env.JUSTICESURE_COMMERCE_TEST_API_KEY = "jsk_test_isolated_no_network";
  process.env.JUSTICESURE_COMMERCE_API_BASE_URL = "https://isolated.example.test";
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const cookie = `soso_checkout_owner=${attemptId}.${token}`;
  const send = (body = { marketingConsent: true, publicPath: "/shop" }, ownerCookie = cookie, extraHeaders = {}) => fetch(`${base}/api/payment/purchase-conversion`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: ownerCookie, ...extraHeaders },
    body: JSON.stringify(body),
  });
  try {
    await db.insert(commerceCheckoutAttemptsTable).values({
      id: attemptId, ownershipTokenHash: createHash("sha256").update(token).digest("hex"),
      requestHash: "isolated", customerName: "Synthetic", customerEmail: "synthetic@example.test",
      customerPhone: "synthetic", items: [], fulfillment: {},
      orderIdempotencyKey: randomUUID(), paymentIdempotencyKey: randomUUID(),
      justiceSureOrderId: orderId, provider: "simulated", status: "paid",
    });
    assert.equal((await send({ marketingConsent: false, publicPath: "/shop" })).status, 403);
    for (const publicPath of ["/checkout", "/payment-return", "/staff", "/shop?order_secret=hidden"]) {
      assert.equal((await send({ marketingConsent: true, publicPath })).status, 403, publicPath);
    }
    assert.equal((await send(undefined, "soso_checkout_owner=bad")).status, 204);
    assert.equal((await send(undefined, cookie, { Origin: "https://cross-site.example" })).status, 403);
    assert.equal(remoteReads, 0);
    currentOrder = { ...paidOrder, payment: { ...paidOrder.payment, status: "pending" }, amounts: { ...paidOrder.amounts, paidKobo: 0 } };
    assert.equal((await send()).status, 204);
    currentOrder = { ...paidOrder, status: "cancelled" };
    assert.equal((await send()).status, 204);
    assert.equal((await db.select().from(purchaseConversionClaimsTable).where(eq(purchaseConversionClaimsTable.attemptId, attemptId))).length, 0);
    currentOrder = paidOrder;
    const results = await Promise.all([send(), send()]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 204]);
    const receipt = await results.find((r) => r.status === 200)!.json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(receipt).sort(), ["currency", "eventId", "value"]);
    assert.equal(receipt.value, 1234.56);
    assert.equal(receipt.currency, "NGN");
    assert.notEqual(receipt.eventId, orderId);
    assert.notEqual(receipt.eventId, attemptId);
    const refreshed = await send();
    assert.equal(refreshed.status, 204);
    assert.equal(refreshed.headers.get("X-SOSO-Verified-Purchaser"), "1");
    assert.equal((await send({ marketingConsent: false, publicPath: "/shop" })).status, 403);
  } finally {
    await db.delete(commerceCheckoutAttemptsTable).where(eq(commerceCheckoutAttemptsTable.id, attemptId));
    JusticeSureCommerceClient.prototype.getOrder = original;
    if (previous === undefined) delete process.env.JUSTICESURE_COMMERCE_TEST_API_KEY;
    else process.env.JUSTICESURE_COMMERCE_TEST_API_KEY = previous;
    if (previousBase === undefined) delete process.env.JUSTICESURE_COMMERCE_API_BASE_URL;
    else process.env.JUSTICESURE_COMMERCE_API_BASE_URL = previousBase;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
