import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { PutImportReviewBody, CleanupImportUploadParams, CleanupImportUploadResponse } from "@workspace/api-zod";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { getImportReview, importLock, listImportUploads, mediaLock, reviewSchema, sessions, uploads } from "../lib/catalogue-import-ledger";
import { cleanupImportUpload } from "../lib/catalogue-import-cleanup";
import { createMediaStorageService } from "../lib/media-storage";

const router = Router();
router.use("/storage/import-ledger", requireStaff, requireStaffRoles("owner", "administrator", "editor"));
router.use("/storage/import-review", requireStaff, requireStaffRoles("owner", "administrator", "editor"));
router.use(["/storage/import-ledger", "/storage/import-review"], (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store"); next();
});
router.get("/storage/import-ledger", async (req, res) => {
  try { res.json(await listImportUploads(req.staff!.id)); }
  catch { res.status(503).json({ error: "Upload ledger unavailable. Uploading is paused to protect recovery." }); }
});
router.post("/storage/import-ledger/:id/cleanup", async (req, res) => {
  const parsed = CleanupImportUploadParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "An exact ledger identity is required" }); return; }
  try {
    const row = await cleanupImportUpload(req.staff!.id, parsed.data.id, createMediaStorageService());
    res.json(CleanupImportUploadResponse.parse({ ...row, createdAt: row.createdAt.toISOString() }));
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Cleanup withheld" });
  }
});
router.get("/storage/import-review", async (req, res) => {
  try { res.json(await getImportReview(req.staff!.id)); }
  catch { res.status(503).json({ error: "Saved review unavailable" }); }
});
router.put("/storage/import-review", async (req, res) => {
  const body = PutImportReviewBody.safeParse(req.body);
  const review = body.success && body.data.review !== null ? reviewSchema.safeParse(body.data.review) : null;
  if (!body.success || (review && !review.success) || JSON.stringify(req.body).length > 2_000_000) {
    res.status(400).json({ error: "A bounded import review is required" }); return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await importLock(tx, req.staff!.id);
      await mediaLock(tx);
      const [current] = await tx.select().from(sessions).where(eq(sessions.ownerId, req.staff!.id));
      if ((current?.version ?? 0) !== body.data.version) throw new Error("Review changed on another device. Reopen the importer before continuing.");
      const value = review?.success ? review.data : null;
      const paths = new Set(Object.values(value?.groups ?? {}).flatMap((g) => g.photos.flatMap((p) => p.path ? [p.path] : [])));
      for (const path of paths) {
        const [owned] = await tx.select({ id: uploads.id }).from(uploads).where(and(
          eq(uploads.ownerId, req.staff!.id), eq(uploads.path, path), eq(uploads.status, "complete"),
        ));
        if (!owned) throw new Error("Review contains an upload without a current owned receipt. Recheck the photos.");
      }
      const version = body.data.version + 1;
      await tx.insert(sessions).values({ ownerId: req.staff!.id, review: value, version })
        .onConflictDoUpdate({ target: sessions.ownerId, set: { review: value, version, updatedAt: new Date() } });
      return { version, review: value };
    });
    res.json(result);
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Review save not confirmed" });
  }
});
export default router;
