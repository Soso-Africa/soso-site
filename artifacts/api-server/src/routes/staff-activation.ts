import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { auditLogsTable, db, siteContentTable, staffUsersTable } from "@workspace/db";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { COMMERCE_ACTIVATION_KEY, inspectCommerceActivation } from "../lib/commerce-activation";

const router: IRouter = Router();
const viewers = requireStaffRoles("owner", "administrator", "editor");
const mutators = requireStaffRoles("owner", "administrator");

router.use("/staff", requireStaff);

router.get("/staff/commerce/activation", viewers, async (_req, res): Promise<void> => {
  res.json(await inspectCommerceActivation());
});

router.put("/staff/commerce/activation", mutators, async (req, res): Promise<void> => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).sort().join(",") !== "enabled,expectedUpdatedAt"
    || typeof body.enabled !== "boolean"
    || !(body.expectedUpdatedAt === null
      || (typeof body.expectedUpdatedAt === "string" && Number.isFinite(Date.parse(body.expectedUpdatedAt))))) {
    res.status(400).json({ error: "Provide only enabled (boolean) and expectedUpdatedAt (ISO timestamp or null)." });
    return;
  }

  const readiness = body.enabled ? await inspectCommerceActivation() : null;
  if (readiness && !readiness.canActivate) {
    res.status(409).json({ error: "Checkout cannot be activated until readiness blockers are resolved.", ...readiness });
    return;
  }

  try {
    const updatedAt = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('soso-commerce-activation'))`);
      const [activeStaff] = await tx.select().from(staffUsersTable)
        .where(and(
          eq(staffUsersTable.clerkUserId, req.staff!.clerkUserId),
          eq(staffUsersTable.isActive, true),
        )).limit(1).for("update");
      if (!activeStaff || (activeStaff.role !== "owner" && activeStaff.role !== "administrator")) {
        throw new Error("STAFF_PERMISSION_CHANGED");
      }

      const [current] = await tx.select().from(siteContentTable)
        .where(eq(siteContentTable.key, COMMERCE_ACTIVATION_KEY)).limit(1).for("update");
      const currentTimestamp = current?.draftUpdatedAt.toISOString() ?? null;
      if (body.expectedUpdatedAt !== currentTimestamp) throw new Error("ACTIVATION_CONFLICT");

      const now = new Date();
      const document = { enabled: body.enabled };
      await tx.insert(siteContentTable).values({
        key: COMMERCE_ACTIVATION_KEY,
        draft: document,
        updatedByClerkUserId: activeStaff.clerkUserId,
        draftUpdatedAt: now,
      }).onConflictDoUpdate({
        target: siteContentTable.key,
        set: {
          draft: document,
          updatedByClerkUserId: activeStaff.clerkUserId,
          draftUpdatedAt: now,
        },
      });
      await tx.insert(auditLogsTable).values({
        actorClerkUserId: activeStaff.clerkUserId,
        action: body.enabled ? "commerce.checkout_activated" : "commerce.checkout_deactivated",
        entityType: "commerce_activation",
        entityId: COMMERCE_ACTIVATION_KEY,
        metadata: { enabled: body.enabled, previousUpdatedAt: currentTimestamp },
      });
      return now.toISOString();
    });
    res.json({ ...(await inspectCommerceActivation()), updatedAt });
  } catch (error) {
    if (error instanceof Error && error.message === "STAFF_PERMISSION_CHANGED") {
      res.status(403).json({ error: "Only an active owner or administrator may change checkout activation." });
      return;
    }
    if (error instanceof Error && error.message === "ACTIVATION_CONFLICT") {
      res.status(409).json({ error: "Checkout activation changed since it was loaded. Refresh and try again.", ...(await inspectCommerceActivation()) });
      return;
    }
    throw error;
  }
});

export default router;