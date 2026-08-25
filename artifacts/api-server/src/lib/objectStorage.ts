import { randomUUID } from "node:crypto";
import type { File } from "@google-cloud/storage";
import { Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) {
    throw new Error("Invalid object storage path");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

function requiredEnvironmentPath(name: "PRIVATE_OBJECT_DIR" | "PUBLIC_OBJECT_SEARCH_PATHS"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function signPutUrl(bucketName: string, objectName: string): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to sign object upload URL (${response.status})`);
  }
  const body = await response.json() as { signed_url?: unknown };
  if (typeof body.signed_url !== "string") {
    throw new Error("Object storage signer returned an invalid response");
  }
  return body.signed_url;
}

export class ObjectStorageService {
  async createMediaUpload(filename: string, contentType: string): Promise<{ uploadURL: string; objectPath: string }> {
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
    const stem = filename.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 120) || "media";
    const safeFilename = `${stem}.${extension}`;
    const privateDir = requiredEnvironmentPath("PRIVATE_OBJECT_DIR").replace(/\/+$/, "");
    const relativePath = `uploads/${randomUUID()}-${safeFilename}`;
    const { bucketName, objectName } = parseObjectPath(`${privateDir}/${relativePath}`);
    return {
      uploadURL: await signPutUrl(bucketName, objectName),
      objectPath: `/api/storage/objects/${relativePath}`,
    };
  }

  async getUploadedObject(relativePath: string): Promise<File> {
    if (!relativePath.startsWith("uploads/") || relativePath.includes("..") || relativePath.includes("\\")) {
      throw new ObjectNotFoundError();
    }
    const privateDir = requiredEnvironmentPath("PRIVATE_OBJECT_DIR").replace(/\/+$/, "");
    const { bucketName, objectName } = parseObjectPath(`${privateDir}/${relativePath}`);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async findPublicObject(relativePath: string): Promise<File | null> {
    if (!relativePath || relativePath.includes("..") || relativePath.includes("\\")) {
      return null;
    }
    const searchPaths = requiredEnvironmentPath("PUBLIC_OBJECT_SEARCH_PATHS")
      .split(",")
      .map((path) => path.trim().replace(/\/+$/, ""))
      .filter(Boolean);
    for (const searchPath of searchPaths) {
      const { bucketName, objectName } = parseObjectPath(`${searchPath}/${relativePath}`);
      const file = objectStorageClient.bucket(bucketName).file(objectName);
      const [exists] = await file.exists();
      if (exists) return file;
    }
    return null;
  }
}