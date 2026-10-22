import { Router, type IRouter } from "express";
import { z } from "zod";
import { CatalogueDriveError } from "../lib/catalogue-import-drive";
import { beginDriveAuthorization, completeDriveAuthorization, disconnectDrive, driveConnectionStatus, listDriveFolders, selectDriveFolder } from "../lib/catalogue-drive-oauth";

// Mounted behind the importer's active Staff session and editor-or-higher checks.
const router: IRouter = Router();
const base = "/staff/catalogue-import/google";
function failure(res: import("express").Response, error: unknown) {
  res.status(error instanceof CatalogueDriveError ? error.status : 502).json({
    error: error instanceof CatalogueDriveError ? error.message : "Google Drive is unavailable. Retry, reconnect, or use local photo folders.",
  });
}
router.get(`${base}/status`, async (req, res) => {
  try { res.json(await driveConnectionStatus(req)); } catch (error) { failure(res, error); }
});
router.post(`${base}/authorize`, async (req, res) => {
  try { res.json(await beginDriveAuthorization(req)); } catch (error) { failure(res, error); }
});
router.get(`${base}/callback`, async (req, res) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  try {
    await completeDriveAuthorization(req);
    res.redirect(303, "/staff?platformSection=catalogue&drive=connected#platform");
  } catch {
    // Never reflect Google's code, state, tokens, or error_description in a page.
    res.redirect(303, "/staff?platformSection=catalogue&drive=failed#platform");
  }
});
router.post(`${base}/disconnect`, async (req, res) => {
  try { res.json(await disconnectDrive(req)); } catch (error) { failure(res, error); }
});
router.get(`${base}/folders`, async (req, res) => {
  const search = z.string().max(100).safeParse(req.query.search ?? "");
  if (!search.success) { res.status(400).json({ error: "Provide a folder search of 100 characters or fewer." }); return; }
  try { res.json(await listDriveFolders(req, search.data)); } catch (error) { failure(res, error); }
});
router.post(`${base}/folders`, async (req, res) => {
  const input = z.object({ folderId: z.string().regex(/^[A-Za-z0-9_-]{10,160}$/) }).strict().safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Select a valid Drive folder." }); return; }
  try { res.json(await selectDriveFolder(req, input.data.folderId)); } catch (error) { failure(res, error); }
});
export default router;
