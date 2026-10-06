import assert from "node:assert/strict";
import test from "node:test";
import { MarketingPixelRuntime } from "./marketing-pixels.ts";
import { mapMarketingEvent, purchaseReceipt, type MarketingProvider, type MarketingPixelConfig } from "./marketing-pixel-types.ts";

const receipt = { eventId: "4e7bc9b9-afdf-4d48-84ed-224b5a919860", value: 1234.56, currency: "NGN" };
const config: MarketingPixelConfig = {
  schemaVersion: 1, revision: 1,
  providers: { meta: { pixelId: "123456789" }, googleAds: null, x: null, tiktok: null },
};

test("purchase is a separate allow-listed boundary and never an intent event", () => {
  assert.equal(mapMarketingEvent("purchase", receipt), null);
  assert.equal(mapMarketingEvent("payment_clicked", receipt), null);
  assert.deepEqual(purchaseReceipt({ ...receipt, email: "private", orderId: "secret" }), receipt);
  assert.equal(purchaseReceipt({ ...receipt, value: 0 }), null);
  assert.equal(purchaseReceipt({ ...receipt, currency: "USD" }), null);
});

test("verified receipt dispatch is deduplicated, consent-gated, public-only and suppresses later intent", () => {
  const purchases: unknown[] = [];
  const intents: string[] = [];
  const provider: MarketingProvider = {
    name: "meta", activate() {}, resume() {}, revoke() {},
    send(event) { intents.push(event.name); },
    purchase(value) { purchases.push(value); },
  };
  const runtime = new MarketingPixelRuntime([provider]);
  runtime.configure(config);
  runtime.dispatchVerifiedPurchase(receipt);
  assert.equal(purchases.length, 0);
  runtime.setContext(true, "/shop");
  runtime.dispatchVerifiedPurchase(receipt);
  runtime.dispatchVerifiedPurchase(receipt);
  assert.equal(purchases.length, 1);
  runtime.track("checkout_started");
  runtime.track("product_view");
  assert.equal(intents.includes("checkout_started"), false);
  assert.equal(intents.includes("product_view"), false);
  runtime.setContext(true, "/payment-return");
  runtime.dispatchVerifiedPurchase({ ...receipt, eventId: "b5e9b4e8-0d8e-4d18-bb9f-23ae2dcdf029" });
  assert.equal(purchases.length, 1);
  runtime.setContext(false, "/shop");
  runtime.dispatchVerifiedPurchase({ ...receipt, eventId: "b5e9b4e8-0d8e-4d18-bb9f-23ae2dcdf029" });
  assert.equal(purchases.length, 1);
});

test("changing a conversion destination requires a fresh page context", () => {
  const provider: MarketingProvider = { name: "googleAds", activate() {}, resume() {}, revoke() {}, send() {}, purchase() {} };
  const runtime = new MarketingPixelRuntime([provider]);
  runtime.setContext(true, "/shop");
  runtime.configure({ ...config, providers: { ...config.providers, meta: null, googleAds: { pixelId: "AW-123456", conversionLabel: "first" } } });
  assert.equal(runtime.hasPurchaseDestination(), true);
  runtime.configure({ ...config, providers: { ...config.providers, meta: null, googleAds: { pixelId: "AW-123456", conversionLabel: "second" } } });
  assert.equal(runtime.hasPurchaseDestination(), false);
});
