import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import ExcelJS from "exceljs";
import { pool } from "@workspace/db";
import mailRouter from "./staff-mail";
import { ensureMailSchema } from "../lib/staff-mail-store";
import { campaignAudienceSQL } from "../lib/newsletter-audience";
import { deliverMail } from "../lib/staff-mail-transport";
import { decodeMailAttachments, mailBodyHash, mailContent } from "../lib/staff-mail-content";

// This suite is deliberately refused outside the disposable-schema runner.
const schema = (await pool.query("SELECT current_schema() AS name")).rows[0].name;
assert.match(schema, /^soso_api_test_[a-f0-9]+$/, "Run through run-in-isolated-soso-schema.mjs");
await ensureMailSchema();
const owner = randomUUID(), admin = randomUUID();
await pool.query(`INSERT INTO soso_staff_users(id,clerk_user_id,email,role)
 VALUES($1,'synthetic-groups-owner','groups-owner@example.test','owner'),
 ($2,'synthetic-groups-admin','groups-admin@example.test','administrator')`, [owner, admin]);
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const role = req.get("x-test-role");
  if (role) req.staff = { id: role === "owner" ? owner : admin, role } as any;
  (req as any).log = { warn() {} };
  next();
});
app.use("/api", mailRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}/api/staff/newsletter`;
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});
function call(path: string, method = "GET", body?: unknown, role = "owner"): Promise<Omit<Response, "json"> & { json(): Promise<any> }> {
  return fetch(`${origin}${path}`, { method, headers: {
    "Content-Type": "application/json", ...(role ? { "x-test-role": role } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) as Promise<Omit<Response, "json"> & { json(): Promise<any> }>;
}

test("groups, full XLSX export, campaign targeting and reservation safeguards", async (t) => {
  const contacts: { id: string; email: string; status: string }[] = [];
  for (let i = 0; i < 55; i++) contacts.push({
    id: randomUUID(), email: `${i === 0 ? "=formula" : `subscriber${i}`}@example.test`,
    status: i === 53 ? "pending" : i === 54 ? "unsubscribed" : "confirmed",
  });
  await pool.query(`INSERT INTO soso_newsletter_subscribers(id,email,status,confirmed_at)
    SELECT id,email,status,CASE WHEN status='confirmed' THEN now() ELSE NULL END
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,email text,status text)`, [JSON.stringify(contacts)]);
  let groupId = "", campaignId = "";
  await t.test("only owners and administrators may manage or export subscribers", async () => {
    assert.equal((await call("/groups", "GET", undefined, "")).status, 401);
    assert.equal((await call("/groups", "POST", { name: "Forbidden" }, "editor")).status, 403);
    assert.equal((await call("/subscribers/export", "GET", undefined, "")).status, 401);
    assert.equal((await call("/groups", "GET", undefined, "administrator")).status, 200);
  });
  await t.test("create, duplicate rejection, rename and atomic multi-group membership", async () => {
    let r = await call("/groups", "POST", { name: "VIP" }); assert.equal(r.status, 201);
    groupId = (await r.json()).id;
    assert.equal((await call("/groups", "POST", { name: "vip" })).status, 409);
    assert.equal((await call(`/groups/${groupId}`, "PATCH", { name: "=VIP clients" })).status, 200);
    const ids = [contacts[0].id, contacts[1].id, contacts[53].id, contacts[54].id];
    for (let i = 0; i < 2; i++) assert.equal((await call(`/groups/${groupId}/members`, "PUT", { action: "add", subscriberIds: ids })).status, 200);
    const groups = (await (await call("/groups")).json()).groups;
    assert.equal(groups[0].total, 4); assert.equal(groups[0].confirmed, 2);
    // A missing subscriber rolls back the entire operation.
    assert.equal((await call(`/groups/${groupId}/members`, "PUT", { action: "add", subscriberIds: [contacts[2].id, randomUUID()] })).status, 409);
    assert.equal((await pool.query("SELECT count(*) FROM soso_newsletter_group_members WHERE group_id=$1", [groupId])).rows[0].count, "4");
    r = await call("/groups", "POST", { name: "Second group" });
    const second = (await r.json()).id;
    assert.equal((await call(`/groups/${second}/members`, "PUT", { action: "add", subscriberIds: [contacts[0].id] })).status, 200);
    const row = (await (await call(`/subscribers?groupId=${groupId}&status=confirmed`)).json()).subscribers.find((x: any) => x.id === contacts[0].id);
    assert.equal(row.groups.length, 2);
    assert.equal((await call(`/groups/${second}`, "DELETE")).status, 200);
    assert.equal((await pool.query("SELECT count(*) FROM soso_newsletter_subscribers")).rows[0].count, "55");
  });
  await t.test("pagination and group/status filters persist server-side", async () => {
    const first = await (await call("/subscribers")).json();
    assert.equal(first.subscribers.length, 50); assert.ok(first.nextCursor);
    const next = await (await call(`/subscribers?before=${first.nextCursor}`)).json();
    assert.equal(next.subscribers.length, 5);
    assert.equal(new Set([...first.subscribers, ...next.subscribers].map((x: any) => x.id)).size, 55);
    const filtered = await (await call(`/subscribers?status=confirmed&groupId=${groupId}`)).json();
    assert.equal(filtered.subscribers.length, 2);
    assert.equal((await call("/subscribers?groupId=not-a-uuid")).status, 400);
  });
  await t.test("Excel export covers all pages, consent fields and literal formula-like values", async () => {
    const response = await call("/subscribers/export");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type")!, /spreadsheetml/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as any);
    const sheet = workbook.worksheets[0]; assert.equal(sheet.rowCount, 56);
    assert.equal(sheet.getRow(1).getCell(6).value, "Consented at (UTC)");
    const row = sheet.getRows(2, 55)!.find((x) => x.getCell(2).value === contacts[0].email)!;
    assert.equal(row.getCell(2).type, ExcelJS.ValueType.String);
    assert.equal(row.getCell(4).value, "=VIP clients");
    assert.equal(row.getCell(4).type, ExcelJS.ValueType.String);
    assert.ok(String(row.getCell(6).value).endsWith("Z"));
    const filtered = await call(`/subscribers/export?groupId=${groupId}&status=confirmed`);
    const filteredBook = new ExcelJS.Workbook();
    await filteredBook.xlsx.load(Buffer.from(await filtered.arrayBuffer()) as any);
    assert.equal(filteredBook.worksheets[0].rowCount, 3);
  });
  await t.test("campaign audience can change only before sending; counts and batches share targeting", async () => {
    const response = await call("/campaigns", "POST", { subject: "New collection", text: "Synthetic body", groupId });
    assert.equal(response.status, 201); campaignId = (await response.json()).id;
    let campaign = (await (await call("/campaigns")).json()).campaigns[0];
    assert.equal(campaign.remaining, 2); assert.equal(campaign.group_id, groupId);
    assert.equal((await call(`/campaigns/${campaignId}/audience`, "PATCH", { groupId: null })).status, 200);
    campaign = (await (await call("/campaigns")).json()).campaigns[0];
    assert.equal(campaign.remaining, 53);
    assert.equal((await call(`/campaigns/${campaignId}/audience`, "PATCH", { groupId })).status, 200);
    const candidates = (await pool.query(`SELECT n.id FROM soso_newsletter_subscribers n
      JOIN soso_mail_campaigns c ON c.id=$1 WHERE n.status='confirmed' AND ${campaignAudienceSQL}`, [campaignId])).rows;
    assert.deepEqual(new Set(candidates.map((x) => x.id)), new Set([contacts[0].id, contacts[1].id]));
    // Default all-audience drafts remain backwards compatible.
    assert.equal((await call("/campaigns", "POST", { subject: "All", text: "Synthetic" })).status, 201);
    await pool.query(`INSERT INTO soso_mail_sends(id,recipient,subject,kind,status,body_hash,created_by,campaign_id,subscriber_id)
      VALUES($1,$2,'Synthetic','newsletter','accepted','synthetic',$3,$4,$5)`,
    [randomUUID(), contacts[0].email, owner, campaignId, contacts[0].id]);
    assert.equal((await call(`/campaigns/${campaignId}/audience`, "PATCH", { groupId: null })).status, 409);
    campaign = (await (await call("/campaigns")).json()).campaigns.find((x: any) => x.id === campaignId);
    assert.equal(campaign.remaining, 1);
    assert.equal((await call(`/groups/${groupId}`, "DELETE")).status, 409);
    assert.equal((await call(`/groups/${groupId}/members`, "PUT", { action: "remove", subscriberIds: [contacts[1].id] })).status, 200);
    campaign = (await (await call("/campaigns")).json()).campaigns.find((x: any) => x.id === campaignId);
    assert.equal(campaign.remaining, 0);
  });
  await t.test("send reservation rechecks changed audience, membership, consent and hourly quota before transport", async () => {
    const settings = { enabled: true, newsletterEnabled: true, policyConfirmed: true, hourlyLimit: 40 };
    await pool.query("INSERT INTO soso_mail_settings(settings,password_ciphertext,version,tested_version) VALUES($1,'never-decrypted',1,1)", [settings]);
    const input = { id: randomUUID(), to: contacts[1].email, subject: "Synthetic", text: "Never sent",
      staffId: owner, kind: "newsletter" as const, campaignId, subscriberId: contacts[1].id, expectedGroupId: groupId };
    await assert.rejects(deliverMail({ ...input, expectedGroupId: null }), /audience changed/);
    await assert.rejects(deliverMail(input), /no longer in the campaign group/);
    await assert.rejects(deliverMail({ ...input, subscriberId: contacts[53].id }), /no longer consents/);
    await call(`/groups/${groupId}/members`, "PUT", { action: "add", subscriberIds: [contacts[1].id] });
    await pool.query("UPDATE soso_mail_settings SET settings=jsonb_set(settings,'{hourlyLimit}','1')");
    await assert.rejects(deliverMail(input), /hourly sending allowance is exhausted/);
    assert.equal((await pool.query("SELECT count(*) FROM soso_mail_sends")).rows[0].count, "1");
  });
  await t.test("rich campaign drafts persist sanitized HTML and authoritative text without changing subscribers", async () => {
    const before = (await pool.query("SELECT count(*) FROM soso_newsletter_subscribers")).rows[0].count;
    const response = await call("/campaigns", "POST", {
      subject: "Formatted", text: "not the canonical body", html: '<p><b>Hello</b> <a href="https://example.test/shop">Shop</a><img src="https://tracker.test/pixel"><script>bad()</script></p>',
    });
    assert.equal(response.status, 201);
    const id = (await response.json()).id;
    const row = (await pool.query("SELECT body_text,body_html FROM soso_mail_campaigns WHERE id=$1", [id])).rows[0];
    assert.match(row.body_html, /<b>Hello<\/b>/);
    assert.doesNotMatch(row.body_html, /script|img|tracker/);
    assert.match(row.body_text, /https:\/\/example.test\/shop/);
    assert.doesNotMatch(row.body_text, /not the canonical/);
    const listed = (await (await call("/campaigns")).json()).campaigns.find((c: any) => c.id === id);
    assert.equal(listed.body_html, row.body_html);
    assert.equal((await pool.query("SELECT count(*) FROM soso_newsletter_subscribers")).rows[0].count, before);
  });
  await t.test("rich direct replays cannot discard uncertainty or change attachment bytes under the same identity", async () => {
    const input = {
      id: randomUUID(), staffId: owner, to: "synthetic@example.test", subject: "Rich replay",
      ...mailContent("fallback", "<p><b>Hi</b></p>"), kind: "direct" as const,
      attachments: decodeMailAttachments([{ name: "note.txt", contentBase64: Buffer.from("first").toString("base64") }]),
    };
    await pool.query("INSERT INTO soso_mail_sends(id,recipient,subject,kind,created_by,body_hash,status) VALUES($1,$2,$3,'direct',$4,$5,'uncertain')",
      [input.id, input.to, input.subject, owner, mailBodyHash(input)]);
    assert.deepEqual(await deliverMail(input), { status: "uncertain", replayed: true });
    await assert.rejects(deliverMail({ ...input, html: "<p>Hi</p>" }), /another request/);
    await assert.rejects(deliverMail({ ...input, attachments: decodeMailAttachments([{ name: "note.txt", contentBase64: Buffer.from("second").toString("base64") }]) }), /another request/);
    assert.equal((await pool.query("SELECT status FROM soso_mail_sends WHERE id=$1", [input.id])).rows[0].status, "uncertain");
  });
});
