export type SiteContentPayload = Record<string, unknown>;

export type SiteContentState = {
  key: string;
  draft: SiteContentPayload;
  published: SiteContentPayload;
  draftUpdatedAt?: Date | null;
  publishedAt?: Date | null;
  updatedByClerkUserId?: string | null;
  publishedByClerkUserId?: string | null;
};

export function publicSiteContent(row: Pick<SiteContentState, "published"> | undefined) {
  return { content: row?.published ?? {} };
}

export function saveSiteDraft(
  current: SiteContentState | undefined,
  draft: SiteContentPayload,
  actorClerkUserId: string,
  now = new Date(),
): SiteContentState {
  return {
    key: current?.key ?? "site",
    draft,
    published: current?.published ?? {},
    draftUpdatedAt: now,
    publishedAt: current?.publishedAt ?? null,
    updatedByClerkUserId: actorClerkUserId,
    publishedByClerkUserId: current?.publishedByClerkUserId ?? null,
  };
}

export function publishSiteDraft(
  current: SiteContentState,
  actorClerkUserId: string,
  now = new Date(),
) {
  return {
    row: {
      ...current,
      published: current.draft,
      publishedAt: now,
      publishedByClerkUserId: actorClerkUserId,
    },
    audit: {
      actorClerkUserId,
      action: "site_content.published",
      entityType: "site_content",
      entityId: "site",
      metadata: { publishedAt: now.toISOString() },
    },
  };
}