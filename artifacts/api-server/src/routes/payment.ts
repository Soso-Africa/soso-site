import crypto from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";
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
  InitiateCommerceCheckoutBody,
  InitiateCommerceCheckoutResponse,
  ReceiveCommerceWebhookBody,
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
const WEBHOOK_LEASE_MS = 5 * 60 * 1_000;
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
  notes?: string;
};

type WebhookEnvelope = {
  id: string;
  event: string;
  apiVersion: string;
  data: { orderId?: string };
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

function hasOwnership(req: Request, attemptId: string, tokenHash: string): boolean {
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
  return {
    checkoutOperationId,
    customer: { name, email, phone },
    items,
    fulfillment: { type, locationId, address },
    notes: stringValue(body.notes, 1_000),
  };
}

function remoteStatus(order: JusticeSureOrder): "payment_pending" | "paid" | "cancelled" | "refunded" | "fulfilled" {
  const paymentStatus = typeof order.payment.status === "string" ? order.payment.status.toLowerCase() : "";
  const fulfillmentStatus = typeof order.fulfillment.status === "string" ? order.fulfillment.status.toLowerCase() : "";
  const orderStatus = order.status.toLowerCase();
  if (orderStatus.includes("refund") || paymentStatus.includes("refund")) return "refunded";
  if (orderStatus.includes("cancel") || paymentStatus.includes("cancel")) return "cancelled";
  if (fulfillmentStatus.includes("fulfill") || fulfillmentStatus.includes("deliver") || orderStatus.includes("complete")) return "fulfilled";
  if (paymentStatus === "paid" || paymentStatus === "successful" || (order.amounts.paidKobo ?? 0) >= order.amounts.totalKobo) return "paid";
  return "payment_pending";
}

function attemptStatus(order: JusticeSureOrder): "payment_pending" | "paid" | "cancelled" | "refunded" | "fulfilled" {
  return remoteStatus(order);
}

function toNaira(kobo: number): string {
  return (kobo / 100).toFixed(2);
}

async function syncLocalOrder(attemptId: string, order: JusticeSureOrder): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`soso-checkout-sync:${attemptId}`}))`);
    const [attempt] = await tx.select().from(commerceCheckoutAttemptsTable)
      .where(eq(commerceCheckoutAttemptsTable.id, attemptId)).limit(1);
    if (!attempt) return;
    const status = remoteStatus(order);
    let localOrderId = attempt.localOrderId;
    if (!localOrderId) {
      const items = attempt.items as CheckoutItem[];
      const [created] = await tx.insert(ordersTable).values({
        orderNumber: order.number,
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
  return GetCommercePaymentStatusResponse.parse({
    attemptId: attempt.id,
    orderNumber: order.number,
    status: attemptStatus(order),
    paymentStatus: typeof order.payment.status === "string" ? order.payment.status : "pending",
    ...(attempt.provider === "paystack" || attempt.provider === "flutterwave" ? { provider: attempt.provider } : {}),
    totalKobo: order.amounts.totalKobo,
    currency: order.currency,
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

router.post("/payment/initiate", async (req, res): Promise<void> => {
  const config = justiceSureConfig();
  if (!isJusticeSureCommerceReady(config)) {
    errorResponse(res, new JusticeSureConfigurationError(
      "Secure payment is not available while the JusticeSure v1 runtime and staging configuration are being verified. No payment has been taken.",
    ));
    return;
  }
  const contractBody = InitiateCommerceCheckoutBody.safeParse(req.body);
  const body = contractBody.success ? checkoutBody(contractBody.data) : null;
  if (!body) {
    res.status(400).json({ error: "Provide a valid JusticeSure checkout request with live product IDs, fulfilment details, and contact information." });
    return;
  }

  const requestHash = hash(JSON.stringify({
    customer: body.customer,
    items: body.items.map(({ productId, variantId, quantity, selectedColourId, selectedColourLabel, selectedColourHex, customColour }) =>
      ({ productId, variantId, quantity, selectedColourId, selectedColourLabel, selectedColourHex, customColour })),
    fulfillment: body.fulfillment,
    notes: body.notes ?? "",
  }));
  const orderIdempotencyKey = `order_${body.checkoutOperationId}`;
  const paymentIdempotencyKey = `payment_${body.checkoutOperationId}`;
  let [attempt] = await db
    .select()
    .from(commerceCheckoutAttemptsTable)
    .where(eq(commerceCheckoutAttemptsTable.orderIdempotencyKey, orderIdempotencyKey))
    .limit(1);

  if (attempt && attempt.requestHash !== requestHash) {
    res.status(409).json({ error: "This checkout operation belongs to different order details. Start a new checkout attempt." });
    return;
  }

  let concurrentCreate = false;
  if (!attempt) {
    let authoritativeItems: CheckoutItem[];
    try {
      const catalog = await new JusticeSureCommerceClient(config).listProducts();
      const storefront = await readPublishedPlatformContent();
      if (!storefront) {
        res.status(503).json({ error: "Published product options are unavailable. No payment has been taken.", noPaymentTaken: true });
        return;
      }
      const resolved = resolveAuthoritativeCheckoutItems(body.items, catalog, storefront.products);
      if (!resolved) {
        res.status(400).json({ error: "A selected product or size is no longer available for secure checkout." });
        return;
      }
      authoritativeItems = resolved;
    } catch (error) {
      errorResponse(res, error);
      return;
    }
    const ownershipToken = randomOwnershipToken();
    try {
      [attempt] = await db
        .insert(commerceCheckoutAttemptsTable)
        .values({
          ownershipTokenHash: hash(ownershipToken),
          requestHash,
          customerName: body.customer.name,
          customerEmail: body.customer.email,
          customerPhone: body.customer.phone,
          items: authoritativeItems,
          fulfillment: body.fulfillment,
          orderIdempotencyKey,
          paymentIdempotencyKey,
        })
        .returning();
      setOwnershipCookie(req, res, attempt.id, ownershipToken);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      concurrentCreate = true;
      [attempt] = await db
        .select()
        .from(commerceCheckoutAttemptsTable)
        .where(eq(commerceCheckoutAttemptsTable.orderIdempotencyKey, orderIdempotencyKey))
        .limit(1);
    }
  }
  if (!attempt) {
    res.status(503).json({ error: "Checkout preparation did not complete. Please retry once.", noPaymentTaken: true });
    return;
  }
  if (!hasOwnership(req, attempt.id, attempt.ownershipTokenHash)) {
    if (concurrentCreate) {
      res.status(409).json({ error: "This checkout is already being prepared. Please retry after the first request completes." });
      return;
    }
    res.status(403).json({ error: "This checkout attempt belongs to a different browser session." });
    return;
  }

  if (attempt.checkoutUrl) {
    res.json(InitiateCommerceCheckoutResponse.parse({ attemptId: attempt.id, checkoutUrl: attempt.checkoutUrl }));
    return;
  }

  try {
    const client = new JusticeSureCommerceClient(config);
    const persistedItems = attempt.items as CheckoutItem[];
    const items: JusticeSureLineItem[] = persistedItems.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }));
    const fulfillment: JusticeSureFulfillment = {
      type: body.fulfillment.type,
      ...(body.fulfillment.locationId ? { locationId: body.fulfillment.locationId } : {}),
      ...(body.fulfillment.address ? { address: body.fulfillment.address } : {}),
    };
    if (body.fulfillment.type === "delivery") {
      const quote = await client.createDeliveryQuote(items, body.fulfillment.address!, body.fulfillment.locationId);
      fulfillment.deliveryQuoteToken = quote.quoteToken;
    }
    const order = attempt.justiceSureOrderId
      ? await client.getOrder(attempt.justiceSureOrderId)
      : await client.createOrder({
        customer: body.customer,
        items,
        fulfillment,
        paymentMethod: config.paymentProvider!,
        notes: body.notes,
        idempotencyKey: attempt.orderIdempotencyKey,
      });
    await db
      .update(commerceCheckoutAttemptsTable)
      .set({ justiceSureOrderId: order.id, status: attemptStatus(order) })
      .where(eq(commerceCheckoutAttemptsTable.id, attempt.id));
    const session = await client.createPaymentSession({
      orderId: order.id,
      checkoutAttemptId: attempt.id,
      provider: config.paymentProvider!,
      email: body.customer.email,
      idempotencyKey: attempt.paymentIdempotencyKey,
    });
    await db
      .update(commerceCheckoutAttemptsTable)
      .set({
        provider: session.provider,
        paymentReference: session.reference,
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
    const order = await new JusticeSureCommerceClient().getOrder(attempt.justiceSureOrderId);
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
  if (!rawBody || !config.webhookSecret || !timestamp || !eventId || !event || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return null;
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(Date.now() - seconds * 1_000) > WEBHOOK_TOLERANCE_SECONDS * 1_000) return null;
  const expected = `sha256=${crypto.createHmac("sha256", config.webhookSecret).update(`${timestamp}.${eventId}.`).update(rawBody).digest("hex")}`;
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (received.length !== expectedBuffer.length || !crypto.timingSafeEqual(received, expectedBuffer)) return null;
  try {
    const parsed = ReceiveCommerceWebhookBody.safeParse(JSON.parse(rawBody.toString("utf8")));
    if (!parsed.success || parsed.data.id !== eventId || parsed.data.event !== event || !supportedWebhookEvents.has(parsed.data.event)) return null;
    const data = parsed.data.data ?? {};
    return {
      envelope: {
        id: parsed.data.id,
        event: parsed.data.event,
        apiVersion: parsed.data.apiVersion,
        data: { ...(typeof data.orderId === "string" ? { orderId: data.orderId } : {}) },
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
    })
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    const [existing] = await db
      .select()
      .from(commerceWebhookEventsTable)
      .where(eq(commerceWebhookEventsTable.eventId, envelope.id))
      .limit(1);
    if (existing?.status === "completed") {
      res.status(200).json(ReceiveCommerceWebhookResponse.parse({ received: true, duplicate: true }));
      return;
    }
    if (existing && existing.updatedAt.getTime() > Date.now() - WEBHOOK_LEASE_MS) {
      res.status(503).json({ error: "Webhook is still being processed; retry this delivery." });
      return;
    }
    const [reclaimed] = await db
      .update(commerceWebhookEventsTable)
      .set({
        status: "processing",
        processingStartedAt: new Date(),
        lastError: null,
      })
      .where(and(
        eq(commerceWebhookEventsTable.eventId, envelope.id),
        ne(commerceWebhookEventsTable.status, "completed"),
        lt(commerceWebhookEventsTable.updatedAt, new Date(Date.now() - WEBHOOK_LEASE_MS)),
      ))
      .returning({ eventId: commerceWebhookEventsTable.eventId });
    if (!reclaimed) {
      res.status(503).json({ error: "Webhook lease could not be claimed; retry this delivery." });
      return;
    }
  }

  try {
    const orderId = envelope.data?.orderId;
    if (isRemoteOrderId(orderId)) {
      const [attempt] = await db
        .select()
        .from(commerceCheckoutAttemptsTable)
        .where(eq(commerceCheckoutAttemptsTable.justiceSureOrderId, orderId))
        .limit(1);
      if (attempt) {
        const order = await new JusticeSureCommerceClient().getOrder(orderId);
        await syncLocalOrder(attempt.id, order);
      }
    }
    await db
      .update(commerceWebhookEventsTable)
      .set({ status: "completed", completedAt: new Date(), lastError: null })
      .where(eq(commerceWebhookEventsTable.eventId, envelope.id));
    res.status(200).json(ReceiveCommerceWebhookResponse.parse({ received: true }));
  } catch {
    await db
      .update(commerceWebhookEventsTable)
      .set({ status: "failed", lastError: "Authoritative order refresh failed." })
      .where(eq(commerceWebhookEventsTable.eventId, envelope.id));
    res.status(503).json({ error: "Webhook processing did not complete; retry this delivery." });
  }
});

export default router;