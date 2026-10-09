import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { z } from "zod";

export class MailError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const host = z.string().trim().min(4).max(253).regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/i);
export const mailSettingsInput = z.object({
  expectedVersion: z.number().int().min(0),
  smtpHost: host, smtpPort: z.union([z.literal(465), z.literal(587)]),
  imapHost: host, imapPort: z.literal(993),
  username: z.string().trim().email().max(254),
  password: z.string().min(1).max(1024).optional(),
  fromName: z.string().trim().min(1).max(100).regex(/^[^\r\n]+$/),
  publicOrigin: z.string().url().max(300).refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && url.pathname === "/" && !url.search && !url.hash;
  }, "Use the HTTPS storefront origin only, without a path."),
  enabled: z.boolean(), newsletterEnabled: z.boolean(),
  policyConfirmed: z.boolean(),
  hourlyLimit: z.number().int().min(0).max(10000),
}).strict();
export type MailSettings = Omit<z.infer<typeof mailSettingsInput>, "password" | "expectedVersion">;

function encryptionKey(secret = process.env.SESSION_SECRET) {
  if (!secret || secret.length < 32) throw new MailError("Secure mail storage is unavailable. The server requires a stable SESSION_SECRET of at least 32 characters.", 503);
  return createHash("sha256").update(`soso-staff-mail-password-v1\0${secret}`).digest();
}
export function sealPassword(password: string, secret?: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from("soso-staff-mail-v1"));
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}
export function unlockPassword(value: string, secret?: string) {
  try {
    const [iv, tag, body] = value.split(".").map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
    decipher.setAAD(Buffer.from("soso-staff-mail-v1"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch { throw new MailError("The saved password cannot be unlocked. An owner must enter it again; the server encryption key may have changed.", 503); }
}
export function publicAddress(value: string) {
  try {
    const address = ipaddr.process(value);
    return address.range() === "unicast";
  } catch { return false; }
}
/** Resolve once and pin the public address; TLS still verifies the original hostname. */
export async function resolveMailHost(hostname: string) {
  if (hostname.toLowerCase() === "localhost" || !hostname.includes(".") || ipaddr.isValid(hostname)) {
    throw new MailError("Use a public mail-server hostname, not an IP address or local host.");
  }
  let records;
  try { records = await lookup(hostname, { all: true }); }
  catch { throw new MailError("The mail-server hostname could not be resolved."); }
  if (!records.length || records.some((record) => !publicAddress(record.address))) {
    throw new MailError("Mail servers must resolve only to public Internet addresses.");
  }
  return records.find((record) => record.family === 4)?.address ?? records[0].address;
}
export const messageInput = z.object({
  idempotencyKey: z.string().uuid(),
  to: z.string().trim().email().max(254),
  subject: z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/),
  text: z.string().trim().min(1).max(24000),
  reply: z.object({ uid: z.number().int().positive(), uidValidity: z.string().regex(/^\d+$/), folder: z.enum(["inbox", "sent"]) }).strict().optional(),
}).strict();
export const campaignInput = z.object({
  subject: messageInput.shape.subject,
  text: messageInput.shape.text,
}).strict();
