import { auditLogsTable, db, siteContentTable } from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { CloudinaryStorageService, MediaNotFoundError } from "./cloudinary-storage";

export const PLATFORM_CONTENT_MEDIA_LOCK = "soso-platform-content-media";
const MANAGED_UPLOAD_PREFIX = "/api/storage/objects/";
const cleanupActions = [
  "platform_media.cleanup_queued",
  "platform_media.cleanup_failed",
  "platform_media.cleanup_deferred",
] as const;

type CollectionCover = { src?: unknown };
type Collection = { cover?: CollectionCover; mobileCover?: CollectionCover };

function managedUploadPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(MANAGED_UPLOAD_PREFIX)) return null;
  const relativePath = value.slice(MANAGED_UPLOAD_PREFIX.length);
  return relativePath.startsWith("uploads/") ? relativePath : null;
}

export function collectionCoverUploadPaths(content: unknown): Set<string> {
  const paths = new Set<string>();
  if (!content || typeof content !== "object" || Array.isArray(content)) return paths;
  const collections = (content as { collections?: unknown }).collections;
  if (!Array.isArray(collections)) return paths;
  for (const collection of collections as Collection[]) {
    for (const cover of [collection?.cover, collection?.mobileCover]) {
      const path = managedUploadPath(cover?.src);
      if (path) paths.add(path);
    }
  }
  return paths;
}

export function replacedCollectionCoverUploadPaths(previous: unknown, next: unknown): string[] {
  const nextPaths = collectionCoverUploadPaths(next);
  return [...collectionCoverUploadPaths(previous)].filter((path) => !nextPaths.has(path)).sort();
}

export function contentReferencesManagedUpload(content: unknown, relativePath: string): boolean {
  const objectPath = `${MANAGED_UPLOAD_PREFIX}${relativePath}`;
  const visit = (value: unknown): boolean => {
    if (value === objectPath) return true;
    if (Array.isArray(value)) return value.some(visit);
    if (!value || typeof value !== "object") return false;
    return Object.values(value as Record<string, unknown>).some(visit);
  };
  return visit(content);
}

export async function queueCollectionCoverCleanup(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  paths: string[],
  actorClerkUserId: string,
): Promise<void> {
  if (paths.length === 0) return;
  await tx.insert(auditLogsTable).values(paths.map((path) => ({
    actorClerkUserId,
    action: "platform_media.cleanup_queued",
    entityType: "platform_media",
    entityId: path,
    metadata: { path, source: "collection_cover_replaced" },
  })));
}

async function pendingCleanupPaths(): Promise<Array<{ path: string; actorClerkUserId: string }>> {
  const rows = await db.select({
    action: auditLogsTable.action,
    path: auditLogsTable.entityId,
    actorClerkUserId: auditLogsTable.actorClerkUserId,
  }).from(auditLogsTable).where(andCleanupAction());
  const pending = new Map<string, string>();
  const deleted = new Set<string>();
  for (const row of rows) {
    if (!row.path) continue;
    if (row.action === "platform_media.cleanup_deleted") deleted.add(row.path);
    else pending.set(row.path, row.actorClerkUserId);
  }
  for (const path of deleted) pending.delete(path);
  return [...pending].map(([path, actorClerkUserId]) => ({ path, actorClerkUserId }));
}

function andCleanupAction() {
  return inArray(auditLogsTable.action, [...cleanupActions, "platform_media.cleanup_deleted"]);
}

export type ManagedMediaCleanupItem = {
  path: string;
  status: "queued" | "deferred" | "failed";
  updatedAt: Date;
  reason: string | null;
};

export async function listPendingCollectionCoverCleanup(): Promise<ManagedMediaCleanupItem[]> {
  const rows = await db.select({
    id: auditLogsTable.id,
    action: auditLogsTable.action,
    path: auditLogsTable.entityId,
    metadata: auditLogsTable.metadata,
    createdAt: auditLogsTable.createdAt,
  }).from(auditLogsTable)
    .where(andCleanupAction())
    .orderBy(desc(auditLogsTable.createdAt), desc(auditLogsTable.id));

  const latestByPath = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    if (row.path && !latestByPath.has(row.path)) latestByPath.set(row.path, row);
  }

  return [...latestByPath.values()].flatMap((row) => {
    if (!row.path || row.action === "platform_media.cleanup_deleted") return [];
    const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {};
    const status = row.action.replace("platform_media.cleanup_", "");
    if (status !== "queued" && status !== "deferred" && status !== "failed") return [];
    return [{
      path: row.path,
      status,
      updatedAt: row.createdAt,
      reason: typeof metadata.reason === "string" ? metadata.reason : null,
    }];
  });
}

export async function processPendingCollectionCoverCleanup(
  storage = new CloudinaryStorageService(),
): Promise<{ deleted: number; deferred: number; failed: number }> {
  const summary = { deleted: 0, deferred: 0, failed: 0 };
  for (const pending of await pendingCleanupPaths()) {
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
      const [deleted] = await tx.select({ id: auditLogsTable.id })
        .from(auditLogsTable)
        .where(and(
          eq(auditLogsTable.entityType, "platform_media"),
          eq(auditLogsTable.entityId, pending.path),
          eq(auditLogsTable.action, "platform_media.cleanup_deleted"),
        ))
        .limit(1);
      if (deleted) return "already_deleted" as const;
      const [platform] = await tx.select({
        draft: siteContentTable.draft,
        published: siteContentTable.published,
      }).from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
      if (
        contentReferencesManagedUpload(platform?.draft, pending.path)
        || contentReferencesManagedUpload(platform?.published, pending.path)
      ) {
        await tx.insert(auditLogsTable).values({
          actorClerkUserId: pending.actorClerkUserId,
          action: "platform_media.cleanup_deferred",
          entityType: "platform_media",
          entityId: pending.path,
          metadata: { path: pending.path, reason: "still_referenced" },
        });
        return "deferred" as const;
      }
      try {
        await storage.deleteUploadedMedia(pending.path);
        await tx.insert(auditLogsTable).values({
          actorClerkUserId: pending.actorClerkUserId,
          action: "platform_media.cleanup_deleted",
          entityType: "platform_media",
          entityId: pending.path,
          metadata: { path: pending.path },
        });
        return "deleted" as const;
      } catch (error) {
        if (error instanceof MediaNotFoundError) {
          await tx.insert(auditLogsTable).values({
            actorClerkUserId: pending.actorClerkUserId,
            action: "platform_media.cleanup_deleted",
            entityType: "platform_media",
            entityId: pending.path,
            metadata: { path: pending.path, alreadyMissing: true },
          });
          return "deleted" as const;
        }
        await tx.insert(auditLogsTable).values({
          actorClerkUserId: pending.actorClerkUserId,
          action: "platform_media.cleanup_failed",
          entityType: "platform_media",
          entityId: pending.path,
          metadata: {
            path: pending.path,
            error: error instanceof Error ? error.message.slice(0, 500) : "Unknown cleanup failure",
          },
        });
        return "failed" as const;
      }
    });
    if (outcome === "deleted") summary.deleted += 1;
    if (outcome === "deferred") summary.deferred += 1;
    if (outcome === "failed") summary.failed += 1;
  }
  return summary;
}