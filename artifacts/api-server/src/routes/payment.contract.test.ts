import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  commerceWebhookEventsTable,
  db,
  staffSessionsTable,
  staffUsersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { checkoutRequestHash, hasOwnership, quoteMatchesRequestedCheckout, remoteStatus, sameImmutableQuote, shouldRecoverPaymentAttempt } from "./payment";
import type { JusticeSureOrder } from "../lib/justicesureCommerce";

const checkout = {
  checkoutOperationId: "checkout-test-operation",
  customer: { name: "Ada Customer", email: "ada@example.test", phone: "+2348000000000" },
  items: [{
    productId: "0efebec6-2687-4d2f-9350-f67282534d30",
    variantId: "a725a2f5-5cdd-46e7-a36d-c0c5beef6a31",
    quantity: 1, selectedColourId: "black", selectedColourLabel: "Black", selectedColourHex: "#000000",
  }],
  fulfillment: { type: "delivery" as const, address: "1 Example Road" },
  displayCurrency: "USD",
  paymentProvider: "stripe" as const,
  paymentMethod: "card" as const,
  notes: "Call first",
};

test("canonical checkout claim changes for contact, address, notes, provider, and currency edits", () => {
  const initial = checkoutRequestHash(checkout);
  assert.notEqual(initial, checkoutRequestHash({ ...checkout, customer: { ...checkout.customer, phone: "+2348111111111" } }));
  assert.notEqual(initial, checkoutRequestHash({ ...checkout, fulfillment: { ...checkout.fulfillment, address: "2 Example Road" } }));
  assert.notEqual(initial, checkoutRequestHash({ ...checkout, notes: "Do not call" }));
  assert.notEqual(initial, checkoutRequestHash({ ...checkout, paymentProvider: "paypal" }));
  assert.notEqual(initial, checkoutRequestHash({ ...checkout, displayCurrency: "EUR" }));
});


test("the quote response ownership cookie authorizes the following confirmation request", () => {
  const attemptId = "0efebec6-2687-4d2f-9350-f67282534d30";
  const token = "a-fresh-browser-only-token";
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const req = { headers: { cookie: `other=value; soso_checkout_owner=${attemptId}.${token}` } };
  assert.equal(hasOwnership(req as never, attemptId, tokenHash), true);
  assert.equal(hasOwnership(req as never, attemptId, crypto.createHash("sha256").update("different").digest("hex")), false);
});

function order(refundedKobo: number): JusticeSureOrder {
  return {
    id: "0efebec6-2687-4d2f-9350-f67282534d30", number: "JS-1", status: "refunded", currency: "NGN",
    amounts: { subtotalKobo: 10000, discountKobo: 0, taxKobo: 0, deliveryKobo: 0, totalKobo: 10000, paidKobo: 10000, outstandingKobo: 0, refundedKobo },
    payment: { method: "card", status: "refunded", reference: "jsorder_test" },
    delivery: { fulfillmentType: "delivery", address: "1 Example Road", status: "pending", partner: null, trackingReference: null },
    fulfillment: { status: "pending" }, items: [],
  };
}

test("partial authoritative refunds do not become full local refunds", () => {
  assert.equal(remoteStatus(order(2500)), "paid");
  assert.equal(remoteStatus(order(10000)), "refunded");
});

test("completed fulfilment never overrides pending payment", () => {
  const pending = order(0);
  pending.status = "completed";
  pending.payment.status = "pending";
  pending.fulfillment.status = "completed";
  pending.amounts.paidKobo = 0;
  pending.amounts.outstandingKobo = pending.amounts.totalKobo;
  assert.equal(remoteStatus(pending), "payment_pending");
});

test("live payment recovery requires a persisted UUID and is bounded to ten seconds", () => {
  const checkedAt = new Date("2030-01-01T00:00:00.000Z");
  const remoteAttemptId = "0efebec6-2687-4d2f-9350-f67282534d30";
  const now = checkedAt.getTime() + 10_000;
  assert.equal(shouldRecoverPaymentAttempt("payment_pending", "paystack", remoteAttemptId, checkedAt, now), true);
  assert.equal(shouldRecoverPaymentAttempt("payment_pending", "paystack", remoteAttemptId, checkedAt, now - 1), false);
  assert.equal(shouldRecoverPaymentAttempt("paid", "paystack", remoteAttemptId, null, now), false);
  assert.equal(shouldRecoverPaymentAttempt("payment_pending", "paystack", null, null, now), false);
  assert.equal(shouldRecoverPaymentAttempt("payment_pending", "paystack", "not-a-uuid", null, now), false);
  assert.equal(shouldRecoverPaymentAttempt("payment_pending", "simulated", remoteAttemptId, null, now), false);
});

test("quote confirmation rejects changed line, fulfillment, expiry, and monetary authority", () => {
  const lines = [{ inventoryItemId: checkout.items[0].productId, variantId: checkout.items[0].variantId, quantity: 1 }];
  const requestedItems = [{ productId: checkout.items[0].productId, variantId: checkout.items[0].variantId, quantity: 1 }];
  const fulfillment = { type: "delivery" as const, address: "1 Example Road" };
  assert.equal(quoteMatchesRequestedCheckout({ lines, fulfillment }, requestedItems, fulfillment), true);
  assert.equal(quoteMatchesRequestedCheckout({ lines: [{ ...lines[0], quantity: 2 }], fulfillment }, requestedItems, fulfillment), false);
  assert.equal(quoteMatchesRequestedCheckout({ lines, fulfillment: { ...fulfillment, address: "Changed" } }, requestedItems, fulfillment), false);
  const snapshot = {
    id: "0efebec6-2687-4d2f-9350-f67282534d30", expiresAt: "2030-01-01T00:00:00.000Z", currency: "NGN",
    displayCurrency: "USD", chargeCurrency: "USD", settlementCurrency: "NGN", fxSnapshotId: null,
    amounts: { totalMinor: "100" }, lines, fulfillment,
  };
  assert.equal(sameImmutableQuote(snapshot, snapshot), true);
  assert.equal(sameImmutableQuote({
    ...snapshot,
    amounts: { totalMinor: "100" },
    lines: lines.map(({ inventoryItemId, variantId, quantity }) => ({ quantity, variantId, inventoryItemId })),
    fulfillment: { address: "1 Example Road", type: "delivery" },
  }, {
    ...snapshot,
    amounts: { totalMinor: "100" },
    lines: lines.map(({ inventoryItemId, variantId, quantity }) => ({ inventoryItemId, variantId, quantity })),
    fulfillment: { type: "delivery", address: "1 Example Road" },
  }), true);
  assert.equal(sameImmutableQuote({ ...snapshot, expiresAt: "2030-01-01T00:01:00.000Z" }, snapshot), false);
  assert.equal(sameImmutableQuote({ ...snapshot, amounts: { totalMinor: "101" } }, snapshot), false);
});

test("signed catalogue webhooks persist idempotently and drive authenticated Staff invalidations", async () => {
  const environmentKeys = [
    "JUSTICESURE_COMMERCE_API_BASE_URL",
    "JUSTICESURE_COMMERCE_TEST_API_KEY",
    "JUSTICESURE_COMMERCE_TEST_WEBHOOK_SECRET",
    "JUSTICESURE_COMMERCE_RUNTIME_READY",
    "SOSO_PAYMENT_RETURN_URL",
  ] as const;
  const previousEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  const webhookSecret = "catalogue-contract-webhook-secret";
  process.env.JUSTICESURE_COMMERCE_API_BASE_URL = "https://commerce.example.test";
  process.env.JUSTICESURE_COMMERCE_TEST_API_KEY = "jsk_test_catalogue_contract";
  process.env.JUSTICESURE_COMMERCE_TEST_WEBHOOK_SECRET = webhookSecret;
  process.env.JUSTICESURE_COMMERCE_RUNTIME_READY = "true";
  process.env.SOSO_PAYMENT_RETURN_URL = "https://store.example.test/payment/return";

  const productId = crypto.randomUUID();
  const variantId = crypto.randomUUID();
  const unaffectedProductId = crypto.randomUUID();
  const eventIds: string[] = [];
  const sessionToken = crypto.randomBytes(32).toString("base64url");
  const clerkUserId = `catalogue-contract-${crypto.randomBytes(8).toString("hex")}`;
  let staffUserId: string | undefined;
  let server: Server | undefined;

  const listen = async () => {
    const running = app.listen(0);
    await once(running, "listening");
    const { port } = running.address() as AddressInfo;
    server = running;
    return `http://127.0.0.1:${port}`;
  };
  const postJson = async (
    baseUrl: string,
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) as unknown : undefined };
  };
  const deliver = async (
    baseUrl: string,
    event: "commerce.product.updated" | "commerce.inventory.updated",
    createdAt: string,
    data: Record<string, unknown>,
    eventId = `evt_${crypto.randomBytes(18).toString("base64url")}`,
  ) => {
    if (!eventIds.includes(eventId)) eventIds.push(eventId);
    const body = { id: eventId, event, apiVersion: "2025-01-01", createdAt, data };
    const rawBody = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const signature = crypto.createHmac("sha256", webhookSecret)
      .update(`${timestamp}.${eventId}.${rawBody}`)
      .digest("hex");
    return postJson(baseUrl, "/api/payment/webhook", body, {
      "x-justicesure-timestamp": timestamp,
      "x-justicesure-event-id": eventId,
      "x-justicesure-event": event,
      "x-justicesure-signature": `sha256=${signature}`,
    });
  };
  const invalidations = (
    baseUrl: string,
    confirmedAt: string,
  ) => postJson(baseUrl, "/api/staff/commerce/catalogue-mapping/invalidations", {
    confirmations: [
      { slug: "matching-product", productId, variantIds: [], confirmedAt },
      { slug: "matching-variant", productId: crypto.randomUUID(), variantIds: [variantId], confirmedAt },
      { slug: "unaffected-product", productId: unaffectedProductId, variantIds: [], confirmedAt },
    ],
  }, {
    origin: baseUrl,
    cookie: `soso_staff_session=${sessionToken}`,
  });

  try {
    const [staffUser] = await db.insert(staffUsersTable).values({
      clerkUserId,
      email: `${clerkUserId}@example.test`,
      role: "administrator",
      isActive: true,
    }).returning({ id: staffUsersTable.id });
    staffUserId = staffUser!.id;
    await db.insert(staffSessionsTable).values({
      staffUserId,
      tokenHash: crypto.createHash("sha256").update(sessionToken).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const baseUrl = await listen();
    const confirmedAt = new Date(Date.now() - 60_000).toISOString();
    const olderThanConfirmation = new Date(Date.now() - 120_000).toISOString();
    const productEventId = `evt_${crypto.randomBytes(18).toString("base64url")}`;
    const productOccurredAt = new Date().toISOString();
    const productUpdatedAt = new Date().toISOString();
    const productData = { productId, updatedAt: productUpdatedAt };

    const productDelivery = await deliver(
      baseUrl,
      "commerce.product.updated",
      productOccurredAt,
      productData,
      productEventId,
    );
    assert.deepEqual(productDelivery, { status: 200, body: { received: true } });
    assert.deepEqual(await invalidations(baseUrl, confirmedAt), {
      status: 200,
      body: { staleSlugs: ["matching-product"] },
    });

    const duplicate = await deliver(
      baseUrl,
      "commerce.product.updated",
      productOccurredAt,
      productData,
      productEventId,
    );
    assert.deepEqual(duplicate, { status: 200, body: { received: true, duplicate: true } });

    assert.equal((await deliver(baseUrl, "commerce.product.updated", new Date().toISOString(), {
      productId: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    })).status, 200);
    assert.equal((await deliver(baseUrl, "commerce.product.updated", olderThanConfirmation, {
      productId: unaffectedProductId,
      updatedAt: olderThanConfirmation,
    })).status, 200);
    assert.deepEqual(await invalidations(baseUrl, confirmedAt), {
      status: 200,
      body: { staleSlugs: ["matching-product"] },
    });

    assert.equal((await deliver(baseUrl, "commerce.inventory.updated", new Date().toISOString(), {
      inventoryItemId: variantId,
      updatedAt: new Date().toISOString(),
    })).status, 200);
    assert.deepEqual(await invalidations(baseUrl, confirmedAt), {
      status: 200,
      body: { staleSlugs: ["matching-product", "matching-variant"] },
    });

    const rows = await db.select({
      eventId: commerceWebhookEventsTable.eventId,
      status: commerceWebhookEventsTable.status,
    }).from(commerceWebhookEventsTable).where(inArray(commerceWebhookEventsTable.eventId, eventIds));
    assert.equal(rows.length, eventIds.length);
    assert.ok(rows.every((row) => row.status === "completed"));
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (eventIds.length) await db.delete(commerceWebhookEventsTable).where(inArray(commerceWebhookEventsTable.eventId, eventIds));
    if (staffUserId) {
      await db.delete(staffSessionsTable).where(eq(staffSessionsTable.staffUserId, staffUserId));
      await db.delete(staffUsersTable).where(eq(staffUsersTable.id, staffUserId));
    }
    for (const key of environmentKeys) {
      const previous = previousEnvironment[key];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  }
});