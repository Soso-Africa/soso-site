import { MediaNotFoundError } from "./cloudinary-storage";
import type { ManagedMediaReference } from "./managed-media-references";
import type { MediaDelivery, MediaStorage } from "./media-storage-types";
import { R2StorageService } from "./r2-storage";

export type CommittedMediaApproval = (
  reference: ManagedMediaReference, promote: () => Promise<void>,
) => Promise<boolean>;

const pending = new WeakMap<R2StorageService, Map<string, Promise<void>>>();

/**
 * Only a separately committed publication can authorize a public copy.
 * Publishing transactions merely preflight private bytes. Failed/rolled-back
 * publications therefore cannot leave a publicly readable object behind.
 */
export async function resolveCommittedMediaDelivery(
  storage: MediaStorage, reference: ManagedMediaReference,
  options: { width?: number; allowPrivate: boolean }, approve: CommittedMediaApproval,
): Promise<MediaDelivery> {
  if (storage.provider !== "r2") return storage.resolveDelivery(reference.path, reference.area, options);
  if (!(storage instanceof R2StorageService)) throw new Error("R2 publication storage is unavailable");
  try {
    return await storage.resolveDelivery(reference.path, reference.area, { ...options, allowPrivate: false });
  } catch (error) {
    if (!(error instanceof MediaNotFoundError)) throw error;
  }
  let work = pending.get(storage);
  if (!work) { work = new Map(); pending.set(storage, work); }
  const identity = `${reference.area}/${reference.path}`;
  let promotion = work.get(identity);
  if (!promotion) {
    promotion = (async () => {
      const committed = await approve(reference, async () => {
        if (/\.(?:jpg|png)$/.test(reference.path)) {
          await storage.stageApprovedRenditions(reference.path, reference.area);
        }
        await storage.stageApprovedOriginal(reference.path, reference.area);
      });
      if (!committed) throw new MediaNotFoundError();
    })();
    work.set(identity, promotion);
  }
  try {
    await promotion;
  } catch (error) {
    if (!(error instanceof MediaNotFoundError) || !options.allowPrivate) throw error;
    return storage.resolveDelivery(reference.path, reference.area, options);
  } finally {
    if (work.get(identity) === promotion) work.delete(identity);
  }
  return storage.resolveDelivery(reference.path, reference.area, { ...options, allowPrivate: false });
}
