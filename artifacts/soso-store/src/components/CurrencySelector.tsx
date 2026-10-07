import React, { useId } from "react";
import { CURRENCY_DISCLOSURE, useDisplayCurrency } from "@/context/DisplayCurrencyContext";

export function CurrencyNotice({ className = "" }: { className?: string }) {
  const { snapshot } = useDisplayCurrency();
  if (!snapshot?.estimated) return null;
  return <p className={`text-xs leading-relaxed text-secondary ${className}`}>{CURRENCY_DISCLOSURE}{" "}
    <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Rates by ExchangeRate-API</a>.
    {snapshot.updatedAt && <span> Updated {new Date(snapshot.updatedAt).toLocaleDateString()}.</span>}
  </p>;
}

export function CurrencySelector() {
  const id = useId();
  const { preference, snapshot, loading, requestFailed, setPreference, retry } = useDisplayCurrency();
  const currencies = snapshot?.availableCurrencies ?? ["NGN"];
  const names = new Intl.DisplayNames(undefined, { type: "currency" });
  return <div className="space-y-3 text-left">
    <label htmlFor={id} className="block text-xs uppercase tracking-[.12em] text-secondary">Display currency</label>
    <select id={id} aria-label="Display currency" value={preference} onChange={(event) => setPreference(event.target.value)}
      className="max-w-full w-64 border border-border bg-background px-3 py-2.5 text-sm text-foreground">
      <option value="auto">Automatic — {snapshot?.suggestedCurrency ?? "NGN"}</option>
      {preference !== "auto" && !currencies.includes(preference) && <option value={preference}>{preference} — temporarily unavailable</option>}
      {currencies.map((code) => <option key={code} value={code}>{code} — {names.of(code) ?? code}</option>)}
    </select>
    {loading && <p role="status" className="text-xs text-secondary">Updating price estimates…</p>}
    {(requestFailed || snapshot?.unavailableReason) && <p role="status" className="text-xs text-secondary">
      Local-currency estimates are unavailable. Prices are shown in naira.{" "}
      <button type="button" className="underline underline-offset-4" onClick={retry}>Retry</button>
    </p>}
    <CurrencyNotice />
    {!snapshot?.estimated && <p className="text-xs text-secondary">Checkout payments are always charged in Nigerian naira (NGN).</p>}
  </div>;
}
