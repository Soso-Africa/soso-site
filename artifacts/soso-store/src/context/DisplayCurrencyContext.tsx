import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { displayPrices, type PriceDisplaySnapshot } from "@workspace/api-client-react";
import { naira } from "../lib/utils";

const PREFERENCE_KEY = "soso-display-currency-v1";
export const CURRENCY_DISCLOSURE = "Local-currency prices are estimates. Payment is charged in Nigerian naira (NGN). Your bank may apply its own exchange rate and fees.";

export function formatDisplayPrice(amount: number, snapshot: PriceDisplaySnapshot | null, now = Date.now()): string {
  if (!snapshot || snapshot.baseCurrency !== "NGN" || snapshot.currency === "NGN"
    || !snapshot.expiresAt || Date.parse(snapshot.expiresAt) <= now || !Number.isFinite(Date.parse(snapshot.expiresAt))) return naira(amount);
  const converted = snapshot.prices.find((row) => row.naira === amount);
  if (!converted || !Number.isFinite(converted.amount) || converted.amount < 0) return naira(amount);
  try {
    return `≈ ${new Intl.NumberFormat(undefined, { style: "currency", currency: snapshot.currency, currencyDisplay: "code" }).format(converted.amount)}`;
  } catch { return naira(amount); }
}

type CurrencyContext = {
  preference: string;
  snapshot: PriceDisplaySnapshot | null;
  loading: boolean;
  requestFailed: boolean;
  setPreference: (value: string) => void;
  register: (amount: number) => () => void;
  retry: () => void;
};
const fallback: CurrencyContext = { preference: "auto", snapshot: null, loading: false, requestFailed: false, setPreference: () => {}, register: () => () => {}, retry: () => {} };
const Context = createContext<CurrencyContext>(fallback);

export function DisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [preference, setChoice] = useState(() => {
    try {
      const stored = localStorage.getItem(PREFERENCE_KEY);
      return stored && /^(?:auto|[A-Z]{3})$/.test(stored) ? stored : "auto";
    } catch { return "auto"; }
  });
  const [snapshot, setSnapshot] = useState<PriceDisplaySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const registry = useRef(new Map<number, number>());
  const [revision, setRevision] = useState(0);
  const register = useCallback((amount: number) => {
    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) return () => {};
    const count = registry.current.get(amount) ?? 0;
    if (!count && registry.current.size >= 128) return () => {};
    registry.current.set(amount, count + 1);
    if (!count) setRevision((v) => v + 1);
    return () => {
      const next = (registry.current.get(amount) ?? 1) - 1;
      if (next) registry.current.set(amount, next);
      else { registry.current.delete(amount); setRevision((v) => v + 1); }
    };
  }, []);
  const setPreference = useCallback((value: string) => {
    if (!/^(?:auto|[A-Z]{3})$/.test(value)) return;
    setSnapshot(null);
    setChoice(value);
    try { localStorage.setItem(PREFERENCE_KEY, value); } catch { /* Memory preference still works. */ }
  }, []);
  const retry = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setRequestFailed(false);
      void displayPrices({ amounts: [...registry.current.keys()], ...(preference !== "auto" ? { currency: preference } : {}) }, { signal: controller.signal })
        .then((next) => {
          if (controller.signal.aborted) return;
          if (next.baseCurrency !== "NGN" || !Array.isArray(next.prices) || !Array.isArray(next.availableCurrencies)) throw new Error("Invalid display prices");
          setSnapshot(next);
        })
        .catch(() => { if (!controller.signal.aborted) { setSnapshot(null); setRequestFailed(true); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [preference, revision]);
  useEffect(() => {
    const timer = window.setInterval(retry, 3_600_000);
    const onFocus = () => {
      if (!snapshot?.expiresAt || Date.parse(snapshot.expiresAt) <= Date.now()) { setSnapshot(null); retry(); }
    };
    window.addEventListener("focus", onFocus);
    const expiry = snapshot?.expiresAt ? Date.parse(snapshot.expiresAt) - Date.now() : NaN;
    const timeout = Number.isFinite(expiry) ? window.setTimeout(() => { setSnapshot(null); retry(); }, Math.max(0, expiry)) : undefined;
    return () => { window.clearInterval(timer); window.clearTimeout(timeout); window.removeEventListener("focus", onFocus); };
  }, [retry, snapshot]);
  const value = useMemo(() => ({ preference, snapshot, loading, requestFailed, setPreference, register, retry }), [preference, snapshot, loading, requestFailed, setPreference, register, retry]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDisplayCurrency() { return useContext(Context); }
export function DisplayPrice({ amount }: { amount: number }) {
  const { snapshot, register } = useDisplayCurrency();
  useEffect(() => register(amount), [amount, register]);
  return <>{formatDisplayPrice(amount, snapshot)}</>;
}
