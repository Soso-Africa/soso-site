import { randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { ShopperError } from "./justicesureCustomers";
import { tokenHash } from "./shopper-auth-session";
import { checkShopperPassword } from "./shopper-auth-passwords";

export type AuthUserRow = { id: string; email: string; name: string; password_hash: string; email_verified_at: Date | null };
export type AuthTokenPurpose = "verify_email" | "reset_password";
export async function authRateLimit(key: string, limit: number, seconds: number) {
  const result = await pool.query(
    `INSERT INTO soso_shopper_auth_limits(key,hits,expires_at) VALUES($1,1,now()+($2*interval '1 second'))
     ON CONFLICT(key) DO UPDATE SET
       hits=CASE WHEN soso_shopper_auth_limits.expires_at<=now() THEN 1 ELSE soso_shopper_auth_limits.hits+1 END,
       expires_at=CASE WHEN soso_shopper_auth_limits.expires_at<=now() THEN excluded.expires_at ELSE soso_shopper_auth_limits.expires_at END
     RETURNING hits`, [tokenHash(key), seconds],
  );
  if (result.rows[0].hits > limit) throw new ShopperError(429, "AUTH_RATE_LIMIT", "Too many attempts. Wait a while before trying again.");
  // Bounded housekeeping, independent of the caller's identity.
  await pool.query(`DELETE FROM soso_shopper_auth_limits WHERE key IN
    (SELECT key FROM soso_shopper_auth_limits WHERE expires_at<now()-interval '1 day' LIMIT 100)`);
}
export async function issueAuthToken(user: AuthUserRow, purpose: AuthTokenPurpose): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO soso_shopper_auth_tokens(token_hash,user_id,purpose,password_version,expires_at)
     VALUES($1,$2,$3,$4,now()+($5*interval '1 minute'))`,
    [tokenHash(token), user.id, purpose, tokenHash(user.password_hash), purpose === "verify_email" ? 60 : 30],
  );
  await pool.query(`DELETE FROM soso_shopper_auth_tokens WHERE token_hash IN
    (SELECT token_hash FROM soso_shopper_auth_tokens WHERE expires_at<now()-interval '1 day' LIMIT 100)`);
  return token;
}
export async function consumeAuthToken(token: string, purpose: AuthTokenPurpose, options: { newPasswordHash?: string; verificationPassword?: string } = {}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalidToken();
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const lookup = (await connection.query("SELECT user_id FROM soso_shopper_auth_tokens WHERE token_hash=$1", [tokenHash(token)])).rows[0];
    if (!lookup) throw invalidToken();
    // Always acquire the user lock first, matching session creation and concurrent resets.
    const user = (await connection.query("SELECT * FROM soso_shopper_users WHERE id=$1 FOR UPDATE", [lookup.user_id])).rows[0] as AuthUserRow | undefined;
    if (!user) throw invalidToken();
    const consumed = await connection.query(
      `UPDATE soso_shopper_auth_tokens SET consumed_at=now()
       WHERE token_hash=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>now() AND password_version=$3
       RETURNING user_id`, [tokenHash(token), purpose, tokenHash(user.password_hash)],
    );
    if (!consumed.rowCount) throw invalidToken();
    if (purpose === "verify_email" && (!options.verificationPassword || !await checkShopperPassword(options.verificationPassword, user.password_hash))) {
      // Email ownership alone must not activate credentials pre-registered by
      // someone else. Rollback keeps the valid token unused after a wrong password.
      throw new ShopperError(400, "AUTH_LINK_PASSWORD_MISMATCH", "This password does not match the signup. Use Forgot password to securely recover the account if needed.");
    }
    if (purpose === "verify_email") {
      await connection.query("UPDATE soso_shopper_users SET email_verified_at=coalesce(email_verified_at,now()) WHERE id=$1", [user.id]);
      await connection.query("UPDATE soso_shopper_auth_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose='verify_email' AND consumed_at IS NULL", [user.id]);
    } else {
      if (!options.newPasswordHash) throw new Error("A password hash is required for recovery");
      await connection.query("UPDATE soso_shopper_users SET password_hash=$2,email_verified_at=coalesce(email_verified_at,now()) WHERE id=$1", [user.id, options.newPasswordHash]);
      await connection.query("DELETE FROM soso_shopper_sessions WHERE user_id=$1", [user.id]);
      await connection.query("UPDATE soso_shopper_auth_tokens SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL", [user.id]);
    }
    await connection.query("COMMIT");
  } catch (error) { await connection.query("ROLLBACK"); throw error; }
  finally { connection.release(); }
}
function invalidToken() {
  return new ShopperError(400, "AUTH_LINK_INVALID", "This link is invalid, expired or already used. Request a new email.");
}
