import {
  isLegacyEditoriallyApproved,
  legacyJournalBySlug,
  legacyJournalEditorialBySlug,
  legacyJournalPosts,
  type LegacyJournalPost,
  type ReviewableLegacyContent,
} from "../data/legacy-content";

export function mergeApprovedJournalPosts<T extends ReviewableLegacyContent>(
  cmsPosts: readonly T[],
  cmsResolved: boolean,
): Array<LegacyJournalPost | T> {
  if (!cmsResolved) return [];
  const merged = new Map<string, LegacyJournalPost | T>(
    legacyJournalPosts
      .filter((post) => {
        const reviewedPost = legacyJournalEditorialBySlug.get(post.slug);
        return reviewedPost ? isLegacyEditoriallyApproved(reviewedPost) : false;
      })
      .map((post) => [post.slug, post]),
  );
  for (const post of cmsPosts) {
    if (legacyJournalEditorialBySlug.has(post.slug) && !isLegacyEditoriallyApproved(post)) {
      merged.delete(post.slug);
      continue;
    }
    merged.set(post.slug, post);
  }
  return [...merged.values()];
}

export type LegacyJournalResolution = {
  legacyPost?: LegacyJournalPost;
  apiPost?: ReviewableLegacyContent;
  isLoading: boolean;
  isError: boolean;
  errorStatus?: number;
};

/**
 * A migrated slug stays private until the CMS detail lookup either returns the
 * exact approved revision or definitively confirms that no CMS row exists.
 */
export function isResolvedLegacyJournalIndexable({
  legacyPost,
  apiPost,
  isLoading,
  isError,
  errorStatus,
}: LegacyJournalResolution): boolean {
  if (!legacyPost) return true;
  if (isLoading) return false;
  if (isError) {
    return errorStatus === 404 && isLegacyEditoriallyApproved(legacyPost);
  }
  if (apiPost) return isLegacyEditoriallyApproved(apiPost);
  return false;
}
