import { and, eq, ne, sql } from "drizzle-orm";
import { db, catalogueImportUploadsTable as uploads, catalogueImportSessionsTable as sessions } from "@workspace/db";
import { z } from "zod/v4";
import { GetImportLedgerResponse, GetImportReviewResponse } from "@workspace/api-zod";
import { PLATFORM_CONTENT_MEDIA_LOCK } from "./collection-cover-cleanup";

export const importLock = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], owner: string) => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`soso-import:${owner}`}))`);
};
export const mediaLock = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
};
export const ownedUpload = (owner: string, path: string) => and(eq(uploads.ownerId, owner), eq(uploads.path, path));

export async function listImportUploads(owner: string) {
  const rows = await db.select().from(uploads).where(and(eq(uploads.ownerId, owner), ne(uploads.status, "deleted")));
  return GetImportLedgerResponse.parse(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
}

// An explicit allow-list prevents accidentally persisting upload authorizations,
// preview URLs, file bytes or future client-only fields in a review snapshot.
const noUrl = (s: string) => !/https?:\/\/|(?:X-Amz-|[?&](?:token|signature|credential)=)/i.test(s);
const text = z.string().max(4000).refine(noUrl, "Do not store URLs or authorization material in the import review");
const short = z.string().max(256).refine(noUrl);
const path = z.string().regex(/^\/api\/storage\/objects\/uploads\/[A-Za-z0-9/_-]+\.[A-Za-z0-9]+$/);
const photo = z.object({
  key: short, name: short, source: z.enum(["drive", "local"]), folderId: short.optional(),
  driveFileId: short.optional(), size: z.number().int().nonnegative(), mimeType: short,
  md5: short.optional(), modifiedTime: short.optional(), hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  path: path.optional(), included: z.boolean(), colourId: short.optional(),
});
export const reviewSchema = z.object({
  sheet: z.object({
    sheetName: short,
    rows: z.array(z.object({
      rowNumber: z.number().int(), slug: short, name: short, department: short, category: short,
      driveFolderId: short.optional(),
      // Keep the folder identity, not its URL (which may carry access parameters).
      fields: z.record(short, z.string().max(4000)).transform((fields) => Object.fromEntries(
        Object.entries(fields).filter(([key, value]) => !/url|link|token|secret|password|credential/i.test(key) && noUrl(value)),
      )),
      warnings: z.array(text).max(100), photoNames: z.array(short).max(100),
    })).max(1000),
    warnings: z.array(text).max(100),
  }),
  groups: z.record(z.string().regex(/^\d+$/), z.object({
    rowNumber: z.number().int(), department: z.enum(["", "men", "women", "accessories"]),
    category: short, accepted: z.boolean(), coverKey: short.nullable(),
    photos: z.array(photo).max(40),
    colours: z.array(z.object({ id: short, label: short, hex: short })).max(16),
    fabric: text, fit: text, sizes: z.array(short).max(100), rights: text,
    scan: z.object({
      status: z.enum(["idle", "scanning", "done", "failed", "unavailable"]),
      folderName: short.optional(), warnings: z.array(text).max(100).optional(),
    }),
    folderAck: z.boolean().optional(), savedAt: short.optional(),
  })),
  selected: z.array(z.number().int()).max(1000),
});

export async function getImportReview(owner: string) {
  const [row] = await db.select().from(sessions).where(eq(sessions.ownerId, owner));
  return GetImportReviewResponse.parse({ version: row?.version ?? 0, review: row?.review ?? null });
}

export { uploads, sessions };
