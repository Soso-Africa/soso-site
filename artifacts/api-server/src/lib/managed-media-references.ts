import type { MediaArea } from "./media-storage-types";

export type ManagedMediaReference = { path: string; area: MediaArea };

/** Exact logical paths, including managed images embedded in Journal text. */
export function managedMediaReferences(value: unknown): Map<string, ManagedMediaReference> {
  const references = new Map<string, ManagedMediaReference>();
  const visit = (part: unknown): void => {
    if (typeof part === "string") {
      const pattern = /\/api\/storage\/(objects|public-objects)\/([A-Za-z0-9_-][A-Za-z0-9_./-]*\.(?:jpg|png|webp|gif|mp4|webm))(?=$|[\s"'<>?#)\],])/g;
      for (const match of part.matchAll(pattern)) {
        // An absolute external URL is not a governed local object reference.
        if (match.index && /[A-Za-z0-9.:/-]/.test(part[match.index - 1]!)) continue;
        const area: MediaArea = match[1] === "objects" ? "uploads" : "public";
        const path = match[2]!;
        references.set(`${area}/${path}`, { path, area });
      }
    } else if (Array.isArray(part)) part.forEach(visit);
    else if (part && typeof part === "object") Object.values(part).forEach(visit);
  };
  visit(value);
  return references;
}
