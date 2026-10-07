import test from "node:test";
import assert from "node:assert/strict";
import { createRateLoader, convertDisplayPrices, MAX_RATE_AGE, parseRateSnapshot, suggestedCurrency } from "./display-prices";
import { DisplayPricesBody } from "@workspace/api-zod";

const now = Date.parse("2026-10-06T12:00:00Z");
const response = (extra = {}) => ({ result: "success", base_code: "NGN", time_last_update_unix: (now - 1000) / 1000,
  time_next_update_unix: (now + 86_400_000) / 1000, rates: { NGN: 1, USD: .001, GBP: .0008, EUR: .0009, JPY: .15, KWD: .0003, ZAR: .02 }, ...extra });

test("display rates must be valid NGN rates, current and bounded", () => {
  assert.equal(parseRateSnapshot(response(), now).rates.NGN, 1);
  for (const extra of [{ result: "error" }, { base_code: "USD" }, { time_last_update_unix: (now - MAX_RATE_AGE) / 1000 },
    { time_last_update_unix: (now + 600_000) / 1000 }, { rates: { NGN: 2, USD: .001 } }]) {
    assert.throws(() => parseRateSnapshot(response(extra), now));
  }
  assert.equal(parseRateSnapshot(response({ rates: { NGN: 1, USD: .001, EUR: Infinity } }), now).rates.EUR, undefined);
});

test("country detection is a suggestion with explicit NGN fallback, not browser language", () => {
  const codes = ["NGN", "GBP", "USD", "EUR", "ZAR"];
  assert.equal(suggestedCurrency("GB", codes), "GBP");
  assert.equal(suggestedCurrency("US", codes), "USD");
  assert.equal(suggestedCurrency("DE", codes), "EUR");
  assert.equal(suggestedCurrency("ZA", codes), "ZAR");
  assert.equal(suggestedCurrency(null, codes), "NGN");
  assert.equal(suggestedCurrency("JP", codes), "NGN");
});

test("local conversion rounds only display amounts, leaving the naira price unchanged", () => {
  const amounts = [265999, 3.25];
  const result = convertDisplayPrices(parseRateSnapshot(response(), now), "USD", "GB", amounts, now);
  assert.equal(result.currency, "USD");
  assert.equal(result.suggestedCurrency, "GBP");
  assert.equal(result.baseCurrency, "NGN");
  assert.equal(result.estimated, true);
  assert.equal(result.prices[0].amount, 266);
  assert.equal(result.prices[0].naira, 265999);
  assert.deepEqual(amounts, [265999, 3.25]);
  assert.ok(!("rates" in result));
  assert.equal(convertDisplayPrices(parseRateSnapshot(response(), now), "JPY", null, [100.5], now).prices[0].amount, 15);
  assert.equal(convertDisplayPrices(parseRateSnapshot(response(), now), "KWD", null, [100], now).prices[0].amount, .03);
});

test("missing, stale and unsupported rates safely fall back to naira", () => {
  const fresh = parseRateSnapshot(response(), now);
  for (const result of [convertDisplayPrices(null, "USD", "US", [265999], now),
    convertDisplayPrices(fresh, "USD", "US", [265999], now + MAX_RATE_AGE),
    convertDisplayPrices(fresh, "XYZ", "US", [265999], now)]) {
    assert.equal(result.currency, "NGN");
    assert.equal(result.estimated, false);
    assert.equal(result.prices[0].amount, 265999);
    assert.ok(result.unavailableReason);
  }
});

test("requests are bounded display numbers and never payment data", () => {
  assert.equal(DisplayPricesBody.safeParse({ currency: "USD", amounts: [0, 265999] }).success, true);
  for (const body of [{ currency: "usd", amounts: [1] }, { amounts: [-1] }, { amounts: [Infinity] },
    { amounts: [1_000_000_001] }, { amounts: Array(129).fill(1) }]) {
    assert.equal(DisplayPricesBody.safeParse(body).success, false);
  }
});

test("concurrent requests share a cached feed, while failures are retried with a delay", async () => {
  let time = now;
  let calls = 0;
  let fail = false;
  const fetcher = (async () => {
    calls++;
    if (fail) throw new Error("unavailable");
    return new Response(JSON.stringify(response()), { status: 200 });
  }) as typeof fetch;
  const load = createRateLoader(fetcher, () => time);
  const results = await Promise.all([load(), load(), load()]);
  assert.equal(calls, 1);
  assert.ok(results.every(Boolean));
  await load();
  assert.equal(calls, 1);
  fail = true;
  time += 86_400_001;
  assert.ok(await load()); // Still within the explicit 48-hour validity budget.
  assert.equal(calls, 2);
  await load();
  assert.equal(calls, 2);
  time += MAX_RATE_AGE;
  assert.equal(await load(), null);
});
