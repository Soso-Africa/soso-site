import { Router, type IRouter, type Request, type Response } from "express";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import {
  detectMediaContentType,
  IMAGE_MEDIA_TYPES,
  MAX_HERO_VIDEO_BYTES,
  MAX_UPLOADED_IMAGE_BYTES,
  parseMediaByteRange,
  VIDEO_MEDIA_TYPES,
} from "../lib/media-files";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,159}$/;
export { detectMediaContentType, parseMediaByteRange } from "../lib/media-files";

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
      req.log.error({ err: error }, "Failed to create object storage upload URL");
      res.status(500).json({ error: "Failed to create upload URL" });
    }
  },
);

async function streamPublicMedia(
  file: Awaited<ReturnType<ObjectStorageService["getUploadedObject"]>>,
  req: Request,
  res: Response,
) {
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  const chunks: Buffer[] = [];
  for await (const chunk of file.createReadStream({ start: 0, end: 65_535 })) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const contentType = detectMediaContentType(Buffer.concat(chunks));
  const maxBytes = contentType?.startsWith("video/") ? MAX_HERO_VIDEO_BYTES : MAX_UPLOADED_IMAGE_BYTES;
  if (!contentType || !Number.isFinite(size) || size < 1 || size > maxBytes) {
    res.status(415).json({ error: "Stored object is not approved storefront media" });
    return;
  }
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  const range = contentType.startsWith("video/") ? req.headers.range : undefined;
  if (contentType.startsWith("video/")) res.setHeader("Accept-Ranges", "bytes");
  if (range) {
    const parsedRange = parseMediaByteRange(range, size);
    if (!parsedRange) {
      res.setHeader("Content-Range", `bytes */${size}`);
      res.sendStatus(416);
      return;
    }
    const { start, end } = parsedRange;
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    file.createReadStream({ start, end }).on("error", (error) => res.destroy(error)).pipe(res);
    return;
  }
  res.setHeader("Content-Length", String(size));
  file.createReadStream().on("error", (error) => res.destroy(error)).pipe(res);
}

router.get("/storage/objects/*path", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.path;
    const relativePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await storage.getUploadedObject(relativePath);
    await streamPublicMedia(file, req, res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Failed to serve uploaded object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.filePath;
    const relativePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await storage.findPublicObject(relativePath);
    if (!file) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    await streamPublicMedia(file, req, res);
  } catch (error) {
    req.log.error({ err: error }, "Failed to serve public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

export default router;