import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createHash, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { MailError, resolveMailHost, unlockPassword, type MailSettings, type messageInput } from "./staff-mail-security";
import { freshMailPermission, mailTransaction, storedMail, type StoredMail } from "./staff-mail-store";
import type { z } from "zod";

async function configuration(allowDisabled = false) {
  const row = await storedMail();
  if (!row) throw new MailError("An owner must configure the mailbox in Staff first.", 503);
  if (!allowDisabled && (!row.settings.enabled || row.tested_version !== row.version)) {
    throw new MailError("Mail is paused or the current settings have not passed a connection test.", 503);
  }
  return row;
}
async function smtp(row: StoredMail) {
  const settings = row.settings;
  return nodemailer.createTransport({
    host: await resolveMailHost(settings.smtpHost), port: settings.smtpPort,
    secure: settings.smtpPort === 465, requireTLS: true,
    tls: { servername: settings.smtpHost, rejectUnauthorized: true, minVersion: "TLSv1.2" },
    auth: { user: settings.username, pass: unlockPassword(row.password_ciphertext) },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
  });
}
async function imap(row: StoredMail) {
  const settings = row.settings;
  const client = new ImapFlow({
    host: await resolveMailHost(settings.imapHost), port: settings.imapPort, secure: true,
    servername: settings.imapHost,
    tls: { servername: settings.imapHost, rejectUnauthorized: true, minVersion: "TLSv1.2" },
    auth: { user: settings.username, pass: unlockPassword(row.password_ciphertext) },
    logger: false, emitLogs: false, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000,
  });
  await client.connect();
  return client;
}
async function withMailbox<T>(row: StoredMail, run: (client: ImapFlow) => Promise<T>) {
  let client: ImapFlow | undefined;
  try { client = await imap(row); return await run(client); }
  finally { if (client) await client.logout().catch(() => client!.close()); }
}
async function folderPath(client: ImapFlow, folder: string) {
  if (folder === "inbox") return "INBOX";
  const sent = (await client.list()).find((entry) => entry.specialUse === "\\Sent");
  if (!sent) throw new MailError("This mailbox has no identifiable Sent folder. Staff send history remains available.", 409);
  return sent.path;
}
export async function testMailConnection(staffId: string) {
  await freshMailPermission(staffId, true);
  const row = await configuration(true);
  const transport = await smtp(row);
  try {
    await transport.verify();
    await withMailbox(row, async () => undefined);
    await mailTransaction(async (connection) => {
      await freshMailPermission(staffId, true, connection);
      const result = await connection.query("UPDATE soso_mail_settings SET tested_version=version WHERE id=true AND version=$1 RETURNING version", [row.version]);
      if (!result.rowCount) throw new MailError("Settings changed during the connection test. Test the new settings again.", 409);
    });
    return { smtp: true, imap: true, version: row.version };
  } finally { transport.close(); }
}
export async function listMail(staffId: string, folder: "inbox" | "sent") {
  await freshMailPermission(staffId);
  return withMailbox(await configuration(), async (client) => {
    const lock = await client.getMailboxLock(await folderPath(client, folder));
    try {
      if (!client.mailbox) throw new MailError("Mailbox could not be opened.", 503);
      const uidValidity = client.mailbox.uidValidity.toString();
      const messages = [];
      if (client.mailbox.exists) {
        for await (const item of client.fetch(`${Math.max(1, client.mailbox.exists - 29)}:*`, { uid: true, envelope: true, flags: true })) {
          messages.push({
            uid: item.uid, subject: item.envelope?.subject ?? "(No subject)",
            from: item.envelope?.from?.[0]?.address ?? "", to: item.envelope?.to?.[0]?.address ?? "",
            date: item.envelope?.date ? new Date(item.envelope.date).toISOString() : null, unread: !item.flags?.has("\\Seen"),
          });
        }
      }
      return { folder, uidValidity, messages: messages.reverse() };
    } finally { lock.release(); }
  });
}
export async function readMail(staffId: string, folder: "inbox" | "sent", uid: number, uidValidity: string) {
  await freshMailPermission(staffId);
  return withMailbox(await configuration(), async (client) => {
    const lock = await client.getMailboxLock(await folderPath(client, folder));
    try {
      if (!client.mailbox || client.mailbox.uidValidity.toString() !== uidValidity) throw new MailError("The mailbox changed. Refresh its message list.", 409);
      const metadata = await client.fetchOne(uid, { size: true }, { uid: true });
      if (!metadata) throw new MailError("This message is no longer available.", 404);
      if (metadata.size === undefined || metadata.size > 2_000_000) throw new MailError("This message is too large or its size is unknown. Open it in webmail.", 413);
      const message = await client.fetchOne(uid, { source: true }, { uid: true });
      if (!message || !message.source) throw new MailError("Message content is unavailable.", 404);
      if (message.source.length > 2_000_000) throw new MailError("This message is too large for Staff preview. Open it in webmail.", 413);
      const parsed = await simpleParser(message.source, { skipHtmlToText: false, skipImageLinks: true });
      return {
        uid, uidValidity, folder, subject: parsed.subject ?? "(No subject)",
        from: parsed.from?.value[0]?.address ?? "", replyTo: parsed.replyTo?.value[0]?.address ?? parsed.from?.value[0]?.address ?? "",
        text: (parsed.text ?? "This email has no readable text. Open it in webmail.").slice(0, 100000),
        date: parsed.date?.toISOString() ?? null,
        messageId: parsed.messageId && !/[\r\n]/.test(parsed.messageId) ? parsed.messageId.slice(0, 500) : undefined,
        // Remote HTML, scripts, tracking images and attachments are never rendered.
        attachments: parsed.attachments.map((item) => ({ name: item.filename ?? "Attachment", size: item.size })),
      };
    } finally { lock.release(); }
  });
}
export async function readyNewsletter(): Promise<MailSettings> {
  const row = await configuration();
  if (!row.settings.newsletterEnabled || !row.settings.policyConfirmed || row.settings.hourlyLimit < 1) {
    throw new MailError("Newsletter email is not enabled with an approved hosting allowance.", 503);
  }
  return row.settings;
}
export async function deliverMail(input: {
  id: string; to: string; subject: string; text: string; staffId?: string;
  kind: "direct" | "confirmation" | "newsletter"; campaignId?: string; subscriberId?: string; unsubscribeUrl?: string;
  inReplyTo?: string;
}) {
  const row = await configuration();
  if (input.staffId) await freshMailPermission(input.staffId);
  if (input.kind !== "direct") await readyNewsletter();
  // The durable reservation prevents duplicate sends and conservatively counts uncertain attempts.
  const reservation = await mailTransaction(async (connection) => {
    await connection.query("SELECT pg_advisory_xact_lock(hashtext('soso-mail-send-quota'))");
    if (input.staffId) await freshMailPermission(input.staffId, false, connection);
    const current = (await connection.query("SELECT version,settings,tested_version FROM soso_mail_settings WHERE id=true")).rows[0];
    if (!current || current.version !== row.version || !current.settings.enabled || current.tested_version !== current.version) {
      throw new MailError("Mail settings changed. Refresh and try again.", 409);
    }
    const bodyHash = createHash("sha256").update(JSON.stringify([input.text, input.kind, input.campaignId, input.subscriberId, input.inReplyTo])).digest("hex");
    const existing = (await connection.query("SELECT status,created_by,recipient,subject,body_hash FROM soso_mail_sends WHERE id=$1", [input.id])).rows[0];
    if (existing) {
      if (existing.created_by !== (input.staffId ?? null) || existing.recipient !== input.to || existing.subject !== input.subject || existing.body_hash !== bodyHash) throw new MailError("This send identifier belongs to another request.", 409);
      return { status: existing.status, replayed: true };
    }
    if (input.kind === "newsletter") {
      const subscriber = (await connection.query("SELECT status FROM soso_newsletter_subscribers WHERE id=$1 FOR UPDATE", [input.subscriberId])).rows[0];
      if (subscriber?.status !== "confirmed") throw new MailError("This subscriber no longer consents to newsletters.", 409);
    }
    if (!current.settings.policyConfirmed || current.settings.hourlyLimit < 1) throw new MailError("An owner must confirm the hosting sending allowance before any email can be sent.", 503);
    const count = Number((await connection.query("SELECT count(*) FROM soso_mail_sends WHERE created_at>now()-interval '1 hour'")).rows[0].count);
    if (count >= row.settings.hourlyLimit) throw new MailError("The configured hourly sending allowance is exhausted. Wait before sending more.", 429);
    await connection.query("INSERT INTO soso_mail_sends(id,recipient,subject,kind,created_by,campaign_id,subscriber_id,body_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [input.id, input.to, input.subject, input.kind, input.staffId ?? null, input.campaignId ?? null, input.subscriberId ?? null, bodyHash]);
    return null;
  });
  if (reservation) return reservation;
  let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
  try {
    transport = await smtp(row);
    const headers = input.unsubscribeUrl ? { "List-Unsubscribe": `<${input.unsubscribeUrl}>` } : undefined;
    const mime = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" }).sendMail({
      from: { name: row.settings.fromName, address: row.settings.username },
      to: input.to, subject: input.subject, text: input.text, headers,
      ...(input.inReplyTo ? { inReplyTo: input.inReplyTo, references: input.inReplyTo } : {}),
      messageId: `<${input.id}@${row.settings.username.split("@")[1]}>`,
    });
    if (!Buffer.isBuffer(mime.message)) throw new MailError("Email content could not be prepared.", 503);
    const raw = mime.message;
    const info = await transport.sendMail({ envelope: { from: row.settings.username, to: [input.to] }, raw });
    if (!info.accepted?.length) throw new Error("SMTP did not accept the recipient");
    await pool.query("UPDATE soso_mail_sends SET status='accepted' WHERE id=$1", [input.id]);
    let sentFolderCopySaved = false;
    if (input.kind === "direct") {
      // SMTP acceptance is committed before this optional IMAP copy.
      sentFolderCopySaved = await withMailbox(row, async (client) => {
        await client.append(await folderPath(client, "sent"), raw, ["\\Seen"]);
        return true;
      }).catch(() => false);
    }
    return { status: "accepted", replayed: false, sentFolderCopySaved };
  } catch {
    await pool.query("UPDATE soso_mail_sends SET status='uncertain' WHERE id=$1", [input.id]);
    throw new MailError("The send outcome could not be confirmed. Check Staff send history and webmail before sending again; this request will not be retried automatically.", 502);
  } finally { transport?.close(); }
}
export async function sendStaffMessage(staffId: string, input: z.infer<typeof messageInput>) {
  let inReplyTo: string | undefined;
  if (input.reply) {
    const original = await readMail(staffId, input.reply.folder, input.reply.uid, input.reply.uidValidity);
    if (original.replyTo.toLowerCase() !== input.to.toLowerCase()) throw new MailError("The reply recipient does not match the original message.");
    inReplyTo = original.messageId;
  }
  return deliverMail({ id: input.idempotencyKey, to: input.to, subject: input.subject, text: input.text, staffId, kind: "direct", inReplyTo });
}
export async function confirmationMail(id: string, email: string, token: string) {
  const settings = await readyNewsletter();
  return deliverMail({
    id: randomUUID(), to: email, subject: "Confirm your SOSO newsletter subscription",
    text: `Please confirm that you want SOSO news, collections and offers:\n\n${settings.publicOrigin}/newsletter/confirm?token=${token}\n\nThis link expires in 24 hours. If you did not request this, ignore this email. You will not receive newsletters without confirmation.`,
    kind: "confirmation", subscriberId: id,
  });
}
