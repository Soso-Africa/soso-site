import { Router, type IRouter } from "express";
import {
  GetStaffOverviewResponse,
  GetStaffFunnelResponse,
  GetStaffProfileResponse,
  ListStaffEnquiriesResponse,
  ListStaffOrdersResponse,
} from "@workspace/api-zod";
import {
  analyticsEventsTable,
  customerEnquiriesTable,
  db,
  ordersTable,
} from "@workspace/db";
import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";

const router: IRouter = Router();

router.use("/staff", requireStaff);

router.get("/staff/me", (req, res): void => {
  res.json(
    GetStaffProfileResponse.parse({
      id: req.staff!.id,
      email: req.staff!.email,
      role: req.staff!.role,
    }),
  );
});

router.get("/staff/overview", async (_req, res): Promise<void> => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [[orders], [inProduction], [enquiries], [events]] = await Promise.all([
    db.select({ value: count() }).from(ordersTable),
    db
      .select({ value: count() })
      .from(ordersTable)
      .where(inArray(ordersTable.status, ["atelier_confirmation", "in_production"])),
    db
      .select({ value: count() })
      .from(customerEnquiriesTable)
      .where(eq(customerEnquiriesTable.status, "new")),
    db
      .select({ value: count() })
      .from(analyticsEventsTable)
      .where(gte(analyticsEventsTable.occurredAt, sevenDaysAgo)),
  ]);

  res.json(
    GetStaffOverviewResponse.parse({
      ordersTotal: Number(orders?.value ?? 0),
      ordersInProduction: Number(inProduction?.value ?? 0),
      openEnquiries: Number(enquiries?.value ?? 0),
      storefrontEvents7d: Number(events?.value ?? 0),
      paymentIsLive: false,
    }),
  );
});

router.get(
  "/staff/funnel",
  requireStaffRoles("owner", "analyst"),
  async (_req, res): Promise<void> => {
    const periodDays = 7;
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
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
      .select({
        eventName: analyticsEventsTable.eventName,
        value: count(),
      })
      .from(analyticsEventsTable)
      .where(and(gte(analyticsEventsTable.occurredAt, since), inArray(analyticsEventsTable.eventName, eventNames)))
      .groupBy(analyticsEventsTable.eventName);
    const values = new Map(counts.map((row) => [row.eventName, Number(row.value)]));

    res.json(
      GetStaffFunnelResponse.parse({
        periodDays,
        events: eventNames.map((eventName) => ({
          eventName,
          count: values.get(eventName) ?? 0,
        })),
      }),
    );
  },
);

router.get("/staff/orders", requireStaffRoles("owner", "operations"), async (_req, res): Promise<void> => {
  const orders = await db
    .select({
      id: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      customerName: ordersTable.customerName,
      customerEmail: ordersTable.customerEmail,
      total: ordersTable.total,
      currency: ordersTable.currency,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .orderBy(desc(ordersTable.createdAt))
    .limit(50);

  res.json(ListStaffOrdersResponse.parse(orders));
});

router.get("/staff/enquiries", requireStaffRoles("owner", "operations", "stylist"), async (_req, res): Promise<void> => {
  const enquiries = await db
    .select()
    .from(customerEnquiriesTable)
    .orderBy(desc(customerEnquiriesTable.createdAt))
    .limit(50);

  res.json(ListStaffEnquiriesResponse.parse(enquiries));
});

export default router;