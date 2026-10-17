import { db, journalPostsTable, siteContentTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { PLATFORM_CONTENT_MEDIA_LOCK } from "./collection-cover-cleanup";
import { managedMediaReferences, type ManagedMediaReference } from "./managed-media-references";
import type { CommittedMediaApproval } from "./committed-media-delivery";

async function isPublished(reference: ManagedMediaReference, connection: typeof db): Promise<boolean> {
  const needle = `/api/storage/${reference.area === "uploads" ? "objects" : "public-objects"}/${reference.path}`;
  const identity = `${reference.area}/${reference.path}`;
  const rows = await connection.select({ published: siteContentTable.published })
    .from(siteContentTable)
    .where(sql`strpos(coalesce(${siteContentTable.published}::text, ''), ${needle}) > 0`).limit(10);
  if (rows.some((row) => managedMediaReferences(row.published).has(identity))) return true;
  const posts = await connection.select({
    cover: journalPostsTable.coverImageUrl, body: journalPostsTable.body,
  }).from(journalPostsTable).where(and(
    eq(journalPostsTable.status, "published"),
    sql`(strpos(coalesce(${journalPostsTable.coverImageUrl}, ''), ${needle}) > 0
      or strpos(coalesce(${journalPostsTable.body}, ''), ${needle}) > 0)`,
  )).limit(50);
  return posts.some((post) => managedMediaReferences(post).has(identity));
}

/**
 * This runs only from a subsequent delivery request, never with a publication's
 * transaction handle. The advisory lock waits for publication COMMIT/ROLLBACK;
 * the fresh check sees only committed published columns, not drafts/revisions.
 * Holding the same lock through copying also excludes concurrent cleanup.
 */
export const withCommittedMediaApproval: CommittedMediaApproval = async (reference, promote) => {
  // Random missing/private URLs must not queue behind the publication lock.
  if (!await isPublished(reference, db)) return false;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
    // Drizzle transactions expose the same read methods, without pool methods.
    if (!await isPublished(reference, tx as unknown as typeof db)) return false;
    await promote();
    return true;
  });
};
