import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test, { after } from "node:test";
import type { Request } from "express";
import express from "express";
import { createServer } from "node:http";
import { pool } from "@workspace/db";
import {
  DRIVE_SCOPE, DRIVE_CALLBACK_PATH, beginDriveAuthorization, completeDriveAuthorization, disconnectDrive,
  driveConfig, driveConnectionStatus, importDriveRead, listDriveFolders, openDriveSecret,
  sealDriveSecret, selectDriveFolder, workspaceDriveAvailable,
} from "./catalogue-drive-oauth";
import { readDrivePhoto } from "./catalogue-import-drive";
import importRouter from "../routes/staff-catalogue-import";
import { requireSameOriginForWrites } from "../middlewares/sameOriginWrite";

// Real SQL in the isolated schema runner; Google is entirely synthetic.
process.env.GOOGLE_DRIVE_CLIENT_ID = "synthetic-drive-client";
process.env.GOOGLE_DRIVE_CLIENT_SECRET = "synthetic-drive-client-secret";
process.env.GOOGLE_DRIVE_REDIRECT_URI = `https://staff.example.test${DRIVE_CALLBACK_PATH}`;
process.env.SESSION_SECRET = "synthetic-drive-encryption-key-never-used-in-production";
process.env.VERCEL = "1";
const origin = "https://staff.example.test";
const folderId = "folder_identifier123", fileId = "photo_identifier1234";
const token = "synthetic-google-access-token";
const jpeg = Buffer.from([255, 216, 255, 224, 1, 2, 3, 4]);
const photo = { id: fileId, name: "real-photo.jpg", mimeType: "image/jpeg", size: String(jpeg.length), parents: [folderId] };
const staffId = randomUUID();
const cookie = randomUUID() + randomUUID();
const sessionHash = createHash("sha256").update(cookie).digest("hex");
const req = { staff: { id: staffId, role: "editor" }, cookies: { soso_staff_session: cookie }, query: {}, get: (name: string) => name === "origin" ? origin : undefined } as unknown as Request;
let scope = DRIVE_SCOPE, revokeFails = false, denyAccess = false, noFolder = false;
let beforeToken: (() => Promise<void>) | undefined;
let tokenCalls = 0, driveCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | globalThis.Request, init?: RequestInit) => {
  const url = String(input);
  if (url === "https://oauth2.googleapis.com/token") {
    tokenCalls++;
    const body = init!.body as URLSearchParams;
    assert.equal(body.get("client_id"), "synthetic-drive-client");
    assert.equal(body.get("redirect_uri"), origin + DRIVE_CALLBACK_PATH);
    assert.ok(body.get("code_verifier")!.length >= 43);
    await beforeToken?.();
    return Response.json({ access_token: token, scope, expires_in: 3600, token_type: "Bearer" });
  }
  if (url === "https://oauth2.googleapis.com/revoke") {
    assert.equal((init!.body as URLSearchParams).get("token"), token);
    return new Response("", { status: revokeFails ? 503 : 200 });
  }
  assert.ok(url.startsWith("https://www.googleapis.com/drive/v3/files"));
  assert.deepEqual(init!.headers, { Authorization: `Bearer ${token}` });
  assert.equal(init!.method, undefined); // GET-only; never forwards a caller's method/body.
  assert.equal(init!.redirect, "error");
  driveCalls++;
  if (denyAccess) return new Response("", { status: 401 });
  if (url.includes("alt=media")) return new Response(jpeg);
  if (url.includes(`/files/${fileId}?`)) return Response.json(photo);
  if (url.includes(`/files/${folderId}?`)) return Response.json({ id: folderId, name: "Product folder", mimeType: noFolder ? "application/vnd.google-apps.shortcut" : "application/vnd.google-apps.folder" });
  return Response.json({ files: [{ id: folderId, name: "Product folder" }], nextPageToken: "more" });
}) as typeof fetch;
after(async () => {
  globalThis.fetch = realFetch;
  await pool.end();
});
async function start() {
  const url = new URL((await beginDriveAuthorization(req)).authorizationUrl);
  req.query = { state: url.searchParams.get("state")!, code: "synthetic-code" };
  return url;
}
async function connect() { await start(); await completeDriveAuthorization(req); }

test("Drive OAuth uses exact HTTPS callback, read-only scope, PKCE and session-bound authenticated encryption", () => {
  assert.equal(workspaceDriveAvailable(), false, "Vercel must never use workspace authority");
  const encrypted = sealDriveSecret(token, "session:token");
  assert.ok(!encrypted.includes(token));
  assert.notEqual(encrypted, sealDriveSecret(token, "session:token"));
  assert.equal(openDriveSecret(encrypted, "session:token"), token);
  assert.throws(() => openDriveSecret(encrypted, "other:token"), /cannot be unlocked/);
  assert.throws(() => openDriveSecret(encrypted, "session:token", "different-key"), /cannot be unlocked/);
  process.env.GOOGLE_DRIVE_REDIRECT_URI = `http://staff.example.test${DRIVE_CALLBACK_PATH}`;
  assert.throws(() => driveConfig(), /HTTPS/);
  process.env.GOOGLE_DRIVE_REDIRECT_URI = origin + DRIVE_CALLBACK_PATH;
});

test("complete Drive lifecycle: single-use OAuth, folder grants, bounded photos, recovery and disconnect", async () => {
  await pool.query(`INSERT INTO soso_staff_users(id,clerk_user_id,email,role) VALUES($1,$2,$3,'editor')`,
    [staffId, `synthetic-drive-${staffId}`, `drive-${staffId}@example.invalid`]);
  await pool.query(`INSERT INTO soso_staff_sessions(staff_user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '2 hours')`, [staffId, sessionHash]);
  const wrongOrigin = { ...req, get: () => "https://attacker.example" } as unknown as Request;
  await assert.rejects(beginDriveAuthorization(wrongOrigin), /configured Drive host/);
  const url = await start();
  assert.equal(url.searchParams.get("scope"), DRIVE_SCOPE);
  assert.equal(url.searchParams.get("access_type"), "online");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("include_granted_scopes"), "false");
  assert.equal(url.searchParams.has("client_secret"), false);
  const stranger = { ...req, cookies: { soso_staff_session: "x".repeat(72) } } as unknown as Request;
  await assert.rejects(completeDriveAuthorization(stranger), /expired|already used/);
  assert.equal(tokenCalls, 0, "Cross-session callback cannot exchange a code");
  await completeDriveAuthorization(req);
  await assert.rejects(completeDriveAuthorization(req), /already used/);
  assert.equal(tokenCalls, 1);
  const status = await driveConnectionStatus(req);
  assert.equal(status.connected, true);
  assert.equal(JSON.stringify(status).includes(token), false);
  const { rows } = await pool.query("SELECT token_ciphertext,verifier_ciphertext,state_hash FROM soso_catalogue_drive_sessions WHERE session_hash=$1", [sessionHash]);
  assert.ok(!rows[0].token_ciphertext.includes(token));
  assert.equal(rows[0].verifier_ciphertext, null);
  assert.equal(rows[0].state_hash, null);
  await assert.rejects(importDriveRead(req, folderId), /select this spreadsheet folder/);
  const picker = await listDriveFolders(req, "Product");
  assert.equal(picker.folders[0]!.id, folderId);
  assert.equal(picker.more, true);
  await assert.rejects(listDriveFolders(req, "x".repeat(101)), /100 characters/);
  noFolder = true;
  await assert.rejects(selectDriveFolder(req, folderId), /not a shortcut/);
  noFolder = false;
  await selectDriveFolder(req, folderId);
  assert.deepEqual((await driveConnectionStatus(req)).folders, [folderId]);
  const proxy = await importDriveRead(req, folderId);
  await assert.rejects(importDriveRead(stranger, folderId), /select this spreadsheet/);
  await assert.rejects(proxy("/oauth2/token"), /Unsupported/);
  const image = await readDrivePhoto(folderId, fileId, proxy);
  assert.deepEqual(image.bytes, jpeg);
  await assert.rejects(readDrivePhoto("different_folder123", fileId, proxy), /no longer belongs/);
  denyAccess = true;
  await assert.rejects(proxy(`/drive/v3/files/${folderId}`), /expired or was revoked/);
  denyAccess = false;
  assert.equal((await driveConnectionStatus(req)).connected, false);
  await connect();
  revokeFails = true;
  assert.deepEqual(await disconnectDrive(req), { disconnected: true, revoked: false });
  assert.equal((await driveConnectionStatus(req)).connected, false, "Local disconnect survives a Google failure");
  await assert.rejects(completeDriveAuthorization(req), /already used/);
  revokeFails = false;
  await connect();
  assert.deepEqual(await disconnectDrive(req), { disconnected: true, revoked: true });
  assert.ok(driveCalls > 0);
});

test("denial, expiry, broad grants, Staff revocation and disconnect during exchange fail closed", async () => {
  await start();
  req.query.error = "access_denied";
  const calls = tokenCalls;
  await assert.rejects(completeDriveAuthorization(req), /cancelled/);
  assert.equal(tokenCalls, calls);
  await start();
  await pool.query("UPDATE soso_catalogue_drive_sessions SET state_expires_at=now()-interval '1 second' WHERE session_hash=$1", [sessionHash]);
  await assert.rejects(completeDriveAuthorization(req), /expired|already used/);
  await start();
  scope = DRIVE_SCOPE + " https://www.googleapis.com/auth/drive";
  await assert.rejects(completeDriveAuthorization(req), /exactly read-only/);
  scope = DRIVE_SCOPE;
  await start();
  beforeToken = async () => { await disconnectDrive(req); };
  await assert.rejects(completeDriveAuthorization(req), /Staff authorization changed/);
  beforeToken = undefined;
  await start();
  await pool.query("UPDATE soso_staff_users SET role='analyst' WHERE id=$1", [staffId]);
  await assert.rejects(completeDriveAuthorization(req), /Staff authorization changed/);
  await pool.query("UPDATE soso_staff_users SET role='editor' WHERE id=$1", [staffId]);
  await connect();
  await pool.query("UPDATE soso_catalogue_drive_sessions SET token_expires_at=now()-interval '1 second' WHERE session_hash=$1", [sessionHash]);
  assert.equal((await driveConnectionStatus(req)).connected, false);
  const pending = await pool.query("SELECT 1 FROM soso_catalogue_drive_sessions WHERE session_hash=$1", [sessionHash]);
  assert.equal(pending.rowCount, 0, "Expired encrypted credentials are removed");
});

test("every Drive route enforces Staff roles, no-store and write origin checks", async () => {
  const app = express();
  app.use(express.json());
  app.use((request, _res, next) => {
    const role = request.get("x-test-role");
    if (role) request.staff = { id: staffId, role } as Request["staff"];
    request.cookies = req.cookies;
    request.log = { warn: () => undefined } as unknown as Request["log"];
    next();
  });
  app.use(requireSameOriginForWrites);
  app.use("/api", importRouter);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  // Use the unmocked local HTTP transport. Google still goes through the synthetic fetch.
  try {
    for (const [method, path] of [
      ["GET", "google/status"], ["POST", "google/authorize"], ["GET", "google/callback"],
      ["POST", "google/disconnect"], ["GET", "google/folders"], ["POST", "google/folders"],
      ["GET", `drive/${folderId}`], ["GET", `drive/${folderId}/files/${fileId}`],
    ]) {
      const url = `${base}/api/staff/catalogue-import/${path}`;
      const headers = { origin: base };
      assert.equal((await realFetch(url, { method, headers, redirect: "manual" })).status, 401);
      for (const role of ["operations", "analyst", "stylist"]) {
        assert.equal((await realFetch(url, { method, headers: { ...headers, "x-test-role": role }, redirect: "manual" })).status, 403);
      }
    }
    for (const role of ["owner", "administrator", "editor"]) {
      const result = await realFetch(`${base}/api/staff/catalogue-import/google/status`, { headers: { "x-test-role": role } });
      assert.equal(result.status, 200);
      assert.match(result.headers.get("cache-control")!, /private, no-store/);
    }
    const denied = await realFetch(`${base}/api/staff/catalogue-import/google/disconnect`, { method: "POST", headers: { "x-test-role": "editor", origin: "https://evil.example" } });
    assert.equal(denied.status, 403);
    const missingOrigin = await realFetch(`${base}/api/staff/catalogue-import/google/disconnect`, { method: "POST", headers: { "x-test-role": "editor" } });
    assert.equal(missingOrigin.status, 403);
    const callback = await realFetch(`${base}/api/staff/catalogue-import/google/callback?code=never-reflect-this&state=bad`, { headers: { "x-test-role": "editor" }, redirect: "manual" });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get("location"), "/staff?platformSection=catalogue&drive=failed#platform");
    assert.equal(callback.headers.get("referrer-policy"), "no-referrer");
    assert.ok(!(await callback.text()).includes("never-reflect-this"));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
