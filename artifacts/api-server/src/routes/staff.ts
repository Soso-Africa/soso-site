import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import {
  AcknowledgeStaffNotificationBody,
  AcknowledgeStaffNotificationParams,
  AcknowledgeStaffNotificationResponse,
  CreateStaffPrivacyRequestBody,
  CreateStaffPrivacyRequestResponse,
  GetStaffExportResponse,
  GetStaffFunnelResponse,
  GetStaffOverviewResponse,
  GetStaffProfileResponse,
  ListStaffAuditEventsResponse,
  ListStaffEnquiriesResponse,
  ListStaffNotificationsResponse,
  ListStaffOrdersResponse,
  ListStaffPrivacyRequestsResponse,
  UpdateStaffEnquiryBody,
  UpdateStaffEnquiryParams,
  UpdateStaffEnquiryResponse,
  UpdateStaffOrderBody,
  UpdateStaffOrderParams,
  UpdateStaffOrderResponse,
  UpdateStaffPrivacyRequestBody,
  UpdateStaffPrivacyRequestParams,
  UpdateStaffPrivacyRequestResponse,
  INVALID_STOREFRONT_PATH_PATTERN,
} from "@workspace/api-zod";
import {
  analyticsEventsTable,
  auditLogsTable,
  customerEnquiriesTable,
  commerceCheckoutAttemptsTable,
  db,
  orderItemsTable,
  redirectsTable,
  operationalNotificationAcknowledgementsTable,
  operationalNotificationsTable,
  ordersTable,
  privacyRequestsTable,
  privacyAccessPackagesTable,
} from "@workspace/db";
import { and, count, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { currentPrivacyPolicyVersion, recordPrivacyPolicyVersion } from "../lib/privacyPolicy";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import {
  buildAnalyticsQualityReport,
  QUALITY_EVENT_LIMIT,
} from "./analytics-quality";
import { buildReportingRates, comparisonDelta, eventCountMap } from "./analytics-reporting";

const router: IRouter = Router();

router.use("/staff", requireStaff);

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const orderStatuses = [
  "payment_pending",
  "paid",
  "atelier_confirmation",
  "in_production",
  "ready",
  "fulfilled",
  "cancelled",
  "refunded",
] as const;

const activeOrderStatuses = ["paid", "atelier_confirmation", "in_production", "ready"] as const;
const measurementConsents = ["analytics", "marketing"] as const;
const orderTransitions: Record<(typeof orderStatuses)[number], readonly (typeof orderStatuses)[number][]> = {
  payment_pending: [],
  paid: ["atelier_confirmation", "cancelled"],
  atelier_confirmation: ["in_production", "cancelled"],
  in_production: ["ready"],
  ready: ["fulfilled"],
  fulfilled: [],
  cancelled: [],
  refunded: [],
};

const privacyTransitions: Record<"received" | "identity_verified" | "in_progress" | "completed" | "rejected", readonly string[]> = {
  received: ["identity_verified", "rejected"],
  identity_verified: ["in_progress", "completed", "rejected"],
  in_progress: ["completed", "rejected"],
  completed: [],
  rejected: [],
} as const;

function resolveDateRange(query: Record<string, unknown>) {
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(today.getUTCDate() - 6);

  const from = typeof query.from === "string" ? query.from : defaultFrom.toISOString().slice(0, 10);
  const to = typeof query.to === "string" ? query.to : today.toISOString().slice(0, 10);
  if (!datePattern.test(from) || !datePattern.test(to) || from > to) return null;

  return {
    from,
    to,
    start: new Date(`${from}T00:00:00.000Z`),
    end: new Date(`${to}T23:59:59.999Z`),
  };
}

function auditMetadata(metadata: Record<string, unknown>) {
  return metadata;
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function privacyPackageHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function hasRecordedIdentityVerification(request: {
  verificationNote: string | null;
  verifiedAt: Date | null;
  verifiedByClerkUserId: string | null;
}): boolean {
  return Boolean(request.verificationNote?.trim() && request.verifiedAt && request.verifiedByClerkUserId);
}

function orderView(order: typeof ordersTable.$inferSelect) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    total: order.total,
    currency: order.currency,
    status: order.status,
    atelierNotes: order.atelierNotes,
    deliveryNotes: order.deliveryNotes,
    refundRequestStatus: order.refundRequestStatus,
    refundRequestReason: order.refundRequestReason,
    refundDecisionNote: order.refundDecisionNote,
    refundRequestedAt: order.refundRequestedAt,
    refundReviewedAt: order.refundReviewedAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

router.get("/staff/me", (req, res): void => {
  res.json(
    GetStaffProfileResponse.parse({
      id: req.staff!.id,
      email: req.staff!.email,
      role: req.staff!.role,
    }),
  );
});

router.get("/staff/overview", async (req, res): Promise<void> => {
  const range = resolveDateRange(req.query);
  if (!range) {
    res.status(400).json({ error: "Use a valid from/to date range (YYYY-MM-DD)" });
    return;
  }

  const activeEnquiryStatuses = ["new", "in_progress"];
  const [[orders], [inProduction], [enquiries], [events]] = await Promise.all([
    db.select({ value: count() }).from(ordersTable).where(and(gte(ordersTable.createdAt, range.start), lte(ordersTable.createdAt, range.end))),
    db
      .select({ value: count() })
      .from(ordersTable)
      .where(inArray(ordersTable.status, ["atelier_confirmation", "in_production"])),
    db
      .select({ value: count() })
      .from(customerEnquiriesTable)
      .where(and(inArray(customerEnquiriesTable.status, activeEnquiryStatuses), gte(customerEnquiriesTable.createdAt, range.start), lte(customerEnquiriesTable.createdAt, range.end))),
    db
      .select({ value: count() })
      .from(analyticsEventsTable)
      .where(and(gte(analyticsEventsTable.occurredAt, range.start), lte(analyticsEventsTable.occurredAt, range.end), inArray(analyticsEventsTable.consent, ["analytics", "marketing"]))),
  ]);

    const values = new Map(counts.map((row) => [row.eventName, Number(row.value)]));

  res.json(
    GetStaffOverviewResponse.parse({
      ...values,
      paymentIsLive: false,
      from: range.from,
      to: range.to,
      generatedAt: new Date(),
      freshnessMinutes: 5,
      metrics: [
        { key: "orders_received", label: "Orders received", definition: "Orders created in the selected date range.", value: values.ordersTotal },
        { key: "in_production", label: "Atelier active", definition: "All orders currently in atelier confirmation or production, regardless of when they were created.", value: values.ordersInProduction },
        { key: "open_enquiries", label: "Open enquiries", definition: "New or in-progress enquiries received in the selected date range.", value: values.openEnquiries },
        { key: "consented_events", label: "Consented storefront events", definition: "First-party events from visitors who opted into measurement.", value: values.storefrontEvents7d },
      ],
    }),
  );
});

router.get(
  "/staff/funnel",
  requireStaffRoles("owner", "analyst"),
  async (req, res): Promise<void> => {
  const range = resolveDateRange(req.query);
    if (!range) {
      res.status(400).json({ error: "Use a valid from/to date range (YYYY-MM-DD)" });
      return;
    }

    const eventNames = [
      "page_view",
      "product_view",
      "size_guide_opened",
      "add_to_bag",
      "cart_opened",
      "checkout_started",
      "checkout_payment_unavailable",
    ] as const;
    const counts = await db
      .select({ eventName: analyticsEventsTable.eventName, value: count() })
      .from(analyticsEventsTable)
      .where(and(gte(analyticsEventsTable.occurredAt, range.start), lte(analyticsEventsTable.occurredAt, range.end), inArray(analyticsEventsTable.eventName, eventNames), inArray(analyticsEventsTable.consent, ["analytics", "marketing"])))
      .groupBy(analyticsEventsTable.eventName);
    const values = new Map(counts.map((row) => [row.eventName, Number(row.value)]));
    const periodDays = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000));
  const events = await db
    .select({ id: auditLogsTable.id, action: auditLogsTable.action, entityType: auditLogsTable.entityType, entityId: auditLogsTable.entityId, metadata: auditLogsTable.metadata, createdAt: auditLogsTable.createdAt })
    .from(auditLogsTable)
    .where(and(gte(auditLogsTable.createdAt, range.start), lte(auditLogsTable.createdAt, range.end)))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(100);
    const dropOffs = events.slice(1).map((event, index) => {
      const prior = events[index]!;
      const dropOffCount = Math.max(0, prior.count - event.count);
      return {
        fromEventName: prior.eventName,
        toEventName: event.eventName,
        priorCount: prior.count,
        currentCount: event.count,
        dropOffCount,
        dropOffRate: prior.count > 0 ? dropOffCount / prior.count : null,
      };
    });

    res.json(
      GetStaffFunnelResponse.parse({
        periodDays,
        from: range.from,
        to: range.to,
        generatedAt: new Date(),
        privacyNote: "Aggregated first-party counts only. No visitor, contact, or order-level data is included.",
        events,
        dropOffs,
      }),
    );
  },
);

router.get("/staff/orders", requireStaffRoles("owner", "operations", "stylist"), async (req, res): Promise<void> => {
  const range = resolveDateRange(req.query);
  const status = typeof req.query.status === "string" && orderStatuses.includes(req.query.status as (typeof orderStatuses)[number])
    ? req.query.status as (typeof orderStatuses)[number]
    : undefined;
  if (!range) {
    res.status(400).json({ error: "Use a valid from/to date range (YYYY-MM-DD)" });
    return;
  }

  const orderConditions = status
    ? [eq(ordersTable.status, status), gte(ordersTable.createdAt, range.start), lte(ordersTable.createdAt, range.end)]
    : [inArray(ordersTable.status, activeOrderStatuses)];
  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(...orderConditions))
    .orderBy(desc(ordersTable.createdAt))
    .limit(100);

  res.json(ListStaffOrdersResponse.parse(orders.map(orderView)));
});

router.patch("/staff/orders/:id", requireStaffRoles("owner", "operations"), async (req, res): Promise<void> => {
  const params = AcknowledgeStaffNotificationParams.safeParse(req.params);
  const parsed = AcknowledgeStaffNotificationBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide a valid privacy request update" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(privacyRequestsTable).where(eq(privacyRequestsTable.id, params.data.id)).limit(1);
    if (!request) return { kind: "missing" as const };
    if (request.requestType !== "access") return { kind: "wrong_type" as const };
    if ((request.status !== "identity_verified" && request.status !== "in_progress" && request.status !== "completed") || !hasRecordedIdentityVerification(request)) return { kind: "unverified" as const };

    const [existing] = await tx.select().from(privacyAccessPackagesTable)
      .where(eq(privacyAccessPackagesTable.privacyRequestId, request.id)).limit(1);
    if (existing && !existing.downloadedAt && existing.expiresAt > new Date()) return { kind: "existing" as const, package: existing };

    const email = normalizedEmail(request.requesterEmail);
    const orders = await tx.select({
      id: ordersTable.id, orderNumber: ordersTable.orderNumber, customerName: ordersTable.customerName,
      customerEmail: ordersTable.customerEmail, customerPhone: ordersTable.customerPhone, currency: ordersTable.currency,
      subtotal: ordersTable.subtotal, total: ordersTable.total, status: ordersTable.status, source: ordersTable.source,
      atelierNotes: ordersTable.atelierNotes, deliveryNotes: ordersTable.deliveryNotes, createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt,
    }).from(ordersTable).where(sql`lower(${ordersTable.customerEmail}) = ${email}`);
    const orderItems = orders.length ? await tx.select({
      orderId: orderItemsTable.orderId, productSlug: orderItemsTable.productSlug, productName: orderItemsTable.productName,
      selectedSize: orderItemsTable.selectedSize, quantity: orderItemsTable.quantity, unitPrice: orderItemsTable.unitPrice, createdAt: orderItemsTable.createdAt,
    }).from(orderItemsTable).where(inArray(orderItemsTable.orderId, orders.map((order) => order.id))) : [];
    const enquiries = await tx.select({
      name: customerEnquiriesTable.name, email: customerEnquiriesTable.email, phone: customerEnquiriesTable.phone,
      productSlug: customerEnquiriesTable.productSlug, message: customerEnquiriesTable.message, status: customerEnquiriesTable.status,
      createdAt: customerEnquiriesTable.createdAt, updatedAt: customerEnquiriesTable.updatedAt,
    }).from(customerEnquiriesTable).where(sql`lower(${customerEnquiriesTable.email}) = ${email}`);
    const checkoutAttempts = await tx.select({
      customerName: commerceCheckoutAttemptsTable.customerName, customerEmail: commerceCheckoutAttemptsTable.customerEmail,
      customerPhone: commerceCheckoutAttemptsTable.customerPhone, items: commerceCheckoutAttemptsTable.items,
      fulfillment: commerceCheckoutAttemptsTable.fulfillment, status: commerceCheckoutAttemptsTable.status,
      createdAt: commerceCheckoutAttemptsTable.createdAt, updatedAt: commerceCheckoutAttemptsTable.updatedAt,
    }).from(commerceCheckoutAttemptsTable).where(sql`lower(${commerceCheckoutAttemptsTable.customerEmail}) = ${email}`);
    const payload = {
      format: "soso-subject-access-package-v1",
      generatedAt: new Date().toISOString(),
      requesterEmail: email,
      scope: {
        included: ["orders", "order_items", "customer_enquiries", "checkout_attempts"],
        excluded: [
          "payment card data, payment-provider references, ownership or idempotency tokens",
          "staff-only audit and operational records",
          "anonymous analytics and consent records, which are not linked to an identified requester",
        ],
      },
      data: { orders, orderItems, enquiries, checkoutAttempts },
    };
    const rowCounts = { orders: orders.length, orderItems: orderItems.length, enquiries: enquiries.length, checkoutAttempts: checkoutAttempts.length };
    const nextPackage = {
      packageHash: privacyPackageHash(payload), payload, rowCounts,
      createdByClerkUserId: req.staff!.clerkUserId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    const [packageRecord] = existing
      ? await tx.update(privacyAccessPackagesTable).set({
        ...nextPackage, downloadedAt: null, downloadedByClerkUserId: null,
      }).where(eq(privacyAccessPackagesTable.id, existing.id)).returning()
      : await tx.insert(privacyAccessPackagesTable).values({ privacyRequestId: request.id, ...nextPackage }).returning();
    if (!packageRecord) return { kind: "conflict" as const };

    const [updated] = await tx.update(privacyRequestsTable)
      .set({ status: request.status === "identity_verified" ? "in_progress" : request.status })
      .where(eq(privacyRequestsTable.id, request.id)).returning();
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId, action: existing ? "privacy_request.access_package_reissued" : "privacy_request.access_package_generated",
      entityType: "privacy_request", entityId: request.id,
      metadata: auditMetadata({ packageId: packageRecord.id, packageHash: packageRecord.packageHash, rowCounts: packageRecord.rowCounts, expiresAt: packageRecord.expiresAt.toISOString(), requestStatus: updated?.status ?? request.status }),
    });
    return { kind: existing ? "reissued" as const : "created" as const, package: packageRecord };
  });

  if (result.kind === "missing") {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (result.kind === "forbidden_refund") {
    res.status(403).json({ error: "Only an owner can review an internal refund request" });
    return;
  }
  if (result.kind === "transition" || result.kind === "refund_action" || result.kind === "refund_pending" || result.kind === "refund_decision") {
    res.status(400).json({ error: result.kind === "transition" ? "That order status transition is not allowed" : result.kind === "refund_action" ? "Request or review a refund in separate actions" : result.kind === "refund_pending" ? "An active internal refund request is already recorded" : "An owner can only review a pending refund request with a decision note" });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ error: "This order changed while you were editing it. Refresh the queue and try again." });
    return;
  }
  res.json(UpdateStaffOrderResponse.parse(orderView(result.order)));
});

router.get("/staff/enquiries", requireStaffRoles("owner", "operations", "stylist"), async (_req, res): Promise<void> => {
  const enquiries = await db.select().from(customerEnquiriesTable).orderBy(desc(customerEnquiriesTable.createdAt)).limit(100);
  res.json(ListStaffEnquiriesResponse.parse(enquiries));
});

router.patch("/staff/enquiries/:id", requireStaffRoles("owner", "operations", "stylist"), async (req, res): Promise<void> => {
  const params = AcknowledgeStaffNotificationParams.safeParse(req.params);
  const parsed = AcknowledgeStaffNotificationBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide a valid enquiry update" });
    return;
  }
  const [updated] = await db
    .update(customerEnquiriesTable)
    .set(parsed.data)
    .where(eq(customerEnquiriesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Enquiry not found" });
    return;
  }
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId,
    action: "enquiry.updated",
    entityType: "enquiry",
    entityId: updated.id,
    metadata: auditMetadata({ status: updated.status, changedHandlingNotes: parsed.data.handlingNotes !== undefined }),
  });
  res.json(UpdateStaffEnquiryResponse.parse(updated));
});

router.get("/staff/privacy-requests", requireStaffRoles("owner", "operations"), async (_req, res): Promise<void> => {
  const requests = await db.select().from(privacyRequestsTable).orderBy(desc(privacyRequestsTable.createdAt)).limit(100);
  res.json(ListStaffPrivacyRequestsResponse.parse(requests));
});

router.post("/staff/privacy-requests", requireStaffRoles("owner", "operations"), async (req, res): Promise<void> => {
  const parsed = AcknowledgeStaffNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a valid privacy request" });
    return;
  }
  const created = await db.transaction(async (tx) => {
    const policyVersion = currentPrivacyPolicyVersion();
    await recordPrivacyPolicyVersion(tx, policyVersion);
    const [request] = await tx.insert(privacyRequestsTable).values({ ...parsed.data, policyVersion }).returning();
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId,
      action: "privacy_request.logged",
      entityType: "privacy_request",
      entityId: request!.id,
      metadata: auditMetadata({ requestType: request!.requestType, status: request!.status }),
    });
    await tx.insert(operationalNotificationsTable).values({
      severity: "attention",
      title: "Privacy request received",
      body: `A ${request!.requestType} request is awaiting identity verification.`,
      targetRole: "owner",
    });
    return request!;
  });
  res.status(201).json(CreateStaffPrivacyRequestResponse.parse(created));
});

router.patch("/staff/privacy-requests/:id", requireStaffRoles("owner", "operations"), async (req, res): Promise<void> => {
  const params = AcknowledgeStaffNotificationParams.safeParse(req.params);
  const parsed = AcknowledgeStaffNotificationBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide a valid privacy request update" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(privacyRequestsTable).where(eq(privacyRequestsTable.id, params.data.id)).limit(1);
    if (!request) return { kind: "missing" as const };
    if (request.requestType !== "access") return { kind: "wrong_type" as const };
    if ((request.status !== "identity_verified" && request.status !== "in_progress" && request.status !== "completed") || !hasRecordedIdentityVerification(request)) return { kind: "unverified" as const };

    const [existing] = await tx.select().from(privacyAccessPackagesTable)
      .where(eq(privacyAccessPackagesTable.privacyRequestId, request.id)).limit(1);
    if (existing && !existing.downloadedAt && existing.expiresAt > new Date()) return { kind: "existing" as const, package: existing };

    const email = normalizedEmail(request.requesterEmail);
    const orders = await tx.select({
      id: ordersTable.id, orderNumber: ordersTable.orderNumber, customerName: ordersTable.customerName,
      customerEmail: ordersTable.customerEmail, customerPhone: ordersTable.customerPhone, currency: ordersTable.currency,
      subtotal: ordersTable.subtotal, total: ordersTable.total, status: ordersTable.status, source: ordersTable.source,
      atelierNotes: ordersTable.atelierNotes, deliveryNotes: ordersTable.deliveryNotes, createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt,
    }).from(ordersTable).where(sql`lower(${ordersTable.customerEmail}) = ${email}`);
    const orderItems = orders.length ? await tx.select({
      orderId: orderItemsTable.orderId, productSlug: orderItemsTable.productSlug, productName: orderItemsTable.productName,
      selectedSize: orderItemsTable.selectedSize, quantity: orderItemsTable.quantity, unitPrice: orderItemsTable.unitPrice, createdAt: orderItemsTable.createdAt,
    }).from(orderItemsTable).where(inArray(orderItemsTable.orderId, orders.map((order) => order.id))) : [];
    const enquiries = await tx.select({
      name: customerEnquiriesTable.name, email: customerEnquiriesTable.email, phone: customerEnquiriesTable.phone,
      productSlug: customerEnquiriesTable.productSlug, message: customerEnquiriesTable.message, status: customerEnquiriesTable.status,
      createdAt: customerEnquiriesTable.createdAt, updatedAt: customerEnquiriesTable.updatedAt,
    }).from(customerEnquiriesTable).where(sql`lower(${customerEnquiriesTable.email}) = ${email}`);
    const checkoutAttempts = await tx.select({
      customerName: commerceCheckoutAttemptsTable.customerName, customerEmail: commerceCheckoutAttemptsTable.customerEmail,
      customerPhone: commerceCheckoutAttemptsTable.customerPhone, items: commerceCheckoutAttemptsTable.items,
      fulfillment: commerceCheckoutAttemptsTable.fulfillment, status: commerceCheckoutAttemptsTable.status,
      createdAt: commerceCheckoutAttemptsTable.createdAt, updatedAt: commerceCheckoutAttemptsTable.updatedAt,
    }).from(commerceCheckoutAttemptsTable).where(sql`lower(${commerceCheckoutAttemptsTable.customerEmail}) = ${email}`);
    const payload = {
      format: "soso-subject-access-package-v1",
      generatedAt: new Date().toISOString(),
      requesterEmail: email,
      scope: {
        included: ["orders", "order_items", "customer_enquiries", "checkout_attempts"],
        excluded: [
          "payment card data, payment-provider references, ownership or idempotency tokens",
          "staff-only audit and operational records",
          "anonymous analytics and consent records, which are not linked to an identified requester",
        ],
      },
      data: { orders, orderItems, enquiries, checkoutAttempts },
    };
    const rowCounts = { orders: orders.length, orderItems: orderItems.length, enquiries: enquiries.length, checkoutAttempts: checkoutAttempts.length };
    const nextPackage = {
      packageHash: privacyPackageHash(payload), payload, rowCounts,
      createdByClerkUserId: req.staff!.clerkUserId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    const [packageRecord] = existing
      ? await tx.update(privacyAccessPackagesTable).set({
        ...nextPackage, downloadedAt: null, downloadedByClerkUserId: null,
      }).where(eq(privacyAccessPackagesTable.id, existing.id)).returning()
      : await tx.insert(privacyAccessPackagesTable).values({ privacyRequestId: request.id, ...nextPackage }).returning();
    if (!packageRecord) return { kind: "conflict" as const };

    const [updated] = await tx.update(privacyRequestsTable)
      .set({ status: request.status === "identity_verified" ? "in_progress" : request.status })
      .where(eq(privacyRequestsTable.id, request.id)).returning();
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId, action: existing ? "privacy_request.access_package_reissued" : "privacy_request.access_package_generated",
      entityType: "privacy_request", entityId: request.id,
      metadata: auditMetadata({ packageId: packageRecord.id, packageHash: packageRecord.packageHash, rowCounts: packageRecord.rowCounts, expiresAt: packageRecord.expiresAt.toISOString(), requestStatus: updated?.status ?? request.status }),
    });
    return { kind: existing ? "reissued" as const : "created" as const, package: packageRecord };
  });
  if (result.kind === "missing") { res.status(404).json({ error: "Privacy request not found" }); return; }
  if (result.kind === "wrong_type") { res.status(400).json({ error: "Only a verified access request can receive an access package" }); return; }
  if (result.kind === "unverified") { res.status(400).json({ error: "Verify the requester before generating an access package" }); return; }
  if (result.kind === "conflict") { res.status(409).json({ error: "An access package is already being generated; refresh and try again" }); return; }
  res.status(result.kind === "created" || result.kind === "reissued" ? 201 : 200).json({
    packageId: result.package.id, expiresAt: result.package.expiresAt, downloadedAt: result.package.downloadedAt,
    rowCounts: result.package.rowCounts, downloadPath: `/api/staff/privacy-access-packages/${result.package.id}/download`,
  });
});

router.get("/staff/privacy-access-packages/:id/download", requireStaffRoles("owner"), async (req, res): Promise<void> => {
  const params = AcknowledgeStaffNotificationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid privacy request reference" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(privacyRequestsTable).where(eq(privacyRequestsTable.id, params.data.id)).limit(1);
    if (!request) return { kind: "missing" as const };
    if (request.requestType !== "access") return { kind: "wrong_type" as const };
    if ((request.status !== "identity_verified" && request.status !== "in_progress" && request.status !== "completed") || !hasRecordedIdentityVerification(request)) return { kind: "unverified" as const };

    const [existing] = await tx.select().from(privacyAccessPackagesTable)
      .where(eq(privacyAccessPackagesTable.privacyRequestId, request.id)).limit(1);
    if (existing && !existing.downloadedAt && existing.expiresAt > new Date()) return { kind: "existing" as const, package: existing };

    const email = normalizedEmail(request.requesterEmail);
    const orders = await tx.select({
      id: ordersTable.id, orderNumber: ordersTable.orderNumber, customerName: ordersTable.customerName,
      customerEmail: ordersTable.customerEmail, customerPhone: ordersTable.customerPhone, currency: ordersTable.currency,
      subtotal: ordersTable.subtotal, total: ordersTable.total, status: ordersTable.status, source: ordersTable.source,
      atelierNotes: ordersTable.atelierNotes, deliveryNotes: ordersTable.deliveryNotes, createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt,
    }).from(ordersTable).where(sql`lower(${ordersTable.customerEmail}) = ${email}`);
    const orderItems = orders.length ? await tx.select({
      orderId: orderItemsTable.orderId, productSlug: orderItemsTable.productSlug, productName: orderItemsTable.productName,
      selectedSize: orderItemsTable.selectedSize, quantity: orderItemsTable.quantity, unitPrice: orderItemsTable.unitPrice, createdAt: orderItemsTable.createdAt,
    }).from(orderItemsTable).where(inArray(orderItemsTable.orderId, orders.map((order) => order.id))) : [];
    const enquiries = await tx.select({
      name: customerEnquiriesTable.name, email: customerEnquiriesTable.email, phone: customerEnquiriesTable.phone,
      productSlug: customerEnquiriesTable.productSlug, message: customerEnquiriesTable.message, status: customerEnquiriesTable.status,
      createdAt: customerEnquiriesTable.createdAt, updatedAt: customerEnquiriesTable.updatedAt,
    }).from(customerEnquiriesTable).where(sql`lower(${customerEnquiriesTable.email}) = ${email}`);
    const checkoutAttempts = await tx.select({
      customerName: commerceCheckoutAttemptsTable.customerName, customerEmail: commerceCheckoutAttemptsTable.customerEmail,
      customerPhone: commerceCheckoutAttemptsTable.customerPhone, items: commerceCheckoutAttemptsTable.items,
      fulfillment: commerceCheckoutAttemptsTable.fulfillment, status: commerceCheckoutAttemptsTable.status,
      createdAt: commerceCheckoutAttemptsTable.createdAt, updatedAt: commerceCheckoutAttemptsTable.updatedAt,
    }).from(commerceCheckoutAttemptsTable).where(sql`lower(${commerceCheckoutAttemptsTable.customerEmail}) = ${email}`);
    const payload = {
      format: "soso-subject-access-package-v1",
      generatedAt: new Date().toISOString(),
      requesterEmail: email,
      scope: {
        included: ["orders", "order_items", "customer_enquiries", "checkout_attempts"],
        excluded: [
          "payment card data, payment-provider references, ownership or idempotency tokens",
          "staff-only audit and operational records",
          "anonymous analytics and consent records, which are not linked to an identified requester",
        ],
      },
      data: { orders, orderItems, enquiries, checkoutAttempts },
    };
    const rowCounts = { orders: orders.length, orderItems: orderItems.length, enquiries: enquiries.length, checkoutAttempts: checkoutAttempts.length };
    const nextPackage = {
      packageHash: privacyPackageHash(payload), payload, rowCounts,
      createdByClerkUserId: req.staff!.clerkUserId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    const [packageRecord] = existing
      ? await tx.update(privacyAccessPackagesTable).set({
        ...nextPackage, downloadedAt: null, downloadedByClerkUserId: null,
      }).where(eq(privacyAccessPackagesTable.id, existing.id)).returning()
      : await tx.insert(privacyAccessPackagesTable).values({ privacyRequestId: request.id, ...nextPackage }).returning();
    if (!packageRecord) return { kind: "conflict" as const };

    const [updated] = await tx.update(privacyRequestsTable)
      .set({ status: request.status === "identity_verified" ? "in_progress" : request.status })
      .where(eq(privacyRequestsTable.id, request.id)).returning();
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId, action: existing ? "privacy_request.access_package_reissued" : "privacy_request.access_package_generated",
      entityType: "privacy_request", entityId: request.id,
      metadata: auditMetadata({ packageId: packageRecord.id, packageHash: packageRecord.packageHash, rowCounts: packageRecord.rowCounts, expiresAt: packageRecord.expiresAt.toISOString(), requestStatus: updated?.status ?? request.status }),
    });
    return { kind: existing ? "reissued" as const : "created" as const, package: packageRecord };
  });
  if (result.kind === "missing") { res.status(404).json({ error: "Privacy request not found" }); return; }
  if (result.kind === "wrong_type") { res.status(400).json({ error: "Only a verified access request can receive an access package" }); return; }
  if (result.kind === "unverified") { res.status(400).json({ error: "Verify the requester before generating an access package" }); return; }
  if (result.kind === "conflict") { res.status(409).json({ error: "An access package is already being generated; refresh and try again" }); return; }
  res.status(result.kind === "created" || result.kind === "reissued" ? 201 : 200).json({
    packageId: result.package.id, expiresAt: result.package.expiresAt, downloadedAt: result.package.downloadedAt,
    rowCounts: result.package.rowCounts, downloadPath: `/api/staff/privacy-access-packages/${result.package.id}/download`,
  });
});

router.get("/staff/privacy-access-packages/:id/download", requireStaffRoles("owner"), async (req, res): Promise<void> => {
  const params = AcknowledgeStaffNotificationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid access package reference" }); return; }
  const packageRecord = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(privacyAccessPackagesTable)
      .set({ downloadedAt: new Date(), downloadedByClerkUserId: req.staff!.clerkUserId })
      .where(and(eq(privacyAccessPackagesTable.id, params.data.id), isNull(privacyAccessPackagesTable.downloadedAt), sql`${privacyAccessPackagesTable.expiresAt} > now()`))
      .returning();
    if (!claimed) return null;
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId, action: "privacy_request.access_package_downloaded",
      entityType: "privacy_request", entityId: claimed.privacyRequestId,
      metadata: auditMetadata({ packageId: claimed.id, packageHash: claimed.packageHash, rowCounts: claimed.rowCounts }),
    });
    return claimed;
  });
  if (!packageRecord) { res.status(404).json({ error: "This access package is unavailable, expired, or has already been downloaded" }); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="soso-subject-access-${packageRecord.id}.json"`);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(JSON.stringify(packageRecord.payload, null, 2));
});

router.get("/staff/notifications", async (req, res): Promise<void> => {
  const notifications = await db
    .select({
      notification: operationalNotificationsTable,
      acknowledgementId: operationalNotificationAcknowledgementsTable.id,
    })
    .from(operationalNotificationsTable)
    .leftJoin(
      operationalNotificationAcknowledgementsTable,
      and(
        eq(operationalNotificationAcknowledgementsTable.notificationId, operationalNotificationsTable.id),
        eq(operationalNotificationAcknowledgementsTable.clerkUserId, req.staff!.clerkUserId),
      ),
    )
    .where(or(isNull(operationalNotificationsTable.targetRole), eq(operationalNotificationsTable.targetRole, req.staff!.role)))
    .orderBy(desc(operationalNotificationsTable.createdAt))
    .limit(50);
  res.json(ListStaffNotificationsResponse.parse(notifications.map(({ notification, acknowledgementId }) => ({
    id: notification.id,
    severity: notification.severity,
    title: notification.title,
    body: notification.body,
    acknowledged: acknowledgementId !== null,
    createdAt: notification.createdAt,
  }))));
});

router.patch("/staff/notifications/:id", async (req, res): Promise<void> => {
  const params = AcknowledgeStaffNotificationParams.safeParse(req.params);
  const parsed = AcknowledgeStaffNotificationBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Provide a valid acknowledgement" });
    return;
  }
  const [notification] = await db
    .select()
    .from(operationalNotificationsTable)
    .where(and(eq(operationalNotificationsTable.id, params.data.id), or(isNull(operationalNotificationsTable.targetRole), eq(operationalNotificationsTable.targetRole, req.staff!.role))))
    .limit(1);
  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  if (parsed.data.acknowledged) {
    await db.insert(operationalNotificationAcknowledgementsTable).values({
      notificationId: notification.id,
      clerkUserId: req.staff!.clerkUserId,
    }).onConflictDoNothing();
  } else {
    await db.delete(operationalNotificationAcknowledgementsTable).where(and(
      eq(operationalNotificationAcknowledgementsTable.notificationId, notification.id),
      eq(operationalNotificationAcknowledgementsTable.clerkUserId, req.staff!.clerkUserId),
    ));
  }
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId,
    action: parsed.data.acknowledged ? "notification.acknowledged" : "notification.unacknowledged",
    entityType: "operational_notification",
    entityId: notification.id,
    metadata: auditMetadata({ severity: notification.severity, targetRole: notification.targetRole }),
  });
  res.json(AcknowledgeStaffNotificationResponse.parse({
    id: notification.id,
    severity: notification.severity,
    title: notification.title,
    body: notification.body,
    acknowledged: parsed.data.acknowledged,
    createdAt: notification.createdAt,
  }));
});

router.get("/staff/analytics/metrics", requireStaffRoles("owner", "analyst"), async (req, res): Promise<void> => {
  const range = resolveDateRange(req.query);
  if (!range) {
    res.status(400).json({ error: "Use a valid from/to date range (YYYY-MM-DD)" });
    return;
  }

  const consentFilter = inArray(analyticsEventsTable.consent, ["analytics", "marketing"]);
  const dateFilter = and(gte(analyticsEventsTable.occurredAt, range.start), lte(analyticsEventsTable.occurredAt, range.end));
  const periodMs = range.end.getTime() - range.start.getTime() + 1;
  const comparisonEnd = new Date(range.start.getTime() - 1);
  const comparisonStart = new Date(comparisonEnd.getTime() - periodMs + 1);
  const comparisonFilter = and(
    gte(analyticsEventsTable.occurredAt, comparisonStart),
    lte(analyticsEventsTable.occurredAt, comparisonEnd),
  );
  const stageEventNames = ["page_view", "product_view", "add_to_bag", "checkout_started", "payment_clicked"];

  const [
    visitorRows,
    visitorTypeRows,
    pageRows,
    deviceRows,
    scrollRows,
    productRows,
    eventRows,
    comparisonRows,
    acquisitionRows,
    countryRows,
    freshnessRows,
    journeyRows,
  ] = await Promise.all([
    // Unique visitors + sessions
    db
      .select({
        uniqueVisitors: sql<number>`COUNT(DISTINCT ${analyticsEventsTable.anonymousId})`,
        uniqueSessions: sql<number>`COUNT(DISTINCT ${analyticsEventsTable.sessionId})`,
      })
      .from(analyticsEventsTable)
      .where(and(dateFilter, consentFilter)),
    // A visitor is returning only if they had an earlier consented event. This
    // avoids treating anonymous analytics as an identified customer record.
    db
      .select({
        visitorType: sql<string>`case when exists (
          select 1 from soso_analytics_events earlier
          where earlier.anonymous_id = ${analyticsEventsTable.anonymousId}
            and earlier.occurred_at < ${range.start}
            and earlier.consent in ('analytics', 'marketing')
        ) then 'returning' else 'new' end`,
        visitors: sql<number>`COUNT(DISTINCT ${analyticsEventsTable.anonymousId})`,
      })
      .from(analyticsEventsTable)
      .where(and(dateFilter, consentFilter))
      .groupBy(sql`case when exists (
        select 1 from soso_analytics_events earlier
        where earlier.anonymous_id = ${analyticsEventsTable.anonymousId}
          and earlier.occurred_at < ${range.start}
          and earlier.consent in ('analytics', 'marketing')
      ) then 'returning' else 'new' end`),
    // Top pages
    db
      .select({ path: analyticsEventsTable.path, views: sql<number>`COUNT(*)` })
      .from(analyticsEventsTable)
      .where(and(dateFilter, consentFilter, eq(analyticsEventsTable.eventName, "page_view")))
      .groupBy(analyticsEventsTable.path)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10),
    // Device breakdown
    db
      .select({ deviceType: analyticsEventsTable.deviceType, events: sql<number>`COUNT(*)` })
      .from(analyticsEventsTable)
      .where(and(dateFilter, consentFilter))
      .groupBy(analyticsEventsTable.deviceType)
      .orderBy(sql`COUNT(*) DESC`),
    // Scroll depth counts
    db
      .select({
        depthPct: sql<string>`${analyticsEventsTable.properties}->>'depth_pct'`,
        events: sql<number>`COUNT(*)`,
      })
      .from(analyticsEventsTable)
      .where(and(dateFilter, consentFilter, eq(analyticsEventsTable.eventName, "scroll_depth_reached")))
      .groupBy(sql`${analyticsEventsTable.properties}->>'depth_pct'`)
      .orderBy(sql`(${analyticsEventsTable.properties}->>'depth_pct')::int ASC`),
    // Top products
    db
      .select({
        slug: sql<string>`${analyticsEventsTable.properties}->>'productSlug'`,
        views: sql<number>`COUNT(*)`,
      })
      .from(analyticsEventsTable)
      .where(and(dateFilter, consentFilter, eq(analyticsEventsTable.eventName, "product_view")))
      .groupBy(sql`${analyticsEventsTable.properties}->>'productSlug'`)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10),
    db
      .select({ eventName: analyticsEventsTable.eventName, events: count() })
      .from(analyticsEventsTable)
      .where(and(dateFilter, consentFilter, inArray(analyticsEventsTable.eventName, stageEventNames)))
      .groupBy(analyticsEventsTable.eventName),
    db
      .select({ eventName: analyticsEventsTable.eventName, events: count() })
      .from(analyticsEventsTable)
      .where(and(comparisonFilter, consentFilter, inArray(analyticsEventsTable.eventName, stageEventNames)))
      .groupBy(analyticsEventsTable.eventName),
    db
      .select({
        source: sql<string>`coalesce(nullif(${analyticsEventsTable.source}, ''), '(direct)')`,
        medium: sql<string>`coalesce(nullif(${analyticsEventsTable.utmMedium}, ''), '(none)')`,
        campaign: sql<string>`coalesce(nullif(${analyticsEventsTable.utmCampaign}, ''), '(none)')`,
        events: count(),
        visitors: sql<number>`COUNT(DISTINCT ${analyticsEventsTable.anonymousId})`,
      })
      .from(analyticsEventsTable)
      .where(and(dateFilter, consentFilter))
      .groupBy(analyticsEventsTable.source, analyticsEventsTable.utmMedium, analyticsEventsTable.utmCampaign)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10),
    db
      .select({
        country: sql<string>`coalesce(nullif(${analyticsEventsTable.properties}->>'_country', ''), 'unknown')`,
        events: count(),
      })
      .from(analyticsEventsTable)
      .where(and(dateFilter, consentFilter))
      .groupBy(sql`coalesce(nullif(${analyticsEventsTable.properties}->>'_country', ''), 'unknown')`)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10),
    db
      .select({
        latestEventAt: sql<Date | null>`MAX(${analyticsEventsTable.occurredAt})`,
        activeDays: sql<number>`COUNT(DISTINCT DATE(${analyticsEventsTable.occurredAt}))`,
      })
      .from(analyticsEventsTable)
      .where(and(dateFilter, consentFilter)),
    db
      .select({
        sessionId: analyticsEventsTable.sessionId,
        eventName: analyticsEventsTable.eventName,
      })
      .from(analyticsEventsTable)
      .where(and(dateFilter, consentFilter, inArray(analyticsEventsTable.eventName, stageEventNames), sql`${analyticsEventsTable.sessionId} IS NOT NULL`))
      .groupBy(analyticsEventsTable.sessionId, analyticsEventsTable.eventName),
  ]);

  const currentCounts = eventCountMap(eventRows.map((row) => ({ eventName: row.eventName, count: Number(row.events) })));
  const previousCounts = eventCountMap(comparisonRows.map((row) => ({ eventName: row.eventName, count: Number(row.events) })));
  const sessionStages = new Map<string, Set<string>>();
  for (const row of journeyRows) {
    if (!row.sessionId) continue;
    const stages = sessionStages.get(row.sessionId) ?? new Set<string>();
    stages.add(row.eventName);
    sessionStages.set(row.sessionId, stages);
  }
  const sessionsAtStage = (stage: string) => Array.from(sessionStages.values()).filter((stages) => stages.has(stage)).length;
  const latestEventAt = freshnessRows[0]?.latestEventAt ?? null;
  const rangeDays = Math.max(1, Math.round(periodMs / 86_400_000));

  res.json({
    from: range.from,
    to: range.to,
    generatedAt: new Date(),
    privacyNote: "Aggregate first-party data only. No visitor identifiers or personal data is included.",
    uniqueVisitors: Number(visitorRows[0]?.uniqueVisitors ?? 0),
    uniqueSessions: Number(visitorRows[0]?.uniqueSessions ?? 0),
    topPages: pageRows.map((r) => ({ path: r.path ?? "(unknown)", views: Number(r.views) })),
    topProducts: productRows.filter((r) => r.slug).map((r) => ({ slug: r.slug, views: Number(r.views) })),
    deviceBreakdown: deviceRows.map((r) => ({ deviceType: r.deviceType ?? "unknown", events: Number(r.events) })),
    scrollDepth: scrollRows.map((r) => ({ depthPct: Number(r.depthPct ?? 0), events: Number(r.events) })),
    visitorTypes: {
      newVisitors: Number(visitorTypeRows.find((row) => row.visitorType === "new")?.visitors ?? 0),
      returningVisitors: Number(visitorTypeRows.find((row) => row.visitorType === "returning")?.visitors ?? 0),
      definition: "Returning visitors had an earlier consented event before this reporting period; this is not account or customer identity data.",
    },
    rates: buildReportingRates(currentCounts),
    comparison: {
      from: comparisonStart.toISOString().slice(0, 10),
      to: comparisonEnd.toISOString().slice(0, 10),
      events: stageEventNames.map((eventName) => ({
        eventName,
        current: currentCounts[eventName] ?? 0,
        previous: previousCounts[eventName] ?? 0,
        delta: comparisonDelta(currentCounts[eventName] ?? 0, previousCounts[eventName] ?? 0),
      })),
    },
    acquisition: acquisitionRows.map((row) => ({
      source: row.source,
      medium: row.medium,
      campaign: row.campaign,
      events: Number(row.events),
      visitors: Number(row.visitors),
    })),
    countries: countryRows.map((row) => ({ country: row.country, events: Number(row.events) })),
    journey: {
      sessionsWithProductView: sessionsAtStage("product_view"),
      sessionsWithBag: sessionsAtStage("add_to_bag"),
      sessionsWithCheckout: sessionsAtStage("checkout_started"),
      sessionsWithPaymentClick: sessionsAtStage("payment_clicked"),
      definition: "A journey stage counts consented sessions that recorded that event in the selected period. Payment-click is not a payment success.",
    },
    freshness: {
      latestEventAt,
      activeDays: Number(freshnessRows[0]?.activeDays ?? 0),
      periodDays: rangeDays,
      coverageRate: Number(freshnessRows[0]?.activeDays ?? 0) / rangeDays,
      definition: "Coverage is the share of calendar days in the selected range with at least one consented event.",
    },
  });
});

router.get("/staff/analytics/quality", requireStaffRoles("owner", "analyst"), async (req, res): Promise<void> => {
  // Every check is aggregate-only: visitor and session identifiers stay server-side.
  const now = new Date();
  const last24h = new Date(now.getTime() - 86_400_000);
  const last7d = new Date(now.getTime() - 7 * 86_400_000);
  const futureTolerance = new Date(now.getTime() + 5 * 60_000);
  const journeyEvents = ["product_view", "add_to_bag", "checkout_started", "payment_clicked"] as const;

  const [recent, week, invalidPaths, incompleteAttribution, futureTimestamps, journeyRows, burstRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(analyticsEventsTable)
      .where(and(gte(analyticsEventsTable.occurredAt, last24h), inArray(analyticsEventsTable.consent, measurementConsents))),
    db
      .select({ value: count() })
      .from(analyticsEventsTable)
      .where(and(gte(analyticsEventsTable.occurredAt, last7d), inArray(analyticsEventsTable.consent, measurementConsents))),
    db
      .select({ value: count() })
      .from(analyticsEventsTable)
      .where(and(
        gte(analyticsEventsTable.occurredAt, last7d),
        inArray(analyticsEventsTable.consent, measurementConsents),
        sql`${analyticsEventsTable.path} ~* ${INVALID_STOREFRONT_PATH_PATTERN}`,
      )),
    db
      .select({ value: count() })
      .from(analyticsEventsTable)
      .where(and(
        gte(analyticsEventsTable.occurredAt, last7d),
        inArray(analyticsEventsTable.consent, measurementConsents),
        sql`${analyticsEventsTable.source} IS NULL AND (${analyticsEventsTable.utmMedium} IS NOT NULL OR ${analyticsEventsTable.utmCampaign} IS NOT NULL)`,
      )),
    db
      .select({ value: count() })
      .from(analyticsEventsTable)
      .where(and(
        inArray(analyticsEventsTable.consent, measurementConsents),
        sql`${analyticsEventsTable.occurredAt} > ${futureTolerance}`,
      )),
    db
      .select({
        sessionId: analyticsEventsTable.sessionId,
        eventName: analyticsEventsTable.eventName,
        occurredAt: analyticsEventsTable.occurredAt,
      })
      .from(analyticsEventsTable)
      .where(and(
        gte(analyticsEventsTable.occurredAt, last7d),
        inArray(analyticsEventsTable.consent, measurementConsents),
        inArray(analyticsEventsTable.eventName, journeyEvents),
      ))
      .orderBy(analyticsEventsTable.occurredAt)
      .limit(QUALITY_EVENT_LIMIT + 1),
    db
      .select({
        sessionId: analyticsEventsTable.sessionId,
        events: count(),
      })
      .from(analyticsEventsTable)
      .where(and(
        gte(analyticsEventsTable.occurredAt, last24h),
        inArray(analyticsEventsTable.consent, measurementConsents),
      ))
      .groupBy(analyticsEventsTable.sessionId, sql`date_trunc('minute', ${analyticsEventsTable.occurredAt})`)
      .having(sql`COUNT(*) > 60`)
      .limit(100),
  ]);
  res.json(buildAnalyticsQualityReport({
    events24h: Number(recent[0]?.value ?? 0),
    events7d: Number(week[0]?.value ?? 0),
    invalidPathCount: Number(invalidPaths[0]?.value ?? 0),
    attributionCount: Number(incompleteAttribution[0]?.value ?? 0),
    futureTimestampCount: Number(futureTimestamps[0]?.value ?? 0),
    journeyRows,
    burstCount: burstRows.length,
    generatedAt: now,
  }));
});

router.get("/staff/audit", requireStaffRoles("owner", "analyst"), async (req, res): Promise<void> => {
  const range = resolveDateRange(req.query);
  if (!range) {
    res.status(400).json({ error: "Use a valid from/to date range (YYYY-MM-DD)" });
    return;
  }
  const events = await db
    .select({ id: auditLogsTable.id, action: auditLogsTable.action, entityType: auditLogsTable.entityType, entityId: auditLogsTable.entityId, metadata: auditLogsTable.metadata, createdAt: auditLogsTable.createdAt })
    .from(auditLogsTable)
    .where(and(gte(auditLogsTable.createdAt, range.start), lte(auditLogsTable.createdAt, range.end)))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(100);
  res.json(ListStaffAuditEventsResponse.parse(events));
});

router.get("/staff/exports", requireStaffRoles("owner", "analyst"), async (req, res): Promise<void> => {
  const range = resolveDateRange(req.query);
  const report = req.query.report;
  if (!range || (report !== "operations_summary" && report !== "analytics_summary" && report !== "campaign_aggregate" && report !== "content_seo_aggregate")) {
    res.status(400).json({ error: "Use a valid report and from/to date range" });
    return;
  }
  if (report === "operations_summary" && req.staff!.role !== "owner") {
    res.status(403).json({ error: "Only an owner can export the operations summary" });
    return;
  }

  const analyticsFilter = and(
    gte(analyticsEventsTable.occurredAt, range.start),
    lte(analyticsEventsTable.occurredAt, range.end),
    inArray(analyticsEventsTable.consent, measurementConsents),
  );
  const summaryRows = report === "operations_summary"
    ? await db
      .select({ status: ordersTable.status, orders: count() })
      .from(ordersTable)
      .where(and(gte(ordersTable.createdAt, range.start), lte(ordersTable.createdAt, range.end)))
      .groupBy(ordersTable.status)
    : report === "analytics_summary"
      ? await db
      .select({ eventName: analyticsEventsTable.eventName, events: count() })
      .from(analyticsEventsTable)
      .where(analyticsFilter)
      .groupBy(analyticsEventsTable.eventName)
      : [];
  const campaignRows = report === "campaign_aggregate"
    ? await db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.occurredAt}), 'YYYY-MM-DD')`,
        source: sql<string>`coalesce(nullif(${analyticsEventsTable.source}, ''), '(none)')`,
        utmMedium: sql<string>`coalesce(nullif(${analyticsEventsTable.utmMedium}, ''), '(none)')`,
        utmCampaign: sql<string>`coalesce(nullif(${analyticsEventsTable.utmCampaign}, ''), '(none)')`,
        deviceType: sql<string>`coalesce(${analyticsEventsTable.deviceType}, 'unknown')`,
        eventName: analyticsEventsTable.eventName,
        events: count(),
      })
      .from(analyticsEventsTable)
      .where(analyticsFilter)
      .groupBy(
        sql`date_trunc('day', ${analyticsEventsTable.occurredAt})`,
        analyticsEventsTable.source,
        analyticsEventsTable.utmMedium,
        analyticsEventsTable.utmCampaign,
        analyticsEventsTable.deviceType,
        analyticsEventsTable.eventName,
      )
      .orderBy(sql`date_trunc('day', ${analyticsEventsTable.occurredAt})`, analyticsEventsTable.source)
    : [];
  const contentRows = report === "content_seo_aggregate"
    ? await db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.occurredAt}), 'YYYY-MM-DD')`,
        path: analyticsEventsTable.path,
        eventName: analyticsEventsTable.eventName,
        deviceType: sql<string>`coalesce(${analyticsEventsTable.deviceType}, 'unknown')`,
        events: count(),
      })
      .from(analyticsEventsTable)
      .where(and(
        analyticsFilter,
        inArray(analyticsEventsTable.eventName, ["page_view", "blog_article_viewed", "faq_expanded", "scroll_depth_reached", "cta_clicked"]),
        sql`${analyticsEventsTable.path} !~* ${INVALID_STOREFRONT_PATH_PATTERN}`,
      ))
      .groupBy(
        sql`date_trunc('day', ${analyticsEventsTable.occurredAt})`,
        analyticsEventsTable.path,
        analyticsEventsTable.eventName,
        analyticsEventsTable.deviceType,
      )
      .orderBy(sql`date_trunc('day', ${analyticsEventsTable.occurredAt})`, analyticsEventsTable.path)
    : [];
  const columns = report === "operations_summary"
    ? ["status", "orders"]
    : report === "analytics_summary"
      ? ["eventName", "events"]
      : report === "campaign_aggregate"
        ? ["date", "source", "utmMedium", "utmCampaign", "deviceType", "eventName", "events"]
        : ["date", "path", "eventName", "deviceType", "events"];
  const rows = await db.select().from(redirectsTable).orderBy(desc(redirectsTable.createdAt)).limit(200);
  const exportRows = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "bigint" ? Number(value) : value])));
  const filename = `soso-${report}-${range.from}-to-${range.to}.csv`;

  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId,
    action: "staff.exported",
    entityType: "staff_export",
    entityId: null,
    metadata: auditMetadata({ report, from: range.from, to: range.to }),
  });
  res.json(GetStaffExportResponse.parse({
    report,
    filename,
    generatedAt: new Date(),
    privacyNote: "This controlled export contains aggregate consented data only and excludes names, email addresses, phone numbers, payment references, visitor identifiers, session identifiers, and arbitrary event properties.",
    columns,
    rows: exportRows,
  }));
});

// ── Redirect management ────────────────────────────────────────────────────

router.get("/staff/redirects", requireStaffRoles("owner", "operations"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(redirectsTable).orderBy(desc(redirectsTable.createdAt)).limit(200);
  res.json(rows);
});

router.post("/staff/redirects", requireStaffRoles("owner", "operations"), async (req, res): Promise<void> => {
  const { fromPath, toPath, statusCode } = req.body as Record<string, unknown>;
  if (
    typeof fromPath !== "string"
    || !fromPath.startsWith("/")
    || fromPath.startsWith("//")
    || typeof toPath !== "string"
    || !toPath.startsWith("/")
    || toPath.startsWith("//")
  ) {
    res.status(400).json({ error: "fromPath and toPath must be internal paths beginning with /" });
    return;
  }
  const code = typeof statusCode === "number" && [301, 302, 307, 308].includes(statusCode) ? statusCode : 301;
  const [row] = await db.delete(redirectsTable).where(eq(redirectsTable.id, req.params.id as string)).returning({ id: redirectsTable.id });
  await db.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "redirect.upserted", entityType: "redirect", entityId: row!.id, metadata: { fromPath, toPath, statusCode: code } });
  res.status(201).json(row);
});

router.delete("/staff/redirects/:id", requireStaffRoles("owner", "operations"), async (req, res): Promise<void> => {
  const [row] = await db.delete(redirectsTable).where(eq(redirectsTable.id, req.params.id as string)).returning({ id: redirectsTable.id });
  if (!row) { res.status(404).json({ error: "Redirect not found" }); return; }
  await db.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "redirect.deleted", entityType: "redirect", entityId: row.id, metadata: {} });
  res.status(204).send();
});

export default router;
