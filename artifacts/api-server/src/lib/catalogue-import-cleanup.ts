import { and, eq, sql } from "drizzle-orm";
import { db, siteContentTable, siteContentRevisionsTable, journalPostsTable, journalPostRevisionsTable } from "@workspace/db";
import { mediaLock, uploads, sessions } from "./catalogue-import-ledger";
import type { MediaStorage } from "./media-storage-types";
import { MediaNotFoundError } from "./cloudinary-storage";

export async function cleanupImportUpload(owner: string, id: string, storage: MediaStorage) {
  return db.transaction(async (tx) => {
    await mediaLock(tx);
    const [row] = await tx.select().from(uploads).where(and(eq(uploads.ownerId, owner), eq(uploads.id, id))).for("update");
    if (!row) throw new Error("Owned import upload not found");
    if (row.status === "deleted") return row;
    // Signed upload grants can still write after a delete. Let all grants expire
    // (Cloudinary's signed timestamp window included) before allowing reclamation.
    if (Date.now() - row.authorizedAt.getTime() < 2 * 60 * 60_000) {
      throw new Error("Upload authorization may still be active. Cleanup is available two hours after authorization.");
    }
    const found = await tx.execute<{ referenced: boolean }>(sql`
      select exists(
        select 1 from ${siteContentTable}
          where strpos(coalesce(${siteContentTable.draft}::text, ''), ${row.path}) > 0
             or strpos(coalesce(${siteContentTable.published}::text, ''), ${row.path}) > 0
        union all select 1 from ${siteContentRevisionsTable}
          where strpos(${siteContentRevisionsTable.snapshot}::text, ${row.path}) > 0
        union all select 1 from ${journalPostsTable}
          where strpos(coalesce(${journalPostsTable.coverImageUrl}, ''), ${row.path}) > 0
             or strpos(coalesce(${journalPostsTable.body}, ''), ${row.path}) > 0
        union all select 1 from ${journalPostRevisionsTable}
          where strpos(${journalPostRevisionsTable.snapshot}::text, ${row.path}) > 0
        union all select 1 from ${sessions}
          where strpos(${sessions.review}::text, ${row.path}) > 0
      ) as referenced
    `);
    if (found.rows[0]?.referenced !== false) throw new Error("Upload is still referenced by content, history or an import review. Cleanup withheld.");
    try {
      const relative = row.path.slice("/api/storage/objects/".length);
      if (!/^uploads\/[A-Za-z0-9/_-]+\.[A-Za-z0-9]+$/.test(relative)) throw new Error("Invalid recorded path");
      if (storage.provider === "r2") {
        if (!storage.deleteUnreferencedUploadedMedia) throw new Error("Safe cleanup unavailable");
        await storage.deleteUnreferencedUploadedMedia(relative);
      } else await storage.deleteUploadedMedia(relative);
    } catch (error) {
      if (!(error instanceof MediaNotFoundError)) throw error;
    }
    const [deleted] = await tx.update(uploads).set({ status: "deleted" }).where(eq(uploads.id, row.id)).returning();
    return deleted;
  });
}
