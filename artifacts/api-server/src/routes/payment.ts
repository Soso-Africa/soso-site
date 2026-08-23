/**
 * SOSO Africa — Payment integration scaffold
 *
 * Activate by setting ALL three env vars:
 *   JUSTICESURE_API_URL         — Base URL for the JusticeSure headless API
 *   JUSTICESURE_API_KEY         — Auth key for the JusticeSure API
 *   JUSTICESURE_WEBHOOK_SECRET  — Used to verify incoming webhook signatures
 *
 * Then set VITE_COMMERCE_MODE=justicesure-headless on the storefront.
 *
 * Until credentials are supplied every route returns 503 and no order record
 * is created. The storefront error message explicitly states "No payment has
 * been taken."
 */

import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, ordersTable, orderItemsTable } from "@workspace/db";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

function jsConfig() {
  const apiUrl = process.env.JUSTICESURE_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.JUSTICESURE_API_KEY;
  const webhookSecret = process.env.JUSTICESURE_WEBHOOK_SECRET;
  return { apiUrl, apiKey, webhookSecret, ready: Boolean(apiUrl && apiKey && webhookSecret) };
}

/** Simple human-readable order reference, e.g. SO-20260824-A3F2 */
function generateOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `SO-${date}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Request type (manual validation — no external schema library needed)
// ---------------------------------------------------------------------------

type LineItem = { slug: string; name: string; size: string; quantity: number; price: number };
type InitiateBody = {
  customer: { name: string; email: string; phone: string; deliveryNote?: string };
  items: LineItem[];
};

function validateBody(body: unknown): InitiateBody | null {
  const b = body as Record<string, unknown>;
  if (!b || typeof b !== "object") return null;
  const c = b.customer as Record<string, unknown>;
  if (!c || typeof c.name !== "string" || typeof c.email !== "string" || typeof c.phone !== "string") return null;
  if (!Array.isArray(b.items) || b.items.length === 0) return null;
  for (const item of b.items as unknown[]) {
    const it = item as Record<string, unknown>;
    if (!it || typeof it.slug !== "string" || typeof it.name !== "string" || typeof it.quantity !== "number" || typeof it.price !== "number") return null;
  }
  return b as unknown as InitiateBody;
}

// ---------------------------------------------------------------------------
// POST /api/payment/initiate
// ---------------------------------------------------------------------------

router.post("/payment/initiate", async (req, res): Promise<void> => {
  const cfg = jsConfig();
  if (!cfg.ready) {
    res.status(503).json({
      error:
        "Secure payment is not yet configured. No payment has been taken. Please ask a SOSO stylist for help.",
    });
    return;
  }

  const body = validateBody(req.body);
  if (!body) {
    res.status(400).json({ error: "Invalid checkout request" });
    return;
  }

  const { customer, items } = body;
  const subtotal = items.reduce((sum: number, i: LineItem) => sum + i.price * i.quantity, 0);
  const total = subtotal; // no discounts at this stage
  const orderNumber = generateOrderNumber();

  const [order] = await db
    .insert(ordersTable)
    .values({
      orderNumber,
      customerName: customer.name,
      customerEmail: customer.email,
      deliveryNotes: customer.deliveryNote || null,
      currency: "NGN",
      subtotal: String(subtotal),
      total: String(total),
    })
    .returning();

  await db.insert(orderItemsTable).values(
    items.map((item: LineItem) => ({
      orderId: order.id,
      productSlug: item.slug,
      productName: item.name,
      size: item.size,
      quantity: item.quantity,
      unitPrice: String(item.price),
    })),
  );

  try {
    // ------------------------------------------------------------------
    // TODO: Replace this stub with the real JusticeSure API call.
    //
    // Typical pattern (adapt to JusticeSure's actual schema):
    //
    //   const jsRes = await fetch(`${cfg.apiUrl}/checkout/sessions`, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.apiKey}` },
    //     body: JSON.stringify({
    //       reference: orderNumber,
    //       amount: total,
    //       currency: "NGN",
    //       customer: { name: customer.name, email: customer.email, phone: customer.phone },
    //       description: `SOSO Africa order ${orderNumber}`,
    //       successUrl: `${process.env.VITE_PUBLIC_SITE_URL}/checkout/success?ref=${order.id}`,
    //       cancelUrl: `${process.env.VITE_PUBLIC_SITE_URL}/checkout`,
    //     }),
    //   });
    //   if (!jsRes.ok) throw new Error(await jsRes.text());
    //   const { checkoutUrl } = await jsRes.json() as { checkoutUrl: string };
    //   res.json({ checkoutUrl, orderId: order.id });
    //   return;
    // ------------------------------------------------------------------

    throw new Error("JusticeSure API contract pending — replace this stub");
  } catch {
    await db
      .update(ordersTable)
      .set({ status: "cancelled" })
      .where(eq(ordersTable.id, order.id));

    res.status(503).json({
      error:
        "Payment session could not be started. The order has been cancelled and no payment has been taken.",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/payment/webhook
// ---------------------------------------------------------------------------

router.post("/payment/webhook", async (req, res): Promise<void> => {
  const cfg = jsConfig();
  if (!cfg.ready) {
    res.status(503).json({ error: "Webhook not configured" });
    return;
  }

  // ------------------------------------------------------------------
  // TODO: Verify JusticeSure webhook signature once the contract is known.
  //
  //   import crypto from "node:crypto";
  //   const sig = String(req.headers["x-justicesure-signature"] ?? "");
  //   const expected = crypto
  //     .createHmac("sha256", cfg.webhookSecret!)
  //     .update(JSON.stringify(req.body))
  //     .digest("hex");
  //   if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
  //     res.status(401).json({ error: "Invalid webhook signature" });
  //     return;
  //   }
  //
  // TODO: Process the payment event and update the order:
  //
  //   const { reference, event, paymentRef } = req.body as Record<string, string>;
  //   if (event === "payment.completed") {
  //     await db.update(ordersTable)
  //       .set({ status: "paid" })
  //       .where(eq(ordersTable.orderNumber, reference));
  //     // Notify the atelier via operationalNotificationsTable
  //   }
  // ------------------------------------------------------------------

  res.status(200).json({ received: true });
});

// ---------------------------------------------------------------------------
// GET /api/payment/status/:ref
// ---------------------------------------------------------------------------

router.get("/payment/status/:ref", async (_req, res): Promise<void> => {
  res.status(503).json({ error: "Payment status check not yet available" });
});

export default router;
