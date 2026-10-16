import assert from "node:assert/strict";
import test from "node:test";
import { JusticeSureCustomersClient, ShopperError } from "./justicesureCustomers";
import { type JusticeSureConfig } from "./justicesureCommerce";

const config: JusticeSureConfig = {
  baseUrl: "https://merchant.example/api/v1/commerce", apiKey: "jsk_test_synthetic",
  runtimeReady: false,
};
const customer = {
  id: "11111111-1111-4111-8111-111111111111", externalId: "soso:abc",
  name: "Synthetic Shopper", email: "synthetic@example.com", verifiedEmail: "synthetic@example.com", phone: null, address: null,
};

test("customer operations are independent of payment activation and use direct JSON", async () => {
  const saved = globalThis.fetch;
  const calls: { url: string; method: string; body: unknown }[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method ?? "GET", body: options?.body ? JSON.parse(String(options.body)) : undefined });
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.redirect, "error");
    return new Response(JSON.stringify({ customer }), { status: 200 });
  };
  try {
    const client = new JusticeSureCustomersClient(config);
    assert.equal(client.environment, "test");
    assert.equal((await client.link({ externalId: customer.externalId, email: customer.verifiedEmail, emailVerified: true, name: customer.name })).id, customer.id);
    await client.profile(customer.externalId);
    await client.update(customer.externalId, { name: customer.name, phone: null, address: null });
    assert.equal(calls[0].url, `${config.baseUrl}/customers/link`);
    assert.equal(calls[1].url, `${config.baseUrl}/customers/soso%3Aabc`);
    assert.deepEqual(calls[2].body, { name: customer.name, phone: null, address: null });
    assert.ok(!JSON.stringify(calls).includes("password"));
  } finally { globalThis.fetch = saved; }
});
test("provider permission/schema failures are actionable and do not leak upstream data", async () => {
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "sensitive upstream detail", code: "INSUFFICIENT_SCOPE" }), { status: 403 });
    await assert.rejects(new JusticeSureCustomersClient(config).profile("soso:abc"), (error: unknown) =>
      error instanceof ShopperError && error.status === 503 && error.code === "INSUFFICIENT_SCOPE" && !error.message.includes("sensitive"));
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { customer } }), { status: 200 });
    await assert.rejects(new JusticeSureCustomersClient(config).profile("soso:abc"), (error: unknown) =>
      error instanceof ShopperError && error.code === "INVALID_CUSTOMER_RESPONSE");
  } finally { globalThis.fetch = saved; }
});
