import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import type { Request } from "express";
import { STAFF_SESSION_COOKIE } from "../middlewares/staff";
import { CatalogueDriveError, driveRead, type DriveProxy } from "./catalogue-import-drive";

// Folder contents require drive.readonly: drive.file does not grant descendants.
// Never request write access, offline access, or reuse workspace connector tokens.
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const DRIVE_CALLBACK_PATH = "/api/staff/catalogue-import/google/callback";
const allowedRoles = ["owner", "administrator", "editor"];
const folderMime = "application/vnd.google-apps.folder";
const idPattern = /^[A-Za-z0-9_-]{10,160}$/;
export const DRIVE_OAUTH_SCHEMA = `
CREATE TABLE IF NOT EXISTS soso_catalogue_drive_sessions (
 session_hash text PRIMARY KEY, staff_id uuid NOT NULL REFERENCES soso_staff_users(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL DEFAULT gen_random_uuid(),
 state_hash text, verifier_ciphertext text, state_expires_at timestamptz,
 token_ciphertext text, token_expires_at timestamptz, folders text[] NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS soso_catalogue_drive_state_idx ON soso_catalogue_drive_sessions(state_hash);
`;
let initialization: Promise<void> | undefined;
async function ensureSchema() {
  if (!initialization) initialization = pool.query(DRIVE_OAUTH_SCHEMA).then(() => undefined).catch((error) => { initialization = undefined; throw error; });
  await initialization;
  // Expired grants never become long-lived credential storage.
  await pool.query(`DELETE FROM soso_catalogue_drive_sessions
    WHERE COALESCE(token_expires_at, state_expires_at, '-infinity'::timestamptz) < now()`);
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function revokeGoogleToken(token: string) {
  try {
    const response = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", body: new URLSearchParams({ token }), redirect: "error", signal: AbortSignal.timeout(10_000) });
    await response.body?.cancel();
    return response.ok;
  } catch { return false; }
}
export function driveConfig() {
  const { GOOGLE_DRIVE_CLIENT_ID: clientId, GOOGLE_DRIVE_CLIENT_SECRET: clientSecret, GOOGLE_DRIVE_REDIRECT_URI: redirectUri, SESSION_SECRET: secret } = process.env;
  if (!clientId || !clientSecret || !redirectUri || !secret || secret.length < 32) {
    throw new CatalogueDriveError("Direct Drive is not configured on this host. Use local photo folders; an owner can configure the separate Google OAuth app.", 503);
  }
  let uri: URL;
  try { uri = new URL(redirectUri); } catch { throw new CatalogueDriveError("The Drive callback configuration is invalid.", 503); }
  if (uri.protocol !== "https:" || uri.pathname !== DRIVE_CALLBACK_PATH || uri.search || uri.hash || uri.username || uri.password) {
    throw new CatalogueDriveError("Configure an exact HTTPS Drive callback URL on the Staff host.", 503);
  }
  return { clientId, clientSecret, redirectUri, origin: uri.origin, secret };
}
export function sealDriveSecret(value: string, binding: string, secret = driveConfig().secret) {
  const key = createHash("sha256").update(`soso-catalogue-drive-v1\0${secret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(binding));
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map((part) => part.toString("base64url")).join(".");
}
export function openDriveSecret(value: string, binding: string, secret = driveConfig().secret) {
  try {
    const [iv, tag, bytes] = value.split(".").map((part) => Buffer.from(part, "base64url"));
    const key = createHash("sha256").update(`soso-catalogue-drive-v1\0${secret}`).digest();
    const decipher = createDecipheriv("aes-256-gcm", key, iv!);
    decipher.setAAD(Buffer.from(binding)); decipher.setAuthTag(tag!);
    return Buffer.concat([decipher.update(bytes!), decipher.final()]).toString("utf8");
  } catch { throw new CatalogueDriveError("Drive credentials cannot be unlocked. Disconnect and reconnect; the server encryption key may have changed.", 409); }
}
function sessionHash(req: Request) {
  const token = req.cookies?.[STAFF_SESSION_COOKIE];
  if (!req.staff || typeof token !== "string" || token.length < 40) throw new CatalogueDriveError("Sign in to Staff again.", 401);
  return hash(token);
}
export function workspaceDriveAvailable() {
  // A hosted deployment must never silently borrow workspace authority.
  return !process.env.VERCEL && process.env.NODE_ENV !== "production" && Boolean(process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL);
}
export async function driveConnectionStatus(req: Request) {
  let configured = true;
  try { driveConfig(); } catch { configured = false; }
  if (!configured) return { configured: false, connected: false, workspace: workspaceDriveAvailable() && !process.env.GOOGLE_DRIVE_CLIENT_ID, folders: [] as string[] };
  await ensureSchema();
  const { rows } = await pool.query(`SELECT token_expires_at, folders FROM soso_catalogue_drive_sessions
    WHERE session_hash=$1 AND staff_id=$2 AND token_ciphertext IS NOT NULL AND token_expires_at > now()`, [sessionHash(req), req.staff!.id]);
  return { configured: true, connected: Boolean(rows[0]), workspace: false, folders: (rows[0]?.folders ?? []) as string[], ...(rows[0] ? { expiresAt: new Date(rows[0].token_expires_at).toISOString() } : {}) };
}
export async function beginDriveAuthorization(req: Request) {
  const config = driveConfig();
  if (req.get("origin") !== config.origin) throw new CatalogueDriveError("Open Staff on the configured Drive host to connect.", 403);
  await ensureSchema();
  const key = sessionHash(req), state = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
  // Reconnecting invalidates old grants and previously selected folders.
  await pool.query(`INSERT INTO soso_catalogue_drive_sessions(session_hash,staff_id,state_hash,verifier_ciphertext,state_expires_at)
    VALUES($1,$2,$3,$4,now()+interval '10 minutes') ON CONFLICT(session_hash) DO UPDATE SET
    staff_id=$2,connection_id=gen_random_uuid(),state_hash=$3,verifier_ciphertext=$4,state_expires_at=now()+interval '10 minutes',
    token_ciphertext=NULL,token_expires_at=NULL,folders='{}'`, [key, req.staff!.id, hash(state), sealDriveSecret(verifier, `${key}:pkce`)]);
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code",
    scope: DRIVE_SCOPE, state, code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256", access_type: "online", prompt: "consent select_account", include_granted_scopes: "false" });
  return { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
}
export async function completeDriveAuthorization(req: Request) {
  const config = driveConfig(), key = sessionHash(req);
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new CatalogueDriveError("Drive authorization expired or belongs to a different Staff session. Connect again.", 400);
  await ensureSchema();
  // Consume before exchange, including denied callbacks. No callback replay or cross-session linking.
  const { rows } = await pool.query(`WITH pending AS (
    SELECT session_hash,verifier_ciphertext,connection_id FROM soso_catalogue_drive_sessions
    WHERE session_hash=$1 AND staff_id=$2 AND state_hash=$3 AND state_expires_at>now() FOR UPDATE
  ) UPDATE soso_catalogue_drive_sessions d SET state_hash=NULL,verifier_ciphertext=NULL
    FROM pending p WHERE d.session_hash=p.session_hash RETURNING p.verifier_ciphertext AS verifier,p.connection_id`,
  [key, req.staff!.id, hash(state)]);
  if (!rows[0]?.verifier) throw new CatalogueDriveError("Drive authorization expired or was already used. Connect again.", 400);
  if (req.query.error) throw new CatalogueDriveError("Google authorization was cancelled. Connect again or use local folders.", 400);
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code || code.length > 4096) throw new CatalogueDriveError("Google did not return an authorization code. Connect again.", 400);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri,
      grant_type: "authorization_code", code, code_verifier: openDriveSecret(rows[0].verifier, `${key}:pkce`) }) });
  if (!response.ok) { await response.body?.cancel(); throw new CatalogueDriveError("Google could not complete authorization. Connect again.", 409); }
  const token = await response.json() as { access_token?: string; expires_in?: number; scope?: string; token_type?: string };
  if (!token.access_token || token.token_type?.toLowerCase() !== "bearer" || !Number.isFinite(token.expires_in) || token.expires_in! <= 60
    || token.scope?.split(" ").length !== 1 || token.scope !== DRIVE_SCOPE) {
    if (typeof token.access_token === "string") await revokeGoogleToken(token.access_token);
    throw new CatalogueDriveError("Google did not grant exactly read-only Drive access. Remove the app in Google Account permissions and reconnect.", 403);
  }
  // Revalidate session/role at commit; a disconnect while exchanging must not resurrect access.
  try {
    const saved = await pool.query(`UPDATE soso_catalogue_drive_sessions d SET token_ciphertext=$3,
    token_expires_at=now()+($4 * interval '1 second'),folders='{}'
    WHERE d.session_hash=$1 AND d.staff_id=$2 AND d.token_ciphertext IS NULL
    AND d.state_hash IS NULL AND d.connection_id=$6 AND EXISTS (SELECT 1 FROM soso_staff_sessions s JOIN soso_staff_users u ON u.id=s.staff_user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.id=$2 AND u.is_active=true AND u.role::text=ANY($5::text[]))`,
  [key, req.staff!.id, sealDriveSecret(token.access_token, `${key}:token`), Math.min(token.expires_in! - 30, 3600), allowedRoles, rows[0].connection_id]);
    if (!saved.rowCount) throw new CatalogueDriveError("Staff authorization changed. Sign in and connect again.", 409);
  } catch (error) {
    // Disconnect/reconnect or role revocation during exchange must not leave a
    // newly issued token usable locally or silently abandon Google's grant.
    await revokeGoogleToken(token.access_token);
    throw error;
  }
}
async function hostedRead(req: Request): Promise<DriveProxy> {
  driveConfig();
  await ensureSchema();
  const key = sessionHash(req);
  const { rows } = await pool.query(`SELECT token_ciphertext FROM soso_catalogue_drive_sessions WHERE session_hash=$1
    AND staff_id=$2 AND token_expires_at>now()`, [key, req.staff!.id]);
  if (!rows[0]?.token_ciphertext) throw new CatalogueDriveError("Connect Google Drive again; the connection may have expired. Local folders remain available.", 409);
  const token = openDriveSecret(rows[0].token_ciphertext, `${key}:token`);
  return async (path) => {
    if (!path.startsWith("/drive/v3/files")) throw new CatalogueDriveError("Unsupported Drive read.", 400);
    let response: Response;
    try {
      response = await fetch(`https://www.googleapis.com${path}`, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(25_000) });
    } catch { throw new CatalogueDriveError("Drive request timed out or failed. Retry, reconnect, or use local folders.", 504); }
    if (response.status === 401) {
      await response.body?.cancel();
      await pool.query("DELETE FROM soso_catalogue_drive_sessions WHERE session_hash=$1 AND token_ciphertext=$2", [key, rows[0].token_ciphertext]);
      throw new CatalogueDriveError("Google access expired or was revoked. Reconnect Drive or use local folders.", 409);
    }
    return response;
  };
}
export async function importDriveRead(req: Request, folderId: string): Promise<DriveProxy> {
  if (workspaceDriveAvailable() && !process.env.GOOGLE_DRIVE_CLIENT_ID) return driveRead;
  // A missing host setup is not a Staff folder-selection mistake.
  driveConfig();
  await ensureSchema();
  const { rows } = await pool.query(`SELECT 1 FROM soso_catalogue_drive_sessions WHERE session_hash=$1 AND staff_id=$2
    AND token_expires_at>now() AND $3=ANY(folders)`, [sessionHash(req), req.staff!.id, folderId]);
  if (!rows.length) throw new CatalogueDriveError("Connect Drive and select this spreadsheet folder in the Drive picker before scanning it.", 409);
  return hostedRead(req);
}
export async function listDriveFolders(req: Request, search: string) {
  if (search.length > 100) throw new CatalogueDriveError("Folder search must be 100 characters or fewer.", 400);
  const proxy = await hostedRead(req);
  const escaped = search.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const params = new URLSearchParams({ q: `trashed=false and mimeType='${folderMime}'${search ? ` and name contains '${escaped}'` : ""}`,
    fields: "files(id,name),nextPageToken,incompleteSearch", pageSize: "50", orderBy: "name_natural", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
  const response = await proxy(`/drive/v3/files?${params}`);
  if (!response.ok) { await response.body?.cancel(); throw new CatalogueDriveError("Google could not list folders. Check permissions, reconnect, or use local folders.", response.status === 429 ? 429 : 502); }
  const data = await response.json() as { files?: { id: string; name: string }[]; nextPageToken?: string; incompleteSearch?: boolean };
  return { folders: data.files ?? [], more: Boolean(data.nextPageToken || data.incompleteSearch) };
}
export async function selectDriveFolder(req: Request, folderId: string) {
  if (!idPattern.test(folderId)) throw new CatalogueDriveError("Invalid Drive folder ID.", 400);
  const proxy = await hostedRead(req);
  const response = await proxy(`/drive/v3/files/${folderId}?supportsAllDrives=true&fields=id,name,mimeType,trashed`);
  if (!response.ok) { await response.body?.cancel(); throw new CatalogueDriveError("Folder is missing or this Google account cannot read it.", 403); }
  const folder = await response.json() as { id: string; name: string; mimeType: string; trashed?: boolean };
  if (folder.trashed || folder.mimeType !== folderMime || folder.id !== folderId) throw new CatalogueDriveError("Choose an accessible, non-trashed folder, not a shortcut or file.", 400);
  const result = await pool.query(`UPDATE soso_catalogue_drive_sessions SET folders=array_append(array_remove(folders,$3),$3)
    WHERE session_hash=$1 AND staff_id=$2 AND token_expires_at>now() AND cardinality(folders)<200`,
  [sessionHash(req), req.staff!.id, folderId]);
  if (!result.rowCount) throw new CatalogueDriveError("Connection expired or the 200-folder session limit was reached. Reconnect Drive.", 409);
  return { id: folder.id, name: folder.name };
}
export async function disconnectDrive(req: Request) {
  await ensureSchema();
  const key = sessionHash(req);
  const { rows } = await pool.query("DELETE FROM soso_catalogue_drive_sessions WHERE session_hash=$1 AND staff_id=$2 RETURNING token_ciphertext", [key, req.staff!.id]);
  if (!rows[0]?.token_ciphertext) return { disconnected: true, revoked: true };
  try {
    const token = openDriveSecret(rows[0].token_ciphertext, `${key}:token`);
    return { disconnected: true, revoked: await revokeGoogleToken(token) };
  } catch { return { disconnected: true, revoked: false }; }
}
