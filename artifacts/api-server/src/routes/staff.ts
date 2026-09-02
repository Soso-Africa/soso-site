import { Router, type IRouter, type Request } from "express";
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
  ListStaffAccessResponse,
  CreateStaffAccessBody,
  CreateStaffAccessResponse,
  UpdateStaffAccessBody,
  UpdateStaffAccessParams,
  UpdateStaffAccessResponse,
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
  UpdateStaffMeasurementBody,
  UpdateStaffMeasurementParams,
  UpdateStaffMeasurementResponse,
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
  measurementRequestsTable,
  measurementRevisionsTable,
  orderItemsTable,
  redirectsTable,
  redirectRevisionsTable,
  operationalNotificationAcknowledgementsTable,
  operationalNotificationsTable,
  ordersTable,
  privacyRequestsTable,
  privacyAccessPackagesTable,
  staffUsersTable,
  type StaffUser,
} from "@workspace/db";
import { and, count, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { currentPrivacyPolicyVersion, recordPrivacyPolicyVersion } from "../lib/privacyPolicy";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { newManagedStaffIdentity, setManagedStaffPassword } from "./staff-auth";
import {
  CUSTOM_DISPATCH_GUIDANCE,
  staffMeasurementActionAllowed,
} from "../lib/measurements";
import {
  buildAnalyticsQualityReport,
  QUALITY_EVENT_LIMIT,
} from "./analytics-quality";
import { buildReportingRates, comparisonDelta, eventCountMap } from "./analytics-reporting";

const router: IRouter = Router();

router.use("/staff", requireStaff);

type StaffAccessChange = {
  role?: StaffUser["role"];
  isActive?: boolean;
};

type StaffAccessTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withStaffAccessMutationLock<T>(
  mutation: (tx: StaffAccessTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('soso-staff-access-mutation-v1'))`);
    return mutation(tx);
  });
}

export function isFinalActiveOwnerChangeBlocked(
  target: Pick<StaffUser, "role" | "isActive">,
  change: StaffAccessChange,
  activeOwnerCount: number,
): boolean {
  const removesOwnerStatus =
    change.isActive === false ||
    (change.role !== undefined && change.role !== "owner");

  return target.role === "owner" && target.isActive && removesOwnerStatus && activeOwnerCount <= 1;
}

export function staffAccessAuditMetadata(
  target: Pick<StaffUser, "email" | "role" | "isActive">,
  updated: Pick<StaffUser, "role" | "isActive">,
) {
  return auditMetadata({
    email: target.email,
    beforeRole: target.role,
    afterRole: updated.role,
    beforeActive: target.isActive,
    afterActive: updated.isActive,
  });
}

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

export function resolveDateRange(query: Record<string, unknown>, maximumDays?: number) {
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(today.getUTCDate() - 6);

  const from = typeof query.from === "string" ? query.from : defaultFrom.toISOString().slice(0, 10);
  const to = typeof query.to === "string" ? query.to : today.toISOString().slice(0, 10);
  if (!datePattern.test(from) || !datePattern.test(to) || from > to) return null;

  const range = {
    from,
    to,
    start: new Date(`${from}T00:00:00.000Z`),
    end: new Date(`${to}T23:59:59.999Z`),
  };
  if (
    Number.isNaN(range.start.getTime()) ||
    Number.isNaN(range.end.getTime()) ||
    range.start.toISOString().slice(0, 10) !== from ||
    range.end.toISOString().slice(0, 10) !== to ||
    (maximumDays && range.end.getTime() - range.start.getTime() + 1 > maximumDays * 86_400_000)
  ) return null;
  return range;
}

const analyticsDevices = ["mobile", "tablet", "desktop", "unknown"] as const;
const analyticsBrowsers = ["chrome", "safari", "firefox", "edge", "opera", "samsung internet", "unknown"] as const;

function singleBoundedQueryValue(value: unknown, maximumLength: number): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximumLength ? trimmed : null;
}

export function resolveAnalyticsFilters(query: Record<string, unknown>) {
  const source = singleBoundedQueryValue(query.source, 128);
  const path = singleBoundedQueryValue(query.path, 200);
  const eventName = singleBoundedQueryValue(query.event, 64);
  const country = singleBoundedQueryValue(query.country, 7);
  const device = singleBoundedQueryValue(query.device, 16);
  const browser = singleBoundedQueryValue(query.browser, 32);
  if ([source, path, eventName, country, device, browser].includes(null)) return null;
  if (device && !analyticsDevices.includes(device as (typeof analyticsDevices)[number])) return null;
  if (browser && !analyticsBrowsers.includes(browser.toLowerCase() as (typeof analyticsBrowsers)[number])) return null;
  if (country && country !== "unknown" && !/^[A-Za-z]{2}$/.test(country)) return null;
  if (
    path &&
    (!path.startsWith("/") || path.includes("?") || path.includes("#") || new RegExp(INVALID_STOREFRONT_PATH_PATTERN, "i").test(path))
  ) return null;
  if (eventName && !/^[a-z][a-z0-9_]{0,63}$/.test(eventName)) return null;
  return {
    source,
    path,
    eventName,
    country: country === "unknown" ? country : country?.toUpperCase(),
    device,
    browser: browser?.toLowerCase(),
  };
}

export function analyticsFilterResponse(filters: ReturnType<typeof resolveAnalyticsFilters>) {
  if (!filters) return null;
  return {
    source: filters.source ?? null,
    path: filters.path ?? null,
    eventName: filters.eventName ?? null,
    country: filters.country ?? null,
    device: filters.device ?? null,
    browser: filters.browser ?? null,
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

type StaffOrderItemRow = {
  item: typeof orderItemsTable.$inferSelect;
  measurement: typeof measurementRequestsTable.$inferSelect | null;
};

function staffMeasurementView(row: StaffOrderItemRow) {
  const request = row.measurement;
  if (!request) return null;
  return {
    id: request.id,
    lineNumber: row.item.lineNumber,
    productId: row.item.commerceProductId,
    variantId: row.item.commerceVariantId,
    productName: row.item.productName,
    selectionType: "custom" as const,
    selectedSize: row.item.selectedSize,
    status: request.status,
    unit: request.unit,
    values: request.values,
    customerNote: request.customerNote,
    clarificationNote: request.clarificationNote,
    productionException: request.productionException,
    version: request.version,
    submittedAt: request.submittedAt,
    confirmedAt: request.confirmedAt,
    updatedAt: request.updatedAt,
  };
}

function orderView(order: typeof ordersTable.$inferSelect, rows: StaffOrderItemRow[] = []) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    total: order.total,
    currency: order.currency,
    status: order.status,
    dispatchGuidance: CUSTOM_DISPATCH_GUIDANCE,
    items: rows.map((row) => ({
      id: row.item.id,
      lineNumber: row.item.lineNumber,
      productId: row.item.commerceProductId,
      variantId: row.item.commerceVariantId,
      productName: row.item.productName,
      selectionType: row.item.selectionType,
      selectedSize: row.item.selectedSize,
      selectedColourId: row.item.selectedColourId,
      selectedColourLabel: row.item.selectedColourLabel,
      selectedColourHex: row.item.selectedColourHex,
      customColour: row.item.customColour,
      quantity: row.item.quantity,
      measurement: staffMeasurementView(row),
    })),
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

async function staffOrderItems(orderIds: string[]): Promise<Map<string, StaffOrderItemRow[]>> {
  const grouped = new Map<string, StaffOrderItemRow[]>();
  if (!orderIds.length) return grouped;
  const rows = await db.select({ item: orderItemsTable, measurement: measurementRequestsTable })
    .from(orderItemsTable)
    .leftJoin(measurementRequestsTable, eq(measurementRequestsTable.orderItemId, orderItemsTable.id))
    .where(inArray(orderItemsTable.orderId, orderIds))
    .orderBy(orderItemsTable.lineNumber);
  for (const row of rows) {
    const values = grouped.get(row.item.orderId) ?? [];
    values.push(row);
    grouped.set(row.item.orderId, values);
  }
  return grouped;
}

export function staffOverviewView(
  values: {
    ordersTotal: number;
    ordersInProduction: number;
    openEnquiries: number;
    storefrontEvents7d: number;
  },
  range: { from: string; to: string },
  generatedAt = new Date(),
) {
  return {
    ...values,
    paymentIsLive: false,
    from: range.from,
    to: range.to,
    generatedAt,
    freshnessMinutes: 5,
    metrics: [
      { key: "orders_received", label: "Orders received", definition: "Orders created in the selected date range.", value: values.ordersTotal },
      { key: "in_production", label: "Atelier active", definition: "All orders currently in atelier confirmation or production, regardless of when they were created.", value: values.ordersInProduction },
      { key: "open_enquiries", label: "Open enquiries", definition: "New or in-progress enquiries received in the selected date range.", value: values.openEnquiries },
      { key: "consented_events", label: "Consented storefront events", definition: "First-party events from visitors who opted into measurement.", value: values.storefrontEvents7d },
    ],
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

router.get("/staff/access", requireStaffRoles("owner"), async (_req, res): Promise<void> => {
  const mappings = await db.select().from(staffUsersTable).orderBy(desc(staffUsersTable.isActive), desc(staffUsersTable.updatedAt));
  res.json(ListStaffAccessResponse.parse(mappings));
});

router.post("/staff/access", requireStaffRoles("owner"), async (req, res): Promise<void> => {
  const email = normalizedEmail(req.body?.email);
  const password = req.body?.password;
  const role = req.body?.role;
  if (!email || typeof password !== "string" || password.length < 12 || !["owner", "administrator", "operations", "stylist", "editor", "analyst"].includes(role)) {
    res.status(400).json({ error: "Provide an email, a strong temporary password, and a valid SOSO role." });
    return;
  }
  const [existing] = await db.select({ id: staffUsersTable.id }).from(staffUsersTable)
    .where(eq(staffUsersTable.email, email)).limit(1);
  if (existing) {
    res.status(400).json({ error: "That email address already has staff access." });
    return;
  }
  const [created] = await db.insert(staffUsersTable).values({ clerkUserId: newManagedStaffIdentity(), email, role: role as StaffUser["role"], isActive: true }).returning();
  await setManagedStaffPassword(created!.id, password);
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId, action: "staff_access.created", entityType: "staff_user", entityId: created!.id,
    metadata: auditMetadata({ email, role }),
  });
  res.status(201).json(CreateStaffAccessResponse.parse(created));
});

router.post("/staff/access/:id/password", requireStaffRoles("owner"), async (req, res): Promise<void> => {
  const password = req.body?.password;
  if (typeof password !== "string" || password.length < 12) {
    res.status(400).json({ error: "Use a temporary password with at least 12 characters." });
    return;
  }
  const staffId = typeof req.params.id === "string" ? req.params.id : "";
  const [target] = await db.select().from(staffUsersTable).where(eq(staffUsersTable.id, staffId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "Staff account not found." });
    return;
  }
  await setManagedStaffPassword(target.id, password);
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId, action: "staff_access.password_reset", entityType: "staff_user", entityId: target.id,
    metadata: auditMetadata({ email: target.email }),
  });
  res.status(204).end();
});

router.patch("/staff/access/:id", requireStaffRoles("owner"), async (req, res): Promise<void> => {
  const params = UpdateStaffAccessParams.safeParse(req.params);
  const parsed = UpdateStaffAccessBody.safeParse(req.body);
  if (!params.success || !parsed.success || (parsed.data.role === undefined && parsed.data.isActive === undefined)) {
    res.status(400).json({ error: "Provide a role or active status." });
    return;
  }
  const result = await withStaffAccessMutationLock(async (tx) => {
    const [actor] = await tx.select({
      role: staffUsersTable.role,
      isActive: staffUsersTable.isActive,
    }).from(staffUsersTable).where(eq(staffUsersTable.id, req.staff!.id)).limit(1);
    if (!actor || actor.role !== "owner" || !actor.isActive) {
      return { kind: "forbidden" as const };
    }

    const [target] = await tx.select().from(staffUsersTable).where(eq(staffUsersTable.id, params.data.id)).limit(1);
    if (!target) {
      return { kind: "missing" as const };
    }
    if (target.role === "owner" && target.isActive) {
      const [{ value: ownerCount }] = await tx.select({ value: count() }).from(staffUsersTable)
        .where(and(eq(staffUsersTable.role, "owner"), eq(staffUsersTable.isActive, true)));
      if (isFinalActiveOwnerChangeBlocked(target, parsed.data, Number(ownerCount))) {
        return { kind: "final_owner" as const };
      }
    }
    const updates = {
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      updatedAt: new Date(),
    };
    const [updated] = await tx.update(staffUsersTable).set(updates).where(eq(staffUsersTable.id, target.id)).returning();
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId,
      action: "staff_access.updated",
      entityType: "staff_user",
      entityId: target.id,
      metadata: staffAccessAuditMetadata(target, updated!),
    });
    return { kind: "updated" as const, staff: updated! };
  });

  if (result.kind === "forbidden") {
    res.status(403).json({ error: "Your staff role no longer permits access changes." });
    return;
  }
  if (result.kind === "missing") {
    res.status(404).json({ error: "Staff mapping not found." });
    return;
  }
  if (result.kind === "final_owner") {
    res.status(400).json({ error: "The final active owner cannot be removed or changed." });
    return;
  }
  res.json(UpdateStaffAccessResponse.parse(result.staff));
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
    GetStaffOverviewResponse.parse(staffOverviewView(values, range)),
  );
});

router.get(
  "/staff/funnel",
  requireStaffRoles("owner", "administrator", "analyst"),
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
    const events = eventNames.map((eventName) => ({
      eventName,
      count: values.get(eventName) ?? 0,
    }));
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

router.get("/staff/orders", requireStaffRoles("owner", "administrator", "operations", "stylist"), async (req, res): Promise<void> => {
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
  const items = await staffOrderItems(orders.map(({ id }) => id));
  res.json(ListStaffOrdersResponse.parse(orders.map((order) => orderView(order, items.get(order.id)))));
});

router.patch("/staff/orders/:id", requireStaffRoles("owner", "operations"), async (req, res): Promise<void> => {
  const params = UpdateStaffOrderParams.safeParse(req.params);
  const parsed = UpdateStaffOrderBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide a valid order update" });
    return;
  }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id)).limit(1);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (parsed.data.status && !orderTransitions[order.status].includes(parsed.data.status)) {
    res.status(400).json({ error: "That order status transition is not allowed" });
    return;
  }
  if (parsed.data.refundRequestDecision) {
    if (req.staff!.role !== "owner") {
      res.status(403).json({ error: "Only an owner can review an internal refund request" });
      return;
    }
    if (order.refundRequestStatus !== "requested" || !parsed.data.refundDecisionNote) {
      res.status(400).json({ error: "An owner can only review a pending refund request with a decision note" });
      return;
    }
  } else if (parsed.data.refundRequestReason) {
    if (order.refundRequestStatus) {
      res.status(400).json({ error: "An active internal refund request is already recorded" });
      return;
    }
  } else if (parsed.data.refundDecisionNote) {
    res.status(400).json({ error: "Request or review a refund in separate actions" });
    return;
  }
  const now = new Date();
  const guards = [eq(ordersTable.id, order.id)];
  if (parsed.data.status === "atelier_confirmation" || parsed.data.status === "in_production") {
    guards.push(sql`not exists (
      select 1
      from ${orderItemsTable}
      left join ${measurementRequestsTable}
        on ${measurementRequestsTable.orderItemId} = ${orderItemsTable.id}
      where ${orderItemsTable.orderId} = ${ordersTable.id}
        and ${orderItemsTable.selectionType} = 'custom'
        and (
          ${measurementRequestsTable.id} is null
          or ${measurementRequestsTable.status} <> 'confirmed'
        )
    )`);
  }
  const [updated] = await db.update(ordersTable).set({
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.atelierNotes !== undefined ? { atelierNotes: parsed.data.atelierNotes ?? null } : {}),
    ...(parsed.data.deliveryNotes !== undefined ? { deliveryNotes: parsed.data.deliveryNotes ?? null } : {}),
    ...(parsed.data.refundRequestReason ? { refundRequestStatus: "requested", refundRequestReason: parsed.data.refundRequestReason, refundRequestedAt: now } : {}),
    ...(parsed.data.refundRequestDecision ? {
      refundRequestStatus: parsed.data.refundRequestDecision,
      refundDecisionNote: parsed.data.refundDecisionNote!,
      refundReviewedAt: now,
    } : {}),
  }).where(and(...guards)).returning();
  if (!updated) {
    res.status(409).json({ error: "Confirm every Custom measurement before advancing the atelier workflow." });
    return;
  }
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId,
    action: "order.updated",
    entityType: "order",
    entityId: order.id,
    metadata: auditMetadata({ status: updated!.status, refundDecision: parsed.data.refundRequestDecision ?? null }),
  });
  const items = await staffOrderItems([updated!.id]);
  res.json(UpdateStaffOrderResponse.parse(orderView(updated!, items.get(updated!.id))));
});

router.patch(
  "/staff/measurements/:id",
  requireStaffRoles("owner", "administrator", "operations", "stylist"),
  async (req, res): Promise<void> => {
    const params = UpdateStaffMeasurementParams.safeParse(req.params);
    const parsed = UpdateStaffMeasurementBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Provide a valid atelier measurement action." });
      return;
    }
    const note = parsed.data.note?.trim();
    if ((parsed.data.action === "request_clarification" || parsed.data.action === "set_production_exception") && !note) {
      res.status(400).json({ error: "A note is required for this action." });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select({
        request: measurementRequestsTable,
        item: orderItemsTable,
        order: ordersTable,
      }).from(measurementRequestsTable)
        .innerJoin(orderItemsTable, eq(measurementRequestsTable.orderItemId, orderItemsTable.id))
        .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
        .where(eq(measurementRequestsTable.id, params.data.id)).limit(1);
      if (!row || row.item.selectionType !== "custom") return { kind: "missing" as const };
      if (!["paid", "atelier_confirmation", "in_production", "ready", "fulfilled"].includes(row.order.status)) {
        return { kind: "unpaid" as const };
      }
      if (!staffMeasurementActionAllowed(row.request.status, parsed.data.action, Boolean(row.request.productionException))) {
        return { kind: "transition" as const };
      }
      const now = new Date();
      const changes = parsed.data.action === "request_clarification"
        ? { status: "clarification_requested" as const, clarificationNote: note! }
        : parsed.data.action === "confirm"
          ? { status: "confirmed" as const, clarificationNote: null, confirmedAt: now }
          : parsed.data.action === "set_production_exception"
            ? { productionException: note! }
            : { productionException: null };
      const [updated] = await tx.update(measurementRequestsTable).set({
        ...changes,
        version: row.request.version + 1,
        updatedAt: now,
      }).where(and(
        eq(measurementRequestsTable.id, row.request.id),
        eq(measurementRequestsTable.version, parsed.data.version),
      )).returning();
      if (!updated) return { kind: "stale" as const };
      await tx.insert(measurementRevisionsTable).values({
        measurementRequestId: updated.id,
        version: updated.version,
        actorType: "staff",
        actorId: req.staff!.clerkUserId,
        action: parsed.data.action,
        snapshot: updated,
      });
      await tx.insert(auditLogsTable).values({
        actorClerkUserId: req.staff!.clerkUserId,
        action: `measurement.${parsed.data.action}`,
        entityType: "measurement_request",
        entityId: updated.id,
        metadata: auditMetadata({
          orderId: row.order.id,
          lineNumber: row.item.lineNumber,
          status: updated.status,
          hasProductionException: Boolean(updated.productionException),
          version: updated.version,
        }),
      });
      return { kind: "updated" as const, row: { item: row.item, measurement: updated } };
    });
    if (result.kind === "missing") {
      res.status(404).json({ error: "Custom measurement request not found." });
      return;
    }
    if (result.kind === "unpaid" || result.kind === "transition" || result.kind === "stale") {
      res.status(409).json({ error: "The paid-order measurement action is stale or is not allowed in its current state." });
      return;
    }
    res.json(UpdateStaffMeasurementResponse.parse(staffMeasurementView(result.row)));
  },
);

router.get("/staff/enquiries", requireStaffRoles("owner", "administrator", "operations", "stylist"), async (_req, res): Promise<void> => {
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
  const params = UpdateStaffPrivacyRequestParams.safeParse(req.params);
  const parsed = UpdateStaffPrivacyRequestBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide a valid privacy request update" });
    return;
  }
  const [request] = await db.select().from(privacyRequestsTable).where(eq(privacyRequestsTable.id, params.data.id)).limit(1);
  if (!request) {
    res.status(404).json({ error: "Privacy request not found" });
    return;
  }
  if (parsed.data.status && !privacyTransitions[request.status].includes(parsed.data.status)) {
    res.status(400).json({ error: "That privacy request transition is not allowed" });
    return;
  }
  const verifiesIdentity = parsed.data.status === "identity_verified";
  const closesRequest = parsed.data.status === "completed" || parsed.data.status === "rejected";
  if ((verifiesIdentity || closesRequest) && req.staff!.role !== "owner") {
    res.status(403).json({ error: "Only an owner can verify identity or close a privacy request" });
    return;
  }
  if (verifiesIdentity && !parsed.data.verificationNote?.trim()) {
    res.status(400).json({ error: "Record identity-verification evidence before marking a request verified" });
    return;
  }
  if (closesRequest && !parsed.data.resolutionNote?.trim()) {
    res.status(400).json({ error: "Record a resolution note before closing a privacy request" });
    return;
  }
  if (request.requestType === "deletion" && parsed.data.status === "completed") {
    res.status(409).json({ error: "Deletion completion is blocked until SOSO approves retention and deletion procedures" });
    return;
  }
  const now = new Date();
  const [updated] = await db.update(privacyRequestsTable).set({
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.verificationNote !== undefined ? { verificationNote: parsed.data.verificationNote ?? null } : {}),
    ...(parsed.data.resolutionNote !== undefined ? { resolutionNote: parsed.data.resolutionNote ?? null } : {}),
    ...(verifiesIdentity ? { verifiedAt: now, verifiedByClerkUserId: req.staff!.clerkUserId } : {}),
    ...(parsed.data.status === "completed" ? { completedAt: now } : {}),
  }).where(eq(privacyRequestsTable.id, request.id)).returning();
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId,
    action: "privacy_request.updated",
    entityType: "privacy_request",
    entityId: request.id,
    metadata: auditMetadata({ status: updated!.status, verified: verifiesIdentity, completed: parsed.data.status === "completed" }),
  });
  res.json(UpdateStaffPrivacyRequestResponse.parse(updated!));
});

router.post("/staff/privacy-requests/:id/access-package", requireStaffRoles("owner"), async (req, res): Promise<void> => {
  const params = UpdateStaffPrivacyRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid privacy request reference" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(privacyRequestsTable).where(eq(privacyRequestsTable.id, params.data.id)).limit(1);
    if (!request) return { kind: "missing" as const };
    if (request.requestType !== "access") return { kind: "wrong_type" as const };
    if (!hasRecordedIdentityVerification(request)) return { kind: "unverified" as const };

    const [existing] = await tx.select().from(privacyAccessPackagesTable)
      .where(eq(privacyAccessPackagesTable.privacyRequestId, request.id)).limit(1);
    const existingFormat = existing?.payload && typeof existing.payload === "object" && !Array.isArray(existing.payload)
      ? (existing.payload as Record<string, unknown>).format
      : undefined;
    if (existing && existingFormat === "soso-subject-access-package-v2" && !existing.downloadedAt && existing.expiresAt > new Date()) {
      return { kind: "existing" as const, package: existing };
    }

    const email = normalizedEmail(request.requesterEmail);
    const orders = await tx.select({
      id: ordersTable.id, orderNumber: ordersTable.orderNumber, customerName: ordersTable.customerName,
      customerEmail: ordersTable.customerEmail, customerPhone: ordersTable.customerPhone, currency: ordersTable.currency,
      subtotal: ordersTable.subtotal, total: ordersTable.total, status: ordersTable.status, source: ordersTable.source,
      atelierNotes: ordersTable.atelierNotes, deliveryNotes: ordersTable.deliveryNotes, createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt,
    }).from(ordersTable).where(sql`lower(${ordersTable.customerEmail}) = ${email}`);
    const orderItems = orders.length ? await tx.select({
      orderId: orderItemsTable.orderId, productSlug: orderItemsTable.productSlug, productName: orderItemsTable.productName,
      selectedSize: orderItemsTable.selectedSize, selectedColourId: orderItemsTable.selectedColourId,
      selectedColourLabel: orderItemsTable.selectedColourLabel, selectedColourHex: orderItemsTable.selectedColourHex,
      customColour: orderItemsTable.customColour, quantity: orderItemsTable.quantity, unitPrice: orderItemsTable.unitPrice, createdAt: orderItemsTable.createdAt,
    }).from(orderItemsTable).where(inArray(orderItemsTable.orderId, orders.map((order) => order.id))) : [];
    const measurements = orders.length ? await tx.select({
      id: measurementRequestsTable.id,
      orderId: orderItemsTable.orderId,
      orderItemId: measurementRequestsTable.orderItemId,
      lineNumber: orderItemsTable.lineNumber,
      status: measurementRequestsTable.status,
      unit: measurementRequestsTable.unit,
      values: measurementRequestsTable.values,
      customerNote: measurementRequestsTable.customerNote,
      clarificationNote: measurementRequestsTable.clarificationNote,
      productionException: measurementRequestsTable.productionException,
      version: measurementRequestsTable.version,
      submittedAt: measurementRequestsTable.submittedAt,
      confirmedAt: measurementRequestsTable.confirmedAt,
      createdAt: measurementRequestsTable.createdAt,
      updatedAt: measurementRequestsTable.updatedAt,
    }).from(measurementRequestsTable)
      .innerJoin(orderItemsTable, eq(measurementRequestsTable.orderItemId, orderItemsTable.id))
      .where(inArray(orderItemsTable.orderId, orders.map((order) => order.id))) : [];
    const measurementRevisions = measurements.length ? await tx.select({
      measurementRequestId: measurementRevisionsTable.measurementRequestId,
      version: measurementRevisionsTable.version,
      actorType: measurementRevisionsTable.actorType,
      action: measurementRevisionsTable.action,
      snapshot: measurementRevisionsTable.snapshot,
      createdAt: measurementRevisionsTable.createdAt,
    }).from(measurementRevisionsTable)
      .where(inArray(measurementRevisionsTable.measurementRequestId, measurements.map(({ id }) => id))) : [];
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
      format: "soso-subject-access-package-v2",
      generatedAt: new Date().toISOString(),
      requesterEmail: email,
      scope: {
        included: ["orders", "order_items", "measurements", "measurement_revisions", "customer_enquiries", "checkout_attempts"],
        excluded: ["payment card data, payment-provider references, ownership or idempotency tokens", "staff-only audit and operational records", "anonymous analytics and consent records, which are not linked to an identified requester"],
      },
      data: { orders, orderItems, measurements, measurementRevisions, enquiries, checkoutAttempts },
    };
    const rowCounts = {
      orders: orders.length,
      orderItems: orderItems.length,
      measurements: measurements.length,
      measurementRevisions: measurementRevisions.length,
      enquiries: enquiries.length,
      checkoutAttempts: checkoutAttempts.length,
    };
    const nextPackage = { packageHash: privacyPackageHash(payload), payload, rowCounts, createdByClerkUserId: req.staff!.clerkUserId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
    const [packageRecord] = existing
      ? await tx.update(privacyAccessPackagesTable).set({ ...nextPackage, downloadedAt: null, downloadedByClerkUserId: null }).where(eq(privacyAccessPackagesTable.id, existing.id)).returning()
      : await tx.insert(privacyAccessPackagesTable).values({ privacyRequestId: request.id, ...nextPackage }).returning();
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId,
      action: existing ? "privacy_request.access_package_reissued" : "privacy_request.access_package_generated",
      entityType: "privacy_request",
      entityId: request.id,
      metadata: auditMetadata({ packageId: packageRecord!.id, packageHash: packageRecord!.packageHash, rowCounts: packageRecord!.rowCounts, expiresAt: packageRecord!.expiresAt.toISOString() }),
    });
    return { kind: existing ? "reissued" as const : "created" as const, package: packageRecord! };
  });
  if (result.kind === "missing") { res.status(404).json({ error: "Privacy request not found" }); return; }
  if (result.kind === "wrong_type") { res.status(400).json({ error: "Only a verified access request can receive an access package" }); return; }
  if (result.kind === "unverified") { res.status(400).json({ error: "Verify the requester before generating an access package" }); return; }
  res.status(result.kind === "created" || result.kind === "reissued" ? 201 : 200).json({
    packageId: result.package.id,
    expiresAt: result.package.expiresAt,
    downloadedAt: result.package.downloadedAt,
    rowCounts: result.package.rowCounts,
    downloadPath: `/api/staff/privacy-access-packages/${result.package.id}/download`,
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

router.get("/staff/analytics/metrics", requireStaffRoles("owner", "administrator", "analyst"), async (req, res): Promise<void> => {
  const range = resolveDateRange(req.query, 366);
  const filters = resolveAnalyticsFilters(req.query);
  if (!range || !filters) {
    res.status(400).json({ error: "Use a valid date range of at most 366 days and bounded analytics filters." });
    return;
  }

  const consentFilter = inArray(analyticsEventsTable.consent, ["analytics", "marketing"]);
  const browserBucket = sql<string>`case
    when lower(coalesce(${analyticsEventsTable.properties}->>'browser', '')) in ('chrome', 'safari', 'firefox', 'edge', 'opera', 'samsung internet')
      then lower(${analyticsEventsTable.properties}->>'browser')
    else 'unknown' end`;
  const countryBucket = sql<string>`case
    when coalesce(${analyticsEventsTable.properties}->>'_country', '') ~ '^[A-Za-z]{2}$'
      then upper(${analyticsEventsTable.properties}->>'_country')
    else 'unknown' end`;
  const sourceBucket = sql<string>`case
    when coalesce(${analyticsEventsTable.source}, '') = '' then '(direct)'
    when length(${analyticsEventsTable.source}) <= 128 and ${analyticsEventsTable.source} ~ '^[A-Za-z0-9._ -]+$'
      then ${analyticsEventsTable.source}
    else '(other)' end`;
  const mediumBucket = sql<string>`case
    when coalesce(${analyticsEventsTable.utmMedium}, '') = '' then '(none)'
    when length(${analyticsEventsTable.utmMedium}) <= 128 and ${analyticsEventsTable.utmMedium} ~ '^[A-Za-z0-9._ /-]+$'
      then ${analyticsEventsTable.utmMedium}
    else '(other)' end`;
  const campaignBucket = sql<string>`case
    when coalesce(${analyticsEventsTable.utmCampaign}, '') = '' then '(none)'
    when length(${analyticsEventsTable.utmCampaign}) <= 128 and ${analyticsEventsTable.utmCampaign} ~ '^[A-Za-z0-9._ /-]+$'
      then ${analyticsEventsTable.utmCampaign}
    else '(other)' end`;
  const dimensionFilters = [
    ...(filters.source ? [sql`${sourceBucket} = ${filters.source}`] : []),
    ...(filters.path ? [eq(analyticsEventsTable.path, filters.path)] : []),
    ...(filters.eventName ? [eq(analyticsEventsTable.eventName, filters.eventName)] : []),
    ...(filters.country ? [sql`${countryBucket} = ${filters.country}`] : []),
    ...(filters.device ? [sql`coalesce(${analyticsEventsTable.deviceType}, 'unknown') = ${filters.device}`] : []),
    ...(filters.browser ? [sql`${browserBucket} = ${filters.browser}`] : []),
  ];
  const dateFilter = and(gte(analyticsEventsTable.occurredAt, range.start), lte(analyticsEventsTable.occurredAt, range.end), ...dimensionFilters);
  const periodMs = range.end.getTime() - range.start.getTime() + 1;
  const comparisonEnd = new Date(range.start.getTime() - 1);
  const comparisonStart = new Date(comparisonEnd.getTime() - periodMs + 1);
  const comparisonFilter = and(
    gte(analyticsEventsTable.occurredAt, comparisonStart),
    lte(analyticsEventsTable.occurredAt, comparisonEnd),
    ...dimensionFilters,
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
      .where(and(dateFilter, consentFilter, eq(analyticsEventsTable.eventName, "page_view"), sql`${analyticsEventsTable.path} !~* ${INVALID_STOREFRONT_PATH_PATTERN}`))
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
        source: sourceBucket,
        medium: sql<string>`case when coalesce(${analyticsEventsTable.utmMedium}, '') ~ '^[A-Za-z0-9._ -]{1,128}$' then ${analyticsEventsTable.utmMedium} else '(none)' end`,
        campaign: sql<string>`case when coalesce(${analyticsEventsTable.utmCampaign}, '') ~ '^[A-Za-z0-9._ -]{1,128}$' then ${analyticsEventsTable.utmCampaign} else '(none)' end`,
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
        country: countryBucket,
        events: count(),
      })
      .from(analyticsEventsTable)
      .where(and(dateFilter, consentFilter))
      .groupBy(countryBucket)
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

  const realtimeStart = new Date(Date.now() - 5 * 60_000);
  const [
    dailyRows,
    pageAggregateRows,
    sourceAggregateRows,
    countryAggregateRows,
    deviceAggregateRows,
    browserAggregateRows,
    allEventRows,
    realtimeRows,
    realtimePageRows,
    orderRows,
    previousSummaryRows,
    previousOrderRows,
    engagementResult,
  ] = await Promise.all([
    db.select({
      date: sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.occurredAt}), 'YYYY-MM-DD')`,
      events: count(),
      visitors: sql<number>`count(distinct ${analyticsEventsTable.anonymousId})`,
      sessions: sql<number>`count(distinct ${analyticsEventsTable.sessionId})`,
      pageViews: sql<number>`count(*) filter (where ${analyticsEventsTable.eventName} = 'page_view')`,
    }).from(analyticsEventsTable).where(and(dateFilter, consentFilter))
      .groupBy(sql`date_trunc('day', ${analyticsEventsTable.occurredAt})`)
      .orderBy(sql`date_trunc('day', ${analyticsEventsTable.occurredAt})`),
    db.select({
      path: analyticsEventsTable.path,
      views: sql<number>`count(*)`,
      visitors: sql<number>`count(distinct ${analyticsEventsTable.anonymousId})`,
      sessions: sql<number>`count(distinct ${analyticsEventsTable.sessionId})`,
    }).from(analyticsEventsTable).where(and(dateFilter, consentFilter, eq(analyticsEventsTable.eventName, "page_view"), sql`${analyticsEventsTable.path} !~* ${INVALID_STOREFRONT_PATH_PATTERN}`))
      .groupBy(analyticsEventsTable.path).orderBy(sql`count(*) desc`).limit(100),
    db.select({
      source: sourceBucket,
      medium: mediumBucket,
      campaign: campaignBucket,
      events: count(),
      visitors: sql<number>`count(distinct ${analyticsEventsTable.anonymousId})`,
      sessions: sql<number>`count(distinct ${analyticsEventsTable.sessionId})`,
    }).from(analyticsEventsTable).where(and(dateFilter, consentFilter))
      .groupBy(sourceBucket, mediumBucket, campaignBucket).orderBy(sql`count(*) desc`).limit(100),
    db.select({
      country: countryBucket,
      events: count(),
      visitors: sql<number>`count(distinct ${analyticsEventsTable.anonymousId})`,
    }).from(analyticsEventsTable).where(and(dateFilter, consentFilter))
      .groupBy(countryBucket).orderBy(sql`count(*) desc`).limit(100),
    db.select({
      deviceType: sql<string>`coalesce(${analyticsEventsTable.deviceType}, 'unknown')`,
      events: count(),
      visitors: sql<number>`count(distinct ${analyticsEventsTable.anonymousId})`,
    }).from(analyticsEventsTable).where(and(dateFilter, consentFilter))
      .groupBy(analyticsEventsTable.deviceType).orderBy(sql`count(*) desc`),
    db.select({
      browser: browserBucket,
      events: count(),
      visitors: sql<number>`count(distinct ${analyticsEventsTable.anonymousId})`,
    }).from(analyticsEventsTable).where(and(dateFilter, consentFilter))
      .groupBy(browserBucket).orderBy(sql`count(*) desc`),
    db.select({
      eventName: analyticsEventsTable.eventName,
      events: count(),
      visitors: sql<number>`count(distinct ${analyticsEventsTable.anonymousId})`,
      sessions: sql<number>`count(distinct ${analyticsEventsTable.sessionId})`,
    }).from(analyticsEventsTable).where(and(dateFilter, consentFilter))
      .groupBy(analyticsEventsTable.eventName).orderBy(sql`count(*) desc`).limit(100),
    db.select({
      activeSessions: sql<number>`count(distinct ${analyticsEventsTable.sessionId})`,
      events: count(),
    }).from(analyticsEventsTable).where(and(
      gte(analyticsEventsTable.occurredAt, realtimeStart),
      lte(analyticsEventsTable.occurredAt, new Date()),
      consentFilter,
      ...dimensionFilters,
    )),
    db.select({ path: analyticsEventsTable.path, views: count() }).from(analyticsEventsTable)
      .where(and(gte(analyticsEventsTable.occurredAt, realtimeStart), consentFilter, eq(analyticsEventsTable.eventName, "page_view"), sql`${analyticsEventsTable.path} !~* ${INVALID_STOREFRONT_PATH_PATTERN}`, ...dimensionFilters))
      .groupBy(analyticsEventsTable.path).orderBy(sql`count(*) desc`).limit(10),
    db.select({
      currency: ordersTable.currency,
      orders: count(),
      revenue: sql<string>`coalesce(sum(${ordersTable.total}), 0)`,
    }).from(ordersTable).where(and(
      gte(ordersTable.createdAt, range.start),
      lte(ordersTable.createdAt, range.end),
      inArray(ordersTable.status, ["paid", "atelier_confirmation", "in_production", "ready", "fulfilled"]),
    )).groupBy(ordersTable.currency),
    db.select({
      visitors: sql<number>`count(distinct ${analyticsEventsTable.anonymousId})`,
      sessions: sql<number>`count(distinct ${analyticsEventsTable.sessionId})`,
      pageViews: sql<number>`count(*) filter (where ${analyticsEventsTable.eventName} = 'page_view')`,
      events: count(),
    }).from(analyticsEventsTable).where(and(comparisonFilter, consentFilter)),
    db.select({ orders: count() }).from(ordersTable).where(and(
      gte(ordersTable.createdAt, comparisonStart),
      lte(ordersTable.createdAt, comparisonEnd),
      inArray(ordersTable.status, ["paid", "atelier_confirmation", "in_production", "ready", "fulfilled"]),
    )),
    db.execute(sql`
      with session_rollup as (
        select session_id,
          count(*) filter (where event_name = 'page_view') as page_views,
          count(*) filter (where event_name = 'active_time_heartbeat') as heartbeats,
          count(*) filter (where event_name in ('add_to_bag', 'checkout_started', 'payment_clicked')) as conversion_events,
          coalesce(sum(case
            when event_name = 'active_time_heartbeat'
              and (properties->>'interval_seconds') ~ '^[0-9]{1,4}$'
            then least((properties->>'interval_seconds')::int, 300)
            else 0 end), 0) as engaged_seconds
        from ${analyticsEventsTable}
        where ${analyticsEventsTable.occurredAt} >= ${range.start}
          and ${analyticsEventsTable.occurredAt} <= ${range.end}
          and ${analyticsEventsTable.consent} in ('analytics', 'marketing')
          and ${analyticsEventsTable.sessionId} is not null
          ${dimensionFilters.length ? sql`and ${and(...dimensionFilters)}` : sql``}
        group by session_id
      )
      select count(*) as sessions,
        coalesce(avg(engaged_seconds), 0) as average_engaged_seconds,
        count(*) filter (where page_views = 1 and heartbeats = 0 and conversion_events = 0) as bounced_sessions
      from session_rollup
    `),
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
  const dailyByDate = new Map(dailyRows.map((row) => [row.date, row]));
  const dailyTimeSeries = Array.from({ length: rangeDays }, (_, index) => {
    const date = new Date(range.start);
    date.setUTCDate(date.getUTCDate() + index);
    const day = date.toISOString().slice(0, 10);
    const row = dailyByDate.get(day);
    return {
      date: day,
      events: Number(row?.events ?? 0),
      visitors: Number(row?.visitors ?? 0),
      sessions: Number(row?.sessions ?? 0),
      pageViews: Number(row?.pageViews ?? 0),
    };
  });
  const engagementRows = (engagementResult as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  const engagement = engagementRows[0] ?? {};
  const engagedSessions = Number(engagement.sessions ?? 0);
  const bouncedSessions = Number(engagement.bounced_sessions ?? 0);
  const currentSummary = {
    visitors: Number(visitorRows[0]?.uniqueVisitors ?? 0),
    sessions: Number(visitorRows[0]?.uniqueSessions ?? 0),
    pageViews: currentCounts.page_view ?? 0,
    events: allEventRows.reduce((total, row) => total + Number(row.events), 0),
    orders: orderRows.reduce((total, row) => total + Number(row.orders ?? 0), 0),
  };
  const previousSummary = {
    visitors: Number(previousSummaryRows[0]?.visitors ?? 0),
    sessions: Number(previousSummaryRows[0]?.sessions ?? 0),
    pageViews: Number(previousSummaryRows[0]?.pageViews ?? 0),
    events: Number(previousSummaryRows[0]?.events ?? 0),
    orders: Number(previousOrderRows[0]?.orders ?? 0),
  };

  res.json({
    from: range.from,
    to: range.to,
    generatedAt: new Date(),
    privacyNote: "Aggregate first-party data only. No visitor identifiers or personal data is included.",
    semantics: {
      consent: "Analytics uses only first-party events recorded after an analytics or marketing consent decision.",
      visitors: "Visitors are distinct anonymous measurement identifiers, never customer accounts or identified people.",
      sessions: "Sessions are distinct anonymous session identifiers. Identifiers are counted server-side and never returned.",
      commerce: "Verified orders and gross order totals come from commerce data and are deliberately not linked or attributed to analytics visitors, sources, or dimensions.",
      browser: "Browser uses only a bounded coarse event property when available; missing or unsupported values are reported as unknown. Full user-agent strings are neither required nor returned.",
      geography: "Country is a coarse server-provided two-letter country code. Precise location is not collected or returned.",
    },
    appliedFilters: analyticsFilterResponse(filters),
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
    summary: Object.fromEntries(Object.entries(currentSummary).map(([key, current]) => [
      key,
      { current, previous: previousSummary[key as keyof typeof previousSummary], delta: comparisonDelta(current, previousSummary[key as keyof typeof previousSummary]) },
    ])),
    dailyTimeSeries,
    pages: pageAggregateRows.map((row) => ({
      path: row.path,
      views: Number(row.views),
      visitors: Number(row.visitors),
      sessions: Number(row.sessions),
    })),
    sources: sourceAggregateRows.map((row) => ({
      source: row.source,
      medium: row.medium,
      campaign: row.campaign,
      events: Number(row.events),
      visitors: Number(row.visitors),
      sessions: Number(row.sessions),
    })),
    geography: countryAggregateRows.map((row) => ({
      country: row.country,
      events: Number(row.events),
      visitors: Number(row.visitors),
    })),
    devices: deviceAggregateRows.map((row) => ({
      deviceType: row.deviceType,
      events: Number(row.events),
      visitors: Number(row.visitors),
    })),
    browsers: browserAggregateRows.map((row) => ({
      browser: row.browser,
      events: Number(row.events),
      visitors: Number(row.visitors),
    })),
    events: allEventRows.map((row) => ({
      eventName: row.eventName,
      events: Number(row.events),
      visitors: Number(row.visitors),
      sessions: Number(row.sessions),
    })),
    conversions: [
      ...["add_to_bag", "checkout_started", "payment_clicked"].map((eventName) => ({
        key: eventName,
        count: currentCounts[eventName] ?? 0,
        kind: "consented_event",
        definition: `${eventName.replaceAll("_", " ")} events in the selected range; event volume is not a count of people or completed payments.`,
      })),
      {
        key: "verified_orders",
        count: orderRows.reduce((total, row) => total + Number(row.orders ?? 0), 0),
        kind: "commerce",
        revenueByCurrency: orderRows.map((row) => ({
          currency: row.currency,
          orders: Number(row.orders ?? 0),
          revenue: Number(row.revenue ?? 0),
        })),
        definition: "Orders in a verified paid or later fulfilment status, aggregated independently from analytics visitors. Revenue is gross order total and is not attributed to a visitor or source.",
      },
    ],
    engagement: {
      averageEngagedSeconds: engagedSessions ? Number(engagement.average_engaged_seconds ?? 0) : null,
      bouncedSessions,
      bounceRate: engagedSessions ? bouncedSessions / engagedSessions : null,
      definition: "Average engaged duration is the mean per consented session of bounded visible-time heartbeat intervals (each interval capped at 300 seconds). A bounce is a session with exactly one page view, no active-time heartbeat (heartbeats begin after 15 visible seconds), and no add-to-bag, checkout-start, or payment-click event.",
    },
    realtime: {
      windowMinutes: 5,
      activeNow: Number(realtimeRows[0]?.activeSessions ?? 0),
      events: Number(realtimeRows[0]?.events ?? 0),
      topPages: realtimePageRows.map((row) => ({ path: row.path, views: Number(row.views) })),
      asOf: new Date(),
      definition: "Active now is the distinct count of consented anonymous sessions with an event in the rolling five minutes. It is not a count of identified people.",
    },
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

router.get("/staff/analytics/quality", requireStaffRoles("owner", "administrator", "analyst"), async (req, res): Promise<void> => {
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

router.get("/staff/audit", requireStaffRoles("owner", "administrator", "analyst"), async (req, res): Promise<void> => {
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

router.get("/staff/exports", requireStaffRoles("owner", "administrator", "analyst"), async (req, res): Promise<void> => {
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

function expectedRedirectRevision(req: Request): Date | null | "invalid" {
  const header = req.header("x-soso-expected-revision");
  if (!header) return null;
  const revision = new Date(header);
  return Number.isNaN(revision.getTime()) ? "invalid" : revision;
}

router.get("/staff/redirects", requireStaffRoles("owner", "administrator", "operations"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(redirectsTable).orderBy(desc(redirectsTable.createdAt)).limit(200);
  res.json(rows);
});

router.post("/staff/redirects", requireStaffRoles("owner", "administrator", "operations"), async (req, res): Promise<void> => {
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
  if (fromPath === toPath || fromPath.length > 512 || toPath.length > 512) {
    res.status(400).json({ error: "Redirect paths must be distinct and at most 512 characters" });
    return;
  }
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(redirectsTable).values({
      fromPath, toPath, statusCode: code, isPublished: false, updatedByClerkUserId: req.staff!.clerkUserId,
    }).returning();
    await tx.insert(redirectRevisionsTable).values({ redirectId: created!.id, event: "created", snapshot: created!, createdByClerkUserId: req.staff!.clerkUserId });
    await tx.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "redirect.created", entityType: "redirect", entityId: created!.id, metadata: { fromPath, toPath, statusCode: code } });
    return created!;
  });
  res.status(201).json(row);
});

router.put("/staff/redirects/:id", requireStaffRoles("owner", "administrator", "operations"), async (req, res): Promise<void> => {
  const { fromPath, toPath, statusCode } = req.body as Record<string, unknown>;
  if (typeof fromPath !== "string" || typeof toPath !== "string" || !fromPath.startsWith("/") || fromPath.startsWith("//") || !toPath.startsWith("/") || toPath.startsWith("//") || fromPath === toPath || fromPath.length > 512 || toPath.length > 512 || typeof statusCode !== "number" || ![301, 302, 307, 308].includes(statusCode)) {
    res.status(400).json({ error: "Provide distinct safe internal redirect paths and a supported status code" }); return;
  }
  const expected = expectedRedirectRevision(req);
  if (expected === "invalid") { res.status(400).json({ error: "The redirect revision reference is invalid" }); return; }
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(redirectsTable).where(eq(redirectsTable.id, req.params.id as string)).limit(1);
    if (!current) return { kind: "missing" as const };
    if (expected && current.updatedAt.getTime() !== expected.getTime()) return { kind: "conflict" as const };
    const [row] = await tx.update(redirectsTable).set({ fromPath, toPath, statusCode, updatedAt: new Date(), updatedByClerkUserId: req.staff!.clerkUserId }).where(eq(redirectsTable.id, current.id)).returning();
    await tx.insert(redirectRevisionsTable).values({ redirectId: row.id, event: "updated", snapshot: row, createdByClerkUserId: req.staff!.clerkUserId });
    await tx.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "redirect.updated", entityType: "redirect", entityId: row.id, metadata: { fromPath, toPath, statusCode } });
    return { kind: "updated" as const, row };
  });
  if (result.kind === "missing") { res.status(404).json({ error: "Redirect not found" }); return; }
  if (result.kind === "conflict") { res.status(409).json({ error: "This redirect changed while you were editing it. Reload before saving." }); return; }
  res.json(result.row);
});

router.post("/staff/redirects/:id/publish", requireStaffRoles("owner", "administrator", "operations"), async (req, res): Promise<void> => {
  const publish = req.body?.published !== false;
  const expected = expectedRedirectRevision(req);
  if (expected === "invalid") { res.status(400).json({ error: "The redirect revision reference is invalid" }); return; }
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(redirectsTable).where(eq(redirectsTable.id, req.params.id as string)).limit(1);
    if (!current) return { kind: "missing" as const };
    if (expected && current.updatedAt.getTime() !== expected.getTime()) return { kind: "conflict" as const };
    const [row] = await tx.update(redirectsTable).set({ isPublished: publish, updatedAt: new Date(), updatedByClerkUserId: req.staff!.clerkUserId }).where(eq(redirectsTable.id, current.id)).returning();
    await tx.insert(redirectRevisionsTable).values({ redirectId: row.id, event: publish ? "published" : "unpublished", snapshot: row, createdByClerkUserId: req.staff!.clerkUserId });
    await tx.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: publish ? "redirect.published" : "redirect.unpublished", entityType: "redirect", entityId: row.id, metadata: {} });
    return { kind: "updated" as const, row };
  });
  if (result.kind === "missing") { res.status(404).json({ error: "Redirect not found" }); return; }
  if (result.kind === "conflict") { res.status(409).json({ error: "This redirect changed before its publication state could be updated." }); return; }
  res.json(result.row);
});

router.get("/staff/redirects/:id/history", requireStaffRoles("owner", "administrator", "operations"), async (req, res): Promise<void> => {
  const rows = await db.select().from(redirectRevisionsTable).where(eq(redirectRevisionsTable.redirectId, req.params.id as string)).orderBy(desc(redirectRevisionsTable.createdAt)).limit(100);
  res.json(rows);
});

router.delete("/staff/redirects/:id", requireStaffRoles("owner", "administrator", "operations"), async (req, res): Promise<void> => {
  const expected = expectedRedirectRevision(req);
  if (expected === "invalid") { res.status(400).json({ error: "The redirect revision reference is invalid" }); return; }
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(redirectsTable).where(eq(redirectsTable.id, req.params.id as string)).limit(1);
    if (!current) return "missing";
    if (expected && current.updatedAt.getTime() !== expected.getTime()) return "conflict";
    await tx.insert(redirectRevisionsTable).values({ redirectId: current.id, event: "deleted", snapshot: current, createdByClerkUserId: req.staff!.clerkUserId });
    await tx.delete(redirectsTable).where(eq(redirectsTable.id, current.id));
    await tx.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "redirect.deleted", entityType: "redirect", entityId: current.id, metadata: {} });
    return "deleted";
  });
  if (result === "missing") { res.status(404).json({ error: "Redirect not found" }); return; }
  if (result === "conflict") { res.status(409).json({ error: "This redirect changed before it could be deleted." }); return; }
  res.status(204).send();
});

export default router;
