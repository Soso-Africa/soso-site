import { randomUUID } from "node:crypto";
import { Router } from "express";
import { db, commerceCheckoutAttemptsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { hasOwnership } from "./payment";
import { JusticeSureCommerceClient } from "../lib/justicesureCommerce";
import { verifiedPurchase } from "../lib/verified-purchase";
import { ClaimPurchaseConversionBody, ClaimPurchaseConversionResponse, isPrivateAdvertisingPath } from "@workspace/api-zod";

const router = Router();

// Cookie-bound same-origin POST; invoked only on public storefront routes.
// Claims are at-most-once dispatch attempts, not assertions of vendor receipt.
router.post("/payment/purchase-conversion", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const input = ClaimPurchaseConversionBody.safeParse(req.body);
  if (req.get("Sec-Fetch-Site") === "cross-site"
    || (req.get("Origin") && req.get("Origin") !== `${req.protocol}://${req.get("host")}`)
    || !input.success || !input.data.publicPath.startsWith("/")
    || /[?#]/.test(input.data.publicPath) || isPrivateAdvertisingPath(input.data.publicPath)) {
    res.status(403).json({ error: "Explicit marketing consent and same-origin access required." });
    return;
  }
  const cookie = req.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("soso_checkout_owner="));
  const attemptId = cookie?.slice("soso_checkout_owner=".length).split(".")[0];
  if (!attemptId || !/^[a-f0-9-]{36}$/i.test(attemptId)) { res.sendStatus(204); return; }
  try {
    const [attempt] = await db.select().from(commerceCheckoutAttemptsTable)
      .where(eq(commerceCheckoutAttemptsTable.id, attemptId)).limit(1);
    if (!attempt || !hasOwnership(req, attempt.id, attempt.ownershipTokenHash)
      || !attempt.justiceSureOrderId) { res.sendStatus(204); return; }
    const existing = await db.execute(sql`select attempt_id from soso_purchase_conversion_claims where attempt_id = ${attempt.id}::uuid`);
    if (existing.rows.length) {
      res.set("X-SOSO-Verified-Purchaser", "1").sendStatus(204);
      return;
    }
    const order = await new JusticeSureCommerceClient(undefined, true).getOrder(attempt.justiceSureOrderId);
    const purchase = verifiedPurchase(order, attempt.justiceSureOrderId);
    if (!purchase) { res.sendStatus(204); return; }
    const eventId = randomUUID();
    const claimed = await db.execute(sql`
      insert into soso_purchase_conversion_claims (attempt_id, event_id)
      values (${attempt.id}::uuid, ${eventId}::uuid)
      on conflict (attempt_id) do nothing returning event_id
    `);
    if (!claimed.rows.length) { res.sendStatus(204); return; }
    res.json(ClaimPurchaseConversionResponse.parse({ eventId, ...purchase }));
  } catch {
    res.status(503).json({ error: "Purchase verification is unavailable." });
  }
});

export default router;
