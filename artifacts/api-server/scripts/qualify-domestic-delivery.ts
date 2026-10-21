/**
 * Non-charging delivery qualification. Explicit Test credential only.
 * The transport allow-list makes orders, sessions and policy writes impossible.
 * Tokens remain in memory; reports contain only safe quote facts/error codes.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  JusticeSureCommerceClient, JusticeSureRequestError, justiceSureConfig,
  type JusticeSureLineItem,
} from "../src/lib/justicesureCommerce";

const config = justiceSureConfig();
if (process.env.NODE_ENV === "production" || !config.apiKey?.startsWith("jsk_test_")
  || config.baseUrl !== "https://justicesure.ai/api/v1/commerce") {
  throw new Error("Requires the configured JusticeSure Test environment; no Live fallback.");
}
const watchPolicy = process.argv.includes("--watch-policy");
const reportPath = fileURLToPath(new URL(watchPolicy
  ? "../../../generated-artifacts/delivery-policy-qualification.json"
  : "../../../generated-artifacts/delivery-qualification.json", import.meta.url));
type Fact = Record<string, unknown>;
const report: Fact = { environment: "Test", startedAt: new Date().toISOString(), operations: [], checks: [] };
const operations = report.operations as Fact[];
const checks = report.checks as Fact[];
const originalFetch = globalThis.fetch;
let deliveryTtlSeconds = 0;
let currentStep = "discovery";
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  const path = url.pathname.replace("/api/v1/commerce", "");
  const method = (init?.method ?? "GET").toUpperCase();
  const allowed = method === "GET"
    ? ["/store", "/products", "/payment-methods"].includes(path) || /^\/price-quotes\/[0-9a-f-]+$/.test(path)
    : method === "POST" && ["/delivery-quotes", "/price-quotes"].includes(path);
  if (url.origin !== new URL(config.baseUrl!).origin || !url.pathname.startsWith("/api/v1/commerce/") || !allowed) {
    throw new Error("Qualification transport blocked a non-quote operation.");
  }
  const response = await originalFetch(input, init);
  const body = await response.clone().json().catch(() => ({}));
  operations.push({ step: currentStep, method, path, status: response.status,
    code: body?.error?.code ?? body?.code ?? null, at: new Date().toISOString() });
  if (path === "/delivery-quotes" && response.ok) {
    deliveryTtlSeconds = Number(body.data?.expiresInSeconds ?? 0);
  }
  return response;
};
const client = new JusticeSureCommerceClient(config);
async function save() {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
}
async function check(name: string, run: () => Promise<unknown>) {
  currentStep = name;
  try {
    const detail = await run();
    checks.push({ name, result: "passed", ...(detail ? { detail } : {}) });
    console.log(JSON.stringify({ step: name, result: "passed", detail }));
  } catch (error) {
    const detail = error instanceof JusticeSureRequestError
      ? { status: error.status, code: error.code ?? null }
      : { assertion: error instanceof assert.AssertionError ? error.message : "Qualification check failed" };
    checks.push({ name, result: "failed", detail });
    console.log(JSON.stringify({ step: name, result: "failed", detail }));
  }
  await save();
}
async function storePolicy() {
  const response = await fetch(`${config.baseUrl}/store`, {
    headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  return body.data.fulfillment.domesticDelivery as Record<string, unknown>;
}
async function rejects(run: () => Promise<unknown>) {
  try { await run(); } catch (error) {
    assert.ok(error instanceof JusticeSureRequestError);
    // An outage is not evidence of input rejection.
    assert.ok([400, 403, 409, 410, 422].includes(error.status));
    return { status: error.status, code: error.code ?? null };
  }
  assert.fail("JusticeSure accepted input that was expected to be rejected.");
}
function price(items: JusticeSureLineItem[], address: string, token?: string, country = "NG") {
  return client.createPriceQuote({
    items, fulfillment: { type: "delivery", destinationCountry: country, address,
      ...(token ? { deliveryQuoteToken: token } : {}) },
    displayCurrency: "NGN", provider: "paystack", paymentMethod: "card",
  });
}
async function completeQuote(items: JusticeSureLineItem[], address: string) {
  const delivery = await client.createDomesticDeliveryQuote({ items, address });
  const created = await price(items, address, delivery.quoteToken);
  assert.equal(created.amounts.shippingMinor, String(delivery.feeKobo));
  const retrieved = await client.getPriceQuote(created.id);
  assert.deepEqual(retrieved.amounts, created.amounts);
  assert.equal(retrieved.expiresAt, created.expiresAt);
  assert.equal(retrieved.fulfillment?.address, address);
  assert.equal(retrieved.fulfillment?.destinationCountry, "NG");
  assert.deepEqual(retrieved.lines?.map((line) => ({
    productId: line.inventoryItemId, quantity: line.quantity,
    ...(line.variantId ? { variantId: line.variantId } : {}),
  })), items);
  const a = retrieved.amounts;
  const componentTotal = BigInt(a.subtotalMinor) - BigInt(a.discountMinor) + BigInt(a.taxMinor)
    + BigInt(a.shippingMinor) + BigInt(a.insuranceMinor) + BigInt(a.dutyMinor)
    + BigInt(a.brokerageMinor) + BigInt(a.roundingMinor);
  assert.equal(componentTotal.toString(), a.totalMinor);
  assert.equal(created.currency, "NGN");
  assert.equal(created.chargeCurrency, "NGN");
  assert.equal(created.settlementCurrency, "NGN");
  return { delivery, created, safe: { quoteId: created.id, expiresAt: created.expiresAt,
    feeKobo: delivery.feeKobo, amounts: a } };
}

try {
  const policy = await storePolicy();
  report.policyBefore = policy;
  assert.equal(policy.intended, true);
  assert.equal(policy.ready, true);
  assert.equal(policy.country, "NG");
  assert.equal(policy.coverage, "nigeria_wide");
  assert.equal(policy.maxRadiusKm, null);
  const methods = await client.listPaymentMethods("NG", "NGN");
  assert.ok(methods.providers.some((p) => p.provider === "paystack" && p.eligible && p.methods.includes("card")));
  const products = await client.listProducts();
  const product = products.find((p) => p.inStock && p.variants.length === 0);
  assert.ok(product, "An actual in-stock Test product is required.");
  const items: JusticeSureLineItem[] = [{ productId: product.id, quantity: 1 }];
  const address = "1 Broad Street, Lagos Island, Lagos, Nigeria";
  currentStep = "baseline";
  const baseline = await completeQuote(items, address);
  const baselineCreatedAt = Date.now();
  const baselineTtl = deliveryTtlSeconds;
  report.baseline = baseline.safe;
  report.deliveryTokenTtlSeconds = baselineTtl;
  await check("baseline-fee-equals-immutable-shipping-and-total", async () => baseline.safe);
  const token = baseline.delivery.quoteToken;
  if (watchPolicy) {
    assert.ok(baselineTtl > 60 && baselineTtl <= 1_800);
    console.log(JSON.stringify({ step: "waiting-for-merchant-test-policy-change",
      pricing: policy.pricing, until: new Date(baselineCreatedAt + Math.min(480, baselineTtl - 30) * 1_000).toISOString() }));
    await check("merchant-policy-edit-invalidates-unexpired-token", async () => {
      const deadline = baselineCreatedAt + Math.min(480, baselineTtl - 30) * 1_000;
      let after = policy;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        after = await storePolicy();
        if (after.pricing !== policy.pricing) break;
      }
      report.policyAfter = after;
      assert.notEqual(after.pricing, policy.pricing, "No merchant pricing-policy change observed before the bounded deadline.");
      assert.equal(after.ready, true);
      assert.equal(after.pricing, "distance");
      assert.ok(Date.now() < baselineCreatedAt + baselineTtl * 1_000, "Token must not be expired at the policy-edit probe.");
      return rejects(() => price(items, address, token));
    });
    if (checks.some((c) => c.name === "merchant-policy-edit-invalidates-unexpired-token" && c.result === "passed")) {
      await check("fresh-quote-uses-merchant-edited-policy", async () => (await completeQuote(items, address)).safe);
    }
  } else {
  await check("changed-address-rejected", () => rejects(() => price(items, "1 Marina Road, Lagos Island, Lagos, Nigeria", token)));
  await check("changed-quantity-rejected", () => rejects(() => price([{ ...items[0], quantity: 2 }], address, token)));
  const other = products.find((p) => p.id !== product.id && p.inStock && p.variants.length === 0);
  if (other) {
    await check("changed-product-rejected", () => rejects(() => price([{ productId: other.id, quantity: 1 }], address, token)));
  }
  const variantProduct = products.find((p) => p.variants.filter((v) => v.inStock).length >= 2);
  if (variantProduct) {
    const variants = variantProduct.variants.filter((v) => v.inStock);
    const variantItems = [{ productId: variantProduct.id, variantId: variants[0].id, quantity: 1 }];
    await check("changed-variant-rejected", async () => {
      const delivery = await client.createDomesticDeliveryQuote({ items: variantItems, address });
      return rejects(() => price([{ ...variantItems[0], variantId: variants[1].id }], address, delivery.quoteToken));
    });
  }
  await check("tampered-token-rejected", () => rejects(() => price(items, address, `${token.slice(0, 10)}X${token.slice(11)}`)));
  await check("missing-token-rejected", () => rejects(() => price(items, address)));
  await check("foreign-country-price-quote-rejected", () => rejects(() => price(items, address, token, "GB")));
  await check("empty-delivery-address-rejected", () => rejects(() => client.createDomesticDeliveryQuote({ items, address: "" })));
  await check("foreign-delivery-address-rejected", () => rejects(() => client.createDomesticDeliveryQuote({ items, address: "10 Downing Street, London SW1A 2AA, United Kingdom" })));
  await check("fresh-changed-cart-and-address", async () => (await completeQuote(
    [{ ...items[0], quantity: 2 }], "1 Marina Road, Lagos Island, Lagos, Nigeria",
  )).safe);
  for (const [label, destination] of [
    ["FCT", "1 Gimbiya Street, Garki, Abuja, FCT, Nigeria"],
    ["Kano", "1 Murtala Mohammed Way, Kano, Kano State, Nigeria"],
    ["Borno", "1 Shehu Laminu Way, Maiduguri, Borno State, Nigeria"],
    ["Sokoto", "1 Ahmadu Bello Way, Sokoto, Sokoto State, Nigeria"],
    ["Cross River", "1 Marian Road, Calabar, Cross River State, Nigeria"],
    ["Rivers", "1 Aba Road, Port Harcourt, Rivers State, Nigeria"],
  ]) {
    await check(`nationwide-no-radius-${label}`, async () => (await completeQuote(items, destination)).safe);
  }
  report.policyAfter = await storePolicy();
  report.limitations = [
    "No Live writes, orders, sessions or charges. No SOSO database writes or browser checkout journey.",
    "Actual merchant policy changes require merchant action; no policy was overridden.",
    "Flat Test pricing does not qualify Live distance computation or rates.",
    "Representative remote addresses do not prove all addresses in all 36 states and FCT.",
  ];
  await save();
  if (process.argv.includes("--wait-expiry")) {
    assert.ok(baselineTtl > 0 && baselineTtl <= 1_800, "Delivery expiry must be bounded to 30 minutes.");
    const waitUntil = Math.max(baselineCreatedAt + baselineTtl * 1_000, Date.parse(baseline.created.expiresAt)) + 2_000;
    console.log(JSON.stringify({ step: "waiting-for-real-expiration", until: new Date(waitUntil).toISOString() }));
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, waitUntil - Date.now())));
    await check("real-expired-delivery-token-rejected", () => rejects(() => price(items, address, token)));
    await check("real-expired-price-quote-rejected", () => rejects(() => client.getPriceQuote(baseline.created.id)));
    await check("fresh-quote-after-expiration", async () => (await completeQuote(items, address)).safe);
  } else {
    checks.push({ name: "real-expiration", result: "not-run", reason: "Use --wait-expiry for elapsed-time checks." });
  }
  }
  report.finishedAt = new Date().toISOString();
  await save();
  if (checks.some((c) => c.result === "failed")) process.exitCode = 1;
} catch (error) {
  report.fatal = error instanceof JusticeSureRequestError
    ? { status: error.status, code: error.code ?? null }
    : { message: error instanceof assert.AssertionError ? error.message : "Qualification prerequisite failed" };
  await save();
  console.log(JSON.stringify({ result: "blocked", detail: report.fatal }));
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
}
