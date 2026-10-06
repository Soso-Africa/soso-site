import type { JusticeSureOrder } from "./justicesureCommerce";

// A return URL, local order status or checkout intent is never authority.
export function verifiedPurchase(order: JusticeSureOrder, expectedOrderId: string) {
  if (order.id !== expectedOrderId || order.currency !== "NGN"
    || !Number.isSafeInteger(order.amounts.totalKobo) || order.amounts.totalKobo <= 0
    || !Number.isSafeInteger(order.amounts.paidKobo)
    || order.amounts.paidKobo < order.amounts.totalKobo
    || order.amounts.refundedKobo !== 0
    || !["paid", "successful"].includes(order.payment.status?.toLowerCase() ?? "")
    || /cancel|refund/.test(order.status.toLowerCase())) return null;
  // The active JusticeSure contract has canonical NGN amounts in kobo.
  return { value: order.amounts.totalKobo / 100, currency: "NGN" as const };
}
