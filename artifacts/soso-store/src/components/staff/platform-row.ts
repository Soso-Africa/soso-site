type RowLike = { draft?: unknown; published?: unknown; draftUpdatedAt?: string | null; publishedAt?: string | null } | null | undefined;

/**
 * Returns the server's committed row when the publish/unpublish response is a usable row for that action,
 * otherwise null (caller must fall back to a GET reload). Never invents a Live state.
 */
export function committedRowFor<T extends RowLike>(result: T, kind: "publish" | "unpublish"): T | null {
  if (!result || typeof result !== "object" || !("published" in result)) return null;
  if (kind === "publish") return result.published && result.publishedAt ? result : null;
  return result.published ? null : result;
}
