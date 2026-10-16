import { and, eq, exists, inArray, isNotNull } from "drizzle-orm";
import { db, commerceCheckoutAttemptsTable, ordersTable } from "@workspace/db";

/** A local row or a hosted checkout session is not evidence of payment. */
export function verifiedLiveOrderPredicate() {
  return and(
    eq(ordersTable.source, "justicesure"),
    exists(db.select({ id: commerceCheckoutAttemptsTable.id })
      .from(commerceCheckoutAttemptsTable)
      .where(and(
        eq(commerceCheckoutAttemptsTable.localOrderId, ordersTable.id),
        isNotNull(commerceCheckoutAttemptsTable.justiceSureOrderId),
        inArray(commerceCheckoutAttemptsTable.status, ["paid", "fulfilled", "refunded"]),
        inArray(commerceCheckoutAttemptsTable.provider, ["paystack", "flutterwave", "stripe", "paypal", "hydrogen"]),
      ))),
  );
}
