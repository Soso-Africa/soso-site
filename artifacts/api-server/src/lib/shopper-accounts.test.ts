import assert from "node:assert/strict";
import { test } from "node:test";
import { GetShopperProfileResponse, LinkShopperProfileResponse, CreateShopperMeasurementBody } from "@workspace/api-zod";
import { assertCustomerIdentity, customerPath, customerRequest, externalSubject, ShopperError } from "./shopper-accounts";

const identity = { externalId: "soso:clerk:user_fixture", email: "shopper@example.test", name: "Test Shopper" };
const customer = { id: "fixture", ...identity, verifiedEmail: identity.email, phone: null, address: null };

test("external identities are immutable auth subjects, never email aliases", () => {
  assert.equal(externalSubject("user_fixture"), identity.externalId);
  assert.throws(() => externalSubject("shopper@example.test"), ShopperError);
  assert.throws(() => externalSubject("../user_fixture"), ShopperError);
  assert.equal(customerPath(identity.externalId), "/customers/soso%3Aclerk%3Auser_fixture");
});

test("a mismatched provider subject or email cannot silently merge an account", () => {
  assert.doesNotThrow(() => assertCustomerIdentity(customer, identity));
  assert.throws(() => assertCustomerIdentity({ ...customer, externalId: "different" }, identity), ShopperError);
  assert.throws(() => assertCustomerIdentity({ ...customer, verifiedEmail: "other@example.test" }, identity), ShopperError);
});

test("customer response validation accepts direct objects, not legacy envelopes", () => {
  assert.equal(GetShopperProfileResponse.safeParse({ customer, capabilities: { measurements: true } }).success, true);
  assert.equal(GetShopperProfileResponse.safeParse({ data: { customer } }).success, false);
});

test("measurement input is bounded and cannot carry a browser-owned customer identity", () => {
  const input = { name: "Fit", unit: "cm", entries: [{ field: "Chest", label: "Chest", value: "90" }] };
  assert.equal(CreateShopperMeasurementBody.strict().safeParse(input).success, true);
  assert.equal(CreateShopperMeasurementBody.strict().safeParse({ ...input, externalId: "other" }).success, false);
  assert.equal(CreateShopperMeasurementBody.safeParse({ ...input, entries: [] }).success, false);
});

test("customer adapter preserves direct customer payloads and handles scope failures safely", async () => {
  const originalFetch = globalThis.fetch;
  const saved = {
    base: process.env.JUSTICESURE_COMMERCE_API_BASE_URL,
    key: process.env.JUSTICESURE_COMMERCE_TEST_API_KEY,
    mode: process.env.NODE_ENV,
  };
  process.env.NODE_ENV = "test";
  process.env.JUSTICESURE_COMMERCE_API_BASE_URL = "https://justicesure.ai/api/v1/commerce";
  process.env.JUSTICESURE_COMMERCE_TEST_API_KEY = "jsk_test_fixture_only_not_a_credential";
  try {
    let sent: Record<string, unknown> | undefined;
    globalThis.fetch = async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ customer }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    await customerRequest("/customers/link", LinkShopperProfileResponse, "POST", {
      name: identity.name, externalId: identity.externalId, email: identity.email,
      emailVerified: true, address: null,
    });
    assert.equal(sent?.externalId, identity.externalId);
    assert.equal(sent?.email, identity.email);
    assert.equal(sent?.emailVerified, true);
    assert.equal(sent?.address, null);
    assert.equal(sent?.password, undefined);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: "INSUFFICIENT_SCOPE", message: "Private provider details" } }), { status: 403 });
    await assert.rejects(
      customerRequest(customerPath(identity.externalId), GetShopperProfileResponse),
      (error: unknown) => error instanceof ShopperError && error.status === 503 && !error.message.includes("Private provider"),
    );
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { customer } }), { status: 200 });
    await assert.rejects(customerRequest(customerPath(identity.externalId), GetShopperProfileResponse), ShopperError);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      JUSTICESURE_COMMERCE_API_BASE_URL: saved.base,
      JUSTICESURE_COMMERCE_TEST_API_KEY: saved.key, NODE_ENV: saved.mode,
    })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
