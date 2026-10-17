import { Router, type IRouter, type Request, type Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "@workspace/db";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { MailError, campaignInput, mailSettingsInput, messageInput, resolveMailHost } from "../lib/staff-mail-security";
import { ensureMailSchema, freshMailPermission, mailTransaction, newsletterLink, rateLimit, saveMailSettings, storedMail, useNewsletterLink } from "../lib/staff-mail-store";
import { confirmationMail, deliverMail, listMail, readMail, readyNewsletter, sendStaffMessage, testMailConnection } from "../lib/staff-mail-transport";
import newsletterGroups from "./newsletter-groups";
import { audienceInput, campaignAudienceSQL, subscriberFilters } from "../lib/newsletter-audience";

const router: IRouter = Router();
const mailRoles = requireStaffRoles("owner", "administrator");
const owner = requireStaffRoles("owner");
const uuid = z.string().uuid();
router.use("/staff/newsletter", newsletterGroups);
type MailRequest = Request & { staff: NonNullable<Request["staff"]> };
function endpoint(handler: (req: MailRequest, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    try { await handler(req as MailRequest, res); }
    catch (error) {
      if (error instanceof z.ZodError) { res.status(400).json({ error: "Check the form fields and try again.", issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) }); return; }
      if (error instanceof MailError) { res.status(error.status).json({ error: error.message }); return; }
      // Mail-server errors may contain account information: never echo or log them.
      res.status(503).json({ error: "The mail operation could not be completed. Check connection settings, certificate validity and mailbox access; passwords are never returned." });
    }
  };
}
router.get("/staff/mail/settings", requireStaff, mailRoles, endpoint(async (req, res) => {
  await freshMailPermission(req.staff.id);
  const row = await storedMail();
  res.json({
    configured: Boolean(row), version: row?.version ?? 0, tested: Boolean(row && row.tested_version === row.version),
    enabled: row?.settings.enabled ?? false, newsletterEnabled: row?.settings.newsletterEnabled ?? false,
    hasPassword: Boolean(row?.password_ciphertext),
    ...(req.staff.role === "owner" && row ? { settings: row.settings } : {}),
  });
}));
router.put("/staff/mail/settings", requireStaff, owner, endpoint(async (req, res) => {
  const input = mailSettingsInput.parse(req.body);
  await Promise.all([resolveMailHost(input.smtpHost), resolveMailHost(input.imapHost)]);
  res.json(await saveMailSettings(req.staff.id, input));
}));
router.post("/staff/mail/test", requireStaff, owner, endpoint(async (req, res) => {
  await rateLimit(`mail-test:${req.staff.id}`, 6, 600);
  res.json(await testMailConnection(req.staff.id));
}));
router.get("/staff/mail/messages", requireStaff, mailRoles, endpoint(async (req, res) => {
  const folder = z.enum(["inbox", "sent"]).default("inbox").parse(req.query.folder);
  await rateLimit(`mail-read:${req.staff.id}`, 60, 60);
  res.json(await listMail(req.staff.id, folder));
}));
router.get("/staff/mail/messages/:uid", requireStaff, mailRoles, endpoint(async (req, res) => {
  const uid = z.coerce.number().int().positive().max(4294967295).parse(req.params.uid);
  const validity = z.string().regex(/^\d+$/).parse(req.query.uidValidity);
  const folder = z.enum(["inbox", "sent"]).default("inbox").parse(req.query.folder);
  await rateLimit(`mail-read:${req.staff.id}`, 60, 60);
  res.json(await readMail(req.staff.id, folder, uid, validity));
}));
router.post("/staff/mail/send", requireStaff, mailRoles, endpoint(async (req, res) => {
  res.json(await sendStaffMessage(req.staff.id, messageInput.parse(req.body)));
}));
router.get("/staff/mail/history", requireStaff, mailRoles, endpoint(async (req, res) => {
  await freshMailPermission(req.staff.id); await ensureMailSchema();
  res.json({ sends: (await pool.query(`SELECT id,recipient,subject,kind,
    CASE WHEN status='sending' AND created_at<now()-interval '2 minutes' THEN 'uncertain' ELSE status END AS status,
    created_at FROM soso_mail_sends ORDER BY created_at DESC,id DESC LIMIT 50`)).rows });
}));
router.get("/staff/newsletter/subscribers", requireStaff, mailRoles, endpoint(async (req, res) => {
  await freshMailPermission(req.staff.id); await ensureMailSchema();
  const filters = subscriberFilters.parse(req.query);
  const rows = (await pool.query(`SELECT n.id,n.email,n.status,n.policy_version,n.consented_at,n.confirmed_at,n.unsubscribed_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) ORDER BY lower(g.name))
      FROM soso_newsletter_group_members m JOIN soso_newsletter_groups g ON g.id=m.group_id WHERE m.subscriber_id=n.id),'[]'::jsonb) AS groups
    FROM soso_newsletter_subscribers n
    WHERE ($1='all' OR n.status=$1) AND ($2::uuid IS NULL OR n.id<$2)
    AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM soso_newsletter_group_members m WHERE m.subscriber_id=n.id AND m.group_id=$3))
    ORDER BY n.id DESC LIMIT 51`, [filters.status, filters.before ?? null, filters.groupId ?? null])).rows;
  res.json({ subscribers: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null });
}));
router.post("/staff/newsletter/subscribers/:id/confirmation", requireStaff, mailRoles, endpoint(async (req, res) => {
  await freshMailPermission(req.staff.id); await readyNewsletter();
  const id = uuid.parse(req.params.id);
  await rateLimit(`confirmation:${id}`, 1, 600);
  const row = (await pool.query("SELECT email,status FROM soso_newsletter_subscribers WHERE id=$1", [id])).rows[0];
  if (!row || row.status !== "pending") throw new MailError("Only pending subscribers can receive a confirmation request.");
  const token = await newsletterLink(id, "confirm");
  res.json(await confirmationMail(id, row.email, token));
}));
router.post("/staff/newsletter/subscribers/:id/unsubscribe", requireStaff, mailRoles, endpoint(async (req, res) => {
  await freshMailPermission(req.staff.id);
  await mailTransaction(async (connection) => {
    await freshMailPermission(req.staff.id, false, connection);
    const id = uuid.parse(req.params.id);
    const result = await connection.query("UPDATE soso_newsletter_subscribers SET status='unsubscribed',unsubscribed_at=now() WHERE id=$1 RETURNING id", [id]);
    if (!result.rowCount) throw new MailError("Subscriber not found.", 404);
    // Revoke outstanding confirmation links atomically with the opt-out.
    await connection.query("DELETE FROM soso_newsletter_links WHERE subscriber_id=$1 AND purpose='confirm'", [id]);
  });
  res.json({ status: "unsubscribed" });
}));
router.get("/staff/newsletter/campaigns", requireStaff, mailRoles, endpoint(async (req, res) => {
  await freshMailPermission(req.staff.id); await ensureMailSchema();
  res.json({ campaigns: (await pool.query(`SELECT c.id,c.subject,c.body_text,c.created_at,c.group_id,g.name AS group_name,
    (SELECT count(*)::int FROM soso_mail_sends s WHERE s.campaign_id=c.id) AS attempted,
    (SELECT count(*)::int FROM soso_mail_sends s WHERE s.campaign_id=c.id AND s.status='accepted') AS accepted,
    (SELECT count(*)::int FROM soso_mail_sends s WHERE s.campaign_id=c.id AND s.status IN ('uncertain','sending')) AS uncertain,
    (SELECT count(*)::int FROM soso_newsletter_subscribers n WHERE n.status='confirmed' AND ${campaignAudienceSQL}
      AND NOT EXISTS(SELECT 1 FROM soso_mail_sends s WHERE s.campaign_id=c.id AND s.subscriber_id=n.id)) AS remaining
    FROM soso_mail_campaigns c LEFT JOIN soso_newsletter_groups g ON g.id=c.group_id ORDER BY c.created_at DESC LIMIT 30`)).rows });
}));
router.post("/staff/newsletter/campaigns", requireStaff, mailRoles, endpoint(async (req, res) => {
  await freshMailPermission(req.staff.id); await ensureMailSchema();
  const input = campaignInput.parse(req.body);
  if (input.groupId && !(await pool.query("SELECT id FROM soso_newsletter_groups WHERE id=$1", [input.groupId])).rowCount) throw new MailError("Group not found. Refresh the audience list.", 404);
  const result = await pool.query("INSERT INTO soso_mail_campaigns(subject,body_text,created_by,group_id) VALUES($1,$2,$3,$4) RETURNING id", [input.subject, input.text, req.staff.id, input.groupId]);
  res.status(201).json(result.rows[0]);
}));
router.patch("/staff/newsletter/campaigns/:id/audience", requireStaff, mailRoles, endpoint(async (req, res) => {
  await ensureMailSchema();
  const id = uuid.parse(req.params.id), input = audienceInput.parse(req.body);
  await mailTransaction(async (connection) => {
    await freshMailPermission(req.staff.id, false, connection);
    const campaign = await connection.query("SELECT id FROM soso_mail_campaigns WHERE id=$1 FOR UPDATE", [id]);
    if (!campaign.rowCount) throw new MailError("Campaign not found.", 404);
    if ((await connection.query("SELECT id FROM soso_mail_sends WHERE campaign_id=$1 LIMIT 1", [id])).rowCount) {
      throw new MailError("The audience is locked after the first send attempt. Create a new draft for another audience.", 409);
    }
    if (input.groupId && !(await connection.query("SELECT id FROM soso_newsletter_groups WHERE id=$1", [input.groupId])).rowCount) throw new MailError("Group not found.", 404);
    await connection.query("UPDATE soso_mail_campaigns SET group_id=$2 WHERE id=$1", [id, input.groupId]);
  });
  res.json({ saved: true });
}));
router.post("/staff/newsletter/campaigns/:id/send", requireStaff, mailRoles, endpoint(async (req, res) => {
  await freshMailPermission(req.staff.id);
  const settings = await readyNewsletter();
  const id = uuid.parse(req.params.id);
  const campaign = (await pool.query("SELECT subject,body_text,group_id FROM soso_mail_campaigns WHERE id=$1", [id])).rows[0];
  if (!campaign) throw new MailError("Campaign not found.", 404);
  // A single short batch is explicit; no fire-and-forget work in serverless handlers.
  const recipients = (await pool.query(`SELECT n.id,n.email FROM soso_newsletter_subscribers n JOIN soso_mail_campaigns c ON c.id=$1 WHERE n.status='confirmed'
    AND ${campaignAudienceSQL}
    AND NOT EXISTS(SELECT 1 FROM soso_mail_sends s WHERE s.campaign_id=$1 AND s.subscriber_id=n.id)
    ORDER BY n.id LIMIT 3`, [id])).rows;
  let accepted = 0;
  for (const recipient of recipients) {
    const token = await newsletterLink(recipient.id, "unsubscribe");
    const url = `${settings.publicOrigin}/newsletter/unsubscribe?token=${token}`;
    await deliverMail({
      id: randomUUID(), staffId: req.staff.id, to: recipient.email,
      subject: campaign.subject, text: `${campaign.body_text}\n\n—\nSOSO Africa\nYou confirmed your subscription to SOSO news, collections and offers.\nUnsubscribe: ${url}`,
      kind: "newsletter", subscriberId: recipient.id, campaignId: id, unsubscribeUrl: url,
      expectedGroupId: campaign.group_id,
    });
    accepted++;
  }
  res.json({ accepted, message: "Batch finished. Refresh progress before sending the next batch. SMTP acceptance does not prove inbox delivery." });
}));
router.get("/newsletter/status", endpoint(async (_req, res) => {
  const row = await storedMail();
  res.json({ available: Boolean(row && row.settings.enabled && row.settings.newsletterEnabled && row.settings.policyConfirmed && row.settings.hourlyLimit > 0 && row.tested_version === row.version) });
}));
router.post("/newsletter/subscribe", endpoint(async (req, res) => {
  const input = z.object({ email: z.string().trim().email().max(254), consent: z.literal(true), website: z.string().max(200).default("") }).strict().parse(req.body);
  await ensureMailSchema();
  await rateLimit(`newsletter-ip:${createHash("sha256").update(req.ip ?? "unknown").digest("hex")}`, 5, 3600);
  if (input.website) { res.status(202).json({ message: "If eligible, a confirmation email will be sent. Please check your inbox." }); return; }
  await readyNewsletter();
  const email = input.email.toLowerCase();
  await rateLimit(`newsletter-address:${createHash("sha256").update(email).digest("hex")}`, 1, 600);
  const row = await mailTransaction(async (connection) => {
    const inserted = await connection.query(`INSERT INTO soso_newsletter_subscribers(email) VALUES($1)
      ON CONFLICT(email) DO UPDATE SET status=CASE WHEN soso_newsletter_subscribers.status='unsubscribed' THEN 'pending' ELSE soso_newsletter_subscribers.status END,
      consented_at=CASE WHEN soso_newsletter_subscribers.status='unsubscribed' THEN now() ELSE soso_newsletter_subscribers.consented_at END
      RETURNING id,status`, [email]);
    return inserted.rows[0];
  });
  if (row.status === "pending") {
    const token = await newsletterLink(row.id, "confirm");
    // Keep the public response uniform; never expose whether an address is subscribed.
    await confirmationMail(row.id, email, token).catch(() => undefined);
  }
  res.status(202).json({ message: "If eligible, a confirmation email will be sent. Please check your inbox. SOSO can resend a pending confirmation if it does not arrive." });
}));
router.post("/newsletter/confirm", endpoint(async (req, res) => {
  await ensureMailSchema();
  res.json(await useNewsletterLink(z.object({ token: z.string().max(100) }).strict().parse(req.body).token, "confirm"));
}));
router.post("/newsletter/unsubscribe", endpoint(async (req, res) => {
  await ensureMailSchema();
  res.json(await useNewsletterLink(z.object({ token: z.string().max(100) }).strict().parse(req.body).token, "unsubscribe"));
}));
export default router;
