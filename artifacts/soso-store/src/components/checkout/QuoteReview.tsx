import React from "react";

type QuoteReviewProps = {
  formattedTotal: string;
  currency: string;
  chargeCurrency: string;
  expiresAt: string;
  paymentProvider?: string;
  paymentMethod?: string;
  collectionLabel?: string;
};

const providerNames: Record<string, string> = {
  paystack: "Paystack",
  flutterwave: "Flutterwave",
  stripe: "Stripe",
  paypal: "PayPal",
  hydrogen: "Hydrogen",
};
function readableName(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function expiryText(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function QuoteReview({ formattedTotal, currency, chargeCurrency, expiresAt, paymentProvider, paymentMethod, collectionLabel }: QuoteReviewProps) {
  const expiry = expiryText(expiresAt);
  const providerName = paymentProvider ? providerNames[paymentProvider] ?? readableName(paymentProvider) : "";
  const paymentLabel = [providerName, paymentMethod ? readableName(paymentMethod) : ""].filter(Boolean).join(" · ");
  const rows: Array<[string, string]> = [];
  if (collectionLabel) rows.push(["Collection", collectionLabel]);
  if (paymentLabel) rows.push(["Payment", paymentLabel]);
  if (expiry) rows.push(["Valid until", expiry]);
  return (
    <section aria-live="polite" aria-labelledby="quote-review-heading" data-testid="quote-review" className="border border-border bg-background p-5 sm:p-6">
      <h2 id="quote-review-heading" className="text-[11px] uppercase tracking-[0.28em] text-secondary">Review your order</h2>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-border pb-4">
        <span className="text-sm text-secondary">Order total</span>
        <strong data-testid="text-quote-total" className="soso-display min-w-0 break-words text-2xl sm:text-3xl font-normal tabular-nums text-foreground">{formattedTotal}</strong>
      </div>
      {rows.length > 0 && (
        <dl className="mt-4 space-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-6">
              <dt className="text-secondary">{label}</dt>
              <dd className="min-w-0 break-words text-foreground sm:text-right">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {chargeCurrency && chargeCurrency !== currency && (
        <p className="mt-4 text-xs leading-relaxed text-secondary">Your payment will be taken in {chargeCurrency}. The amount shown is your order total in {currency}.</p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-secondary">Next, complete your payment securely{providerName ? ` with ${providerName}` : " on the payment page"}.</p>
    </section>
  );
}
