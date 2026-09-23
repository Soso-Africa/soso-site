import assert from "node:assert/strict";
import test from "node:test";
import {
  JusticeSureCommerceClient,
  JusticeSureConfigurationError,
  JusticeSureRequestError,
  isJusticeSureCommerceReady,
  isJusticeSureTestMode,
  justiceSureConfig,
} from "./justicesureCommerce";

const saved = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key];
  }
  Object.assign(process.env, saved);
}

test("JusticeSure activation requires the published runtime and every staged server secret", () => {
  try {
    delete process.env.JUSTICESURE_COMMERCE_RUNTIME_READY;
    delete process.env.JUSTICESURE_COMMERCE_API_BASE_URL;
    delete process.env.JUSTICESURE_COMMERCE_API_KEY;
    delete process.env.JUSTICESURE_COMMERCE_WEBHOOK_SECRET;
    delete process.env.SOSO_PAYMENT_RETURN_URL;
    assert.equal(isJusticeSureCommerceReady(), false);
    assert.throws(() => new JusticeSureCommerceClient(), JusticeSureConfigurationError);

    process.env.JUSTICESURE_COMMERCE_RUNTIME_READY = "true";
    process.env.JUSTICESURE_COMMERCE_API_BASE_URL = "https://justicesure.example/api/v1/commerce";
    process.env.JUSTICESURE_COMMERCE_API_KEY = "jsk_staging_test_key";
    process.env.JUSTICESURE_COMMERCE_WEBHOOK_SECRET = "staging-webhook-secret";
    process.env.SOSO_PAYMENT_RETURN_URL = "https://soso.example/checkout/return";
    assert.equal(isJusticeSureCommerceReady(), true);
    assert.equal(justiceSureConfig().baseUrl, "https://justicesure.example/api/v1/commerce");
  } finally {
    restoreEnv();
  }
});

test("JusticeSure activation rejects a non-HTTPS Commerce API configuration", () => {
  try {
    process.env.JUSTICESURE_COMMERCE_RUNTIME_READY = "true";
    process.env.JUSTICESURE_COMMERCE_API_BASE_URL = "http://justicesure.example/api/v1/commerce";
    process.env.JUSTICESURE_COMMERCE_API_KEY = "jsk_staging_test_key";
    process.env.JUSTICESURE_COMMERCE_WEBHOOK_SECRET = "staging-webhook-secret";
    process.env.SOSO_PAYMENT_RETURN_URL = "https://soso.example/checkout/return";
    assert.equal(isJusticeSureCommerceReady(), false);
  } finally {
    restoreEnv();
  }
});

test("Test credentials are development-only and never replace production credentials", () => {
  try {
    process.env.JUSTICESURE_COMMERCE_TEST_API_KEY = "jsk_test_development_key";
    process.env.JUSTICESURE_COMMERCE_TEST_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.JUSTICESURE_COMMERCE_API_KEY = "jsk_live_production_key";
    process.env.JUSTICESURE_COMMERCE_WEBHOOK_SECRET = "live-webhook-secret";

    process.env.NODE_ENV = "development";
    assert.equal(justiceSureConfig().apiKey, "jsk_test_development_key");
    assert.equal(justiceSureConfig().webhookSecret, "test-webhook-secret");
    assert.equal(isJusticeSureTestMode(), true);

    process.env.NODE_ENV = "production";
    assert.equal(justiceSureConfig().apiKey, "jsk_live_production_key");
    assert.equal(justiceSureConfig().webhookSecret, "live-webhook-secret");
    assert.equal(isJusticeSureTestMode(), false);
  } finally {
    restoreEnv();
  }
});

test("order and payment-session calls send the exact durable canonical JSON bodies", async () => {
  const originalFetch = globalThis.fetch;
  const captured: string[] = [];
  globalThis.fetch = async (_url, init) => {
    captured.push(String(init?.body));
    const isSession = String(_url).includes("payment-sessions");
    return new Response(JSON.stringify(isSession
      ? { data: { provider: "stripe", reference: "ref_1", checkoutUrl: "https://pay.example/session" } }
      : { data: {
        id: "0efebec6-2687-4d2f-9350-f67282534d30", number: "JS-1", status: "pending", currency: "NGN",
        amounts: { subtotalKobo: 100, discountKobo: 0, taxKobo: 0, deliveryKobo: 0, totalKobo: 100, paidKobo: 0, outstandingKobo: 100, refundedKobo: 0 },
        payment: { method: "card", status: "pending", reference: null },
        delivery: { fulfillmentType: "delivery", address: "1 Example Road", status: "pending", partner: null, trackingReference: null },
        fulfillment: { status: "pending" }, items: [],
      } }), { status: 200, headers: { "idempotency-replayed": "false", "content-type": "application/json" } });
  };
  try {
    const client = new JusticeSureCommerceClient({
      runtimeReady: true, baseUrl: "https://commerce.example", apiKey: "jsk_test_key_123",
      webhookSecret: "secret", paymentReturnUrl: "https://soso.example/return",
    });
    const orderBody = {
      customer: { name: "Ada", email: "ada@example.test", phone: "+2348000000000" },
      items: [{ productId: "0efebec6-2687-4d2f-9350-f67282534d30", variantId: "a725a2f5-5cdd-46e7-a36d-c0c5beef6a31", quantity: 1 }],
      fulfillment: { type: "delivery" as const, address: "1 Example Road" },
      paymentMethod: "stripe" as const, quoteId: "0efebec6-2687-4d2f-9350-f67282534d30", displayCurrency: "USD",
    };
    await client.createOrder({ body: orderBody, idempotencyKey: "order_test" });
    const sessionBody = { provider: "stripe" as const, email: "ada@example.test" };
    await client.createPaymentSession({ orderId: orderBody.quoteId, body: sessionBody, idempotencyKey: "session_test" });
    assert.equal(captured[0], JSON.stringify(orderBody));
    assert.equal(captured[1], JSON.stringify(sessionBody));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a created idempotent resource may omit replay metadata but a replay may not", async () => {
  const originalFetch = globalThis.fetch;
  const order = { data: {
    id: "0efebec6-2687-4d2f-9350-f67282534d30", number: "JS-1", status: "pending", currency: "NGN",
    amounts: { subtotalKobo: 100, discountKobo: 0, taxKobo: 0, deliveryKobo: 0, totalKobo: 100, paidKobo: 0, outstandingKobo: 100, refundedKobo: 0 },
    payment: { method: "card", status: "pending", reference: null },
    delivery: { fulfillmentType: "pickup", address: null, status: "pending", partner: null, trackingReference: null },
    fulfillment: { status: "pending" }, items: [],
  } };
  const client = new JusticeSureCommerceClient({
    runtimeReady: true, baseUrl: "https://commerce.example", apiKey: "jsk_test_key_123",
    webhookSecret: "secret", paymentReturnUrl: "https://soso.example/return",
  });
  try {
    globalThis.fetch = async () => new Response(JSON.stringify(order), { status: 201, headers: { "content-type": "application/json" } });
    assert.equal((await client.createOrder({
      body: {
        customer: { name: "Ada", email: "ada@example.test" },
        items: [{ productId: "0efebec6-2687-4d2f-9350-f67282534d30", quantity: 1 }],
        fulfillment: { type: "pickup", locationId: "a725a2f5-5cdd-46e7-a36d-c0c5beef6a31" },
        paymentMethod: "paystack", quoteId: "618626e6-f359-4167-853c-2370df34c686", displayCurrency: "NGN",
      },
      idempotencyKey: "order_created",
    })).replayed, false);
    globalThis.fetch = async () => new Response(JSON.stringify(order), { status: 200, headers: { "content-type": "application/json" } });
    await assert.rejects(() => client.createOrder({
      body: {
        customer: { name: "Ada", email: "ada@example.test" },
        items: [{ productId: "0efebec6-2687-4d2f-9350-f67282534d30", quantity: 1 }],
        fulfillment: { type: "pickup", locationId: "a725a2f5-5cdd-46e7-a36d-c0c5beef6a31" },
        paymentMethod: "paystack", quoteId: "618626e6-f359-4167-853c-2370df34c686", displayCurrency: "NGN",
      },
      idempotencyKey: "order_replay",
    }), JusticeSureRequestError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retrieved quote fixture uses the v3.3 QuoteLine inventoryItemId schema", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: {
    id: "0efebec6-2687-4d2f-9350-f67282534d30", expiresAt: "2030-01-01T00:00:00.000Z",
    currency: "NGN", displayCurrency: "USD", chargeCurrency: "USD", settlementCurrency: "NGN",
    amounts: { subtotalMinor: "100", discountMinor: "0", taxMinor: "0", shippingMinor: "0", insuranceMinor: "0", dutyMinor: "0", brokerageMinor: "0", roundingMinor: "0", totalMinor: "100" },
    fxSnapshotId: null,
    lines: [{ inventoryItemId: "0efebec6-2687-4d2f-9350-f67282534d30", name: "Suit", quantity: 1, unitPrice: 1, unitPriceKobo: "100" }],
    fulfillment: { type: "delivery", locationId: null, address: "1 Example Road", destinationCountry: "NG", shippingAddress: null },
  } }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const client = new JusticeSureCommerceClient({
      runtimeReady: true, baseUrl: "https://commerce.example", apiKey: "jsk_test_key_123",
      webhookSecret: "secret", paymentReturnUrl: "https://soso.example/return",
    });
    const quote = await client.getPriceQuote("0efebec6-2687-4d2f-9350-f67282534d30");
    assert.equal(quote.lines?.[0]?.inventoryItemId, "0efebec6-2687-4d2f-9350-f67282534d30");
    assert.equal(quote.lines?.[0]?.variantId, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Test payment sessions retain the simulated provider and JusticeSure attempt ID", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: {
      provider: "simulated",
      reference: "sim_0efebec6-2687-4d2f-9350-f67282534d30",
      checkoutUrl: "https://justicesure.ai/business/headless-commerce?environment=test&attempt=0efebec6-2687-4d2f-9350-f67282534d30",
      paymentIntentId: "a725a2f5-5cdd-46e7-a36d-c0c5beef6a31",
      attemptId: "0efebec6-2687-4d2f-9350-f67282534d30",
      originalCharge: { status: "known" },
      simulated: true,
      environment: "test",
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const client = new JusticeSureCommerceClient({
      runtimeReady: true, baseUrl: "https://commerce.example", apiKey: "jsk_test_key_123",
      webhookSecret: "secret", paymentReturnUrl: "https://soso.example/return",
    });
    const session = await client.createPaymentSession({
      orderId: "0efebec6-2687-4d2f-9350-f67282534d30",
      body: { provider: "paystack", email: "ada@example.test" },
      idempotencyKey: "session_test",
    });
    assert.equal(session.provider, "simulated");
    assert.equal(session.attemptId, "0efebec6-2687-4d2f-9350-f67282534d30");
    assert.equal(session.paymentIntentId, "a725a2f5-5cdd-46e7-a36d-c0c5beef6a31");
    assert.deepEqual(session.originalCharge, { status: "known" });
    assert.equal(session.replayed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Test payment discovery accepts paystack readiness with simulated test markers", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: {
    providers: [{ provider: "paystack", eligible: true, methods: ["card"], chargeCurrencies: ["NGN"],
      settlementCurrencies: ["NGN"], reasonCode: null, simulated: true, environment: "test" }],
    country: "NG", currency: "NGN",
  } }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const client = new JusticeSureCommerceClient({
      runtimeReady: true, baseUrl: "https://commerce.example", apiKey: "jsk_test_key_123",
      webhookSecret: "secret", paymentReturnUrl: "https://soso.example/return",
    });
    const readiness = await client.listPaymentMethods("NG", "NGN");
    assert.equal(readiness.providers[0]?.provider, "paystack");
    assert.equal(readiness.providers[0]?.eligible, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("payment recovery rejects a response for a different remote attempt", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: {
    attemptId: "a725a2f5-5cdd-46e7-a36d-c0c5beef6a31", status: "pending", paymentStatus: "pending",
  } }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const client = new JusticeSureCommerceClient({
      runtimeReady: true, baseUrl: "https://commerce.example", apiKey: "jsk_test_key_123",
      webhookSecret: "secret", paymentReturnUrl: "https://soso.example/return",
    });
    await assert.rejects(
      () => client.verifyPaymentAttempt("0efebec6-2687-4d2f-9350-f67282534d30", "0efebec6-2687-4d2f-9350-f67282534d30"),
      (error: unknown) => error instanceof JusticeSureRequestError && error.status === 502,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("JusticeSure nested error envelopes retain safe code and request ID", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: "PROVIDER_APPROVAL_REQUIRED", message: "The payment route is not ready." },
    requestId: "req_test_123",
  }), { status: 422, headers: { "content-type": "application/json" } });
  try {
    const client = new JusticeSureCommerceClient({
      runtimeReady: true, baseUrl: "https://commerce.example", apiKey: "jsk_test_key_123",
      webhookSecret: "secret", paymentReturnUrl: "https://soso.example/return",
    });
    await assert.rejects(
      () => client.listProducts(),
      (error: unknown) => error instanceof JusticeSureRequestError
        && error.code === "PROVIDER_APPROVAL_REQUIRED"
        && error.requestId === "req_test_123"
        && error.message === "The payment route is not ready.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogue reads every page and projects current variant attributes, price, and stock", async () => {
  const originalFetch = globalThis.fetch;
  const productId = "0efebec6-2687-4d2f-9350-f67282534d30";
  const variantId = "a725a2f5-5cdd-46e7-a36d-c0c5beef6a31";
  const requests: string[] = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    const secondPage = String(url).includes("offset=1");
    return new Response(JSON.stringify({
      data: secondPage ? [{
        id: productId,
        name: "Two-piece",
        description: null,
        images: [],
        price: { amountKobo: 15_000_000 },
        availability: { inStock: true },
        variants: [{
          id: variantId,
          name: "Size S",
          attributes: { size: "S", limited: true },
          price: { amountKobo: 15_500_000 },
          availability: { inStock: false },
        }],
      }] : [{
        id: "618626e6-f359-4167-853c-2370df34c686",
        name: "Variantless product",
        description: null,
        images: [],
        price: { amountKobo: 10_000 },
        availability: { inStock: true },
        variants: [],
      }],
      meta: { limit: 100, offset: secondPage ? 1 : 0, total: 2, hasMore: !secondPage },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const client = new JusticeSureCommerceClient({
      runtimeReady: true, baseUrl: "https://commerce.example", apiKey: "jsk_test_key_123",
      webhookSecret: "secret", paymentReturnUrl: "https://soso.example/return",
    });
    const products = await client.listProducts();
    assert.equal(products.length, 2);
    assert.deepEqual(products[1]?.variants[0], {
      id: variantId,
      name: "Size S",
      label: "S",
      attributes: { size: "S", limited: true },
      amountKobo: 15_500_000,
      inStock: false,
    });
    assert.deepEqual(requests, [
      "https://commerce.example/products?limit=100&offset=0",
      "https://commerce.example/products?limit=100&offset=1",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("production payment sessions reject malformed optional attempt IDs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: { provider: "stripe", reference: "ref_1", checkoutUrl: "https://pay.example/session", attemptId: "not-a-uuid" },
  }), { status: 200, headers: { "idempotency-replayed": "false", "content-type": "application/json" } });
  try {
    const client = new JusticeSureCommerceClient({
      runtimeReady: true, baseUrl: "https://commerce.example", apiKey: "jsk_test_key_123",
      webhookSecret: "secret", paymentReturnUrl: "https://soso.example/return",
    });
    await assert.rejects(() => client.createPaymentSession({
      orderId: "0efebec6-2687-4d2f-9350-f67282534d30",
      body: { provider: "stripe" },
      idempotencyKey: "session_test",
    }), JusticeSureRequestError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});