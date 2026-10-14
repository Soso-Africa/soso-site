import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, commerceCheckoutAttemptsTable, ordersTable } from "@workspace/db";
import { verifiedLiveOrderPredicate } from "./verified-order-reporting";

test("only confirmed non-simulated checkout orders enter verified order totals", async () => {
  const ids: string[] = [];
  const attemptIds: string[] = [];
  const scenarios = [
    { name: "unverified local record", source: "storefront", provider: "paystack", status: "paid", linked: false, expected: false },
    { name: "local paid label alone", source: "justicesure", provider: "paystack", status: "paid", linked: false, expected: false },
    { name: "unpaid checkout", source: "justicesure", provider: "paystack", status: "payment_pending", linked: true, expected: false },
    { name: "simulated payment", source: "justicesure", provider: "simulated", status: "paid", linked: true, expected: false },
    { name: "live payment", source: "justicesure", provider: "paystack", status: "paid", linked: true, expected: true },
    { name: "fulfilled payment", source: "justicesure", provider: "paystack", status: "fulfilled", linked: true, expected: true },
    { name: "refunded payment", source: "justicesure", provider: "paystack", status: "refunded", linked: true, expected: true },
    { name: "cancelled checkout", source: "justicesure", provider: "paystack", status: "cancelled", linked: true, expected: false },
  ] as const;
  try {
    for (const scenario of scenarios) {
      const id = randomUUID();
      ids.push(id);
      await db.insert(ordersTable).values({
        id, orderNumber: `reporting-${id}`, customerName: "Synthetic reporting fixture",
        customerEmail: "reporting@example.test", subtotal: "100", total: "100",
        source: scenario.source, status: scenario.status, paymentProvider: scenario.provider,
      });
      if (scenario.linked) {
        const attemptId = randomUUID();
        attemptIds.push(attemptId);
        await db.insert(commerceCheckoutAttemptsTable).values({
          id: attemptId, ownershipTokenHash: "synthetic", requestHash: "synthetic",
          customerName: "Synthetic reporting fixture", customerEmail: "reporting@example.test",
          customerPhone: "synthetic", items: [], fulfillment: {}, localOrderId: id,
          justiceSureOrderId: randomUUID(), orderIdempotencyKey: randomUUID(), paymentIdempotencyKey: randomUUID(),
          provider: scenario.provider, status: scenario.status,
        });
      }
      const result = await db.select({ id: ordersTable.id }).from(ordersTable)
        .where(and(eq(ordersTable.id, id), verifiedLiveOrderPredicate()));
      assert.equal(result.length > 0, scenario.expected, scenario.name);
    }
  } finally {
    if (attemptIds.length) await db.delete(commerceCheckoutAttemptsTable).where(inArray(commerceCheckoutAttemptsTable.id, attemptIds));
    if (ids.length) await db.delete(ordersTable).where(inArray(ordersTable.id, ids));
  }
});
