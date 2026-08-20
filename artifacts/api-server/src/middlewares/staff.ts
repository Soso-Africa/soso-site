import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { db, staffUsersTable, type StaffUser } from "@workspace/db";
import { and, eq } from "drizzle-orm";

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
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [staff] = await db
    .select()
    .from(staffUsersTable)
    .where(and(eq(staffUsersTable.clerkUserId, userId), eq(staffUsersTable.isActive, true)))
    .limit(1);

  if (!staff) {
    req.log.warn({ clerkUserId: userId }, "Denied staff route for unassigned user");
    res.status(403).json({ error: "Staff access has not been assigned to this account" });
    return;
  }

  req.staff = staff;
  next();
}