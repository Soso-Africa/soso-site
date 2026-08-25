import { Router, type IRouter, type Request, type Response } from "express";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,159}$/;

export function detectImageContentType(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => Buffer.from(bytes.subarray(start, end)).toString("ascii");
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "image/gif";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

router.post(
  "/storage/uploads/request-url",
  requireStaff,
  requireStaffRoles("owner", "administrator", "editor"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (
      !parsed.success ||
      !IMAGE_TYPES.has(parsed.data.contentType) ||
      !Number.isInteger(parsed.data.size) ||
      parsed.data.size > MAX_IMAGE_BYTES ||
      !SAFE_FILENAME.test(parsed.data.name) ||
      parsed.data.name === "." ||
      parsed.data.name === ".."
    ) {
      res.status(400).json({
        error: "Choose a JPEG, PNG, WebP, or GIF image up to 12 MB with a safe filename",
      });
      return;
    }
    try {
      const result = await storage.createImageUpload(parsed.data.name, parsed.data.contentType);
      res.json(RequestUploadUrlResponse.parse(result));
    } catch (error) {
      req.log.error({ err: error }, "Failed to create object storage upload URL");
      res.status(500).json({ error: "Failed to create upload URL" });
    }
  },
);

async function streamPublicImage(file: Awaited<ReturnType<ObjectStorageService["getUploadedObject"]>>, res: Response) {
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isFinite(size) || size < 1 || size > MAX_IMAGE_BYTES) {
    res.status(415).json({ error: "Stored object is not an approved image" });
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of file.createReadStream({ start: 0, end: 15 })) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const contentType = detectImageContentType(Buffer.concat(chunks));
  if (!contentType) {
    res.status(415).json({ error: "Stored object is not an approved image" });
    return;
  }
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", String(size));
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  file.createReadStream().on("error", (error) => res.destroy(error)).pipe(res);
}

router.get("/storage/objects/*path", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.path;
    const relativePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await storage.getUploadedObject(relativePath);
    await streamPublicImage(file, res);
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
    await streamPublicImage(file, res);
  } catch (error) {
    req.log.error({ err: error }, "Failed to serve public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

export default router;