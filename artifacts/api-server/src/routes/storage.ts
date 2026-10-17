import { Router, type IRouter, type Request, type Response } from "express";
import { RESPONSIVE_PHOTO_WIDTHS } from "../lib/responsive-media";
import {
  FinalizeStorageUploadBody,
  FinalizeStorageUploadResponse,
  ListPendingMediaCleanupResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  RetryPendingMediaCleanupResponse,
  GetStaffCloudinaryUsageResponse,
  RequestMediaRenditionUploadsBody,
  RequestMediaRenditionUploadsResponse,
  GetStaffMediaStorageStatusResponse,
} from "@workspace/api-zod";
import { getCloudinaryUsage } from "../lib/cloudinary-usage";
import { getR2StorageUsage } from "../lib/r2-storage-usage";
import { resolveCommittedMediaDelivery } from "../lib/committed-media-delivery";
import { withCommittedMediaApproval } from "../lib/committed-media-approval";
import { R2StorageService } from "../lib/r2-storage";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { MediaNotFoundError } from "../lib/cloudinary-storage";
import { createMediaStorageService } from "../lib/media-storage";
import type { MediaInspection } from "../lib/media-storage-types";
import {
  listPendingCollectionCoverCleanup,
  processPendingCollectionCoverCleanup,
} from "../lib/collection-cover-cleanup";
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
const storage = createMediaStorageService();
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,159}$/;
export { detectMediaContentType, parseMediaByteRange } from "../lib/media-files";

router.get("/storage/status", requireStaff, requireStaffRoles("owner", "administrator", "editor"),
  async (_req: Request, res: Response): Promise<void> => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      res.json(GetStaffMediaStorageStatusResponse.parse({
        provider: storage.provider, r2Usage: storage instanceof R2StorageService ? await getR2StorageUsage(storage) : null,
      }));
    } catch { res.status(503).json({ error: "Media storage status could not be loaded safely" }); }
  });

router.get("/storage/usage", requireStaff, requireStaffRoles("owner", "administrator", "editor"),
  async (_req: Request, res: Response): Promise<void> => {
    res.setHeader("Cache-Control", "private, no-store");
    if (storage.provider !== "cloudinary") {
      res.status(409).json({ error: "Cloudinary is not the active media provider. Reload Staff for current storage status." });
      return;
    }
    try {
      res.json(GetStaffCloudinaryUsageResponse.parse(await getCloudinaryUsage()));
    } catch {
      // Fail closed if durable refresh coordination is unavailable.
      res.status(503).json({ error: "Cloudinary usage cannot be loaded safely right now. Try again later." });
    }
  });

function inspectionIssue(
  relativePath: string,
  inspected: MediaInspection,
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
      const result = await storage.createMediaUpload(parsed.data.name, parsed.data.contentType, {
        size: parsed.data.size, ownerId: req.staff!.id,
      });
      res.json(RequestUploadUrlResponse.parse(result));
    } catch (error) {
      req.log.error({ err: error }, "Failed to create managed media upload authorization");
      res.status(500).json({ error: "Failed to create upload URL" });
    }
  },
);

router.get(
  "/storage/uploads/cleanup-pending",
  requireStaff,
  requireStaffRoles("owner", "administrator", "editor"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(ListPendingMediaCleanupResponse.parse(await listPendingCollectionCoverCleanup()));
    } catch (error) {
      req.log.error({ err: error }, "Failed to list pending managed media cleanup");
      res.status(500).json({ error: "Pending media cleanup could not be loaded" });
    }
  },
);

router.post(
  "/storage/uploads/renditions/request-urls",
  requireStaff,
  requireStaffRoles("owner", "administrator", "editor"),
  async (req: Request, res: Response): Promise<void> => {
    res.setHeader("Cache-Control", "private, no-store");
    if (!storage.createRenditionUploads) {
      res.status(409).json({ error: "The active storage provider does not accept separate responsive uploads" });
      return;
    }
    const parsed = RequestMediaRenditionUploadsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Provide the owned upload authorization and four bounded responsive copies" });
      return;
    }
    try {
      const signed = await storage.createRenditionUploads(
        parsed.data.objectPath, parsed.data.finalizeToken, req.staff!.id, parsed.data.renditions,
      );
      res.json(RequestMediaRenditionUploadsResponse.parse(signed));
    } catch (error) {
      req.log.warn({ err: error }, "Responsive upload authorization refused");
      res.status(400).json({ error: "The source photo or responsive upload metadata could not be verified" });
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
      await storage.verifyFinalization?.(objectPath, parsed.success ? parsed.data.finalizeToken : undefined, req.staff!.id);
      const inspected = await storage.inspectUploadedMedia(relativePath);
      if (inspectionIssue(relativePath, inspected)) {
        await storage.deleteUploadedMedia(relativePath);
        res.status(400).json({ error: "Uploaded media did not pass SOSO publishing checks" });
        return;
      }
      await storage.finalizeRenditions?.(objectPath, parsed.success ? parsed.data.finalizeToken : undefined, req.staff!.id);
      res.json(FinalizeStorageUploadResponse.parse({ objectPath }));
    } catch (error) {
      if (!(error instanceof MediaNotFoundError)) {
        req.log.error({ err: error }, "Failed to finalize managed media upload");
      }
      res.status(400).json({ error: "Uploaded media could not be verified" });
    }
  },
);

router.post(
  "/storage/uploads/cleanup-pending",
  requireStaff,
  requireStaffRoles("owner", "administrator", "editor"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(RetryPendingMediaCleanupResponse.parse(await processPendingCollectionCoverCleanup(storage)));
    } catch (error) {
      req.log.error({ err: error }, "Failed to retry pending managed media cleanup");
      res.status(500).json({ error: "Pending media cleanup could not be processed" });
    }
  },
);

router.get("/storage/objects/*path", async (req: Request, res: Response): Promise<void> => {
  try {
    const width = req.query.w === undefined ? undefined : Number(req.query.w);
    if (width !== undefined && (typeof req.query.w !== "string"
      || !(RESPONSIVE_PHOTO_WIDTHS as readonly number[]).includes(width))) {
      res.status(400).json({ error: "Unsupported photo width" });
      return;
    }
    const raw = req.params.path;
    const relativePath = Array.isArray(raw) ? raw.join("/") : raw;
    const delivery = await resolveCommittedMediaDelivery(storage, { path: relativePath, area: "uploads" }, {
      width, allowPrivate: !!req.staff && ["owner", "administrator", "editor"].includes(req.staff.role),
    }, withCommittedMediaApproval);
    const inspected = await storage.inspectUploadedMedia(relativePath);
    const issue = inspectionIssue(relativePath, inspected);
    if (issue) {
      res.status(415).json({ error: issue });
      return;
    }
    res.setHeader("Cache-Control", delivery.cacheControl);
    if (storage.provider === "r2") res.setHeader("Vary", "Cookie");
    res.redirect(302, delivery.url);
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
    const delivery = await resolveCommittedMediaDelivery(storage, { path: relativePath, area: "public" }, {
      allowPrivate: !!req.staff && ["owner", "administrator", "editor"].includes(req.staff.role),
    }, withCommittedMediaApproval);
    const inspected = await storage.inspectPublicMedia(relativePath);
    const issue = inspectionIssue(relativePath, inspected);
    if (issue) {
      res.status(415).json({ error: issue });
      return;
    }
    res.setHeader("Cache-Control", delivery.cacheControl);
    if (storage.provider === "r2") res.setHeader("Vary", "Cookie");
    res.redirect(302, delivery.url);
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