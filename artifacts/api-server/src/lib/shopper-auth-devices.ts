import type { Request } from "express";
import { pool } from "@workspace/db";
import { ShopperError } from "./justicesureCustomers";
import { checkShopperPassword } from "./shopper-auth-passwords";

export type SessionAction = { id: string } | { scope: "others" | "all"; password: string };

/** All session operations share the user-first lock with login and password recovery. */
export async function shopperDevices(req: Request, action?: SessionAction) {
  if (!req.shopper || !req.shopperSessionHash) throw signInRequired();
  // Expensive credential work runs outside the lock, then its version is checked inside.
  let checkedHash: string | undefined;
  if (action && "scope" in action) {
    const user = (await pool.query("SELECT password_hash FROM soso_shopper_users WHERE id=$1", [req.shopper.id])).rows[0];
    if (!user || !await checkShopperPassword(action.password, user.password_hash)) {
      throw new ShopperError(403, "PASSWORD_REQUIRED", "Your password was not confirmed. Nothing has been signed out.");
    }
    checkedHash = user.password_hash;
  }
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const user = (await connection.query("SELECT password_hash FROM soso_shopper_users WHERE id=$1 FOR UPDATE", [req.shopper.id])).rows[0];
    const current = await connection.query(`SELECT id FROM soso_shopper_sessions
      WHERE user_id=$1 AND token_hash=$2 AND expires_at>clock_timestamp()`, [req.shopper.id, req.shopperSessionHash]);
    if (!user || !current.rowCount) throw signInRequired();
    if (checkedHash && user.password_hash !== checkedHash) {
      throw new ShopperError(403, "PASSWORD_REQUIRED", "Your credentials changed. Confirm your current password again.");
    }
    if (action && "id" in action) {
      // Current-device logout uses the existing logout path; unknown IDs reveal no ownership.
      const deleted = await connection.query(`DELETE FROM soso_shopper_sessions
        WHERE user_id=$1 AND id=$2 AND token_hash<>$3 AND expires_at>clock_timestamp()`,
      [req.shopper.id, action.id, req.shopperSessionHash]);
      if (!deleted.rowCount) throw new ShopperError(404, "SESSION_NOT_FOUND", "That other session is no longer active. Refresh the list.");
    } else if (action) {
      await connection.query(`DELETE FROM soso_shopper_sessions WHERE user_id=$1
        AND ($3::boolean OR token_hash<>$2)`, [req.shopper.id, req.shopperSessionHash, action.scope === "all"]);
    }
    const rows = (await connection.query(`SELECT id,device_label,created_at,last_active_at,expires_at,
      token_hash=$2 AS current FROM soso_shopper_sessions
      WHERE user_id=$1 AND expires_at>clock_timestamp() ORDER BY created_at DESC LIMIT 10`,
    [req.shopper.id, req.shopperSessionHash])).rows;
    await connection.query("COMMIT");
    return { sessions: rows.map((row) => ({
      id: row.id, deviceLabel: row.device_label, createdAt: row.created_at.toISOString(),
      lastActiveAt: row.last_active_at.toISOString(), expiresAt: row.expires_at.toISOString(), current: row.current,
    })) };
  } catch (error) { await connection.query("ROLLBACK"); throw error; }
  finally { connection.release(); }
}
function signInRequired() {
  return new ShopperError(401, "SIGN_IN_REQUIRED", "Your shopper session ended. Sign in again.");
}
