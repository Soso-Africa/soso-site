import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import {
  commerceCheckoutAttemptsTable,
  commerceWebhookEventsTable,
  db,
  measurementRequestsTable,
  measurementRevisionsTable,
  orderItemsTable,
  ordersTable,
} from "@workspace/db";
import {
  GetCommerceCatalogResponse,
  GetCommerceLocationsResponse,
  GetCommercePaymentStatusParams,
  GetCommercePaymentStatusResponse,
  GetCustomerMeasurementsResponse,
  InitiateCommerceCheckoutResponse,
  ReceiveCommerceWebhookResponse,
  UpdateCustomerMeasurementBody,
  UpdateCustomerMeasurementParams,
  UpdateCustomerMeasurementResponse,
} from "@workspace/api-zod";
import {
  isJusticeSureCommerceReady,
  JusticeSureCommerceClient,
  JusticeSureConfigurationError,
  JusticeSureRequestError,
  justiceSureConfig,
  type JusticeSureFulfillment,
  type JusticeSureLineItem,
  type JusticeSureOrder,
  type JusticeSurePaymentMethod,
  type JusticeSureProvider,
} from "../lib/justicesureCommerce";
import {
  CUSTOM_DISPATCH_GUIDANCE,
  customerCanSubmit,
  reconciledOrderStatus,
  resolveAuthoritativeCheckoutItems,
  selectionType,
  shouldActivateMeasurements,
  validateMeasurementValues,
} from "../lib/measurements";
import { readPublishedPlatformContent } from "../lib/platform-content";

const router: IRouter = Router();
const OWNERSHIP_COOKIE = "soso_checkout_owner";
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const supportedWebhookEvents = new Set([
  "commerce.product.updated",
  "commerce.inventory.updated",
  "commerce.order.created",
  "commerce.order.updated",
  "commerce.payment.updated",
  "commerce.order.cancelled",
  "commerce.order.refunded",
  "commerce.fulfilment.updated",
]);
const webhookRequiredFields: Record<string, string[]> = {
  "commerce.product.updated": ["productId", "updatedAt"],
  "commerce.inventory.updated": ["updatedAt"],
  "commerce.order.created": ["orderId", "orderNumber", "status", "paymentStatus", "totalKobo", "updatedAt"],
  "commerce.order.updated": ["orderId", "orderNumber", "status", "paymentStatus", "updatedAt"],
  "commerce.payment.updated": ["orderId", "orderNumber", "paymentStatus", "provider", "amountKobo", "updatedAt"],
  "commerce.order.cancelled": ["orderId", "status", "paymentStatus", "updatedAt"],
  "commerce.order.refunded": ["orderId", "orderNumber", "status", "paymentStatus", "refundedKobo", "isFullRefund", "updatedAt"],
  "commerce.fulfilment.updated": ["orderId", "status", "updatedAt"],
};

type CheckoutItem = {
  productId: string;
  variantId?: string;
  quantity: number;
  displayName?: string;
  displaySlug?: string;
  selectedSize?: string;
  selectedColourId: string;
  selectedColourLabel?: string;
  selectedColourHex?: string;
  customColour?: string;
  unitPriceKobo?: number;
};

type CheckoutBody = {
  checkoutOperationId: string;
  customer: { name: string; email: string; phone: string };
  items: CheckoutItem[];
  fulfillment: { type: "pickup" | "delivery"; locationId?: string; address?: string };
  quoteId?: string;
  displayCurrency?: string;
  paymentProvider?: JusticeSureProvider;
  paymentMethod?: JusticeSurePaymentMethod;
  notes?: string;
};

type WebhookEnvelope = {
  id: string;
  event: string;
  apiVersion: string;
  createdAt: string;
  data: { orderId?: string; catalogueIdentifiers: string[] };
};

function hash(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomOwnershipToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function readCookie(req: Request, name: string): string | undefined {
  const prefix = `${name}=`;
  return req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

export function hasOwnership(req: Request, attemptId: string, tokenHash: string): boolean {
  const value = readCookie(req, OWNERSHIP_COOKIE);
  if (!value) return false;
  const [id, token] = value.split(".", 2);
  if (!id || !token || id !== attemptId) return false;
  const candidate = Buffer.from(hash(token), "hex");
  const expected = Buffer.from(tokenHash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function setOwnershipCookie(req: Request, res: Response, attemptId: string, token: string): void {
  res.cookie(OWNERSHIP_COOKIE, `${attemptId}.${token}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: 24 * 60 * 60 * 1_000,
    path: "/api/payment",
  });
}

function stringValue(value: unknown, max = 500): string | undefined {
  return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : undefined;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function isRemoteOrderId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

export function shouldRecoverPaymentAttempt(
  status: string,
  provider: string | null,
  remoteAttemptId: string | null,
  checkedAt: Date | null,
  now = Date.now(),
): boolean {
  if (status !== "starting" && status !== "payment_pending") return false;
  if (!remoteAttemptId || !isUuid(remoteAttemptId)) return false;
  // Test mode is advanced only by the authenticated simulator; provider
  // verify/reconcile endpoints deliberately reject simulated attempts.
  if (provider === "simulated") return false;
  return !checkedAt || now - checkedAt.getTime() >= 10_000;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505");
}

function checkoutBody(value: unknown): CheckoutBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const customer = body.customer as Record<string, unknown> | undefined;
  const fulfillment = body.fulfillment as Record<string, unknown> | undefined;
  const checkoutOperationId = stringValue(body.checkoutOperationId, 56);
  if (!checkoutOperationId || !/^[A-Za-z0-9_.:-]{8,56}$/.test(checkoutOperationId)) return null;
  if (!customer || !fulfillment) return null;
  const name = stringValue(customer.name, 160);
  const email = stringValue(customer.email, 320);
  const phone = stringValue(customer.phone, 80);
  const type = fulfillment.type;
  if (!name || !email || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (type !== "pickup" && type !== "delivery")) return null;
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) return null;
  const items: CheckoutItem[] = [];
  for (const value of body.items) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    const productId = stringValue(item.productId, 64);
    const variantId = stringValue(item.variantId, 64);
    const quantity = item.quantity;
    const selectedColourId = stringValue(item.selectedColourId, 64);
    const selectedColourLabel = stringValue(item.selectedColourLabel, 80);
    const selectedColourHex = stringValue(item.selectedColourHex, 7);
    const customColour = stringValue(item.customColour, 200);
    if (!isUuid(productId) || (variantId && !isUuid(variantId)) || !Number.isInteger(quantity) || typeof quantity !== "number" || quantity < 1 || quantity > 100
      || !selectedColourId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selectedColourId)
      || (selectedColourId === "custom"
        ? (!customColour || selectedColourLabel !== undefined || selectedColourHex !== undefined)
        : (!selectedColourLabel || !selectedColourHex || !/^#[0-9A-Fa-f]{6}$/.test(selectedColourHex) || customColour !== undefined))) return null;
    items.push({
      productId,
      variantId,
      quantity,
      displayName: stringValue(item.displayName, 200),
      displaySlug: stringValue(item.displaySlug, 160),
      selectedSize: stringValue(item.selectedSize, 80),
      selectedColourId,
      ...(selectedColourLabel ? { selectedColourLabel } : {}),
      ...(selectedColourHex ? { selectedColourHex: selectedColourHex.toUpperCase() } : {}),
      ...(customColour ? { customColour } : {}),
    });
  }
  const locationId = stringValue(fulfillment.locationId, 64);
  const address = stringValue(fulfillment.address, 1_000);
  if ((type === "pickup" && !isUuid(locationId)) || (type === "delivery" && !address)) return null;
  const quoteId = stringValue(body.quoteId, 64);
  const displayCurrency = stringValue(body.displayCurrency, 3)?.toUpperCase();
  const paymentProvider = stringValue(body.paymentProvider, 20);
  const paymentMethod = stringValue(body.paymentMethod, 20);
  if ((quoteId !== undefined && !isUuid(quoteId))
    || (displayCurrency !== undefined && !/^[A-Z]{3}$/.test(displayCurrency))
    || (paymentProvider !== undefined && !["paystack", "flutterwave", "stripe", "paypal", "hydrogen"].includes(paymentProvider))
    || (paymentMethod !== undefined && !["card", "bank_transfer", "wallet", "paypal", "virtual_account"].includes(paymentMethod))) return null;
  return {
    checkoutOperationId,
    customer: { name, email, phone },
    items,
    fulfillment: { type, locationId, address },
    ...(quoteId ? { quoteId } : {}),
    ...(displayCurrency ? { displayCurrency } : {}),
    ...(paymentProvider ? { paymentProvider: paymentProvider as JusticeSureProvider } : {}),
    ...(paymentMethod ? { paymentMethod: paymentMethod as JusticeSurePaymentMethod } : {}),
    notes: stringValue(body.notes, 1_000),
  };
}

export function remoteStatus(order: JusticeSureOrder): "payment_pending" | "paid" | "cancelled" | "refunded" | "fulfilled" {
  const paymentStatus = order.payment.status?.toLowerCase() ?? "";
  const fulfillmentStatus = order.fulfillment.status.toLowerCase();
  const orderStatus = order.status.toLowerCase();
  const isPaid = paymentStatus === "paid"
    || paymentStatus === "successful"
    || (order.amounts.paidKobo ?? 0) >= order.amounts.totalKobo;
  // A partial refund is still a paid order. Only JusticeSure's amount
  // projection can establish a complete refund; wording alone is ambiguous.
  if ((orderStatus.includes("refund") || paymentStatus.includes("refund"))
    && order.amounts.paidKobo > 0
    && order.amounts.refundedKobo >= order.amounts.paidKobo) return "refunded";
  if (orderStatus.includes("cancel") || paymentStatus.includes("cancel")) return "cancelled";
  if (isPaid && (fulfillmentStatus.includes("fulfill") || fulfillmentStatus.includes("deliver") || orderStatus.includes("complete"))) return "fulfilled";
  if (isPaid) return "paid";
  return "payment_pending";
}

function attemptStatus(order: JusticeSureOrder): "payment_pending" | "paid" | "cancelled" | "refunded" | "fulfilled" {
  return remoteStatus(order);
}

function toNaira(kobo: number): string {
  return (kobo / 100).toFixed(2);
}

export function checkoutRequestHash(body: CheckoutBody): string {
  return hash(JSON.stringify({
    customer: body.customer,
    items: body.items.map(({ productId, variantId, quantity, selectedColourId, selectedColourLabel, selectedColourHex, customColour }) =>
      ({ productId, variantId, quantity, selectedColourId, selectedColourLabel, selectedColourHex, customColour })),
    fulfillment: body.fulfillment,
    displayCurrency: body.displayCurrency,
    paymentProvider: body.paymentProvider,
    paymentMethod: body.paymentMethod,
    notes: body.notes ?? "",
  }));
}

function quoteResponse(snapshot: Record<string, unknown>) {
  return {
    id: snapshot.id, expiresAt: snapshot.expiresAt, currency: snapshot.currency,
    displayCurrency: snapshot.displayCurrency, chargeCurrency: snapshot.chargeCurrency,
    settlementCurrency: snapshot.settlementCurrency, amounts: snapshot.amounts, payment: snapshot.payment,
    currencyMinorUnitExponents: snapshot.currencyMinorUnitExponents,
  };
}

export function quoteMatchesRequestedCheckout(
  quote: { lines?: unknown[]; fulfillment?: Record<string, unknown> },
  items: JusticeSureLineItem[],
  fulfillment: JusticeSureFulfillment,
): boolean {
  if (!Array.isArray(quote.lines) || quote.lines.length !== items.length || !quote.fulfillment) return false;
  const sameLines = quote.lines.every((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const line = value as Record<string, unknown>;
    const expected = items[index];
    // QuoteLine does not expose CartLine.productId; JusticeSure identifies the
    // resolved catalogue inventory row as inventoryItemId.
    return line.inventoryItemId === expected.productId
      && (line.variantId ?? undefined) === expected.variantId
      && line.quantity === expected.quantity;
  });
  if (!sameLines) return false;
  return quote.fulfillment.type === fulfillment.type
    && (quote.fulfillment.locationId ?? undefined) === fulfillment.locationId
    && (quote.fulfillment.address ?? undefined) === fulfillment.address;
}

export function sameImmutableQuote(
  current: { id: string; expiresAt: string; currency: string; displayCurrency: string; chargeCurrency: string; settlementCurrency: string; amounts: Record<string, string>; fxSnapshotId: string | null; lines?: unknown[]; fulfillment?: Record<string, unknown> },
  snapshot: Record<string, unknown>,
): boolean {
  return current.id === snapshot.id
    && current.expiresAt === snapshot.expiresAt
    && current.currency === snapshot.currency
    && current.displayCurrency === snapshot.displayCurrency
    && current.chargeCurrency === snapshot.chargeCurrency
    && current.settlementCurrency === snapshot.settlementCurrency
    && current.fxSnapshotId === snapshot.fxSnapshotId
    && isDeepStrictEqual(current.amounts, snapshot.amounts)
    && isDeepStrictEqual(current.lines, snapshot.lines)
    && isDeepStrictEqual(current.fulfillment, snapshot.fulfillment);
}

async function syncLocalOrder(
  attemptId: string,
  order: JusticeSureOrder,
  webhookFence?: { eventId: string; leaseGeneration: number },
): Promise<void> {
  await db.transaction(async (tx) => {
    if (webhookFence) {
      // Lock the event row in the same transaction as every local effect, so
      // a reclaim cannot interleave a stale worker's order projection.
      const lease = await tx.execute(sql`
        select event_id from soso_commerce_webhook_events
        where event_id = ${webhookFence.eventId}
          and status = 'processing'
          and lease_generation = ${webhookFence.leaseGeneration}
        for update
      `);
      if (!lease.rows.length) throw new Error("Webhook lease was fenced before local order effects.");
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`soso-checkout-sync:${attemptId}`}))`);
    const [attempt] = await tx.select().from(commerceCheckoutAttemptsTable)
      .where(eq(commerceCheckoutAttemptsTable.id, attemptId)).limit(1);
    if (!attempt) return;
    const status = remoteStatus(order);
    let localOrderId = attempt.localOrderId;
    if (!localOrderId) {
      const items = attempt.items as CheckoutItem[];
      const [created] = await tx.insert(ordersTable).values({
        orderNumber: order.number ?? order.id,
        customerName: attempt.customerName,
        customerEmail: attempt.customerEmail,
        customerPhone: attempt.customerPhone,
        currency: order.currency,
        subtotal: toNaira(order.amounts.subtotalKobo),
        total: toNaira(order.amounts.totalKobo),
        status,
        source: "justicesure",
        paymentProvider: attempt.provider,
        paymentReference: attempt.paymentReference,
        deliveryNotes: JSON.stringify(attempt.fulfillment),
      }).returning({ id: ordersTable.id });
      localOrderId = created!.id;
      if (items.some(({ unitPriceKobo }) => !Number.isInteger(unitPriceKobo) || unitPriceKobo! < 0)) {
        throw new Error("Authoritative checkout item pricing is unavailable for this order.");
      }
      await tx.insert(orderItemsTable).values(items.map((item, index) => ({
        orderId: localOrderId!,
        lineNumber: index + 1,
        commerceProductId: item.productId,
        commerceVariantId: item.variantId ?? null,
        productSlug: item.displaySlug ?? item.productId,
        productName: item.displayName ?? item.productId,
        selectionType: selectionType(item.selectedSize),
        selectedSize: item.selectedSize ?? null,
        selectedColourId: item.selectedColourId,
        selectedColourLabel: item.selectedColourLabel ?? null,
        selectedColourHex: item.selectedColourHex ?? null,
        customColour: item.customColour ?? null,
        quantity: item.quantity,
        unitPrice: toNaira(item.unitPriceKobo!),
      })));
    } else {
      const [localOrder] = await tx.select({ status: ordersTable.status }).from(ordersTable)
        .where(eq(ordersTable.id, localOrderId)).limit(1);
      await tx.update(ordersTable).set({
        subtotal: toNaira(order.amounts.subtotalKobo),
        total: toNaira(order.amounts.totalKobo),
        status: reconciledOrderStatus(localOrder?.status ?? "payment_pending", status),
        paymentProvider: attempt.provider,
        paymentReference: attempt.paymentReference,
      }).where(eq(ordersTable.id, localOrderId));
    }
    if (shouldActivateMeasurements(status)) {
      const customItems = await tx.select({ id: orderItemsTable.id }).from(orderItemsTable)
        .where(and(eq(orderItemsTable.orderId, localOrderId!), eq(orderItemsTable.selectionType, "custom")));
      if (customItems.length) {
        await tx.insert(measurementRequestsTable)
          .values(customItems.map(({ id }) => ({ orderItemId: id })))
          .onConflictDoNothing({ target: measurementRequestsTable.orderItemId });
      }
    } else if (status === "cancelled" || status === "refunded") {
      const requestRows = await tx.select({ id: measurementRequestsTable.id })
        .from(measurementRequestsTable)
        .innerJoin(orderItemsTable, eq(measurementRequestsTable.orderItemId, orderItemsTable.id))
        .where(and(eq(orderItemsTable.orderId, localOrderId!), inArray(measurementRequestsTable.status, ["needed", "submitted", "clarification_requested"])));
      for (const request of requestRows) {
        const [cancelled] = await tx.update(measurementRequestsTable)
          .set({ status: "cancelled", version: sql`${measurementRequestsTable.version} + 1`, updatedAt: new Date() })
          .where(eq(measurementRequestsTable.id, request.id)).returning();
        await tx.insert(measurementRevisionsTable).values({
          measurementRequestId: request.id,
          version: cancelled!.version,
          actorType: "system",
          action: status,
          snapshot: cancelled!,
        });
      }
    }
    await tx.update(commerceCheckoutAttemptsTable).set({
      localOrderId,
      status: attemptStatus(order),
      lastErrorCode: null,
      lastErrorMessage: null,
    }).where(eq(commerceCheckoutAttemptsTable.id, attemptId));
    if (webhookFence) {
      const completed = await tx.update(commerceWebhookEventsTable)
        .set({ status: "completed", completedAt: sql`now()`, updatedAt: sql`now()`, lastError: null })
        .where(and(
          eq(commerceWebhookEventsTable.eventId, webhookFence.eventId),
          eq(commerceWebhookEventsTable.status, "processing"),
          eq(commerceWebhookEventsTable.leaseGeneration, webhookFence.leaseGeneration),
        ))
        .returning({ eventId: commerceWebhookEventsTable.eventId });
      if (!completed.length) throw new Error("Webhook lease was fenced before completion.");
    }
  });
}

function measurementView(row: {
  request: typeof measurementRequestsTable.$inferSelect;
  item: typeof orderItemsTable.$inferSelect;
}) {
  return {
    id: row.request.id,
    lineNumber: row.item.lineNumber,
    productId: row.item.commerceProductId,
    variantId: row.item.commerceVariantId,
    productName: row.item.productName,
    selectionType: "custom" as const,
    selectedSize: row.item.selectedSize,
    status: row.request.status,
    unit: row.request.unit,
    values: row.request.values,
    customerNote: row.request.customerNote,
    clarificationNote: row.request.clarificationNote,
    productionException: row.request.productionException,
    version: row.request.version,
    submittedAt: row.request.submittedAt,
    confirmedAt: row.request.confirmedAt,
    updatedAt: row.request.updatedAt,
  };
}

function publicStatus(order: JusticeSureOrder, attempt: typeof commerceCheckoutAttemptsTable.$inferSelect) {
  const quote = attempt.quoteSnapshot as Record<string, unknown> | null;
  return GetCommercePaymentStatusResponse.parse({
    attemptId: attempt.id,
    ...(order.number ? { orderNumber: order.number } : {}),
    status: attemptStatus(order),
    paymentStatus: typeof order.payment.status === "string" ? order.payment.status : "pending",
    ...(attempt.provider && ["paystack", "flutterwave", "stripe", "paypal", "hydrogen"].includes(attempt.provider)
      ? { provider: attempt.provider as JusticeSureProvider } : {}),
    totalKobo: order.amounts.totalKobo,
    currency: order.currency,
    ...(typeof quote?.displayCurrency === "string" ? { quoteDisplayCurrency: quote.displayCurrency } : {}),
    ...(typeof quote?.chargeCurrency === "string" ? { quoteChargeCurrency: quote.chargeCurrency } : {}),
    ...(typeof quote?.settlementCurrency === "string" ? { quoteSettlementCurrency: quote.settlementCurrency } : {}),
    ...(quote?.currencyMinorUnitExponents && typeof quote.currencyMinorUnitExponents === "object" ? { quoteCurrencyMinorUnitExponents: quote.currencyMinorUnitExponents } : {}),
    checkedAt: new Date(),
  });
}

function errorResponse(res: Response, error: unknown): void {
  if (error instanceof JusticeSureConfigurationError) {
    res.status(503).json({ error: error.message, noPaymentTaken: true });
    return;
  }
  if (error instanceof JusticeSureRequestError) {
    if (error.retryAfterSeconds) res.setHeader("Retry-After", String(error.retryAfterSeconds));
    const status = error.status === 429 ? 503 : Math.min(Math.max(error.status, 400), 504);
    res.status(status).json({
      error: status >= 500 ? "Secure payment could not be confirmed. No payment has been marked as successful." : error.message,
      code: error.code,
      requestId: error.requestId,
      noPaymentTaken: status >= 500,
    });
    return;
  }
  res.status(503).json({ error: "Secure payment is temporarily unavailable. No payment has been taken.", noPaymentTaken: true });
}

router.get("/payment/catalog", async (_req, res): Promise<void> => {
  try {
    const client = new JusticeSureCommerceClient();
    res.json(GetCommerceCatalogResponse.parse({ products: await client.listProducts() }));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get("/payment/locations", async (_req, res): Promise<void> => {
  try {
    const client = new JusticeSureCommerceClient();
    res.json(GetCommerceLocationsResponse.parse({ locations: await client.listLocations() }));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get("/payment/discovery", async (req, res): Promise<void> => {
  const country = stringValue(req.query.country, 2)?.toUpperCase();
  const currency = stringValue(req.query.currency, 3)?.toUpperCase();
  if ((country && !/^[A-Z]{2}$/.test(country)) || (currency && !/^[A-Z]{3}$/.test(currency))) {
    res.status(400).json({ error: "Country and currency must use ISO codes." });
    return;
  }
  try {
    const client = new JusticeSureCommerceClient();
    const [currencies, paymentMethods, corridors] = await Promise.all([
      client.listCurrencies(), client.listPaymentMethods(country, currency), client.listFulfillmentCorridors(),
    ]);
    // Only public-safe readiness and corridor metadata is exposed.
    res.json({ currencies, paymentMethods, corridors });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post("/payment/quote", async (req, res): Promise<void> => {
  const body = checkoutBody(req.body);
  if (!body || !body.paymentProvider || !body.paymentMethod) {
    res.status(400).json({ error: "Provide live items, fulfilment details, and a ready payment method to create a quote." });
    return;
  }
  try {
    const client = new JusticeSureCommerceClient();
    const requestHash = checkoutRequestHash(body);
    const orderIdempotencyKey = `order_${body.checkoutOperationId}`;
    const paymentIdempotencyKey = `payment_${body.checkoutOperationId}`;
    let [attempt] = await db.select().from(commerceCheckoutAttemptsTable)
      .where(eq(commerceCheckoutAttemptsTable.orderIdempotencyKey, orderIdempotencyKey)).limit(1);
    if (attempt && attempt.requestHash !== requestHash) {
      res.status(409).json({ error: "This checkout operation belongs to different quote details. Edit the checkout and create a new quote." });
      return;
    }
    if (attempt?.quoteSnapshot) {
      const expiry = (attempt.quoteSnapshot as Record<string, unknown>).expiresAt;
      if (typeof expiry !== "string" || !Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now()) {
        res.status(410).json({ error: "This immutable quote has expired. Create a new quote.", code: "QUOTE_EXPIRED_REQUOTE_REQUIRED" });
        return;
      }
      res.json(quoteResponse(attempt.quoteSnapshot as Record<string, unknown>));
      return;
    }
    if (!attempt) {
      const catalog = await client.listProducts();
      const storefront = await readPublishedPlatformContent();
      const resolved = storefront
        ? resolveAuthoritativeCheckoutItems(body.items, catalog, storefront.products)
        : null;
      if (!resolved) {
        res.status(400).json({ error: "A selected product or size is no longer available for secure checkout." });
        return;
      }
      const ownershipToken = randomOwnershipToken();
      const items: JusticeSureLineItem[] = resolved.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }));
      const fulfillment: JusticeSureFulfillment = {
        type: body.fulfillment.type,
        ...(body.fulfillment.locationId ? { locationId: body.fulfillment.locationId } : {}),
        ...(body.fulfillment.address ? { address: body.fulfillment.address } : {}),
      };
      // Persist the exact request intent before the quote/network boundary.
      const orderRequestBody = {
        customer: body.customer, items, fulfillment, paymentMethod: body.paymentProvider,
        displayCurrency: body.displayCurrency,
        ...(body.notes === undefined ? {} : { notes: body.notes }),
      };
      try {
        [attempt] = await db.insert(commerceCheckoutAttemptsTable).values({
          ownershipTokenHash: hash(ownershipToken), requestHash,
          customerName: body.customer.name, customerEmail: body.customer.email, customerPhone: body.customer.phone,
          items: resolved, fulfillment: body.fulfillment, orderIdempotencyKey, paymentIdempotencyKey,
          provider: body.paymentProvider, paymentMethod: body.paymentMethod, displayCurrency: body.displayCurrency,
          notes: body.notes ?? null, orderRequestBody,
        }).returning();
        setOwnershipCookie(req, res, attempt.id, ownershipToken);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        res.status(409).json({ error: "This checkout quote is already being prepared. Retry to recover it." });
        return;
      }
    }
    if (!attempt) throw new Error("Checkout quote operation was not persisted.");
    const items: JusticeSureLineItem[] = (attempt.items as CheckoutItem[]).map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }));
    const fulfillment: JusticeSureFulfillment = {
      type: body.fulfillment.type, ...(body.fulfillment.locationId ? { locationId: body.fulfillment.locationId } : {}),
      ...(body.fulfillment.address ? { address: body.fulfillment.address } : {}),
    };
    const quote = await client.createPriceQuote({
      items, fulfillment, provider: body.paymentProvider, paymentMethod: body.paymentMethod,
      ...(body.displayCurrency ? { displayCurrency: body.displayCurrency } : {}),
    });
    if (!quote.payment) throw new JusticeSureRequestError("JusticeSure did not return quote payment authority.", 502);
    if (quote.payment.provider !== body.paymentProvider || quote.payment.method !== body.paymentMethod) {
      throw new JusticeSureRequestError("JusticeSure returned quote payment authority different from the requested ready provider and method.", 502);
    }
    // Creation response deliberately omits line/fulfillment details. Retrieve
    // the immutable quote and bind those authoritative facts before allowing
    // confirmation.
    const retrieved = await client.getPriceQuote(quote.id);
    const currencyMetadata = await client.listCurrencies();
    if (retrieved.expiresAt !== quote.expiresAt || retrieved.displayCurrency !== quote.displayCurrency
      || retrieved.currency !== quote.currency || retrieved.chargeCurrency !== quote.chargeCurrency
      || retrieved.settlementCurrency !== quote.settlementCurrency
      || retrieved.fxSnapshotId !== quote.fxSnapshotId
      || !isDeepStrictEqual(retrieved.amounts, quote.amounts)
      || !quoteMatchesRequestedCheckout(retrieved, items, fulfillment)) {
      throw new JusticeSureRequestError("JusticeSure returned inconsistent immutable quote details.", 502);
    }
    const quoteCurrencies = [quote.currency, quote.displayCurrency, quote.chargeCurrency, quote.settlementCurrency];
    const currencyMinorUnitExponents = Object.fromEntries(quoteCurrencies.map((currency) => {
      const metadata = currencyMetadata.find((item) => item.code === currency);
      if (!metadata) throw new JusticeSureRequestError("JusticeSure did not provide currency exponent metadata for the quote.", 502);
      return [currency, metadata.minorUnitExponent];
    }));
    const snapshot = {
      ...quoteResponse({
      id: quote.id, expiresAt: quote.expiresAt, currency: quote.currency, displayCurrency: quote.displayCurrency,
      chargeCurrency: quote.chargeCurrency, settlementCurrency: quote.settlementCurrency, amounts: quote.amounts, fxSnapshotId: quote.fxSnapshotId, payment: quote.payment,
      }),
      // Internal durable comparison data; deliberately not part of the
      // customer quote projection.
      fxSnapshotId: quote.fxSnapshotId,
      lines: retrieved.lines,
      fulfillment: retrieved.fulfillment,
      currencyMinorUnitExponents,
    };
    const orderRequestBody = {
      customer: body.customer, items, fulfillment, paymentMethod: quote.payment.provider,
      quoteId: quote.id, displayCurrency: quote.displayCurrency,
      ...(body.notes === undefined ? {} : { notes: body.notes }),
    };
    await db.update(commerceCheckoutAttemptsTable).set({
      quoteId: quote.id, quoteSnapshot: snapshot, provider: quote.payment.provider, paymentMethod: quote.payment.method,
      displayCurrency: quote.displayCurrency, orderRequestBody,
      // A payment operation is never reused across immutable quotes.
      orderIdempotencyKey: `order_${body.checkoutOperationId}_${quote.id.slice(0, 8)}`,
      paymentIdempotencyKey: `payment_${body.checkoutOperationId}_${quote.id.slice(0, 8)}`,
    }).where(eq(commerceCheckoutAttemptsTable.id, attempt.id));
    res.status(201).json(snapshot);
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post("/payment/initiate", async (req, res): Promise<void> => {
  const config = justiceSureConfig();
  if (!isJusticeSureCommerceReady(config)) {
    errorResponse(res, new JusticeSureConfigurationError(
      "Secure payment is not available while the JusticeSure v1 runtime and staging configuration are being verified. No payment has been taken.",
    ));
    return;
  }
  const body = checkoutBody(req.body);
  if (!body || !body.quoteId || !body.displayCurrency || !body.paymentProvider || !body.paymentMethod) {
    res.status(400).json({ error: "Review a current immutable quote and choose a ready payment method before secure checkout." });
    return;
  }

  const requestHash = checkoutRequestHash(body);
  let [attempt] = await db
    .select()
    .from(commerceCheckoutAttemptsTable)
    .where(eq(commerceCheckoutAttemptsTable.quoteId, body.quoteId))
    .limit(1);

  if (attempt && attempt.requestHash !== requestHash) {
    res.status(409).json({ error: "This checkout operation belongs to different order details. Start a new checkout attempt." });
    return;
  }

  if (!attempt) {
    res.status(409).json({ error: "Create and review a quote before starting payment." });
    return;
  }
  if (!hasOwnership(req, attempt.id, attempt.ownershipTokenHash)) {
    res.status(403).json({ error: "This checkout attempt belongs to a different browser session." });
    return;
  }
  if (attempt.quoteId !== body.quoteId || !attempt.quoteSnapshot || !attempt.orderRequestBody) {
    res.status(409).json({ error: "This quote is no longer bound to the checkout details. Create a new quote." });
    return;
  }

  if (attempt.checkoutUrl && !(attempt.provider === "simulated" && !attempt.justiceSurePaymentAttemptId)) {
    res.json(InitiateCommerceCheckoutResponse.parse({ attemptId: attempt.id, checkoutUrl: attempt.checkoutUrl }));
    return;
  }

  try {
    const client = new JusticeSureCommerceClient(config);
    const quoteSnapshot = attempt.quoteSnapshot as Record<string, unknown> & {
      payment?: { provider?: JusticeSureProvider }; displayCurrency?: string;
    };
    if (!quoteSnapshot.payment?.provider || !quoteSnapshot.displayCurrency) {
      throw new JusticeSureRequestError("The persisted quote is missing payment authority.", 502);
    }
    // Re-read the immutable quote before ordering; never recalculate its money locally.
    const currentQuote = await client.getPriceQuote(body.quoteId);
    if (!sameImmutableQuote(currentQuote, quoteSnapshot)) {
      throw new JusticeSureRequestError("The immutable quote no longer matches this checkout. Create a new quote.", 409, "QUOTE_EXPIRED_REQUOTE_REQUIRED");
    }
    const order = attempt.justiceSureOrderId
      ? await client.getOrder(attempt.justiceSureOrderId)
      : (await client.createOrder({
        body: attempt.orderRequestBody as import("../lib/justicesureCommerce").JusticeSureOrderRequestBody,
        idempotencyKey: attempt.orderIdempotencyKey,
      })).order;
    await db
      .update(commerceCheckoutAttemptsTable)
      .set({ justiceSureOrderId: order.id, status: attemptStatus(order) })
      .where(eq(commerceCheckoutAttemptsTable.id, attempt.id));
    const paymentSessionRequestBody = (attempt.paymentSessionRequestBody as import("../lib/justicesureCommerce").JusticeSurePaymentSessionRequestBody | null) ?? {
      provider: quoteSnapshot.payment.provider,
      email: attempt.customerEmail,
      ...(quoteSnapshot.payment.provider === "flutterwave" ? { redirectUrl: config.paymentReturnUrl } : {}),
    };
    if (paymentSessionRequestBody.provider !== quoteSnapshot.payment.provider) {
      throw new JusticeSureRequestError("The persisted payment-session body does not match immutable quote authority.", 409, "QUOTE_EXPIRED_REQUOTE_REQUIRED");
    }
    if (!attempt.paymentSessionRequestBody) {
      await db.update(commerceCheckoutAttemptsTable).set({ paymentSessionRequestBody })
        .where(eq(commerceCheckoutAttemptsTable.id, attempt.id));
    }
    const session = await client.createPaymentSession({
      orderId: order.id,
      body: paymentSessionRequestBody,
      idempotencyKey: attempt.paymentIdempotencyKey,
    });
    if (session.provider !== quoteSnapshot.payment.provider && session.provider !== "simulated") {
      throw new JusticeSureRequestError("JusticeSure returned a session that does not match the immutable quote provider.", 502);
    }
    await db
      .update(commerceCheckoutAttemptsTable)
      .set({
        provider: session.provider,
        paymentReference: session.reference,
        justiceSurePaymentAttemptId: session.attemptId ?? null,
        justiceSurePaymentIntentId: session.paymentIntentId ?? null,
        justiceSureOriginalCharge: session.originalCharge ?? null,
        checkoutUrl: session.checkoutUrl,
        status: attemptStatus(order),
      })
      .where(eq(commerceCheckoutAttemptsTable.id, attempt.id));
    await syncLocalOrder(attempt.id, order);
    res.json(InitiateCommerceCheckoutResponse.parse({ attemptId: attempt.id, checkoutUrl: session.checkoutUrl }));
  } catch (error) {
    const safeError = error instanceof JusticeSureRequestError ? error : null;
    await db
      .update(commerceCheckoutAttemptsTable)
      .set({
        lastErrorCode: safeError?.code ?? "COMMERCE_UNAVAILABLE",
        lastErrorMessage: safeError?.message ?? "JusticeSure could not complete the request.",
      })
      .where(eq(commerceCheckoutAttemptsTable.id, attempt.id));
    errorResponse(res, error);
  }
});

router.get("/payment/status/:attemptId", async (req, res): Promise<void> => {
  const params = GetCommercePaymentStatusParams.safeParse(req.params);
  if (!params.success || !isUuid(params.data.attemptId)) {
    res.status(404).json({ error: "Checkout attempt not found." });
    return;
  }
  const [attempt] = await db
    .select()
    .from(commerceCheckoutAttemptsTable)
    .where(eq(commerceCheckoutAttemptsTable.id, params.data.attemptId))
    .limit(1);
  if (!attempt || !hasOwnership(req, attempt.id, attempt.ownershipTokenHash)) {
    res.status(404).json({ error: "Checkout attempt not found." });
    return;
  }
  if (!attempt.justiceSureOrderId) {
    res.status(202).json(GetCommercePaymentStatusResponse.parse({ attemptId: attempt.id, status: attempt.status, paymentStatus: "pending", checkedAt: new Date() }));
    return;
  }
  try {
    const client = new JusticeSureCommerceClient();
    const recoveryPending = attempt.status === "starting" || attempt.status === "payment_pending";
    const remoteAttemptId = attempt.justiceSurePaymentAttemptId;
    if (recoveryPending && attempt.provider === "simulated" && !remoteAttemptId) {
      throw new JusticeSureRequestError("The Test payment attempt identifier is missing; payment status cannot be verified.", 502);
    }
    if (recoveryPending && remoteAttemptId && !isUuid(remoteAttemptId)) {
      throw new JusticeSureRequestError("The persisted payment attempt identifier is invalid; payment status cannot be verified.", 502);
    }
    if (shouldRecoverPaymentAttempt(attempt.status, attempt.provider, remoteAttemptId, attempt.paymentRecoveryCheckedAt)) {
      await db.update(commerceCheckoutAttemptsTable)
        .set({ paymentRecoveryCheckedAt: new Date() })
        .where(eq(commerceCheckoutAttemptsTable.id, attempt.id));
      const verified = await client.verifyPaymentAttempt(attempt.justiceSureOrderId, remoteAttemptId as string);
      if (verified.status === "pending") {
        await client.reconcilePaymentAttempt(attempt.justiceSureOrderId, remoteAttemptId as string);
      }
    }
    const order = await client.getOrder(attempt.justiceSureOrderId);
    await syncLocalOrder(attempt.id, order);
    res.json(publicStatus(order, attempt));
  } catch (error) {
    errorResponse(res, error);
  }
});

async function ownedAttempt(req: Request) {
  const attemptId = header(req, "x-soso-checkout-attempt");
  if (!isUuid(attemptId)) return undefined;
  const [attempt] = await db.select().from(commerceCheckoutAttemptsTable)
    .where(eq(commerceCheckoutAttemptsTable.id, attemptId)).limit(1);
  return attempt && hasOwnership(req, attempt.id, attempt.ownershipTokenHash) ? attempt : undefined;
}

router.get("/payment/measurements", async (req, res): Promise<void> => {
  const attempt = await ownedAttempt(req);
  if (!attempt?.justiceSureOrderId) {
    res.status(403).json({ error: "Checkout ownership is not valid." });
    return;
  }
  try {
    const remoteOrder = await new JusticeSureCommerceClient().getOrder(attempt.justiceSureOrderId);
    await syncLocalOrder(attempt.id, remoteOrder);
    const paymentStatus = remoteStatus(remoteOrder);
    if (!shouldActivateMeasurements(paymentStatus) || !attempt.localOrderId) {
      const [refreshed] = await db.select({ localOrderId: commerceCheckoutAttemptsTable.localOrderId })
        .from(commerceCheckoutAttemptsTable).where(eq(commerceCheckoutAttemptsTable.id, attempt.id)).limit(1);
      if (!shouldActivateMeasurements(paymentStatus) || !refreshed?.localOrderId) {
        res.status(409).json({ error: "Measurements are available only for a paid order." });
        return;
      }
    }
    const [refreshed] = await db.select().from(commerceCheckoutAttemptsTable)
      .where(eq(commerceCheckoutAttemptsTable.id, attempt.id)).limit(1);
    const rows = await db.select({ request: measurementRequestsTable, item: orderItemsTable })
      .from(measurementRequestsTable)
      .innerJoin(orderItemsTable, eq(measurementRequestsTable.orderItemId, orderItemsTable.id))
      .where(eq(orderItemsTable.orderId, refreshed!.localOrderId!));
    res.json(GetCustomerMeasurementsResponse.parse({
      paymentStatus,
      measurementsRequired: rows.some(({ request }) => request.status !== "confirmed" && request.status !== "cancelled"),
      orderNumber: remoteOrder.number,
      dispatchGuidance: CUSTOM_DISPATCH_GUIDANCE,
      items: rows.map(measurementView),
    }));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.put("/payment/measurements/:id", async (req, res): Promise<void> => {
  const params = UpdateCustomerMeasurementParams.safeParse(req.params);
  const parsed = UpdateCustomerMeasurementBody.safeParse(req.body);
  if (!params.success || !parsed.success
    || !validateMeasurementValues(parsed.data.unit, parsed.data.values)
    || (parsed.data.customerNote?.length ?? 0) > 500) {
    res.status(400).json({ error: "Provide all required measurements within the permitted bounds." });
    return;
  }
  const attempt = await ownedAttempt(req);
  if (!attempt?.justiceSureOrderId) {
    res.status(403).json({ error: "Checkout ownership is not valid." });
    return;
  }
  try {
    const remoteOrder = await new JusticeSureCommerceClient().getOrder(attempt.justiceSureOrderId);
    await syncLocalOrder(attempt.id, remoteOrder);
    if (!shouldActivateMeasurements(remoteStatus(remoteOrder))) {
      res.status(409).json({ error: "Measurements are available only for a paid order." });
      return;
    }
    const [refreshed] = await db.select({ localOrderId: commerceCheckoutAttemptsTable.localOrderId })
      .from(commerceCheckoutAttemptsTable)
      .where(eq(commerceCheckoutAttemptsTable.id, attempt.id))
      .limit(1);
    if (!refreshed?.localOrderId) {
      res.status(409).json({ error: "The paid order handoff is still being prepared. Please retry." });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select({ request: measurementRequestsTable, item: orderItemsTable })
        .from(measurementRequestsTable)
        .innerJoin(orderItemsTable, eq(measurementRequestsTable.orderItemId, orderItemsTable.id))
        .where(and(
          eq(measurementRequestsTable.id, params.data.id),
          eq(orderItemsTable.orderId, refreshed.localOrderId!),
          eq(orderItemsTable.selectionType, "custom"),
        )).limit(1);
      if (!row) return { kind: "missing" as const };
      if (!customerCanSubmit(row.request.status)) return { kind: "transition" as const };
      const [updated] = await tx.update(measurementRequestsTable).set({
        unit: parsed.data.unit,
        values: parsed.data.values,
        customerNote: parsed.data.customerNote?.trim() || null,
        clarificationNote: null,
        status: "submitted",
        submittedAt: new Date(),
        version: row.request.version + 1,
        updatedAt: new Date(),
      }).where(and(
        eq(measurementRequestsTable.id, row.request.id),
        eq(measurementRequestsTable.version, parsed.data.version),
        inArray(measurementRequestsTable.status, ["needed", "submitted", "clarification_requested"]),
      )).returning();
      if (!updated) return { kind: "stale" as const };
      await tx.insert(measurementRevisionsTable).values({
        measurementRequestId: updated.id,
        version: updated.version,
        actorType: "customer",
        actorId: attempt.id,
        action: row.request.status === "needed" ? "submitted" : "corrected",
        snapshot: updated,
      });
      return { kind: "updated" as const, row: { request: updated, item: row.item } };
    });
    if (result.kind === "missing") {
      res.status(404).json({ error: "Custom measurement request not found." });
      return;
    }
    if (result.kind !== "updated") {
      res.status(409).json({ error: "This measurement request cannot be edited or has changed." });
      return;
    }
    res.json(UpdateCustomerMeasurementResponse.parse(measurementView(result.row)));
  } catch (error) {
    errorResponse(res, error);
  }
});

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function validWebhook(req: Request): { envelope: WebhookEnvelope; rawBody: Buffer } | null {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const config = justiceSureConfig();
  const timestamp = header(req, "x-justicesure-timestamp");
  const eventId = header(req, "x-justicesure-event-id");
  const event = header(req, "x-justicesure-event");
  const signature = header(req, "x-justicesure-signature");
  if (!rawBody || !config.webhookSecret || !timestamp || !eventId || !event || !signature || !/^evt_[A-Za-z0-9_-]{24}$/.test(eventId) || !/^sha256=[a-f0-9]{64}$/.test(signature)) return null;
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(Date.now() - seconds * 1_000) > WEBHOOK_TOLERANCE_SECONDS * 1_000) return null;
  const expected = `sha256=${crypto.createHmac("sha256", config.webhookSecret).update(`${timestamp}.${eventId}.`).update(rawBody).digest("hex")}`;
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (received.length !== expectedBuffer.length || !crypto.timingSafeEqual(received, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || parsed.id !== eventId || parsed.event !== event
      || !supportedWebhookEvents.has(event) || parsed.apiVersion !== "2025-01-01"
      || typeof parsed.createdAt !== "string" || !Number.isFinite(Date.parse(parsed.createdAt))
      || !parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) return null;
    const data = parsed.data as Record<string, unknown>;
    const required = webhookRequiredFields[event] ?? [];
    if (required.some((field) => !(field in data))
      || (typeof data.orderId === "string" && !isUuid(data.orderId))
      || (typeof data.productId === "string" && !isUuid(data.productId))
      || (typeof data.variantId === "string" && !isUuid(data.variantId))
      || (typeof data.inventoryItemId === "string" && !isUuid(data.inventoryItemId))
      || (typeof data.updatedAt !== "string" && required.includes("updatedAt"))
      || (typeof data.updatedAt === "string" && !Number.isFinite(Date.parse(data.updatedAt)))
      || (typeof data.totalKobo !== "undefined" && (typeof data.totalKobo !== "number" || !Number.isSafeInteger(data.totalKobo) || data.totalKobo < 0))
      || (typeof data.amountKobo !== "undefined" && (typeof data.amountKobo !== "number" || !Number.isSafeInteger(data.amountKobo) || data.amountKobo < 0))
      || (typeof data.refundedKobo !== "undefined" && (typeof data.refundedKobo !== "number" || !Number.isSafeInteger(data.refundedKobo) || data.refundedKobo < 0))
      || (typeof data.isFullRefund !== "undefined" && typeof data.isFullRefund !== "boolean")) return null;
    return {
      envelope: {
        id: eventId,
        event,
        apiVersion: parsed.apiVersion,
        createdAt: parsed.createdAt,
        data: {
          ...(typeof data.orderId === "string" ? { orderId: data.orderId } : {}),
          catalogueIdentifiers: [...new Set(
            [data.productId, data.variantId, data.inventoryItemId]
              .filter((value): value is string => typeof value === "string"),
          )],
        },
      },
      rawBody,
    };
  } catch {
    return null;
  }
}

router.post("/payment/webhook", async (req, res): Promise<void> => {
  if (!isJusticeSureCommerceReady() || !justiceSureConfig().webhookSecret) {
    res.status(503).json({ error: "Webhook receiver is not configured." });
    return;
  }
  const verified = validWebhook(req);
  if (!verified) {
    res.status(401).json({ error: "Invalid JusticeSure webhook signature or envelope." });
    return;
  }
  const { envelope, rawBody } = verified;
  const [inserted] = await db
    .insert(commerceWebhookEventsTable)
    .values({
      eventId: envelope.id,
      eventType: envelope.event,
      apiVersion: envelope.apiVersion,
      payloadHash: hash(rawBody),
      eventOccurredAt: new Date(envelope.createdAt),
      catalogueIdentifiers: envelope.data.catalogueIdentifiers,
    })
    .onConflictDoNothing()
    .returning({ leaseGeneration: commerceWebhookEventsTable.leaseGeneration });

  let claimedGeneration = inserted?.leaseGeneration;
  if (!inserted) {
    const [existing] = await db
      .select()
      .from(commerceWebhookEventsTable)
      .where(eq(commerceWebhookEventsTable.eventId, envelope.id))
      .limit(1);
    if (!existing || existing.payloadHash !== hash(rawBody)) {
      res.status(400).json({ error: "Webhook event ID was reused with a different payload." });
      return;
    }
    if (existing.status === "completed") {
      res.status(200).json(ReceiveCommerceWebhookResponse.parse({ received: true, duplicate: true }));
      return;
    }
    const [reclaimed] = await db
      .update(commerceWebhookEventsTable)
      .set({
        status: "processing",
        processingStartedAt: sql`now()`,
        updatedAt: sql`now()`,
        leaseGeneration: sql`${commerceWebhookEventsTable.leaseGeneration} + 1`,
        lastError: null,
      })
      .where(and(
        eq(commerceWebhookEventsTable.eventId, envelope.id),
        ne(commerceWebhookEventsTable.status, "completed"),
        or(
          eq(commerceWebhookEventsTable.status, "failed"),
          sql`${commerceWebhookEventsTable.updatedAt} < now() - interval '5 minutes'`,
        ),
      ))
      .returning({ leaseGeneration: commerceWebhookEventsTable.leaseGeneration });
    if (!reclaimed) {
      res.status(503).json({ error: "Webhook lease could not be claimed; retry this delivery." });
      return;
    }
    claimedGeneration = reclaimed.leaseGeneration;
  }

  if (claimedGeneration === undefined) {
    res.status(503).json({ error: "Webhook processing lease changed; retry this delivery." });
    return;
  }
  try {
    const orderId = envelope.data?.orderId;
    let completedWithEffects = false;
    if (isRemoteOrderId(orderId)) {
      const [attempt] = await db
        .select()
        .from(commerceCheckoutAttemptsTable)
        .where(eq(commerceCheckoutAttemptsTable.justiceSureOrderId, orderId))
        .limit(1);
      if (attempt) {
        const order = await new JusticeSureCommerceClient().getOrder(orderId);
        await syncLocalOrder(attempt.id, order, {
          eventId: envelope.id,
          leaseGeneration: claimedGeneration,
        });
        completedWithEffects = true;
      }
    }
    // syncLocalOrder completes the locked lease in its own effects transaction.
    // Events without a local checkout still need an atomic fenced completion.
    if (!completedWithEffects) {
      const [completed] = await db
      .update(commerceWebhookEventsTable)
      .set({ status: "completed", completedAt: sql`now()`, updatedAt: sql`now()`, lastError: null })
      .where(and(
        eq(commerceWebhookEventsTable.eventId, envelope.id),
        eq(commerceWebhookEventsTable.status, "processing"),
        eq(commerceWebhookEventsTable.leaseGeneration, claimedGeneration),
      ))
      .returning({ eventId: commerceWebhookEventsTable.eventId });
      if (!completed) {
        res.status(503).json({ error: "Webhook processing lease changed; retry this delivery." });
        return;
      }
    }
    res.status(200).json(ReceiveCommerceWebhookResponse.parse({ received: true }));
  } catch {
    await db
      .update(commerceWebhookEventsTable)
      .set({ status: "failed", updatedAt: sql`now()`, lastError: "Authoritative order refresh failed." })
      .where(and(
        eq(commerceWebhookEventsTable.eventId, envelope.id),
        eq(commerceWebhookEventsTable.status, "processing"),
        eq(commerceWebhookEventsTable.leaseGeneration, claimedGeneration),
      ));
    res.status(503).json({ error: "Webhook processing did not complete; retry this delivery." });
  }
});

export default router;