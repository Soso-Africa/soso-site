import { createHash, randomUUID } from "node:crypto";
import {
  detectMediaContentType,
  imageDimensions,
  isAnimatedImage,
  MAX_HERO_POSTER_BYTES,
  mediaMimeTypeForPath,
} from "./media-files";

const CLOUDINARY_ROOT = "soso-store";
const UPLOADED_PATH = /^uploads\/([A-Za-z0-9_-][A-Za-z0-9_./-]*\.(?:jpg|png|webp|gif|mp4|webm))$/;
const PUBLIC_PATH = /^([A-Za-z0-9_-][A-Za-z0-9_./-]*\.(?:jpg|png|webp|gif|mp4|webm))$/;

type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

type CloudinaryUploadPolicy = {
  resourceType: "image" | "video";
  preset: string;
  allowedFormats: string[];
  maxFileSize: number;
};

export type CloudinaryUpload = {
  uploadURL: string;
  uploadMethod: "POST";
  uploadFields: Record<string, string>;
  objectPath: string;
};

export type CloudinaryMediaInspection = {
  contentType: string;
  declaredContentType?: string;
  size: number;
  animated?: boolean;
  bytes?: Buffer;
  width?: number;
  height?: number;
};

export class MediaNotFoundError extends Error {
  constructor() {
    super("Media not found");
    this.name = "MediaNotFoundError";
  }
}

const presetPromises = new Map<string, Promise<void>>();

function requiredCloudinaryConfig(): CloudinaryConfig {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary media storage is not configured");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(cloudName)) {
    throw new Error("Cloudinary cloud name is invalid");
  }
  return { cloudName, apiKey, apiSecret };
}

function extensionForContentType(contentType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  const extension = extensions[contentType];
  if (!extension) throw new Error("Unsupported media content type");
  return extension;
}

export function cloudinaryUploadPolicyForContentType(contentType: string): CloudinaryUploadPolicy {
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType)) {
    return {
      resourceType: "image",
      preset: "soso-governed-image-v1",
      allowedFormats: ["jpg", "jpeg", "png", "webp", "gif"],
      maxFileSize: 12 * 1024 * 1024,
    };
  }
  if (["video/mp4", "video/webm"].includes(contentType)) {
    return {
      resourceType: "video",
      preset: "soso-governed-video-v1",
      allowedFormats: ["mp4", "webm"],
      maxFileSize: 8 * 1024 * 1024,
    };
  }
  throw new Error("Unsupported media content type");
}

function encodeCloudinaryPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function normalizeRelativePath(relativePath: string, area: "uploads" | "public"): string {
  const normalized = relativePath.replace(/^\/+/, "");
  const match = area === "uploads" ? UPLOADED_PATH.exec(normalized) : PUBLIC_PATH.exec(normalized);
  if (!match || normalized.includes("..") || normalized.includes("\\")) {
    throw new MediaNotFoundError();
  }
  return normalized;
}

function cloudinaryPublicId(relativePath: string, area: "uploads" | "public"): string {
  const normalized = normalizeRelativePath(relativePath, area);
  const pathWithoutFormat = normalized.replace(/\.[^.]+$/, "");
  return area === "uploads"
    ? `${CLOUDINARY_ROOT}/${pathWithoutFormat}`
    : `${CLOUDINARY_ROOT}/public/${pathWithoutFormat}`;
}

export function createCloudinarySignature(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const canonical = Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("sha1").update(`${canonical}${apiSecret}`).digest("hex");
}

export function cloudinaryDeliveryUrlForPath(
  relativePath: string,
  area: "uploads" | "public",
  cloudName = requiredCloudinaryConfig().cloudName,
): string {
  const normalized = normalizeRelativePath(relativePath, area);
  const expectedType = mediaMimeTypeForPath(normalized);
  if (!expectedType) throw new MediaNotFoundError();
  const resourceType = expectedType.startsWith("video/") ? "video" : "image";
  const publicIdWithFormat = `${cloudinaryPublicId(normalized, area)}.${normalized.split(".").pop()!.toLowerCase()}`;
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/${resourceType}/upload/${encodeCloudinaryPath(publicIdWithFormat)}`;
}

async function inspectDeliveryUrl(url: string): Promise<CloudinaryMediaInspection> {
  const response = await fetch(url, {
    headers: { Range: `bytes=0-${MAX_HERO_POSTER_BYTES}` },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) throw new MediaNotFoundError();
  if (!response.ok) throw new Error(`Cloudinary media inspection failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentRange = response.headers.get("content-range");
  const rangeSize = contentRange?.match(/\/(\d+)$/)?.[1];
  const contentLength = response.headers.get("content-length");
  const size = Number(rangeSize ?? contentLength ?? bytes.length);
  const declaredContentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
  const contentType = detectMediaContentType(bytes) ?? "";
  const dimensions = imageDimensions(bytes, contentType);
  return {
    contentType,
    declaredContentType,
    size,
    animated: contentType.startsWith("image/") && isAnimatedImage(bytes, contentType),
    ...(dimensions ?? {}),
  };
}

async function cloudinaryAdminRequest(
  config: CloudinaryConfig,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const authorization = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");
  return fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
}

async function ensureUploadPreset(config: CloudinaryConfig, policy: CloudinaryUploadPolicy): Promise<void> {
  const existing = presetPromises.get(policy.preset);
  if (existing) return existing;
  const setup = (async () => {
    const body = {
      unsigned: false,
      allowed_formats: policy.allowedFormats,
      max_file_size: policy.maxFileSize,
      overwrite: false,
      use_filename: false,
      unique_filename: false,
    };
    const updatePath = `/upload_presets/${encodeURIComponent(policy.preset)}`;
    const updated = await cloudinaryAdminRequest(config, updatePath, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (updated.ok) return;
    if (updated.status !== 404) {
      throw new Error(`Cloudinary upload policy update failed (${updated.status})`);
    }
    const created = await cloudinaryAdminRequest(config, "/upload_presets", {
      method: "POST",
      body: JSON.stringify({ name: policy.preset, ...body }),
    });
    if (!created.ok && created.status !== 409) {
      throw new Error(`Cloudinary upload policy creation failed (${created.status})`);
    }
  })();
  presetPromises.set(policy.preset, setup);
  try {
    await setup;
  } catch (error) {
    presetPromises.delete(policy.preset);
    throw error;
  }
}

async function destroyCloudinaryAsset(
  config: CloudinaryConfig,
  publicId: string,
  resourceType: "image" | "video",
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1_000);
  const signature = createCloudinarySignature({ public_id: publicId, timestamp }, config.apiSecret);
  const form = new FormData();
  form.append("api_key", config.apiKey);
  form.append("public_id", publicId);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/${resourceType}/destroy`,
    { method: "POST", body: form, signal: AbortSignal.timeout(20_000) },
  );
  if (!response.ok) throw new Error(`Cloudinary asset cleanup failed (${response.status})`);
}

export class CloudinaryStorageService {
  async createMediaUpload(filename: string, contentType: string): Promise<CloudinaryUpload> {
    const config = requiredCloudinaryConfig();
    const extension = extensionForContentType(contentType);
    const policy = cloudinaryUploadPolicyForContentType(contentType);
    await ensureUploadPreset(config, policy);
    const stem = filename.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 120) || "media";
    const relativePath = `uploads/${randomUUID()}-${stem}.${extension}`;
    const publicId = cloudinaryPublicId(relativePath, "uploads");
    const timestamp = Math.floor(Date.now() / 1_000);
    const params = { public_id: publicId, timestamp, upload_preset: policy.preset };
    return {
      uploadURL: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/${policy.resourceType}/upload`,
      uploadMethod: "POST",
      uploadFields: {
        api_key: config.apiKey,
        public_id: publicId,
        timestamp: String(timestamp),
        upload_preset: policy.preset,
        signature: createCloudinarySignature(params, config.apiSecret),
      },
      objectPath: `/api/storage/objects/${relativePath}`,
    };
  }

  uploadedDeliveryUrl(relativePath: string): string {
    return cloudinaryDeliveryUrlForPath(relativePath, "uploads");
  }

  publicDeliveryUrl(relativePath: string): string {
    return cloudinaryDeliveryUrlForPath(relativePath, "public");
  }

  inspectUploadedMedia(relativePath: string): Promise<CloudinaryMediaInspection> {
    return inspectDeliveryUrl(this.uploadedDeliveryUrl(relativePath));
  }

  inspectPublicMedia(relativePath: string): Promise<CloudinaryMediaInspection> {
    return inspectDeliveryUrl(this.publicDeliveryUrl(relativePath));
  }

  async readUploadedImageBytes(relativePath: string, maxBytes: number): Promise<Buffer> {
    const url = this.uploadedDeliveryUrl(relativePath);
    const response = await fetch(url, {
      headers: { Range: `bytes=0-${maxBytes - 1}` },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 404) throw new MediaNotFoundError();
    if (!response.ok) throw new Error(`Cloudinary image read failed (${response.status})`);
    const total = Number(response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1]
      ?? response.headers.get("content-length"));
    if (!Number.isSafeInteger(total) || total < 1 || total > maxBytes) {
      throw new Error("Cloudinary image exceeds the bounded validation read");
    }
    if (!response.body) throw new Error("Cloudinary image response has no body");
    const chunks: Buffer[] = [];
    let received = 0;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new Error("Cloudinary image exceeded the bounded validation read");
      }
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== total) throw new Error("Cloudinary image did not return complete bounded bytes");
    return bytes;
  }

  async deleteUploadedMedia(relativePath: string): Promise<void> {
    const config = requiredCloudinaryConfig();
    const normalized = normalizeRelativePath(relativePath, "uploads");
    const expectedType = mediaMimeTypeForPath(normalized);
    if (!expectedType) throw new MediaNotFoundError();
    await destroyCloudinaryAsset(
      config,
      cloudinaryPublicId(normalized, "uploads"),
      expectedType.startsWith("video/") ? "video" : "image",
    );
  }

  async runDiagnostic(): Promise<CloudinaryMediaInspection> {
    const diagnosticPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/l3xZ5QAAAABJRU5ErkJggg==",
      "base64",
    );
    const upload = await this.createMediaUpload("storage-diagnostic.png", "image/png");
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.uploadFields)) form.append(key, value);
    form.append("file", new Blob([diagnosticPng], { type: "image/png" }), "storage-diagnostic.png");
    let uploadAttempted = false;
    const relativePath = upload.objectPath.slice("/api/storage/objects/".length);
    try {
      uploadAttempted = true;
      const response = await fetch(upload.uploadURL, {
        method: upload.uploadMethod,
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`Cloudinary diagnostic upload failed (${response.status})`);
      }
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await this.inspectUploadedMedia(relativePath);
        } catch (error) {
          lastError = error;
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      throw lastError;
    } finally {
      if (uploadAttempted) await this.deleteUploadedMedia(relativePath);
    }
  }
}