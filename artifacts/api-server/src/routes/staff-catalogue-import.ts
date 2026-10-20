import { Router, type IRouter } from "express";
import { ScanCatalogueImportSheetBody, ScanCatalogueImportSheetResponse, GetCatalogueImportDriveFolderResponse } from "@workspace/api-zod";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { parseCatalogueSpreadsheet } from "../lib/catalogue-import-sheet";
import { CatalogueDriveError, readDrivePhoto, scanDriveFolder } from "../lib/catalogue-import-drive";
import googleDriveRouter from "./staff-catalogue-drive-oauth";
import { importDriveRead } from "../lib/catalogue-drive-oauth";

const router: IRouter = Router();
router.use("/staff/catalogue-import", requireStaff, requireStaffRoles("owner", "administrator", "editor"));
router.use("/staff/catalogue-import", (_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
router.use(googleDriveRouter);
let activePhotoReads = 0, activeSheetReads = 0;

router.post("/staff/catalogue-import/sheet", async (req, res): Promise<void> => {
  const input = ScanCatalogueImportSheetBody.safeParse(req.body);
  if (!input.success || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.data.contentBase64)) {
    res.status(400).json({ error: "Provide a filename and valid base64 Excel/CSV content." }); return;
  }
  if (activeSheetReads >= 2) { res.status(429).json({ error: "Two sheets are being read. Retry shortly." }); return; }
  activeSheetReads++;
  try {
    const result = await parseCatalogueSpreadsheet(input.data.name, Buffer.from(input.data.contentBase64, "base64"));
    res.json(ScanCatalogueImportSheetResponse.parse(result));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "The spreadsheet could not be read." });
  } finally { activeSheetReads--; }
});

router.get("/staff/catalogue-import/drive/:folderId", async (req, res): Promise<void> => {
  try { res.json(GetCatalogueImportDriveFolderResponse.parse(await scanDriveFolder(String(req.params.folderId), await importDriveRead(req, String(req.params.folderId))))); }
  catch (error) {
    res.status(error instanceof CatalogueDriveError ? error.status : 502).json({ error: error instanceof CatalogueDriveError ? error.message : "Connected Drive is unavailable. Use local photo selection or retry in the workspace." });
  }
});

router.get("/staff/catalogue-import/drive/:folderId/files/:fileId", async (req, res): Promise<void> => {
  if (activePhotoReads >= 2) { res.status(429).json({ error: "Two photos are downloading. Retry shortly." }); return; }
  activePhotoReads++;
  try {
    const photo = await readDrivePhoto(String(req.params.folderId), String(req.params.fileId), await importDriveRead(req, String(req.params.folderId)));
    res.setHeader("Content-Type", photo.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "attachment");
    res.send(photo.bytes);
  } catch (error) {
    res.status(error instanceof CatalogueDriveError ? error.status : 502).json({ error: error instanceof CatalogueDriveError ? error.message : "Connected Drive download failed. Retry this photo." });
  } finally { activePhotoReads--; }
});

export default router;
