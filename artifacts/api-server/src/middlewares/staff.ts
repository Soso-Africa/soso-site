import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { db, staffSessionsTable, staffUsersTable, type StaffUser } from "@workspace/db";
import { and, eq, gt, isNull } from "drizzle-orm";

export const STAFF_SESSION_COOKIE = "soso_staff_session";

declare global {
  namespace Express {
    interface Request {
      staff?: StaffUser;
    }
  }
}

export async function requireStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.staff) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export async function loadStaffSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[STAFF_SESSION_COOKIE];
  if (typeof token !== "string" || token.length < 40) {
    next();
    return;
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [session] = await db.select({ staff: staffUsersTable }).from(staffSessionsTable)
    .innerJoin(staffUsersTable, eq(staffSessionsTable.staffUserId, staffUsersTable.id))
    .where(and(eq(staffSessionsTable.tokenHash, tokenHash), isNull(staffSessionsTable.revokedAt), gt(staffSessionsTable.expiresAt, new Date()), eq(staffUsersTable.isActive, true)))
    .limit(1);
  if (session) {
    req.staff = session.staff;
    void db.update(staffSessionsTable).set({ lastSeenAt: new Date() }).where(eq(staffSessionsTable.tokenHash, tokenHash));
  }
  next();
}

export function requireStaffRoles(...allowedRoles: StaffUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.staff) {
      res.status(500).json({ error: "Staff authorization context is unavailable" });
      return;
    }

    if (!allowedRoles.includes(req.staff.role)) {
      req.log.warn(
        { staffId: req.staff.id, role: req.staff.role, allowedRoles },
        "Denied staff mutation for insufficient role",
      );
      res.status(403).json({ error: "Your staff role does not have permission for this action" });
      return;
    }

    next();
  };
}