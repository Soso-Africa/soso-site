import { managedMediaReferences } from "./managed-media-references";
import { createMediaStorageService } from "./media-storage";
import { R2StorageService } from "./r2-storage";
import { readR2RenditionManifest } from "./r2-renditions";
import type { MediaStorage } from "./media-storage-types";

/**
 * Run inside the existing media transaction lock, only for the role-checked,
 * validated publication candidate. Never copy the unrelated saved draft.
 */
export async function prepareMediaForPublication(
  candidate: unknown, previouslyPublished?: unknown, storage: MediaStorage = createMediaStorageService(),
): Promise<void> {
  if (storage.provider !== "r2") return;
  if (!(storage instanceof R2StorageService)) throw new Error("R2 publication storage is unavailable");
  const previous = managedMediaReferences(previouslyPublished);
  const changed = [...managedMediaReferences(candidate)].filter(([identity]) => !previous.has(identity)).map(([, reference]) => reference);
  // Preflight every required rendition before exposing any new original.
  let next = 0;
  const worker = async (copy: boolean): Promise<void> => {
    while (next < changed.length) {
      const reference = changed[next++]!;
      if (/\.(?:jpg|png)$/.test(reference.path)) {
        if (copy) await storage.stageApprovedRenditions(reference.path, reference.area);
        else await readR2RenditionManifest(storage, reference.path, reference.area);
      }
      if (copy) await storage.stageApprovedOriginal(reference.path, reference.area);
      else {
        const inspected = reference.area === "uploads"
          ? await storage.inspectUploadedMedia(reference.path) : await storage.inspectPublicMedia(reference.path);
        if (!inspected.contentType || inspected.contentType !== inspected.declaredContentType) throw new Error("Publication media bytes could not be verified");
      }
    }
  };
  const preflight = await Promise.allSettled(Array.from({ length: Math.min(4, changed.length) }, () => worker(false)));
  const failedPreflight = preflight.find((result) => result.status === "rejected");
  if (failedPreflight?.status === "rejected") throw failedPreflight.reason;
  next = 0;
  const copies = await Promise.allSettled(Array.from({ length: Math.min(4, changed.length) }, () => worker(true)));
  const failedCopy = copies.find((result) => result.status === "rejected");
  if (failedCopy?.status === "rejected") throw failedCopy.reason;
}
