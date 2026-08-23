import { Router, type IRouter } from "express";
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
} from "@workspace/api-zod";
import {
  analyticsEventsTable,
  auditLogsTable,
  customerEnquiriesTable,
  db,
  operationalNotificationAcknowledgementsTable,
  operationalNotificationsTable,
  ordersTable,
  privacyRequestsTable,
} from "@workspace/db";
import { and, count, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";

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

  const values = {
    ordersTotal: Number(orders?.value ?? 0),
    ordersInProduction: Number(inProduction?.value ?? 0),
    openEnquiries: Number(enquiries?.value ?? 0),
    storefrontEvents7d: Number(events?.value ?? 0),
  };

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

    res.json(
      GetStaffFunnelResponse.parse({
        periodDays,
        from: range.from,
        to: range.to,
        generatedAt: new Date(),
        privacyNote: "Aggregated first-party counts only. No visitor, contact, or order-level data is included.",
        events: eventNames.map((eventName) => ({ eventName, count: values.get(eventName) ?? 0 })),
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
  const params = UpdateStaffOrderParams.safeParse(req.params);
  const parsed = UpdateStaffOrderBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide a valid order update" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(ordersTable).where(eq(ordersTable.id, params.data.id)).limit(1);
    if (!current) return { kind: "missing" as const };

    const nextStatus = parsed.data.status;
    if (nextStatus && nextStatus !== current.status) {
      if (!orderTransitions[current.status].includes(nextStatus)) return { kind: "transition" as const };
    }
    const requestingRefund = parsed.data.refundRequestReason !== undefined;
    const decidingRefund = parsed.data.refundRequestDecision !== undefined;
    if (requestingRefund && decidingRefund) return { kind: "refund_action" as const };
    if (requestingRefund && (current.refundRequestStatus === "requested" || current.refundRequestStatus === "approved")) return { kind: "refund_pending" as const };
    if (decidingRefund && req.staff!.role !== "owner") return { kind: "forbidden_refund" as const };
    if (decidingRefund && current.refundRequestStatus !== "requested") return { kind: "refund_decision" as const };
    if (decidingRefund && !parsed.data.refundDecisionNote?.trim()) return { kind: "refund_decision" as const };

    const [updated] = await tx
      .update(ordersTable)
      .set({
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(parsed.data.atelierNotes !== undefined ? { atelierNotes: parsed.data.atelierNotes } : {}),
        ...(parsed.data.deliveryNotes !== undefined ? { deliveryNotes: parsed.data.deliveryNotes } : {}),
        ...(requestingRefund ? {
          refundRequestStatus: "requested",
          refundRequestReason: parsed.data.refundRequestReason,
          refundDecisionNote: null,
          refundRequestedAt: new Date(),
          refundReviewedAt: null,
        } : {}),
        ...(decidingRefund ? {
          refundRequestStatus: parsed.data.refundRequestDecision,
          refundDecisionNote: parsed.data.refundDecisionNote,
          refundReviewedAt: new Date(),
        } : {}),
      })
      .where(and(eq(ordersTable.id, current.id), eq(ordersTable.status, current.status)))
      .returning();
    if (!updated) return { kind: "conflict" as const };

    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId,
      action: requestingRefund ? "refund_request.requested" : decidingRefund ? `refund_request.${parsed.data.refundRequestDecision}` : "order.updated",
      entityType: "order",
      entityId: current.id,
      metadata: auditMetadata({ orderNumber: current.orderNumber, previousStatus: current.status, status: updated!.status, changedAtelierNotes: parsed.data.atelierNotes !== undefined, changedDeliveryNotes: parsed.data.deliveryNotes !== undefined, refundRequestStatus: updated!.refundRequestStatus }),
    });

    if (requestingRefund || decidingRefund || (nextStatus && nextStatus !== current.status)) {
      await tx.insert(operationalNotificationsTable).values({
        severity: requestingRefund ? "attention" : "info",
        title: requestingRefund ? "Refund review required" : decidingRefund ? `Refund request ${parsed.data.refundRequestDecision}` : "Order workflow advanced",
        body: requestingRefund ? `Order ${current.orderNumber} has an internal refund request awaiting owner review. No payment refund has been issued.` : decidingRefund ? `The internal refund request for order ${current.orderNumber} was ${parsed.data.refundRequestDecision}. Payment-provider execution is handled separately.` : `Order ${current.orderNumber} moved from ${current.status.replaceAll("_", " ")} to ${updated!.status.replaceAll("_", " ")}.`,
        targetRole: requestingRefund ? "owner" : "operations",
      });
    }
    return { kind: "updated" as const, order: updated! };
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
  const params = UpdateStaffEnquiryParams.safeParse(req.params);
  const parsed = UpdateStaffEnquiryBody.safeParse(req.body);
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
  const parsed = CreateStaffPrivacyRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a valid privacy request" });
    return;
  }
  const created = await db.transaction(async (tx) => {
    const [request] = await tx.insert(privacyRequestsTable).values(parsed.data).returning();
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
  const params = UpdateStaffPrivacyRequestParams.safeParse(req.params);
  const parsed = UpdateStaffPrivacyRequestBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide a valid privacy request update" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(privacyRequestsTable).where(eq(privacyRequestsTable.id, params.data.id)).limit(1);
    if (!current) return { kind: "missing" as const };
    const nextStatus = parsed.data.status ?? current.status;
    if (current.status === "completed" || current.status === "rejected") return { kind: "terminal" as const };
    if (nextStatus !== current.status && !privacyTransitions[current.status].includes(nextStatus)) return { kind: "transition" as const };
    const ownerOnly = nextStatus === "completed" || nextStatus === "rejected";
    if (ownerOnly && req.staff!.role !== "owner") return { kind: "forbidden" as const };
    const verificationEvidence = parsed.data.verificationNote?.trim() || current.verificationNote?.trim();
    if (nextStatus === "identity_verified" && current.status !== "identity_verified" && !parsed.data.verificationNote?.trim()) return { kind: "verification" as const };
    if (nextStatus === "completed" && (!verificationEvidence || (current.status !== "identity_verified" && current.status !== "in_progress"))) return { kind: "unverified" as const };
    if ((nextStatus === "completed" || nextStatus === "rejected") && !parsed.data.resolutionNote) return { kind: "resolution" as const };

    const [updated] = await tx
      .update(privacyRequestsTable)
      .set({
        ...parsed.data,
        completedAt: nextStatus === "completed" || nextStatus === "rejected" ? new Date() : current.completedAt,
      })
      .where(and(eq(privacyRequestsTable.id, current.id), eq(privacyRequestsTable.status, current.status)))
      .returning();
    if (!updated) return { kind: "conflict" as const };
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId,
      action: "privacy_request.updated",
      entityType: "privacy_request",
      entityId: current.id,
      metadata: auditMetadata({ requestType: current.requestType, previousStatus: current.status, status: updated!.status }),
    });
    return { kind: "updated" as const, request: updated! };
  });

  if (result.kind === "missing") {
    res.status(404).json({ error: "Privacy request not found" });
    return;
  }
  if (result.kind === "forbidden") {
    res.status(403).json({ error: "Only an owner can complete or reject a privacy request" });
    return;
  }
  if (result.kind === "unverified" || result.kind === "verification" || result.kind === "resolution") {
    res.status(400).json({ error: result.kind === "unverified" ? "Verify the requester and record the evidence before completing this request" : result.kind === "verification" ? "Record a verification note before marking identity as verified" : "A resolution note is required before completing or rejecting a request" });
    return;
  }
  if (result.kind === "terminal" || result.kind === "transition") {
    res.status(400).json({ error: result.kind === "terminal" ? "Completed and rejected privacy requests are locked" : "That privacy request procedure step is not allowed" });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ error: "This privacy request changed while you were editing it. Refresh the queue and try again." });
    return;
  }
  res.json(UpdateStaffPrivacyRequestResponse.parse(result.request));
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
  if (!range || (report !== "operations_summary" && report !== "analytics_summary")) {
    res.status(400).json({ error: "Use a valid report and from/to date range" });
    return;
  }
  if (report === "operations_summary" && req.staff!.role !== "owner") {
    res.status(403).json({ error: "Only an owner can export the operations summary" });
    return;
  }

  const rows = report === "operations_summary"
    ? await db
      .select({ status: ordersTable.status, orders: count() })
      .from(ordersTable)
      .where(and(gte(ordersTable.createdAt, range.start), lte(ordersTable.createdAt, range.end)))
      .groupBy(ordersTable.status)
    : await db
      .select({ eventName: analyticsEventsTable.eventName, events: count() })
      .from(analyticsEventsTable)
      .where(and(gte(analyticsEventsTable.occurredAt, range.start), lte(analyticsEventsTable.occurredAt, range.end), inArray(analyticsEventsTable.consent, ["analytics", "marketing"])))
      .groupBy(analyticsEventsTable.eventName);
  const columns = report === "operations_summary" ? ["status", "orders"] : ["eventName", "events"];
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
    privacyNote: "This controlled export contains aggregate operational data only and excludes names, email addresses, phone numbers, payment references, and visitor identifiers.",
    columns,
    rows: exportRows,
  }));
});

export default router;