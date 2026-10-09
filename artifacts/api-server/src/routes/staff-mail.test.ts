import assert from "node:assert/strict";
import test, { after } from "node:test";
import express from "express";
import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import mailRouter from "./staff-mail";
import { requireSameOriginForWrites } from "../middlewares/sameOriginWrite";
import { unlockPassword } from "../lib/staff-mail-security";

// A completely synthetic SQL fixture: this process never connects to a database
// or authenticates to a real mailbox. Browser fixtures test the complementary UI.
process.env.SESSION_SECRET = "synthetic-mail-test-encryption-key-never-used-in-production";
let row: any;
let ownerActive = true;
const subscriberId = "00000000-0000-4000-8000-000000000010";
const confirmToken = "C".repeat(43);
const unsubscribeToken = "U".repeat(43);
let confirmationExists = true;
let confirmationExpired = false;
let subscriberStatus = "pending";
const ownerId = "00000000-0000-4000-8000-000000000001";
const adminId = "00000000-0000-4000-8000-000000000002";
const originalQuery = pool.query;
const originalConnect = pool.connect;
async function fakeQuery(sql: string, values: any[] = []) {
  if (sql.includes("SELECT subscriber_id FROM soso_newsletter_links")) {
    const confirmation = values[0] === createHash("sha256").update(confirmToken).digest("hex") && values[1] === "confirm" && confirmationExists;
    const unsubscribe = values[0] === createHash("sha256").update(unsubscribeToken).digest("hex") && values[1] === "unsubscribe";
    const valid = (confirmation || unsubscribe) && !(confirmation && confirmationExpired && sql.includes("expires_at>now()"));
    return {rows:valid ? [{subscriber_id:subscriberId}] : [],rowCount:valid?1:0};
  }
  if (sql.includes("UPDATE soso_newsletter_subscribers SET status='confirmed'")) {
    const pending = subscriberStatus === "pending";
    if (pending) subscriberStatus = "confirmed";
    return {rows:pending?[{id:subscriberId}]:[],rowCount:pending?1:0};
  }
  if (sql.includes("UPDATE soso_newsletter_subscribers SET status='unsubscribed'")) {
    subscriberStatus = "unsubscribed";
    return {rows:[{id:subscriberId}],rowCount:1};
  }
  if (sql.includes("DELETE FROM soso_newsletter_links") && sql.includes("purpose='confirm'")) confirmationExists = false;
  if (sql.includes("INSERT INTO soso_mail_rate_limits")) return { rows: [{count:1}], rowCount:1 };
  if (sql.includes("SELECT role FROM soso_staff_users")) {
    return { rows: values[0] === ownerId ? (ownerActive ? [{role:"owner"}] : []) : [{role:"administrator"}], rowCount: 1 };
  }
  if (sql.startsWith("SELECT settings,password_ciphertext") || sql.startsWith("SELECT * FROM soso_mail_settings")) {
    return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
  }
  if (sql.includes("INSERT INTO soso_mail_settings")) {
    row = { settings: values[0], password_ciphertext: values[1], version: (row?.version ?? 0) + 1, tested_version: null };
  }
  return { rows: [], rowCount: 1 };
}
pool.query = fakeQuery as unknown as typeof pool.query;
pool.connect = (async () => ({ query: fakeQuery, release() {} })) as unknown as typeof pool.connect;
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const role = req.get("x-synthetic-role");
  if (role) req.staff = { id: role === "owner" ? ownerId : adminId, role } as any;
  (req as any).log = {warn() {}};
  next();
});
app.use(requireSameOriginForWrites);
app.use("/api", mailRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  pool.query = originalQuery; pool.connect = originalConnect;
});
const settings = {
  expectedVersion: 0, smtpHost: "server273-1.web-hosting.com", smtpPort: 465,
  imapHost: "server273-1.web-hosting.com", imapPort: 993,
  username: "synthetic@example.test", password: "synthetic-test-mailbox-password",
  fromName: "SOSO Africa", publicOrigin: "https://example.test",
  enabled: false, newsletterEnabled: false, policyConfirmed: false, hourlyLimit: 0,
};
async function request(path: string, role?: string, body?: unknown, writeOrigin = origin) {
  return fetch(`${origin}/api${path}`, {
    method: body === undefined ? "GET" : path.endsWith("/settings") ? "PUT" : "POST",
    headers: {
      ...(role ? {"x-synthetic-role":role} : {}),
      ...(body === undefined ? {} : {"Content-Type":"application/json", Origin:writeOrigin}),
    },
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
  });
}
test("mail access is private, role limited and protected against cross-origin writes", async () => {
  assert.equal((await request("/staff/mail/settings")).status, 401);
  assert.equal((await request("/staff/mail/settings", "editor")).status, 403);
  assert.equal((await request("/staff/mail/settings", "administrator", settings)).status, 403);
  assert.equal((await request("/staff/mail/settings", "owner", settings, "https://other.example.test")).status, 403);
  assert.equal(row, undefined);
});
test("owner setup persists an encrypted password, never echoes it, and survives reload", async () => {
  const save = await request("/staff/mail/settings", "owner", settings);
  assert.equal(save.status, 200);
  assert.deepEqual(await save.json(), {saved:true});
  assert.notEqual(row.password_ciphertext, settings.password);
  assert.equal(unlockPassword(row.password_ciphertext), settings.password);
  const reload = await request("/staff/mail/settings", "owner");
  assert.match(reload.headers.get("cache-control")!, /no-store/);
  const output = await reload.json() as any;
  assert.equal(output.settings.username, settings.username);
  assert.equal(output.version, 1);
  assert.equal(output.hasPassword, true);
  assert.equal(output.tested, false);
  assert(!JSON.stringify(output).includes(settings.password));
  assert(!JSON.stringify(output).includes(row.password_ciphertext));
  const admin = await (await request("/staff/mail/settings", "administrator")).json() as any;
  assert(!admin.settings);
  assert(!JSON.stringify(admin).includes(settings.username));
});
test("password preservation, optimistic concurrency and fresh owner authority fail safely", async () => {
  const cipher = row.password_ciphertext;
  const {password, ...withoutPassword} = settings;
  assert.equal((await request("/staff/mail/settings", "owner", {...withoutPassword, expectedVersion:1, fromName:"SOSO"})).status, 200);
  assert.equal(row.password_ciphertext, cipher);
  assert.equal(row.version, 2);
  assert.equal((await request("/staff/mail/settings", "owner", {...withoutPassword, expectedVersion:1})).status, 409);
  assert.equal((await request("/staff/mail/settings", "owner", {...withoutPassword, expectedVersion:2, username:"changed@example.test"})).status, 400);
  ownerActive = false;
  assert.equal((await request("/staff/mail/settings", "owner", {...settings, expectedVersion:2})).status, 403);
  ownerActive = true;
  assert.equal(row.version, 2);
});
test("unconfigured or untested mail cannot open inboxes, send or enrol newsletter recipients", async () => {
  assert.equal((await request("/staff/mail/messages", "owner")).status, 503);
  assert.equal((await request("/staff/mail/send", "owner", { idempotencyKey:"00000000-0000-4000-8000-000000000011",to:"synthetic@example.test",subject:"Test",text:"No real mail"})).status, 503);
  const status = await (await request("/newsletter/status")).json();
  assert.deepEqual(status, {available:false});
  assert.equal((await request("/newsletter/subscribe", undefined, {email:"synthetic@example.test",consent:false})).status, 400);
  assert.equal((await request("/newsletter/subscribe", undefined, {email:"synthetic@example.test",consent:true})).status, 503);
  assert.equal((await request("/staff/mail/settings", "owner", {...settings, expectedVersion:2, enabled:true, newsletterEnabled:true})).status, 400);
});
test("confirmation is explicit, expiring, single-use and never triggered by an email scanner GET", async () => {
  const scanner = await request(`/newsletter/confirm?token=${confirmToken}`);
  assert.equal(scanner.status, 404);
  assert.equal(subscriberStatus, "pending");
  assert.equal((await request("/newsletter/confirm", undefined, {token:"invalid"})).status, 400);
  confirmationExpired = true;
  assert.equal((await request("/newsletter/confirm", undefined, {token:confirmToken})).status, 400);
  assert.equal(subscriberStatus, "pending");
  confirmationExpired = false;
  assert.equal((await request("/newsletter/confirm", undefined, {token:confirmToken})).status, 200);
  assert.equal(subscriberStatus, "confirmed");
  assert.equal((await request("/newsletter/confirm", undefined, {token:confirmToken})).status, 400);
});
test("unsubscribe remains available while mail is paused, is repeatable and invalidates outstanding confirmations", async () => {
  confirmationExists = true;
  assert.equal((await request("/newsletter/confirm", undefined, {token:unsubscribeToken})).status, 400);
  assert.equal((await request("/newsletter/unsubscribe", undefined, {token:unsubscribeToken})).status, 200);
  assert.equal(subscriberStatus, "unsubscribed");
  assert.equal(confirmationExists, false);
  assert.equal((await request("/newsletter/unsubscribe", undefined, {token:unsubscribeToken})).status, 200);
  assert.equal((await request("/newsletter/confirm", undefined, {token:confirmToken})).status, 400);
});
