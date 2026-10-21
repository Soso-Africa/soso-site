import { eq, inArray, ne, sql } from "drizzle-orm";
import { db, staffUsersTable, siteContentRevisionsTable } from "@workspace/db";
import { z } from "zod/v4";
import { cleanupImportUpload } from "./catalogue-import-cleanup";
import { mediaLock, sessions, uploads } from "./catalogue-import-ledger";
import type { MediaStorage } from "./media-storage-types";

export const VerificationImportManifest = z.object({
  schema: z.string().regex(/^soso_api_test_[a-f0-9]{32}$/),
  runId: z.string().uuid(),
  uploads: z.array(z.object({
    id: z.string().uuid(), owner_id: z.string().uuid(), source_identity: z.string(),
    source_version: z.string(), hash: z.string(), path: z.string(),
  })).min(1),
  draftRevisions: z.array(z.object({ id: z.string().uuid(), content_hash: z.string() })),
});

/** Maintenance for one retained disposable verification schema, never public.
 * Its normal Staff ownership records and the common fresh reference checker
 * remain authoritative; a file of paths is not itself deletion authority.
 */
export async function recoverVerificationImports(
  input: unknown,
  storage: MediaStorage,
  discardVerificationDraftHistory: boolean,
) {
  const manifest = VerificationImportManifest.parse(input);
  const current = await db.execute<{ name: string }>(sql`select current_schema() as name`);
  if (current.rows[0]?.name !== manifest.schema) throw new Error("Recovery must use the exact retained isolated schema");
  const guard = await db.execute<{ run_id: string }>(sql`select run_id from import_verification_guard`);
  if (guard.rows.length !== 1 || guard.rows[0]?.run_id !== manifest.runId) throw new Error("Isolated verification identity does not match");
  const rows = await db.select().from(uploads);
  for (const saved of manifest.uploads) {
    const row = rows.find((r) => r.id === saved.id);
    if (!row || row.ownerId !== saved.owner_id || row.path !== saved.path || row.hash !== saved.hash
      || row.sourceIdentity !== saved.source_identity || row.sourceVersion !== saved.source_version) {
      throw new Error("Recorded upload identity changed; cleanup withheld");
    }
  }
  const active = rows.filter((r) => r.status !== "deleted");
  if (active.some((r) => !manifest.uploads.some((saved) => saved.id === r.id))) {
    throw new Error("Retained ledger contains additional uploads; preserve and refresh its recovery manifest");
  }
  if (!active.length) return { state: "complete", deleted: 0, remaining: 0 } as const;
  const owners = await db.select().from(staffUsersTable).where(inArray(staffUsersTable.id, [...new Set(active.map((r) => r.ownerId))]));
  if (active.some((r) => !owners.some((s) => s.id === r.ownerId && s.isActive && ["owner", "administrator", "editor"].includes(s.role)))) {
    throw new Error("Original Staff upload ownership is unavailable or no longer authorized");
  }
  const notBefore = Math.max(...active.map((r) => r.authorizedAt.getTime())) + 2 * 60 * 60_000;
  if (Date.now() < notBefore) {
    return { state: "waiting", notBefore: new Date(notBefore).toISOString(), remaining: active.length } as const;
  }
  if (discardVerificationDraftHistory) {
    await db.transaction(async (tx) => {
      await mediaLock(tx);
      // Only exact, frozen verification revision identities may be discarded.
      // Published content, current drafts and other history remain references.
      for (const recorded of manifest.draftRevisions) {
        const [revision] = await tx.select().from(siteContentRevisionsTable).where(eq(siteContentRevisionsTable.id, recorded.id));
        if (!revision) continue; // repeat-safe after a partially finished recovery
        if (revision.contentHash !== recorded.content_hash || revision.contentKey !== "platform" || revision.event !== "draft_saved"
          || !owners.some((s) => s.clerkUserId === revision.createdByClerkUserId)
          || !active.some((r) => JSON.stringify(revision.snapshot).includes(r.path))) {
          throw new Error("Verification draft history changed; discard withheld");
        }
        await tx.delete(siteContentRevisionsTable).where(eq(siteContentRevisionsTable.id, revision.id));
      }
      // A saved import review is disposable only with the explicit discard flag.
      for (const owner of owners) {
        await tx.update(sessions).set({ review: null, version: sql`${sessions.version} + 1`, updatedAt: new Date() })
          .where(eq(sessions.ownerId, owner.id));
      }
    });
  }
  let deleted = 0;
  const blocked: string[] = [];
  for (const row of active) {
    try {
      await cleanupImportUpload(row.ownerId, row.id, storage);
      deleted++;
    } catch { blocked.push(row.id); }
  }
  const remaining = await db.select({ id: uploads.id }).from(uploads).where(ne(uploads.status, "deleted"));
  return { state: remaining.length ? "blocked" : "complete", deleted, remaining: remaining.length, blocked } as const;
}
