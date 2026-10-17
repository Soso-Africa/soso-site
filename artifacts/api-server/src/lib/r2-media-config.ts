import { MediaNotFoundError } from "./cloudinary-storage";
import { mediaMimeTypeForPath } from "./media-files";
import type { MediaArea } from "./media-storage-types";

export type R2MediaConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  privateBucket: string;
  publicBucket: string;
  namespace: string;
  publicOrigin?: string;
};

export function requiredR2MediaConfig(): R2MediaConfig {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_MEDIA_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_MEDIA_SECRET_ACCESS_KEY?.trim() ?? "";
  if (!/^[a-f0-9]{32}$/.test(accountId) || !/^[a-f0-9]{32}$/i.test(accessKeyId)
    || !/^[a-f0-9]{64}$/i.test(secretAccessKey)) throw new Error("R2 application credentials are not configured");
  const privateBucket = process.env.R2_MEDIA_PRIVATE_BUCKET?.trim() ?? "soso-media-private";
  const publicBucket = process.env.R2_MEDIA_PUBLIC_BUCKET?.trim() ?? "soso-media-public";
  if (privateBucket === publicBucket || ![privateBucket, publicBucket].every((name) =>
    /^soso-media-[a-z0-9-]+$/.test(name) && name !== "soso-media-backup")) {
    throw new Error("R2 runtime buckets must be separate from each other and the backup");
  }
  const namespace = process.env.R2_MEDIA_NAMESPACE?.trim() ?? "";
  if (namespace && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(namespace)) throw new Error("R2 media namespace is invalid");
  let publicOrigin: string | undefined;
  if (process.env.R2_PUBLIC_MEDIA_ORIGIN) {
    const parsed = new URL(process.env.R2_PUBLIC_MEDIA_ORIGIN);
    if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash
      || parsed.username || parsed.password || parsed.hostname.endsWith(".r2.dev")) {
      throw new Error("R2 public delivery requires an approved HTTPS custom-domain origin");
    }
    publicOrigin = parsed.origin;
  }
  if (!publicOrigin && process.env.NODE_ENV === "production") {
    throw new Error("Production R2 delivery requires a custom domain");
  }
  return { accountId, accessKeyId, secretAccessKey, privateBucket, publicBucket, namespace, publicOrigin };
}

export function normalizeR2MediaPath(path: string, area: MediaArea): string {
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_./-]*\.(?:jpg|png|webp|gif|mp4|webm)$/.test(path)
    || path.includes("..") || path.split("/").some((part) => !part || part === ".")
    || (area === "uploads" && !path.startsWith("uploads/")) || !mediaMimeTypeForPath(path)) {
    throw new MediaNotFoundError();
  }
  return path;
}

export function r2MediaKey(config: Pick<R2MediaConfig, "namespace">, path: string, area: MediaArea): string {
  return `${config.namespace ? `${config.namespace}/` : ""}${area === "public" ? "public/" : ""}${normalizeR2MediaPath(path, area)}`;
}
