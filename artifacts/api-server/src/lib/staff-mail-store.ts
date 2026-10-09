import { createHash, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import type { PoolClient as MailConnection } from "pg";
import { MailError, type MailSettings, sealPassword } from "./staff-mail-security";

export const MAIL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS soso_mail_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK (id), settings jsonb NOT NULL,
 password_ciphertext text NOT NULL, version integer NOT NULL DEFAULT 1,
 tested_version integer, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS soso_newsletter_subscribers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','unsubscribed')),
 policy_version text NOT NULL DEFAULT 'newsletter-v1', consented_at timestamptz NOT NULL DEFAULT now(),
 confirmed_at timestamptz, unsubscribed_at timestamptz, last_confirmation_at timestamptz
);
CREATE TABLE IF NOT EXISTS soso_newsletter_links (
 token_hash text PRIMARY KEY, subscriber_id uuid NOT NULL REFERENCES soso_newsletter_subscribers(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('confirm','unsubscribe')), expires_at timestamptz
);
CREATE TABLE IF NOT EXISTS soso_mail_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject text NOT NULL, body_text text NOT NULL,
 created_by uuid NOT NULL REFERENCES soso_staff_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS soso_mail_sends (
 id uuid PRIMARY KEY, recipient text NOT NULL, subject text NOT NULL, kind text NOT NULL,
 status text NOT NULL DEFAULT 'sending' CHECK(status IN ('sending','accepted','uncertain')), body_hash text NOT NULL,
 created_by uuid REFERENCES soso_staff_users(id), campaign_id uuid REFERENCES soso_mail_campaigns(id),
 subscriber_id uuid REFERENCES soso_newsletter_subscribers(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(campaign_id,subscriber_id)
);
CREATE INDEX IF NOT EXISTS soso_mail_sends_hour_idx ON soso_mail_sends(created_at);
CREATE TABLE IF NOT EXISTS soso_mail_rate_limits (
 key text PRIMARY KEY, count integer NOT NULL, reset_at timestamptz NOT NULL
);
`;
let initialization: Promise<void> | undefined;
export async function ensureMailSchema() {
  if (!initialization) initialization = pool.query(MAIL_SCHEMA_SQL).then(() => undefined).catch((error) => { initialization = undefined; throw error; });
  return initialization;
}
export type StoredMail = { settings: MailSettings; password_ciphertext: string; version: number; tested_version: number | null };
export async function storedMail(): Promise<StoredMail | undefined> {
  await ensureMailSchema();
  return (await pool.query("SELECT settings,password_ciphertext,version,tested_version FROM soso_mail_settings WHERE id=true")).rows[0];
}
export async function freshMailPermission(staffId: string, ownerOnly = false, connection: MailConnection | typeof pool = pool) {
  const result = await connection.query(`SELECT role FROM soso_staff_users WHERE id=$1 AND is_active=true${connection === pool ? "" : " FOR UPDATE"}`, [staffId]);
  if (!result.rows[0] || !(ownerOnly ? ["owner"] : ["owner", "administrator"]).includes(result.rows[0].role)) {
    throw new MailError("Your Staff access has changed or does not permit email access.", 403);
  }
}
export async function mailTransaction<T>(run: (connection: MailConnection) => Promise<T>) {
  const connection = await pool.connect();
  try { await connection.query("BEGIN"); const value = await run(connection); await connection.query("COMMIT"); return value; }
  catch (error) { await connection.query("ROLLBACK"); throw error; }
  finally { connection.release(); }
}
export async function saveMailSettings(staffId: string, input: MailSettings & { password?: string; expectedVersion: number }) {
  await ensureMailSchema();
  return mailTransaction(async (connection) => {
    await connection.query("SELECT pg_advisory_xact_lock(hashtext('soso-mail-settings'))");
    await freshMailPermission(staffId, true, connection);
    const current = (await connection.query("SELECT * FROM soso_mail_settings WHERE id=true FOR UPDATE")).rows[0] as StoredMail | undefined;
    if ((current?.version ?? 0) !== input.expectedVersion) throw new MailError("Mail settings changed. Reload before saving.", 409);
    if (!current && !input.password) throw new MailError("Enter the mailbox password for the first setup.");
    if (current && current.settings.username !== input.username && !input.password) throw new MailError("Enter the password when changing the mailbox account.");
    if (input.newsletterEnabled && (!input.policyConfirmed || input.hourlyLimit < 1 || !input.enabled)) {
      throw new MailError("Newsletters require enabled mail, confirmed hosting permission and an hourly allowance.");
    }
    const { password, expectedVersion, ...settings } = input;
    const ciphertext = password ? sealPassword(password) : current!.password_ciphertext;
    await connection.query(`INSERT INTO soso_mail_settings(id,settings,password_ciphertext,version) VALUES(true,$1,$2,1)
      ON CONFLICT(id) DO UPDATE SET settings=$1,password_ciphertext=$2,version=soso_mail_settings.version+1,tested_version=NULL,updated_at=now()`, [settings, ciphertext]);
    await connection.query(`INSERT INTO soso_audit_logs(actor_clerk_user_id,action,entity_type,entity_id,metadata)
      SELECT clerk_user_id,'mail.settings_saved','mail_settings','primary',$2::jsonb FROM soso_staff_users WHERE id=$1`,
      [staffId, JSON.stringify({ passwordReplaced: Boolean(password), enabled: settings.enabled, newsletterEnabled: settings.newsletterEnabled })]);
    return { saved: true };
  });
}
export async function rateLimit(key: string, maximum: number, seconds: number) {
  await ensureMailSchema();
  const result = await pool.query(`INSERT INTO soso_mail_rate_limits(key,count,reset_at) VALUES($1,1,now()+($2*interval '1 second'))
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN soso_mail_rate_limits.reset_at<=now() THEN 1 ELSE soso_mail_rate_limits.count+1 END,
    reset_at=CASE WHEN soso_mail_rate_limits.reset_at<=now() THEN now()+($2*interval '1 second') ELSE soso_mail_rate_limits.reset_at END RETURNING count`, [key, seconds]);
  if (result.rows[0].count > maximum) throw new MailError("Too many requests. Please try again later.", 429);
}
export async function newsletterLink(subscriberId: string, purpose: "confirm" | "unsubscribe") {
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO soso_newsletter_links(token_hash,subscriber_id,purpose,expires_at) VALUES($1,$2,$3,CASE WHEN $3='confirm' THEN now()+interval '24 hours' ELSE NULL END)",
    [createHash("sha256").update(token).digest("hex"), subscriberId, purpose]);
  return token;
}
export async function useNewsletterLink(token: string, purpose: "confirm" | "unsubscribe") {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new MailError("This email link is invalid or expired.");
  return mailTransaction(async (connection) => {
    const hash = createHash("sha256").update(token).digest("hex");
    const lookup = await connection.query("SELECT subscriber_id FROM soso_newsletter_links WHERE token_hash=$1 AND purpose=$2", [hash, purpose]);
    if (!lookup.rows[0]) throw new MailError("This email link is invalid or expired.");
    // Consistent subscriber-before-token lock order also matches Staff opt-outs.
    await connection.query("SELECT id FROM soso_newsletter_subscribers WHERE id=$1 FOR UPDATE", [lookup.rows[0].subscriber_id]);
    const result = await connection.query(`SELECT subscriber_id FROM soso_newsletter_links WHERE token_hash=$1 AND purpose=$2
      AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE`, [hash, purpose]);
    if (!result.rows[0]) throw new MailError("This email link is invalid or expired.");
    const id = result.rows[0].subscriber_id;
    if (purpose === "confirm") {
      const updated = await connection.query("UPDATE soso_newsletter_subscribers SET status='confirmed',confirmed_at=now(),unsubscribed_at=NULL WHERE id=$1 AND status='pending' RETURNING id", [id]);
      if (!updated.rowCount) throw new MailError("This subscription is no longer pending. Request a new signup if you want to subscribe again.", 409);
      await connection.query("DELETE FROM soso_newsletter_links WHERE subscriber_id=$1 AND purpose='confirm'", [id]);
    } else {
      await connection.query("UPDATE soso_newsletter_subscribers SET status='unsubscribed',unsubscribed_at=now() WHERE id=$1", [id]);
      await connection.query("DELETE FROM soso_newsletter_links WHERE subscriber_id=$1 AND purpose='confirm'", [id]);
    }
    return { status: purpose === "confirm" ? "confirmed" : "unsubscribed" };
  });
}
