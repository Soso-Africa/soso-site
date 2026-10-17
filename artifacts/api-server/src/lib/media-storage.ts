import { CloudinaryStorageService } from "./cloudinary-storage";
import { responsivePhotoDelivery } from "./responsive-media";
import { R2StorageService } from "./r2-storage";
import type { MediaArea, MediaDelivery, MediaStorage } from "./media-storage-types";

class CloudinaryMediaAdapter extends CloudinaryStorageService implements MediaStorage {
  readonly provider = "cloudinary" as const;
  async resolveDelivery(path: string, area: MediaArea, options: { width?: number; allowPrivate: boolean }): Promise<MediaDelivery> {
    const original = area === "uploads" ? this.uploadedDeliveryUrl(path) : this.publicDeliveryUrl(path);
    return {
      url: options.width === undefined ? original : responsivePhotoDelivery(original, options.width),
      cacheControl: "public, max-age=31536000, immutable",
    };
  }
}

const cloudinary = new CloudinaryMediaAdapter();
let r2: R2StorageService | undefined;

/** Explicit selection only. An R2 failure must never revive a Cloudinary dependency. */
export function createMediaStorageService(): MediaStorage {
  const provider = process.env.MEDIA_STORAGE_PROVIDER?.trim() || "cloudinary";
  if (provider === "cloudinary") return cloudinary;
  if (provider === "r2") {
    if (process.env.R2_MEDIA_ACTIVATION_APPROVED !== "yes") {
      throw new Error("R2 media activation has not passed the migration release gate");
    }
    return r2 ??= new R2StorageService();
  }
  throw new Error("Unsupported media storage provider");
}
