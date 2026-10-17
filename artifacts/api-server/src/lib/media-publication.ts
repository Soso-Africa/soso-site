import { managedMediaReferences } from "./managed-media-references";
import { createMediaStorageService } from "./media-storage";
import { R2StorageService } from "./r2-storage";
import { readR2RenditionManifest } from "./r2-renditions";
import type { MediaStorage } from "./media-storage-types";

/**
 * Run inside the existing media transaction lock, only for the role-checked,
 * validated publication candidate. This is READ ONLY: a database transaction
 * can still fail after this function returns. Public copies are prepared only
 * by committed-media-delivery after a separate committed-approval check.
 */
export async function prepareMediaForPublication(
  candidate: unknown, previouslyPublished?: unknown, storage: MediaStorage = createMediaStorageService(),
): Promise<void> {
  if (storage.provider !== "r2") return;
  if (!(storage instanceof R2StorageService)) throw new Error("R2 publication storage is unavailable");
  const previous = managedMediaReferences(previouslyPublished);
  const changed = [...managedMediaReferences(candidate)].filter(([identity]) => !previous.has(identity)).map(([, reference]) => reference);
  // Preflight every required rendition without changing public visibility.
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < changed.length) {
      const reference = changed[next++]!;
      if (/\.(?:jpg|png)$/.test(reference.path)) {
        await readR2RenditionManifest(storage, reference.path, reference.area);
      }
      const inspected = reference.area === "uploads"
        ? await storage.inspectUploadedMedia(reference.path) : await storage.inspectPublicMedia(reference.path);
      if (!inspected.contentType || inspected.contentType !== inspected.declaredContentType) throw new Error("Publication media bytes could not be verified");
    }
  };
  const preflight = await Promise.allSettled(Array.from({ length: Math.min(4, changed.length) }, () => worker()));
  const failedPreflight = preflight.find((result) => result.status === "rejected");
  if (failedPreflight?.status === "rejected") throw failedPreflight.reason;
}
