import assert from "node:assert/strict";
import test from "node:test";
import { marketingPixels } from "./marketing-pixels.ts";
import { checkVerifiedPurchase } from "./purchase-conversions.ts";

test("in-flight withdrawal, private navigation and refresh cannot replay purchase dispatch", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  const originalDestination = marketingPixels.hasPurchaseDestination;
  const originalDispatch = marketingPixels.dispatchVerifiedPurchase;
  const originalGeneration = marketingPixels.getPurchaseGeneration;
  let generation = 1;
  let consent: string | null = "marketing";
  let requestCount = 0;
  let sendCount = 0;
  const storage = new Map<string, string>();
  const scope = { location: { pathname: "/shop" },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } };
  Object.defineProperty(globalThis, "window", { configurable: true, value: scope });
  marketingPixels.hasPurchaseDestination = () => true;
  marketingPixels.getPurchaseGeneration = () => generation;
  marketingPixels.dispatchVerifiedPurchase = () => { sendCount += 1; };
  let resolveResponse!: (value: Response) => void;
  globalThis.fetch = async (_url, options) => {
    requestCount += 1;
    const body = JSON.parse(String(options?.body));
    assert.deepEqual(Object.keys(body).sort(), ["marketingConsent", "publicPath"]);
    return new Promise<Response>((resolve) => { resolveResponse = resolve; });
  };
  const receipt = { eventId: "4e7bc9b9-afdf-4d48-84ed-224b5a919860", value: 1234.56, currency: "NGN" };
  try {
    const withdrawn = checkVerifiedPurchase("/api", () => consent);
    consent = "essential_only";
    generation += 1;
    // Re-grant before the old response must not revive the earlier grant.
    consent = "marketing";
    resolveResponse(Response.json(receipt));
    await withdrawn;
    assert.equal(sendCount, 0);
    const navigated = checkVerifiedPurchase("/api", () => consent);
    scope.location.pathname = "/checkout/return";
    resolveResponse(Response.json(receipt));
    await navigated;
    assert.equal(sendCount, 0);
    await checkVerifiedPurchase("/api", () => consent);
    assert.equal(requestCount, 2);
    scope.location.pathname = "/shop";
    const paid = checkVerifiedPurchase("/api", () => consent);
    resolveResponse(Response.json(receipt));
    await paid;
    assert.equal(sendCount, 1);
    assert.equal(storage.get("soso-consented-purchaser-v1"), "1");
    const refresh = checkVerifiedPurchase("/api", () => consent);
    resolveResponse(new Response(null, { status: 204, headers: { "X-SOSO-Verified-Purchaser": "1" } }));
    await refresh;
    assert.equal(sendCount, 1);
    consent = "essential_only";
    await checkVerifiedPurchase("/api", () => consent);
    assert.equal(requestCount, 4);
  } finally {
    globalThis.fetch = originalFetch;
    marketingPixels.hasPurchaseDestination = originalDestination;
    marketingPixels.dispatchVerifiedPurchase = originalDispatch;
    marketingPixels.getPurchaseGeneration = originalGeneration;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
