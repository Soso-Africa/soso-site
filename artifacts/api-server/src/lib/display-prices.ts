import countryCurrencies from "./display-currency-countries.json" with { type: "json" };

// Country mapping: Unicode CLDR 48.1 currencyData, Unicode License v3.
// https://github.com/unicode-org/cldr-json/tree/48.1.0
const countries = countryCurrencies as Record<string, string[]>;
export const RATE_SOURCE = "https://www.exchangerate-api.com";
export const RATE_ENDPOINT = "https://open.er-api.com/v6/latest/NGN";
export const MAX_RATE_AGE = 48 * 60 * 60 * 1000;
const supportedCodes = new Set(Intl.supportedValuesOf("currency"));
type Snapshot = { updatedAt: number; refreshAt: number; rates: Record<string, number> };

export function parseRateSnapshot(value: unknown, now = Date.now()): Snapshot {
  const row = value as Record<string, unknown>;
  const updatedAt = Number(row?.time_last_update_unix) * 1000;
  if (row?.result !== "success" || row.base_code !== "NGN"
    || !Number.isFinite(updatedAt) || updatedAt > now + 300_000 || now - updatedAt >= MAX_RATE_AGE
    || !row.rates || typeof row.rates !== "object" || Array.isArray(row.rates)) {
    throw new Error("Display rates are unavailable or out of date");
  }
  const rates: Record<string, number> = {};
  for (const [code, rate] of Object.entries(row.rates)) {
    if (supportedCodes.has(code) && typeof rate === "number" && Number.isFinite(rate) && rate >= 1e-12 && rate <= 1e6) rates[code] = rate;
  }
  if (rates.NGN !== 1 || Object.keys(rates).length < 2) throw new Error("Invalid NGN display rates");
  const next = Number(row.time_next_update_unix) * 1000;
  return { updatedAt, refreshAt: Math.min(Number.isFinite(next) && next > now ? next : now + 3_600_000, now + 86_400_000, updatedAt + MAX_RATE_AGE), rates };
}

export function suggestedCurrency(country: string | null, available: readonly string[]): string {
  return (country ? countries[country] : undefined)?.find((code) => available.includes(code)) ?? "NGN";
}

export function createRateLoader(fetcher: typeof fetch = fetch, clock: () => number = Date.now) {
  let cached: Snapshot | null = null;
  let pending: Promise<Snapshot | null> | null = null;
  let retryAt = 0;
  return async (): Promise<Snapshot | null> => {
    const now = clock();
    const usable = () => cached && clock() - cached.updatedAt < MAX_RATE_AGE ? cached : null;
    if (cached && now < cached.refreshAt) return usable();
    if (now < retryAt) return usable();
    if (!pending) {
      pending = Promise.resolve().then(async () => {
        try {
          const response = await fetcher(RATE_ENDPOINT, { signal: AbortSignal.timeout(5000), redirect: "error" });
          if (!response.ok) throw new Error("Display rate provider unavailable");
          const text = await response.text();
          if (text.length > 65_536) throw new Error("Oversized rate response");
          cached = parseRateSnapshot(JSON.parse(text), clock());
          retryAt = 0;
        } catch {
          retryAt = clock() + 300_000;
        } finally {
          pending = null;
        }
        return usable();
      });
    }
    return pending;
  };
}

export function convertDisplayPrices(snapshot: Snapshot | null, requested: string | undefined, country: string | null, amounts: number[], now = Date.now()) {
  const fresh = snapshot && now - snapshot.updatedAt < MAX_RATE_AGE && snapshot.updatedAt <= now + 300_000 ? snapshot : null;
  const availableCurrencies = fresh ? Object.keys(fresh.rates).sort() : ["NGN"];
  const suggested = suggestedCurrency(country, availableCurrencies);
  const choice = requested ?? suggested;
  const currency = availableCurrencies.includes(choice) ? choice : "NGN";
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const rate = fresh?.rates[currency] ?? 1;
  return {
    baseCurrency: "NGN" as const, currency, suggestedCurrency: suggested,
    availableCurrencies, estimated: currency !== "NGN",
    updatedAt: fresh ? new Date(fresh.updatedAt).toISOString() : null,
    expiresAt: fresh ? new Date(fresh.updatedAt + MAX_RATE_AGE).toISOString() : null,
    unavailableReason: !fresh ? "rates_unavailable" : requested && currency !== requested ? "currency_unsupported" : null,
    sourceUrl: RATE_SOURCE,
    // Return converted display amounts, not a redistributed raw exchange-rate feed.
    prices: amounts.map((naira) => ({ naira, amount: currency === "NGN" ? naira : Math.round(naira * rate * 10 ** digits) / 10 ** digits })),
  };
}
