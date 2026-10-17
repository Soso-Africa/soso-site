import { GetStaffMediaStorageStatusResponse } from "@workspace/api-zod";
import type { R2StorageService } from "./r2-storage";

/** Worker-written private summary only. Runtime never receives backup credentials. */
export async function getR2MediaOperations(storage: R2StorageService) {
  try {
    const key = `${storage.config.namespace ? `${storage.config.namespace}/` : ""}operations/media-operations.json`;
    const head = await storage.io.head(storage.config.privateBucket, key);
    const bytes = await storage.io.read(storage.config.privateBucket, key, 16_384, head);
    const parsed = GetStaffMediaStorageStatusResponse.safeParse({
      provider: "r2", r2Usage: null, r2Operations: JSON.parse(bytes.toString("utf8")),
    });
    return parsed.success ? parsed.data.r2Operations ?? null : null;
  } catch {
    // Staff explicitly sees "unavailable", never a manufactured healthy result.
    return null;
  }
}
