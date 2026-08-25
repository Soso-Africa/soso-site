import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Router, type IRouter, type Response } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { auditLogsTable, db, staffSessionsTable, staffUsersTable } from "@workspace/db";
import { STAFF_SESSION_COOKIE } from "../middlewares/staff";

const router: IRouter = Router();
const scrypt = promisify(scryptCallback);
const SESSION_MS = 1000 * 60 * 60 * 8;
const passwordPattern = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}/;

function normalizedEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && passwordPattern.test(value);
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}

async function passwordMatches(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [algorithm, salt, hash] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const derived = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MS,
    path: "/",
  });
}

async function createSession(staffUserId: string, res: Response): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(staffSessionsTable).values({
    staffUserId,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + SESSION_MS),
  });
  setSessionCookie(res, token);
}

router.post("/staff-auth/login", async (req, res): Promise<void> => {
  const email = normalizedEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || typeof password !== "string") {
    res.status(400).json({ error: "Enter your email address and password." });
    return;
  }
  const [staff] = await db.select().from(staffUsersTable).where(eq(staffUsersTable.email, email)).limit(1);
  if (!staff || !staff.isActive || !(await passwordMatches(password, staff.passwordHash))) {
    res.status(401).json({ error: "The email address or password is incorrect." });
    return;
  }
  await createSession(staff.id, res);
  await db.insert(auditLogsTable).values({ actorClerkUserId: staff.id, action: "staff_auth.signed_in", entityType: "staff_user", entityId: staff.id });
  res.json({ id: staff.id, email: staff.email, role: staff.role });
});

router.post("/staff-auth/logout", async (req, res): Promise<void> => {
  const token = req.cookies?.[STAFF_SESSION_COOKIE];
  if (typeof token === "string") {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await db.update(staffSessionsTable).set({ revokedAt: new Date() }).where(eq(staffSessionsTable.tokenHash, tokenHash));
  }
  res.clearCookie(STAFF_SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.status(204).end();
});

router.get("/staff-auth/status", (req, res): void => {
  if (!req.staff) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json({ id: req.staff.id, email: req.staff.email, role: req.staff.role });
});

router.post("/staff-auth/bootstrap", async (req, res): Promise<void> => {
  const bootstrapToken = process.env.STAFF_BOOTSTRAP_TOKEN;
  const email = normalizedEmail(req.body?.email);
  const password = req.body?.password;
  if (!bootstrapToken) {
    res.status(503).json({ error: "Initial owner setup has not been configured." });
    return;
  }
  const suppliedToken = typeof req.body?.token === "string" ? req.body.token : "";
  const tokenMatches = suppliedToken.length === bootstrapToken.length && timingSafeEqual(Buffer.from(suppliedToken), Buffer.from(bootstrapToken));
  if (!tokenMatches || !validPassword(password)) {
    res.status(400).json({ error: "Provide the setup token and a password with 12+ characters, uppercase, lowercase, and a number." });
    return;
  }
  // Bootstrap eligibility is scoped to the owner identified by the request. A
  // passwordless record for another staff member must not affect this owner's
  // result (or make a repeat bootstrap look like an ineligible email).
  const [owner] = await db.select().from(staffUsersTable).where(and(eq(staffUsersTable.email, email), eq(staffUsersTable.role, "owner"), eq(staffUsersTable.isActive, true))).limit(1);
  if (!owner) {
    res.status(403).json({ error: "This email address is not eligible for initial owner setup." });
    return;
  }
  if (owner.passwordHash) {
    res.status(409).json({ error: "Initial owner setup is no longer available." });
    return;
  }
  const passwordHash = await hashPassword(password);
  const [bootstrappedOwner] = await db.update(staffUsersTable)
    .set({ passwordHash, passwordChangedAt: new Date() })
    .where(and(eq(staffUsersTable.id, owner.id), eq(staffUsersTable.role, "owner"), eq(staffUsersTable.isActive, true), isNull(staffUsersTable.passwordHash)))
    .returning();
  if (!bootstrappedOwner) {
    res.status(409).json({ error: "Initial owner setup is no longer available." });
    return;
  }
  await createSession(bootstrappedOwner.id, res);
  await db.insert(auditLogsTable).values({ actorClerkUserId: bootstrappedOwner.id, action: "staff_auth.bootstrap_completed", entityType: "staff_user", entityId: bootstrappedOwner.id });
  res.status(201).json({ id: bootstrappedOwner.id, email: bootstrappedOwner.email, role: bootstrappedOwner.role });
});

export async function setManagedStaffPassword(staffUserId: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db.update(staffUsersTable).set({ passwordHash, passwordChangedAt: new Date() }).where(eq(staffUsersTable.id, staffUserId));
  await db.update(staffSessionsTable).set({ revokedAt: new Date() }).where(and(eq(staffSessionsTable.staffUserId, staffUserId), isNull(staffSessionsTable.revokedAt), gt(staffSessionsTable.expiresAt, new Date())));
}

export function newManagedStaffIdentity(): string {
  return `staff_${randomUUID()}`;
}

export default router;