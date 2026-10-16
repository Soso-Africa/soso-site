import { test } from "node:test";
import assert from "node:assert/strict";
import { JusticeSureCommerceClient, JusticeSureRequestError } from "./justicesureCommerce";
import { deliveryQuoteMatches } from "./domestic-fulfillment";

test("domestic delivery uses the provider token and authoritative integer fee, never local shipping arithmetic", async () => {
  const original = globalThis.fetch;
  const client = new JusticeSureCommerceClient({
    baseUrl: "https://justicesure.ai/api/v1/commerce",
    apiKey: "jsk_test_fixture_only_not_a_credential",
    webhookSecret: "fixture-only", paymentReturnUrl: "https://soso.example.test/checkout/return", runtimeReady: true,
  });
  try {
    const address = "Test Street, Test City, Test State, Nigeria";
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://justicesure.ai/api/v1/commerce/delivery-quotes");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), { items: [{ productId: "fixture", quantity: 1 }], address });
      return new Response(JSON.stringify({ data: { quoteToken: "fixture-signed-delivery-token", feeKobo: 150000, cartSubtotalKobo: 250000 } }));
    };
    assert.deepEqual(await client.createDomesticDeliveryQuote({ items: [{ productId: "fixture", quantity: 1 }], address }), {
      quoteToken: "fixture-signed-delivery-token", feeKobo: 150000,
    });
    const expected = { type: "delivery" as const, destinationCountry: "NG", address, deliveryQuoteToken: "fixture-signed-delivery-token" };
    assert.equal(deliveryQuoteMatches({ destinationCountry: "NG", address, shippingAddress: null }, expected), true);
    assert.equal(deliveryQuoteMatches({ destinationCountry: "NG", address: "Changed address" }, expected), false);
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { quoteToken: "fixture-signed-delivery-token", feeKobo: 0.5, cartSubtotalKobo: 250000 } }));
    await assert.rejects(client.createDomesticDeliveryQuote({ items: [], address }), JusticeSureRequestError);
  } finally { globalThis.fetch = original; }
});
