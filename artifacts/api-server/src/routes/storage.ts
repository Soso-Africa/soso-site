import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  FinalizeStorageUploadBody,
  FinalizeStorageUploadResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { CloudinaryStorageService, MediaNotFoundError } from "../lib/cloudinary-storage";
import {
  detectMediaContentType,
  IMAGE_MEDIA_TYPES,
  MAX_HERO_VIDEO_BYTES,
  MAX_UPLOADED_IMAGE_BYTES,
  parseMediaByteRange,
  mediaMimeTypeForPath,
  VIDEO_MEDIA_TYPES,
} from "../lib/media-files";

const router: IRouter = Router();
const storage = new CloudinaryStorageService();
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,159}$/;
export { detectMediaContentType, parseMediaByteRange } from "../lib/media-files";

export function storageDiagnosticTokenMatches(expected: string, supplied: string): boolean {
  return expected.length >= 32
    && supplied.length === expected.length
    && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function inspectionIssue(
  relativePath: string,
  inspected: Awaited<ReturnType<CloudinaryStorageService["inspectUploadedMedia"]>>,
): string | null {
  const expectedType = mediaMimeTypeForPath(relativePath);
  const maxBytes = expectedType?.startsWith("video/") ? MAX_HERO_VIDEO_BYTES : MAX_UPLOADED_IMAGE_BYTES;
  if (
    !expectedType
    || inspected.contentType !== expectedType
    || inspected.declaredContentType !== expectedType
  ) return "Stored media bytes, MIME type, and file extension do not match";
  if (
    !Number.isSafeInteger(inspected.size)
    || inspected.size < 1
    || inspected.size > maxBytes
  ) return `Stored media exceeds its ${maxBytes} byte publishing budget`;
  return null;
}

router.post(
  "/storage/uploads/request-url",
  requireStaff,
  requireStaffRoles("owner", "administrator", "editor"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    const contentType = parsed.success ? parsed.data.contentType : "";
    const maxBytes = VIDEO_MEDIA_TYPES.has(contentType) ? MAX_HERO_VIDEO_BYTES : MAX_UPLOADED_IMAGE_BYTES;
    if (
      !parsed.success ||
      (!IMAGE_MEDIA_TYPES.has(parsed.data.contentType) && !VIDEO_MEDIA_TYPES.has(parsed.data.contentType)) ||
      !Number.isInteger(parsed.data.size) ||
      parsed.data.size < 1 ||
      parsed.data.size > maxBytes ||
      !SAFE_FILENAME.test(parsed.data.name) ||
      parsed.data.name === "." ||
      parsed.data.name === ".."
    ) {
      res.status(400).json({
        error: "Choose a JPEG, PNG, WebP, or GIF image up to 12 MB, or an MP4 or WebM video up to 8 MB, with a safe filename",
      });
      return;
    }
    try {
      const result = await storage.createMediaUpload(parsed.data.name, parsed.data.contentType);
      res.json(RequestUploadUrlResponse.parse(result));
    } catch (error) {
      req.log.error({ err: error }, "Failed to create Cloudinary upload authorization");
      res.status(500).json({ error: "Failed to create upload URL" });
    }
  },
);

router.post(
  "/storage/uploads/finalize",
  requireStaff,
  requireStaffRoles("owner", "administrator", "editor"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = FinalizeStorageUploadBody.safeParse(req.body);
    const objectPath = parsed.success ? parsed.data.objectPath : "";
    const uploadedPrefix = "/api/storage/objects/";
    if (!objectPath.startsWith(uploadedPrefix)) {
      res.status(400).json({ error: "A valid uploaded media path is required" });
      return;
    }
    const relativePath = objectPath.slice(uploadedPrefix.length);
    try {
      const inspected = await storage.inspectUploadedMedia(relativePath);
      if (inspectionIssue(relativePath, inspected)) {
        await storage.deleteUploadedMedia(relativePath);
        res.status(400).json({ error: "Uploaded media did not pass SOSO publishing checks" });
        return;
      }
      res.json(FinalizeStorageUploadResponse.parse({ objectPath }));
    } catch (error) {
      if (!(error instanceof MediaNotFoundError)) {
        req.log.error({ err: error }, "Failed to finalize Cloudinary upload");
      }
      res.status(400).json({ error: "Uploaded media could not be verified" });
    }
  },
);

router.post("/storage/diagnostic", async (req: Request, res: Response): Promise<void> => {
  const expected = process.env.STAFF_BOOTSTRAP_TOKEN ?? "";
  const supplied = req.header("x-soso-bootstrap-token") ?? "";
  if (!storageDiagnosticTokenMatches(expected, supplied)) {
    res.status(403).json({ error: "Storage diagnostic authorization failed" });
    return;
  }
  try {
    const inspected = await storage.runDiagnostic();
    const issue = inspectionIssue("uploads/storage-diagnostic.png", inspected);
    if (issue) {
      res.status(500).json({ error: "Cloudinary diagnostic media failed verification" });
      return;
    }
    res.json({
      status: "ok",
      contentType: inspected.contentType,
      size: inspected.size,
      cleanedUp: true,
    });
  } catch (error) {
    req.log.error({ err: error }, "Cloudinary storage diagnostic failed");
    res.status(503).json({ error: "Cloudinary storage diagnostic failed" });
  }
});

router.get("/storage/objects/*path", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.path;
    const relativePath = Array.isArray(raw) ? raw.join("/") : raw;
    const inspected = await storage.inspectUploadedMedia(relativePath);
    const issue = inspectionIssue(relativePath, inspected);
    if (issue) {
      res.status(415).json({ error: issue });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.redirect(302, storage.uploadedDeliveryUrl(relativePath));
  } catch (error) {
    if (error instanceof MediaNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Failed to resolve uploaded media");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.filePath;
    const relativePath = Array.isArray(raw) ? raw.join("/") : raw;
    const inspected = await storage.inspectPublicMedia(relativePath);
    const issue = inspectionIssue(relativePath, inspected);
    if (issue) {
      res.status(415).json({ error: issue });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.redirect(302, storage.publicDeliveryUrl(relativePath));
  } catch (error) {
    if (error instanceof MediaNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Failed to resolve public media");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

export default router;