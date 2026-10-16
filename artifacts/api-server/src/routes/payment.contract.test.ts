import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  commerceWebhookEventsTable,
  commerceCheckoutAttemptsTable,
  db,
  orderItemsTable,
  ordersTable,
  pool,
  siteContentTable,
  staffSessionsTable,
  staffUsersTable,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import { checkoutRequestHash, hasOwnership, paymentSessionRequestBodyForAttempt, quoteMatchesRequestedCheckout, remoteStatus, sameImmutableQuote, shouldRecoverPaymentAttempt } from "./payment";
import { JusticeSureCommerceClient, JusticeSureRequestError, type JusticeSureOrder, type JusticeSureQuote, type JusticeSureCatalogProduct } from "../lib/justicesureCommerce";
import { DEFAULT_PLATFORM_CONTENT, PlatformContentSchema } from "../lib/platform-content";
import { catalogueProductHash, localMappingHash } from "../lib/catalogue-mapping";
import { checkoutInitiationLockDb, checkoutInitiationLockPool } from "../lib/checkout-initiation-lock";

async function jsonObject(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json();
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function providerGate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitForGate(promise: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Concurrent provider barrier was not reached")), 5_000);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

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
  assert.notEqual(initial, checkoutRequestHash({ ...checkout, customerExternalId: "soso:verified-subject" }));
  assert.notEqual(
    checkoutRequestHash({ ...checkout, customerExternalId: "soso:verified-subject" }),
    checkoutRequestHash({ ...checkout, customerExternalId: "soso:another-subject" }),
  );
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

test("Paystack payment sessions use the approved callback URL and only repair explicitly rejected durable intent", () => {
  const callbackUrl = "https://shopsoso.co/checkout/return";
  assert.deepEqual(paymentSessionRequestBodyForAttempt(null, "paystack", "buyer@example.test", callbackUrl, null), {
    provider: "paystack", email: "buyer@example.test", redirectUrl: callbackUrl,
  });

  const rejected = { provider: "paystack" as const, email: "buyer@example.test" };
  assert.deepEqual(paymentSessionRequestBodyForAttempt(rejected, "paystack", "buyer@example.test", callbackUrl, "PLATFORM_CALLBACK_URL_REQUIRED"), {
    ...rejected, redirectUrl: callbackUrl,
  });
  assert.equal(paymentSessionRequestBodyForAttempt(rejected, "paystack", "buyer@example.test", callbackUrl, "OTHER_ERROR"), rejected);
});

test("quote confirmation rejects changed line, fulfillment, expiry, and monetary authority", () => {
  const lines = [{ inventoryItemId: checkout.items[0].productId, variantId: checkout.items[0].variantId, quantity: 1 }];
  const requestedItems = [{ productId: checkout.items[0].productId, variantId: checkout.items[0].variantId, quantity: 1 }];
  const fulfillment = {
    type: "delivery" as const, address: "1 Example Road", destinationCountry: "NG",
    shippingAddress: {
      country: "NG", region: "Lagos", city: "Ikeja", postalCode: "100271",
      addressLines: ["1 Example Road"], recipientName: "Ada Customer", recipientPhone: "+2348000000000",
    },
  };
  assert.equal(quoteMatchesRequestedCheckout({ lines, fulfillment }, requestedItems, fulfillment), true);
  assert.equal(quoteMatchesRequestedCheckout({ lines: [{ ...lines[0], quantity: 2 }], fulfillment }, requestedItems, fulfillment), false);
  assert.equal(quoteMatchesRequestedCheckout({ lines, fulfillment: { ...fulfillment, address: "Changed" } }, requestedItems, fulfillment), false);
  assert.equal(quoteMatchesRequestedCheckout({ lines, fulfillment: { ...fulfillment, destinationCountry: "GB" } }, requestedItems, fulfillment), false);
  assert.equal(quoteMatchesRequestedCheckout({ lines, fulfillment: { ...fulfillment, shippingAddress: { ...fulfillment.shippingAddress, city: "Changed" } } }, requestedItems, fulfillment), false);
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
    fulfillment: { shippingAddress: fulfillment.shippingAddress, destinationCountry: "NG", address: "1 Example Road", type: "delivery" },
  }, {
    ...snapshot,
    amounts: { totalMinor: "100" },
    lines: lines.map(({ inventoryItemId, variantId, quantity }) => ({ inventoryItemId, variantId, quantity })),
    fulfillment,
  }), true);
  assert.equal(sameImmutableQuote({ ...snapshot, expiresAt: "2030-01-01T00:01:00.000Z" }, snapshot), false);
  assert.equal(sameImmutableQuote({ ...snapshot, amounts: { totalMinor: "101" } }, snapshot), false);
});

test("guest quote creation needs no prior quote, while initiation and status require an owned attempt", async () => {
  const previous = process.env.JUSTICESURE_COMMERCE_RUNTIME_READY;
  process.env.JUSTICESURE_COMMERCE_RUNTIME_READY = "false";
  const server = app.listen(0);
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const payload = {
      ...checkout,
      checkoutOperationId: `regression-${crypto.randomUUID()}`,
      displayCurrency: "NGN",
      paymentProvider: "paystack",
      fulfillment: { type: "pickup", locationId: crypto.randomUUID() },
    };
    const quote = await fetch(`${base}/api/payment/quote`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    assert.equal(quote.status, 409);
    assert.equal((await jsonObject(quote)).noPaymentTaken, true);
    const initiate = await fetch(`${base}/api/payment/initiate`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, quoteId: crypto.randomUUID() }),
    });
    assert.equal(initiate.status, 409);
    assert.match(String((await jsonObject(initiate)).error), /Create and review a quote/);
    const status = await fetch(`${base}/api/payment/status/${crypto.randomUUID()}`);
    assert.equal(status.status, 404);
    assert.equal((await jsonObject(status)).error, "Checkout attempt not found.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previous === undefined) delete process.env.JUSTICESURE_COMMERCE_RUNTIME_READY;
    else process.env.JUSTICESURE_COMMERCE_RUNTIME_READY = previous;
  }
});

test("persisted quote confirms only for its browser and recovers payment with deterministic provider mocks", async (t) => {
  // This fixture must never replace real published content, even when someone
  // accidentally invokes the file without the isolated-schema runner.
  const schema = await db.execute(sql`select current_schema() as name`);
  assert.match(String(schema.rows[0]?.name), /^soso_api_test_[a-f0-9]+$/);
  const environment = {
    NODE_ENV: "test",
    JUSTICESURE_COMMERCE_API_BASE_URL: "https://commerce.example.test",
    JUSTICESURE_COMMERCE_TEST_API_KEY: "jsk_test_payment_contract",
    JUSTICESURE_COMMERCE_TEST_WEBHOOK_SECRET: "payment-contract-secret",
    JUSTICESURE_COMMERCE_RUNTIME_READY: "true",
    SOSO_PAYMENT_RETURN_URL: "https://store.example.test/checkout/return",
  };
  const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of Object.keys(environment)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  const productId = checkout.items[0].productId;
  const variantId = checkout.items[0].variantId;
  const locationId = "bb36b5b8-60b1-4a8d-b8e7-c68c8ca01949";
  const quoteId = "f9fbf593-9856-4f93-bcc4-b3b02ef3827e";
  const remoteAttemptId = "be103ef1-de70-4f41-af79-d9a0c841e237";
  const payload = {
    ...checkout, checkoutOperationId: "contract-confirmation-operation",
    displayCurrency: "NGN", paymentProvider: "paystack" as const,
    items: [{ ...checkout.items[0], selectedSize: "M" }],
    fulfillment: { type: "pickup" as const, locationId },
  };
  const catalog: JusticeSureCatalogProduct = {
    id: productId, name: "Contract garment", description: null, amountKobo: 10000,
    currency: "NGN", inStock: true, images: [],
    variants: [{ id: variantId, name: "Medium", label: "M", attributes: { size: "M" }, amountKobo: 10000, inStock: true }],
  };
  const published = structuredClone(DEFAULT_PLATFORM_CONTENT);
  const product = {
    ...published.products[0], name: catalog.name, price: 100,
    standardEligible: true, customEligible: false, sizes: ["M"], standardSizes: ["M"], readyNowSizes: ["M"],
    fulfilmentState: "ready_now" as const,
    commerceProductId: productId, commerceVariantIds: { M: variantId }, variantPrices: { M: 100 },
    colourOptions: [{ id: "black", label: "Black", hex: "#000000" }], allowCustomColour: false,
  };
  product.commerceMappingConfirmation = {
    productHash: catalogueProductHash(catalog),
    localHash: localMappingHash({
      ...product, eligibility: { standard: true, custom: false },
    }),
    snapshotHash: "a".repeat(64), snapshotFetchedAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(), confidence: 100, source: "manual",
    evidence: ["Isolated deterministic contract fixture"], choiceLabels: { M: "M" },
  };
  published.products[0] = product;
  PlatformContentSchema.parse(published);
  Object.assign(process.env, environment);
  const immutableQuote: JusticeSureQuote = {
    id: quoteId, expiresAt: "2099-01-01T00:00:00.000Z",
    currency: "NGN", displayCurrency: "NGN", chargeCurrency: "NGN", settlementCurrency: "NGN",
    amounts: { subtotalMinor: "10000", shippingMinor: "0", totalMinor: "10000" }, fxSnapshotId: null,
    payment: { provider: "paystack", method: "card", chargeCurrency: "NGN", settlementCurrency: "NGN" },
    lines: [{ inventoryItemId: productId, variantId, quantity: 1, name: catalog.name, unitPrice: 100, unitPriceKobo: "10000" }],
    fulfillment: { type: "pickup", locationId, address: null, destinationCountry: "NG", shippingAddress: null },
  };
  let currentQuote = structuredClone(immutableQuote);
  let remoteOrder = order(0);
  remoteOrder.status = "pending";
  remoteOrder.payment.status = "pending";
  remoteOrder.amounts.paidKobo = 0;
  remoteOrder.amounts.outstandingKobo = 10000;
  remoteOrder.delivery.fulfillmentType = "pickup";
  let failSession = true;
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "127.0.0.1", "All nonlocal network traffic is forbidden in the payment contract fixture");
    return originalFetch(input, init);
  });
  const client = JusticeSureCommerceClient.prototype;
  t.mock.method(client, "listProducts", async () => [structuredClone(catalog)]);
  t.mock.method(client, "listStoreFulfillmentOptions", async () => ["pickup"]);
  t.mock.method(client, "listLocations", async () => [{ id: locationId, type: "shop", name: "SOSO HQ", address: "1 Example Road", city: "Lagos", country: "NG" }]);
  t.mock.method(client, "listCurrencies", async () => [{ code: "NGN", name: "Naira", minorUnitExponent: 2 }]);
  const quoteCreate = t.mock.method(client, "createPriceQuote", async (input: Parameters<typeof client.createPriceQuote>[0]) => {
    assert.deepEqual(input.items, [{ productId, variantId, quantity: 1 }]);
    assert.deepEqual(input.fulfillment, payload.fulfillment);
    return structuredClone(immutableQuote);
  });
  t.mock.method(client, "getPriceQuote", async (id: string) => {
    assert.equal(id, quoteId);
    return structuredClone(currentQuote);
  });
  const createOrder = t.mock.method(client, "createOrder", async (input: Parameters<typeof client.createOrder>[0]) => {
    assert.equal(input.body.quoteId, quoteId);
    assert.equal(input.body.paymentMethod, "paystack");
    assert.deepEqual(input.body.customer, payload.customer);
    assert.equal(input.idempotencyKey, `order_${payload.checkoutOperationId}`);
    return { order: structuredClone(remoteOrder), replayed: false };
  });
  t.mock.method(client, "getOrder", async (id: string) => {
    assert.equal(id, remoteOrder.id);
    return structuredClone(remoteOrder);
  });
  const session = t.mock.method(client, "createPaymentSession", async (input: Parameters<typeof client.createPaymentSession>[0]) => {
    assert.equal(input.orderId, remoteOrder.id);
    assert.equal(input.idempotencyKey, `payment_${payload.checkoutOperationId}_${quoteId.slice(0, 8)}`);
    assert.deepEqual(input.body, {
      provider: "paystack", email: payload.customer.email, redirectUrl: environment.SOSO_PAYMENT_RETURN_URL,
    });
    if (failSession) throw new JusticeSureRequestError("Mock provider unavailable", 503, "PROVIDER_UNAVAILABLE");
    return { provider: "paystack", reference: "contract-payment-reference", attemptId: remoteAttemptId,
      checkoutUrl: "https://checkout.example.test/payment", replayed: false };
  });
  const verify = t.mock.method(client, "verifyPaymentAttempt", async (id: string, paymentId: string) => {
    assert.equal(id, remoteOrder.id);
    assert.equal(paymentId, remoteAttemptId);
    return { attemptId: paymentId, status: "pending", paymentStatus: "pending" };
  });
  const reconcile = t.mock.method(client, "reconcilePaymentAttempt", async (id: string, paymentId: string) => {
    assert.equal(id, remoteOrder.id);
    assert.equal(paymentId, remoteAttemptId);
    return { attemptId: paymentId, status: "pending", paymentStatus: "pending" };
  });
  let server: Server | undefined;
  let attemptId: string | undefined;
  try {
    await db.insert(siteContentTable).values({ key: "platform", draft: published, published, publishedAt: new Date() });
    server = app.listen(0);
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (path: string, body: unknown, cookie?: string) => fetch(`${base}/api/payment/${path}`, {
      method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    const created = await post("quote", payload);
    assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
    const snapshot = await jsonObject(created);
    assert.equal(snapshot.id, quoteId);
    const setCookie = created.headers.get("set-cookie")!;
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\/api\/payment/i);
    const cookie = setCookie.split(";")[0];
    const [persisted] = await db.select().from(commerceCheckoutAttemptsTable).where(eq(commerceCheckoutAttemptsTable.quoteId, quoteId));
    attemptId = persisted.id;
    assert.equal(hasOwnership({ headers: { cookie } } as never, attemptId, persisted.ownershipTokenHash), true);
    assert.notEqual(persisted.ownershipTokenHash, cookie.split(".")[1]);
    assert.deepEqual(persisted.quoteSnapshot, snapshot);
    assert.equal((persisted.orderRequestBody as Record<string, unknown>)?.quoteId, quoteId);
    assert.equal(persisted.justiceSureOrderId, null);
    assert.equal(quoteCreate.mock.callCount(), 1);
    assert.equal(createOrder.mock.callCount(), 0);
    const confirmation = { ...payload, quoteId };
    const recoveredSnapshot = { ...snapshot };
    // Replays use the public projection, excluding internal comparison facts.
    for (const key of ["fxSnapshotId", "lines", "fulfillment"]) delete recoveredSnapshot[key];

    await t.test("a lost quote response and reload recover the same immutable attempt", async () => {
      // Ignore the original body as a browser would after losing the response.
      // The HttpOnly cookie is the proof retained across a page reload.
      for (let retry = 0; retry < 3; retry += 1) {
        const recovered = await post("quote", payload, cookie);
        assert.equal(recovered.status, 200);
        assert.deepEqual(await jsonObject(recovered), recoveredSnapshot);
        assert.equal(recovered.headers.get("set-cookie"), null, "Recovery must not rotate ownership");
      }
      const attempts = await db.select().from(commerceCheckoutAttemptsTable);
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].id, attemptId);
      assert.equal(attempts[0].orderIdempotencyKey, `order_${payload.checkoutOperationId}`);
      assert.equal(attempts[0].paymentIdempotencyKey, `payment_${payload.checkoutOperationId}_${quoteId.slice(0, 8)}`);
      assert.equal(quoteCreate.mock.callCount(), 1);
      assert.equal(createOrder.mock.callCount(), 0);
      assert.equal(session.mock.callCount(), 0);
    });

    await t.test("an interrupted quote preparation cannot be resumed by another browser", async () => {
      try {
        await db.update(commerceCheckoutAttemptsTable).set({ quoteSnapshot: null })
          .where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
        const denied = await post("quote", payload);
        assert.equal(denied.status, 403);
        assert.equal(denied.headers.get("set-cookie"), null);
        assert.equal(quoteCreate.mock.callCount(), 1);
        assert.equal((await db.select().from(commerceCheckoutAttemptsTable)).length, 1);
      } finally {
        await db.update(commerceCheckoutAttemptsTable).set({ quoteSnapshot: snapshot })
          .where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
      }
    });

    await t.test("a lost or forged cookie cannot claim the operation or read its quote", async () => {
      for (const owner of [undefined, `${cookie}tampered`, `soso_checkout_owner=${crypto.randomUUID()}.forged`]) {
        for (let retry = 0; retry < 2; retry += 1) {
          const denied = await post("quote", payload, owner);
          assert.equal(denied.status, 403);
          assert.equal(denied.headers.get("set-cookie"), null);
          assert.equal((await jsonObject(denied)).id, undefined);
        }
      }
      const attempts = await db.select().from(commerceCheckoutAttemptsTable);
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].ownershipTokenHash, persisted.ownershipTokenHash);
      assert.equal(quoteCreate.mock.callCount(), 1);
      assert.equal(createOrder.mock.callCount(), 0);
      assert.equal(session.mock.callCount(), 0);
    });

    await t.test("recovery rejects edited intent and expired quotes without replacing the attempt", async () => {
      assert.equal((await post("quote", { ...payload, notes: "Changed" }, cookie)).status, 409);
      try {
        await db.update(commerceCheckoutAttemptsTable).set({
          quoteSnapshot: { ...snapshot, expiresAt: "2000-01-01T00:00:00.000Z" },
        }).where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
        const expired = await post("quote", payload, cookie);
        assert.equal(expired.status, 410);
        assert.equal((await jsonObject(expired)).code, "QUOTE_EXPIRED_REQUOTE_REQUIRED");
      } finally {
        await db.update(commerceCheckoutAttemptsTable).set({ quoteSnapshot: snapshot })
          .where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
      }
      assert.equal((await db.select().from(commerceCheckoutAttemptsTable)).length, 1);
      assert.equal(quoteCreate.mock.callCount(), 1);
    });

    await t.test("previously persisted quote-specific order keys remain recoverable only by their owner", async () => {
      try {
        await db.update(commerceCheckoutAttemptsTable).set({
          orderIdempotencyKey: `order_${payload.checkoutOperationId}_${quoteId.slice(0, 8)}`,
        }).where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
        const denied = await post("quote", payload);
        assert.equal(denied.status, 403);
        assert.equal(denied.headers.get("set-cookie"), null);
        const recovered = await post("quote", payload, cookie);
        assert.equal(recovered.status, 200);
        assert.deepEqual(await jsonObject(recovered), recoveredSnapshot);
        assert.equal((await db.select().from(commerceCheckoutAttemptsTable)).length, 1);
        assert.equal(quoteCreate.mock.callCount(), 1);
      } finally {
        await db.update(commerceCheckoutAttemptsTable).set({
          orderIdempotencyKey: `order_${payload.checkoutOperationId}`,
        }).where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
      }
    });

    await t.test("missing or forged cookies and changed checkout details cannot create an order", async () => {
      for (const owner of [undefined, `${cookie}tampered`, `soso_checkout_owner=${crypto.randomUUID()}.forged`]) {
        assert.equal((await post("initiate", confirmation, owner)).status, 403);
      }
      assert.equal((await post("initiate", { ...confirmation, notes: "Changed" }, cookie)).status, 409);
      assert.equal((await fetch(`${base}/api/payment/status/${attemptId}`)).status, 404);
      assert.equal(createOrder.mock.callCount(), 0);
      assert.equal(session.mock.callCount(), 0);
    });

    await t.test("immutable money, line, expiry, currency, FX and fulfilment changes fail before provider writes", async () => {
      const mutations: Partial<JusticeSureQuote>[] = [
        { amounts: { ...immutableQuote.amounts, totalMinor: "10001" } },
        { expiresAt: "2099-01-02T00:00:00.000Z" },
        { displayCurrency: "USD" }, { chargeCurrency: "USD" }, { settlementCurrency: "USD" },
        { fxSnapshotId: crypto.randomUUID() },
        { lines: [{ ...immutableQuote.lines![0], quantity: 2 }] },
        { fulfillment: { ...immutableQuote.fulfillment!, locationId: crypto.randomUUID() } },
      ];
      for (const mutation of mutations) {
        currentQuote = { ...structuredClone(immutableQuote), ...mutation };
        const rejected = await post("initiate", confirmation, cookie);
        assert.equal(rejected.status, 409);
        assert.equal((await jsonObject(rejected)).code, "QUOTE_EXPIRED_REQUOTE_REQUIRED");
      }
      assert.equal(createOrder.mock.callCount(), 0);
      assert.equal(session.mock.callCount(), 0);
      currentQuote = structuredClone(immutableQuote);
    });

    await t.test("session failure preserves durable intent and retry reuses the existing remote order", async () => {
      const failed = await post("initiate", confirmation, cookie);
      assert.equal(failed.status, 503);
      assert.equal((await jsonObject(failed)).noPaymentTaken, true);
      const [failedAttempt] = await db.select().from(commerceCheckoutAttemptsTable).where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
      assert.equal(failedAttempt.justiceSureOrderId, remoteOrder.id);
      assert.equal(failedAttempt.checkoutUrl, null);
      assert.equal(failedAttempt.lastErrorCode, "PROVIDER_UNAVAILABLE");
      assert.deepEqual(failedAttempt.paymentSessionRequestBody, session.mock.calls[0].arguments[0].body);
      failSession = false;
      const confirmed = await post("initiate", confirmation, cookie);
      assert.equal(confirmed.status, 200);
      assert.deepEqual(await confirmed.json(), { attemptId, checkoutUrl: "https://checkout.example.test/payment" });
      assert.equal(createOrder.mock.callCount(), 1);
      assert.deepEqual(session.mock.calls[1].arguments, session.mock.calls[0].arguments);
      const replay = await post("initiate", confirmation, cookie);
      assert.equal(replay.status, 200);
      assert.equal(createOrder.mock.callCount(), 1);
      assert.equal(session.mock.callCount(), 2);
    });

    await t.test("overlapping owned confirmations share durable intent and one recoverable session", { timeout: 15_000 }, async (concurrent) => {
      const concurrentQuoteId = crypto.randomUUID();
      const concurrentAttemptId = crypto.randomUUID();
      const concurrentPaymentAttemptId = crypto.randomUUID();
      const concurrentPaymentIntentId = crypto.randomUUID();
      const operationId = `concurrent-${crypto.randomUUID()}`;
      const concurrentPayload = { ...payload, checkoutOperationId: operationId, quoteId: concurrentQuoteId };
      const concurrentQuote = { ...structuredClone(immutableQuote), id: concurrentQuoteId };
      const concurrentOrder = { ...structuredClone(remoteOrder), id: crypto.randomUUID(), number: `JS-${operationId}` };
      const orderKey = `order_${operationId}_${concurrentQuoteId.slice(0, 8)}`;
      const paymentKey = `payment_${operationId}_${concurrentQuoteId.slice(0, 8)}`;
      const orderBody = { ...persisted.orderRequestBody as Record<string, unknown>, quoteId: concurrentQuoteId };
      const paymentBody = { provider: "paystack", email: payload.customer.email, redirectUrl: environment.SOSO_PAYMENT_RETURN_URL };
      const concurrentCookie = cookie.replace(persisted.id, concurrentAttemptId);
      await db.insert(commerceCheckoutAttemptsTable).values({
        ...persisted, id: concurrentAttemptId, quoteId: concurrentQuoteId,
        requestHash: checkoutRequestHash(concurrentPayload),
        quoteSnapshot: { ...persisted.quoteSnapshot as Record<string, unknown>, id: concurrentQuoteId },
        orderRequestBody: orderBody, orderIdempotencyKey: orderKey, paymentIdempotencyKey: paymentKey,
      });
      const orderEntered = providerGate();
      const releaseOrder = providerGate();
      const sessionEntered = providerGate();
      const releaseSession = providerGate();
      const secondConfirmationEntered = providerGate();
      const originalTransaction = checkoutInitiationLockDb.transaction.bind(checkoutInitiationLockDb);
      concurrent.mock.method(checkoutInitiationLockDb, "transaction", async (
        callback: Parameters<typeof checkoutInitiationLockDb.transaction>[0],
        config?: Parameters<typeof checkoutInitiationLockDb.transaction>[1],
      ) => {
        return originalTransaction(async (tx) => {
          const originalExecute = tx.execute.bind(tx);
          concurrent.mock.method(tx, "execute", async (query: Parameters<typeof tx.execute>[0]) => {
            const result = await originalExecute(query);
            if (result.rows[0]?.acquired === false) secondConfirmationEntered.resolve();
            return result;
          });
          return callback(tx);
        }, config);
      });
      concurrent.mock.method(client, "getPriceQuote", async () => structuredClone(concurrentQuote));
      const concurrentCreate = concurrent.mock.method(client, "createOrder", async (input: Parameters<typeof client.createOrder>[0]) => {
        assert.deepEqual(input, { body: orderBody, idempotencyKey: orderKey });
        orderEntered.resolve();
        await releaseOrder.promise;
        return { order: structuredClone(concurrentOrder), replayed: false };
      });
      const concurrentSession = concurrent.mock.method(client, "createPaymentSession", async (input: Parameters<typeof client.createPaymentSession>[0]) => {
        assert.deepEqual(input, { orderId: concurrentOrder.id, body: paymentBody, idempotencyKey: paymentKey });
        const [intent] = await db.select().from(commerceCheckoutAttemptsTable)
          .where(eq(commerceCheckoutAttemptsTable.id, concurrentAttemptId));
        assert.equal(intent.justiceSureOrderId, concurrentOrder.id);
        assert.deepEqual(intent.orderRequestBody, orderBody);
        assert.deepEqual(intent.paymentSessionRequestBody, paymentBody);
        assert.equal(intent.orderIdempotencyKey, orderKey);
        assert.equal(intent.paymentIdempotencyKey, paymentKey);
        const number = concurrentSession.mock.callCount();
        sessionEntered.resolve();
        await releaseSession.promise;
        // Deliberately different per call: a second provider call must not be
        // hidden by an unrealistically idempotent mock.
        return { provider: "paystack" as const, reference: `concurrent-reference-${number}`,
          attemptId: concurrentPaymentAttemptId, paymentIntentId: concurrentPaymentIntentId,
          checkoutUrl: `https://checkout.example.test/concurrent/${number}`, replayed: false };
      });
      const requests: Promise<Response>[] = [];
      try {
        requests.push(post("initiate", concurrentPayload, concurrentCookie));
        await waitForGate(orderEntered.promise);
        requests.push(post("initiate", concurrentPayload, concurrentCookie));
        // Confirm real overlap, not merely two fast sequential HTTP requests:
        // the second request must try the held lock while the first provider
        // promise is unresolved. Do not depend on arbitrary sleep durations.
        await waitForGate(secondConfirmationEntered.promise);
        assert.equal(concurrentCreate.mock.callCount(), 1);
        const [beforeOrder] = await db.select().from(commerceCheckoutAttemptsTable)
          .where(eq(commerceCheckoutAttemptsTable.id, concurrentAttemptId));
        assert.deepEqual(beforeOrder.orderRequestBody, orderBody);
        assert.equal(beforeOrder.justiceSureOrderId, null);
        releaseOrder.resolve();
        await waitForGate(sessionEntered.promise);
        assert.equal(concurrentSession.mock.callCount(), 1);
        releaseSession.resolve();
        const responses = await Promise.all(requests);
        for (const response of responses) {
          assert.equal(response.status, 200);
          assert.deepEqual(await response.json(), {
            attemptId: concurrentAttemptId, checkoutUrl: "https://checkout.example.test/concurrent/1",
          });
        }
        const [completed] = await db.select().from(commerceCheckoutAttemptsTable)
          .where(eq(commerceCheckoutAttemptsTable.id, concurrentAttemptId));
        assert.equal(completed.justiceSureOrderId, concurrentOrder.id);
        assert.equal(completed.justiceSurePaymentAttemptId, concurrentPaymentAttemptId);
        assert.equal(completed.justiceSurePaymentIntentId, concurrentPaymentIntentId);
        assert.equal(completed.paymentReference, "concurrent-reference-1");
        assert.deepEqual(completed.orderRequestBody, orderBody);
        assert.deepEqual(completed.paymentSessionRequestBody, paymentBody);
        assert.equal(completed.orderIdempotencyKey, orderKey);
        assert.equal(completed.paymentIdempotencyKey, paymentKey);
        assert.equal(completed.checkoutUrl, "https://checkout.example.test/concurrent/1");
        const projected = await db.select().from(ordersTable).where(eq(ordersTable.orderNumber, concurrentOrder.number!));
        assert.equal(projected.length, 1);
        assert.equal(projected[0].id, completed.localOrderId);
        assert.equal(projected[0].paymentReference, completed.paymentReference);
        const lines = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, completed.localOrderId!));
        assert.equal(lines.length, 1);
        assert.equal(lines[0].commerceProductId, productId);
        const replay = await post("initiate", concurrentPayload, concurrentCookie);
        assert.equal(replay.status, 200);
        assert.deepEqual(await replay.json(), { attemptId: concurrentAttemptId, checkoutUrl: completed.checkoutUrl });
        assert.equal((await post("initiate", concurrentPayload, `${concurrentCookie}forged`)).status, 403);
        assert.equal((await post("initiate", { ...concurrentPayload, notes: "Changed" }, concurrentCookie)).status, 409);
        assert.equal(concurrentCreate.mock.callCount(), 1);
        assert.equal(concurrentSession.mock.callCount(), 1);
      } finally {
        releaseOrder.resolve();
        releaseSession.resolve();
        await Promise.allSettled(requests);
      }
    });

    await t.test("distinct confirmations saturate lock capacity without starving durable checkout work", { timeout: 15_000 }, async (burst) => {
      assert.notEqual(checkoutInitiationLockPool, pool);
      const capacity = pool.options.max!;
      assert.ok(checkoutInitiationLockPool.options.max! >= capacity);
      const fixtures = Array.from({ length: capacity + 2 }, () => {
        const id = crypto.randomUUID();
        const quoteId = crypto.randomUUID();
        const operationId = `burst-${crypto.randomUUID()}`;
        const body = { ...payload, checkoutOperationId: operationId, quoteId };
        const remote = { ...structuredClone(remoteOrder), id: crypto.randomUUID(), number: `JS-${operationId}` };
        return {
          id, quoteId, body, remote, cookie: cookie.replace(persisted.id, id),
          paymentAttemptId: crypto.randomUUID(),
          orderKey: `order_${operationId}_${quoteId.slice(0, 8)}`,
          paymentKey: `payment_${operationId}_${quoteId.slice(0, 8)}`,
          checkoutUrl: `https://checkout.example.test/burst/${id}`,
        };
      });
      await db.insert(commerceCheckoutAttemptsTable).values(fixtures.map((fixture) => ({
        ...persisted, id: fixture.id, quoteId: fixture.quoteId,
        requestHash: checkoutRequestHash(fixture.body),
        quoteSnapshot: { ...persisted.quoteSnapshot as Record<string, unknown>, id: fixture.quoteId },
        orderRequestBody: { ...persisted.orderRequestBody as Record<string, unknown>, quoteId: fixture.quoteId },
        orderIdempotencyKey: fixture.orderKey, paymentIdempotencyKey: fixture.paymentKey,
      })));
      const saturated = providerGate();
      const releaseProviders = providerGate();
      let providerEntries = 0;
      burst.mock.method(client, "getPriceQuote", async (quoteId: string) => {
        assert.ok(fixtures.some((fixture) => fixture.quoteId === quoteId));
        return { ...structuredClone(immutableQuote), id: quoteId };
      });
      const create = burst.mock.method(client, "createOrder", async (input: Parameters<typeof client.createOrder>[0]) => {
        const fixture = fixtures.find(({ quoteId }) => quoteId === input.body.quoteId);
        assert.ok(fixture);
        assert.equal(input.idempotencyKey, fixture.orderKey);
        if (++providerEntries >= capacity) saturated.resolve();
        await releaseProviders.promise;
        return { order: structuredClone(fixture.remote), replayed: false };
      });
      const sessions = burst.mock.method(client, "createPaymentSession", async (input: Parameters<typeof client.createPaymentSession>[0]) => {
        const fixture = fixtures.find(({ remote }) => remote.id === input.orderId);
        assert.ok(fixture);
        assert.equal(input.idempotencyKey, fixture.paymentKey);
        assert.deepEqual(input.body, {
          provider: "paystack", email: payload.customer.email, redirectUrl: environment.SOSO_PAYMENT_RETURN_URL,
        });
        return { provider: "paystack" as const, reference: `burst-${fixture.id}`,
          attemptId: fixture.paymentAttemptId, checkoutUrl: fixture.checkoutUrl, replayed: false };
      });
      const requests = fixtures.map((fixture) => post("initiate", fixture.body, fixture.cookie));
      try {
        // At least as many distinct locks as the entire data-pool capacity are
        // held over unresolved provider calls. A shared lock/data pool deadlocks
        // before reaching this barrier; a separate pool keeps reads available.
        await waitForGate(saturated.promise);
        await waitForGate(db.execute(sql`select 1`).then(() => undefined));
        releaseProviders.resolve();
        const responses = await Promise.all(requests);
        for (const [index, response] of responses.entries()) {
          const fixture = fixtures[index];
          assert.equal(response.status, 200);
          assert.deepEqual(await response.json(), { attemptId: fixture.id, checkoutUrl: fixture.checkoutUrl });
        }
        const completed = await db.select().from(commerceCheckoutAttemptsTable)
          .where(inArray(commerceCheckoutAttemptsTable.id, fixtures.map(({ id }) => id)));
        assert.equal(completed.length, fixtures.length);
        assert.equal(new Set(completed.map(({ localOrderId }) => localOrderId)).size, fixtures.length);
        for (const attempt of completed) {
          const fixture = fixtures.find(({ id }) => id === attempt.id)!;
          assert.ok(attempt.localOrderId);
          assert.equal(attempt.justiceSureOrderId, fixture.remote.id);
          assert.equal(attempt.justiceSurePaymentAttemptId, fixture.paymentAttemptId);
          assert.equal(attempt.orderIdempotencyKey, fixture.orderKey);
          assert.equal(attempt.paymentIdempotencyKey, fixture.paymentKey);
          assert.equal(attempt.checkoutUrl, fixture.checkoutUrl);
        }
        const projections = await db.select().from(ordersTable)
          .where(inArray(ordersTable.orderNumber, fixtures.map(({ remote }) => remote.number!)));
        assert.equal(projections.length, fixtures.length);
        assert.equal(create.mock.callCount(), fixtures.length);
        assert.equal(sessions.mock.callCount(), fixtures.length);
      } finally {
        releaseProviders.resolve();
        await Promise.allSettled(requests);
      }
    });

    await t.test("owned status verifies and reconciles pending payments with a persisted cooldown", async () => {
      const status = () => fetch(`${base}/api/payment/status/${attemptId}`, { headers: { cookie } });
      const pending = await status();
      assert.equal(pending.status, 200);
      assert.equal((await jsonObject(pending)).status, "payment_pending");
      assert.equal(verify.mock.callCount(), 1);
      assert.equal(reconcile.mock.callCount(), 1);
      assert.equal((await status()).status, 200);
      assert.equal(verify.mock.callCount(), 1);
      const [pendingAttempt] = await db.select().from(commerceCheckoutAttemptsTable).where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
      assert.ok(pendingAttempt.paymentRecoveryCheckedAt);
      assert.equal(pendingAttempt.justiceSurePaymentAttemptId, remoteAttemptId);
      await db.update(commerceCheckoutAttemptsTable).set({ paymentRecoveryCheckedAt: new Date(0) }).where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
      remoteOrder = { ...remoteOrder, payment: { ...remoteOrder.payment, status: "paid" },
        amounts: { ...remoteOrder.amounts, paidKobo: 10000, outstandingKobo: 0 } };
      verify.mock.mockImplementation(async () => ({ attemptId: remoteAttemptId, status: "succeeded", paymentStatus: "paid" }));
      const paid = await status();
      assert.equal(paid.status, 200);
      assert.equal((await jsonObject(paid)).status, "paid");
      assert.equal(verify.mock.callCount(), 2);
      assert.equal(reconcile.mock.callCount(), 1);
      const [paidAttempt] = await db.select().from(commerceCheckoutAttemptsTable).where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
      assert.equal(paidAttempt.status, "paid");
      const [localOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, paidAttempt.localOrderId!));
      assert.equal(localOrder.status, "paid");
      assert.equal((await status()).status, 200);
      assert.equal(verify.mock.callCount(), 2);
    });

    await t.test("recovery failures never mark a pending local order as paid", async () => {
      remoteOrder.payment.status = "pending";
      remoteOrder.amounts.paidKobo = 0;
      remoteOrder.amounts.outstandingKobo = 10000;
      const [attempt] = await db.select().from(commerceCheckoutAttemptsTable).where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
      await db.update(ordersTable).set({ status: "payment_pending" }).where(eq(ordersTable.id, attempt.localOrderId!));
      await db.update(commerceCheckoutAttemptsTable).set({ status: "payment_pending", paymentRecoveryCheckedAt: new Date(0) })
        .where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
      verify.mock.mockImplementation(async () => { throw new JusticeSureRequestError("Mock verification failure", 503); });
      const failed = await fetch(`${base}/api/payment/status/${attemptId}`, { headers: { cookie } });
      assert.equal(failed.status, 503);
      const [failedAttempt] = await db.select().from(commerceCheckoutAttemptsTable).where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
      assert.equal(failedAttempt.status, "payment_pending");
      const [localOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, attempt.localOrderId!));
      assert.equal(localOrder.status, "payment_pending");
      assert.equal(reconcile.mock.callCount(), 1);
      assert.ok(failedAttempt.paymentRecoveryCheckedAt, "Failed provider reads must also retain the retry cooldown");
    });

    await t.test("invalid recovery IDs fail closed and simulated attempts never invoke live verification", async () => {
      const calls = verify.mock.callCount();
      await db.update(commerceCheckoutAttemptsTable).set({ justiceSurePaymentAttemptId: "not-a-uuid", paymentRecoveryCheckedAt: new Date(0) })
        .where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
      assert.equal((await fetch(`${base}/api/payment/status/${attemptId}`, { headers: { cookie } })).status, 502);
      assert.equal(verify.mock.callCount(), calls);
      await db.update(commerceCheckoutAttemptsTable).set({ provider: "simulated", justiceSurePaymentAttemptId: remoteAttemptId })
        .where(eq(commerceCheckoutAttemptsTable.id, attemptId!));
      const simulated = await fetch(`${base}/api/payment/status/${attemptId}`, { headers: { cookie } });
      assert.equal(simulated.status, 200);
      assert.equal((await jsonObject(simulated)).status, "payment_pending");
      assert.equal(verify.mock.callCount(), calls);
      assert.equal(reconcile.mock.callCount(), 1);
    });
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    // All fixture rows are removed by the isolated-schema runner, including
    // order projections and content; never touch a shared schema here.
  }
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