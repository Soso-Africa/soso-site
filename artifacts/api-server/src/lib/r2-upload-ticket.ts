import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { R2MediaConfig } from "./r2-media-config";

type Ticket = {
  v: 1; path: string; ownerId: string; size: number; contentType: string;
  expiresAt: number; scope: string;
  sourceEtag?: string;
  renditions?: import("@workspace/api-zod").RenditionUploadMetadata[];
};

function scope(config: R2MediaConfig): string {
  return createHash("sha256").update(JSON.stringify([
    config.accountId, config.privateBucket, config.publicBucket, config.namespace,
  ])).digest("hex");
}
function signature(payload: string): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) throw new Error("Media upload authorization secret is not configured");
  return createHmac("sha256", secret).update(`soso-r2-media-upload-v1:${payload}`).digest();
}
export function createR2UploadTicket(
  config: R2MediaConfig, data: Pick<Ticket, "path" | "ownerId" | "size" | "contentType"> & Partial<Pick<Ticket, "sourceEtag" | "renditions">>,
): string {
  const ticket: Ticket = { ...data, v: 1, expiresAt: Date.now() + 30 * 60_000, scope: scope(config) };
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}
export function verifyR2UploadTicket(
  config: R2MediaConfig, token: string | undefined, path: string, ownerId: string,
): Ticket {
  if (!token || token.length > 4096) throw new Error("A valid upload authorization is required");
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) {
    throw new Error("Upload authorization is invalid");
  }
  const actual = Buffer.from(parts[1], "base64url");
  const expected = signature(parts[0]);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Upload authorization is invalid");
  const ticket: Ticket = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  if (ticket.v !== 1 || ticket.path !== path || ticket.ownerId !== ownerId
    || ticket.scope !== scope(config) || !Number.isFinite(ticket.expiresAt)
    || ticket.expiresAt < Date.now() || ticket.expiresAt > Date.now() + 30 * 60_000
    || !Number.isSafeInteger(ticket.size) || ticket.size < 1 || typeof ticket.contentType !== "string") {
    throw new Error("Upload authorization has expired or belongs to another upload");
  }
  return ticket;
}
