import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, RequestHandler } from "express";
import { pool } from "@workspace/db";
import { ShopperError } from "./justicesureCustomers";

export const SHOPPER_SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-soso_shopper_session" : "soso_shopper_session";
export const SHOPPER_ISSUER = "https://shopsoso.co/auth/shopper";
export const SHOPPER_SESSION_SECONDS = 14 * 24 * 60 * 60;
export type LocalShopper = { id: string; email: string; name: string; emailVerified: boolean };
declare global {
  namespace Express {
    interface Request { shopper?: LocalShopper; shopperSessionHash?: string }
  }
}
export function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
}
export const loadShopperSession: RequestHandler = async (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const token = req.cookies?.[SHOPPER_SESSION_COOKIE];
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) { next(); return; }
  try {
    const hashed = tokenHash(token);
    const result = await pool.query(
      `SELECT u.id,u.email,u.name,u.email_verified_at
       FROM soso_shopper_sessions s JOIN soso_shopper_users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at>now()`, [hashed],
    );
    const user = result.rows[0];
    if (user) {
      // Approximate activity, throttled to avoid a database write on every request.
      await pool.query(`UPDATE soso_shopper_sessions SET last_active_at=clock_timestamp()
        WHERE token_hash=$1 AND last_active_at<clock_timestamp()-interval '5 minutes'`, [hashed]);
      req.shopper = { id: user.id, email: user.email, name: user.name, emailVerified: Boolean(user.email_verified_at) };
      req.shopperSessionHash = hashed;
    } else res.clearCookie(SHOPPER_SESSION_COOKIE, cookieOptions());
    next();
  } catch (error) { next(error); }
};
export async function createShopperSession(req: Request, res: Response, userId: string, expectedPasswordHash: string): Promise<LocalShopper> {
  const token = randomBytes(32).toString("base64url");
  const connection = await pool.connect();
  let user: LocalShopper;
  try {
    await connection.query("BEGIN");
    // A reset racing a password check must not mint a session for the old password.
    const current = (await connection.query("SELECT * FROM soso_shopper_users WHERE id=$1 FOR UPDATE", [userId])).rows[0];
    if (!current || current.password_hash !== expectedPasswordHash) {
      throw new ShopperError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    user = { id: current.id, email: current.email, name: current.name, emailVerified: Boolean(current.email_verified_at) };
    if (req.shopperSessionHash) await connection.query("DELETE FROM soso_shopper_sessions WHERE token_hash=$1", [req.shopperSessionHash]);
    await connection.query(`DELETE FROM soso_shopper_sessions WHERE user_id=$1 AND
      (expires_at<=now() OR token_hash IN (SELECT token_hash FROM soso_shopper_sessions WHERE user_id=$1 ORDER BY created_at DESC OFFSET 9))`, [userId]);
    await connection.query(`INSERT INTO soso_shopper_sessions(token_hash,user_id,expires_at,device_label)
      VALUES($1,$2,clock_timestamp()+($3*interval '1 second'),$4)`,
      [tokenHash(token), userId, SHOPPER_SESSION_SECONDS, shopperDeviceLabel(req.get?.("user-agent") ?? "")]);
    await connection.query("COMMIT");
  } catch (error) { await connection.query("ROLLBACK"); throw error; }
  finally { connection.release(); }
  res.cookie(SHOPPER_SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SHOPPER_SESSION_SECONDS * 1000 });
  return user!;
}
/** Coarse, untrusted hints only; never persist raw UA, IP or precise location. */
export function shopperDeviceLabel(ua: string) {
  ua = ua.slice(0, 512);
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox|FxiOS/.test(ua) ? "Firefox"
    : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Unknown browser";
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "unknown device";
  return `${browser} / ${device}`;
}
export async function deleteCurrentShopperSession(req: Request) {
  if (!req.shopper || !req.shopperSessionHash) return;
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SELECT id FROM soso_shopper_users WHERE id=$1 FOR UPDATE", [req.shopper.id]);
    await connection.query("DELETE FROM soso_shopper_sessions WHERE user_id=$1 AND token_hash=$2", [req.shopper.id, req.shopperSessionHash]);
    await connection.query("COMMIT");
  } catch (error) { await connection.query("ROLLBACK"); throw error; }
  finally { connection.release(); }
}
/** Must run on every shopper/auth/payment write, including anonymous login. */
export const requireShopperSameOrigin: RequestHandler = (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) { next(); return; }
  const host = (req.get("x-forwarded-host") ?? req.get("host"))?.split(",")[0]?.trim();
  const protocol = (req.get("x-forwarded-proto") ?? req.protocol).split(",")[0]?.trim();
  const origin = req.get("origin");
  if (!host || origin !== `${protocol}://${host}`) {
    res.status(403).json({ error: "Same-origin proof is required.", code: "ORIGIN_REQUIRED" });
    return;
  }
  next();
};
