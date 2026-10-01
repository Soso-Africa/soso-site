export type SaveResult = { ok: boolean; message: string };

export type PublicationState = "unsaved" | "draft_not_live" | "live_old_version" | "live_current";

export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sameProduct(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

/** current = editor state, saved = row.draft product, published = row.published product (by slug). */
export function publicationState(current: unknown, saved: unknown, published: unknown): PublicationState {
  if (!saved || !sameProduct(current, saved)) return "unsaved";
  if (!published) return "draft_not_live";
  return sameProduct(saved, published) ? "live_current" : "live_old_version";
}

export function publicationLabel(state: PublicationState, hasPublished: boolean): string {
  switch (state) {
    case "unsaved": return hasPublished ? "Unsaved edits. An older version is live." : "Unsaved edits. Not live.";
    case "draft_not_live": return "Saved draft. Not live.";
    case "live_old_version": return "Saved draft differs from the live version. The old version is still live until published.";
    case "live_current": return "Live. The saved draft matches the published product.";
  }
}
