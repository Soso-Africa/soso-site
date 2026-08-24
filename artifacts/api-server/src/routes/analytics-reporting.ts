export type EventCount = {
  eventName: string;
  count: number;
};

export type ReportingRate = {
  key: string;
  label: string;
  numerator: number;
  denominator: number;
  value: number | null;
  definition: string;
};

export function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.max(0, Math.min(1, numerator / denominator));
}

export function eventCountMap(rows: EventCount[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.eventName, Number(row.count) || 0]));
}

/**
 * These are event-volume rates, not shopper or revenue conversion rates.
 * They remain explicitly non-payment metrics until a verified provider order
 * relationship exists.
 */
export function buildReportingRates(counts: Record<string, number>): ReportingRate[] {
  const pageViews = counts.page_view ?? 0;
  const productViews = counts.product_view ?? 0;
  const bags = counts.add_to_bag ?? 0;
  const checkoutStarts = counts.checkout_started ?? 0;
  const paymentStarts = counts.payment_clicked ?? 0;

  return [
    {
      key: "product_view_rate",
      label: "Product-view rate",
      numerator: productViews,
      denominator: pageViews,
      value: rate(productViews, pageViews),
      definition: "Product-view events divided by consented page-view events.",
    },
    {
      key: "add_to_bag_rate",
      label: "Add-to-bag rate",
      numerator: bags,
      denominator: productViews,
      value: rate(bags, productViews),
      definition: "Add-to-bag events divided by product-view events.",
    },
    {
      key: "checkout_start_rate",
      label: "Checkout-start rate",
      numerator: checkoutStarts,
      denominator: bags,
      value: rate(checkoutStarts, bags),
      definition: "Checkout-start events divided by add-to-bag events.",
    },
    {
      key: "payment_click_rate",
      label: "Payment-start rate",
      numerator: paymentStarts,
      denominator: checkoutStarts,
      value: rate(paymentStarts, checkoutStarts),
      definition: "Payment-click events divided by checkout-start events. It does not prove payment success.",
    },
    {
      key: "cart_abandonment",
      label: "Cart abandonment",
      numerator: Math.max(0, bags - checkoutStarts),
      denominator: bags,
      value: rate(Math.max(0, bags - checkoutStarts), bags),
      definition: "Add-to-bag events without a matching downstream checkout-start event volume.",
    },
    {
      key: "checkout_abandonment",
      label: "Checkout abandonment",
      numerator: Math.max(0, checkoutStarts - paymentStarts),
      denominator: checkoutStarts,
      value: rate(Math.max(0, checkoutStarts - paymentStarts), checkoutStarts),
      definition: "Checkout-start events without a matching downstream payment-click event volume. It does not measure failed or completed payments.",
    },
  ];
}

export function comparisonDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / previous;
}