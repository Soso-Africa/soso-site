import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import {
  CreateStaffJournalPostBody,
  CreateStaffJournalPostResponse,
  ListStaffJournalPostRevisionsParams,
  ListStaffJournalPostRevisionsResponse,
  ListStaffJournalPostsResponse,
  UpdateStaffJournalPostBody,
  UpdateStaffJournalPostParams,
  UpdateStaffJournalPostResponse,
} from "@workspace/api-zod";
import {
  auditLogsTable,
  db,
  faqItemsTable,
  journalPostRevisionsTable,
  journalPostsTable,
<<<<<<< HEAD
  siteContentTable,
} from "@workspace/db";
import { asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { publishSiteDraft, saveSiteDraft } from "./site-content-policy";
=======
} from "@workspace/db";
import { asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
>>>>>>> github/main

const router: IRouter = Router();

router.use("/staff", requireStaff);

<<<<<<< HEAD
router.get("/staff/content/site", requireStaffRoles("owner", "editor"), async (_req, res): Promise<void> => {
  const [row] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "site")).limit(1);
  res.json(row ?? {
    key: "site",
    draft: {},
    published: {},
    draftUpdatedAt: null,
    publishedAt: null,
    updatedByClerkUserId: null,
    publishedByClerkUserId: null,
  });
});

router.put("/staff/content/site", requireStaffRoles("owner", "editor"), async (req, res): Promise<void> => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({ error: "Content must be an object" });
    return;
  }
  const allowedKeys = new Set([
    "heroEyebrow", "heroTitle", "heroAccent", "heroDescription", "heroImageUrl",
    "heroImageAlt", "primaryCta", "primaryCtaHref", "stylistCta", "announcement",
    "footerDescription", "instagramUrl", "whatsappUrl",
    "navKaftansLabel", "navAgbadasLabel", "navShirtsLabel", "contactEmail", "contactPhone",
  ]);
  const draft: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
    if (!allowedKeys.has(key) || typeof value !== "string" || value.length > 500) {
      res.status(400).json({ error: `Invalid site content field: ${key}` });
      return;
    }
    draft[key] = value.trim();
  }
  for (const key of ["heroImageUrl", "instagramUrl", "whatsappUrl"]) {
    if (draft[key] && !/^https?:\/\/|^\//.test(draft[key])) {
      res.status(400).json({ error: `${key} must be an https URL or local path` });
      return;
    }
  }
  if (draft.primaryCtaHref && !draft.primaryCtaHref.startsWith("/")) {
    res.status(400).json({ error: "Primary CTA must link to a local storefront path" });
    return;
  }
  const [current] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "site")).limit(1);
  const next = saveSiteDraft(current, draft, req.staff!.clerkUserId);
  const nextValues = {
    key: next.key, draft: next.draft, published: next.published,
    draftUpdatedAt: next.draftUpdatedAt ?? undefined, publishedAt: next.publishedAt ?? undefined,
    updatedByClerkUserId: next.updatedByClerkUserId ?? undefined,
    publishedByClerkUserId: next.publishedByClerkUserId ?? undefined,
  };
  const [row] = await db.insert(siteContentTable).values(nextValues).onConflictDoUpdate({
    target: siteContentTable.key,
    set: nextValues,
  }).returning();
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId, action: "site_content.draft_saved",
    entityType: "site_content", entityId: "site",
    metadata: { keys: Object.keys(draft) },
  });
  res.json(row);
});

router.post("/staff/content/site/publish", requireStaffRoles("owner", "editor"), async (req, res): Promise<void> => {
  const [existing] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "site")).limit(1);
  if (!existing) { res.status(409).json({ error: "Save a draft before publishing" }); return; }
  const { row: published, audit } = publishSiteDraft(existing, req.staff!.clerkUserId);
  const [row] = await db.update(siteContentTable).set({
    ...published,
    draftUpdatedAt: published.draftUpdatedAt ?? undefined,
    updatedByClerkUserId: published.updatedByClerkUserId ?? undefined,
  }).where(eq(siteContentTable.key, "site")).returning();
  await db.insert(auditLogsTable).values({
    actorClerkUserId: audit.actorClerkUserId, action: audit.action,
    entityType: audit.entityType, entityId: audit.entityId, metadata: audit.metadata,
  });
  res.json(row);
});

=======
>>>>>>> github/main
type JournalPostCore = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  authorName: string;
  category: string | null;
  tags: string[] | null;
  seoTitle: string | null;
  seoDescription: string | null;
  readTimeMinutes: number | null;
  relatedProductSlugs: string[] | null;
  relatedArticleSlugs: string[] | null;
  status: string;
};

function journalFingerprint(post: JournalPostCore): string {
  return createHash("sha256")
    .update(JSON.stringify(post))
    .digest("hex");
}

function journalSnapshot(post: JournalPostCore & { publishedAt: Date | null }) {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    coverImageUrl: post.coverImageUrl,
    coverImageAlt: post.coverImageAlt,
    authorName: post.authorName,
    category: post.category,
    tags: post.tags,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    readTimeMinutes: post.readTimeMinutes,
    relatedProductSlugs: post.relatedProductSlugs,
    relatedArticleSlugs: post.relatedArticleSlugs,
    status: post.status,
    publishedAt: post.publishedAt?.toISOString() ?? null,
  };
}

async function validateRelatedArticles(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sourceSlug: string,
  relatedArticleSlugs: string[] | null | undefined,
  nextStatus: string,
): Promise<string | null> {
  const slugs = Array.from(new Set((relatedArticleSlugs ?? []).map((slug) => slug.trim()).filter(Boolean)));
  if (!slugs.length) return null;
  if (slugs.includes(sourceSlug)) return "An article cannot link to itself";
  const related = await tx.select({ slug: journalPostsTable.slug, status: journalPostsTable.status })
    .from(journalPostsTable).where(inArray(journalPostsTable.slug, slugs));
  if (related.length !== slugs.length) return "Every related article must exist before it can be linked";
  if (related.some((post) => post.status === "archived")) return "Archived articles cannot be used as related content";
  if (nextStatus === "published" && related.some((post) => post.status !== "published")) {
    return "Published articles may only link to other published articles";
  }
  return null;
}

router.get("/staff/journal", requireStaffRoles("owner", "editor"), async (_req, res): Promise<void> => {
  const posts = await db
    .select()
    .from(journalPostsTable)
    .orderBy(desc(journalPostsTable.updatedAt))
    .limit(100);

  res.json(ListStaffJournalPostsResponse.parse(posts));
});

router.post(
  "/staff/journal",
  requireStaffRoles("owner", "editor"),
  async (req, res): Promise<void> => {
<<<<<<< HEAD
    const parsed = UpdateStaffJournalPostBody.safeParse(req.body);
=======
    const parsed = CreateStaffJournalPostBody.safeParse(req.body);
>>>>>>> github/main
    if (!parsed.success) {
      res.status(400).json({ error: "Please complete the article details" });
      return;
    }
<<<<<<< HEAD
    const params = ListStaffJournalPostRevisionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid article reference" });
      return;
    }
    const expectedRevision = req.body?.expectedRevision ? new Date(req.body.expectedRevision) : null;

    const post = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(journalPostsTable)
        .where(eq(journalPostsTable.id, params.data.id))
        .limit(1);
      if (!current) return null;
      if (expectedRevision && current.updatedAt.getTime() !== expectedRevision.getTime()) {
        return { kind: "conflict" as const };
      }
      const nextStatus = parsed.data.status ?? current.status;
      const relationError = await validateRelatedArticles(
        tx,
        parsed.data.slug ?? current.slug,
        parsed.data.relatedArticleSlugs ?? current.relatedArticleSlugs,
        nextStatus,
      );
      if (relationError) return { kind: "relation_error" as const, message: relationError };
      const [previousRevision] = await tx
        .select({ id: journalPostRevisionsTable.id })
        .from(journalPostRevisionsTable)
        .where(eq(journalPostRevisionsTable.journalPostId, current.id))
        .orderBy(desc(journalPostRevisionsTable.createdAt))
        .limit(1);

      const status = nextStatus;
      const [updated] = await tx
        .update(journalPostsTable)
        .set({
          ...parsed.data,
          publishedAt:
            status === "published"
              ? current.publishedAt ?? new Date()
              : null,
        })
        .where(eq(journalPostsTable.id, current.id))
=======

    const post = await db.transaction(async (tx) => {
      const relationError = await validateRelatedArticles(tx, parsed.data.slug, parsed.data.relatedArticleSlugs, parsed.data.status);
      if (relationError) return { kind: "relation_error" as const, message: relationError };
      const [created] = await tx
        .insert(journalPostsTable)
        .values({
          ...parsed.data,
          publishedAt: parsed.data.status === "published" ? new Date() : null,
        })
>>>>>>> github/main
        .returning();

      const [revision] = await tx
        .insert(journalPostRevisionsTable)
        .values({
<<<<<<< HEAD
          journalPostId: updated!.id,
          snapshot: journalSnapshot(updated!),
          contentHash: journalFingerprint(updated!),
=======
          journalPostId: created!.id,
          snapshot: journalSnapshot(created!),
          contentHash: journalFingerprint(created!),
>>>>>>> github/main
          createdByClerkUserId: req.staff!.clerkUserId,
        })
        .returning();

      await tx.insert(auditLogsTable).values({
        actorClerkUserId: req.staff!.clerkUserId,
<<<<<<< HEAD
        action: "journal.updated",
        entityType: "journal_post",
        entityId: updated!.id,
        metadata: {
          previousSlug: current.slug,
          slug: updated!.slug,
          previousStatus: current.status,
          status: updated!.status,
          previousContentHash: journalFingerprint(current),
          contentHash: journalFingerprint(updated!),
          previousRevisionId: previousRevision?.id ?? null,
          revisionId: revision!.id,
        },
      });
      return { kind: "updated" as const, post: updated! };
    });

    if (!post) {
      res.status(404).json({ error: "Article not found" });
      return;
    }
    if (post.kind === "conflict") {
      res.status(409).json({ error: "This article changed while you were editing it. Reload it before saving again." });
      return;
    }
=======
        action: "journal.created",
        entityType: "journal_post",
        entityId: created!.id,
        metadata: {
          slug: created!.slug,
          status: created!.status,
          contentHash: journalFingerprint(created!),
          revisionId: revision!.id,
        },
      });
      return { kind: "created" as const, post: created! };
    });

>>>>>>> github/main
    if (post.kind === "relation_error") {
      res.status(400).json({ error: post.message });
      return;
    }
<<<<<<< HEAD

    res.json(UpdateStaffJournalPostResponse.parse(post.post));
  },
);

router.get(
  "/staff/journal/:id/revisions",
  requireStaffRoles("owner", "editor"),
  async (req, res): Promise<void> => {
    const params = ListStaffJournalPostRevisionsParams.safeParse(req.params);
=======
    res.status(201).json(CreateStaffJournalPostResponse.parse(post.post));
  },
);

router.patch(
  "/staff/journal/:id",
  requireStaffRoles("owner", "editor"),
  async (req, res): Promise<void> => {
    const params = UpdateStaffJournalPostParams.safeParse(req.params);
>>>>>>> github/main
    const parsed = UpdateStaffJournalPostBody.safeParse(req.body);
    if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) {
      res.status(400).json({ error: "Please provide valid article updates" });
      return;
    }
    const revisionHeader = req.header("x-soso-expected-revision");
    const expectedRevision = revisionHeader ? new Date(revisionHeader) : null;
    if (revisionHeader && (!expectedRevision || Number.isNaN(expectedRevision.getTime()))) {
      res.status(400).json({ error: "The article revision reference is invalid" });
      return;
    }

    const post = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(journalPostsTable)
        .where(eq(journalPostsTable.id, params.data.id))
        .limit(1);
      if (!current) return null;
      if (expectedRevision && current.updatedAt.getTime() !== expectedRevision.getTime()) {
        return { kind: "conflict" as const };
      }
      const nextStatus = parsed.data.status ?? current.status;
      const relationError = await validateRelatedArticles(
        tx,
        parsed.data.slug ?? current.slug,
        parsed.data.relatedArticleSlugs ?? current.relatedArticleSlugs,
        nextStatus,
      );
      if (relationError) return { kind: "relation_error" as const, message: relationError };
      const [previousRevision] = await tx
        .select({ id: journalPostRevisionsTable.id })
        .from(journalPostRevisionsTable)
        .where(eq(journalPostRevisionsTable.journalPostId, current.id))
        .orderBy(desc(journalPostRevisionsTable.createdAt))
        .limit(1);

      const status = nextStatus;
      const [updated] = await tx
        .update(journalPostsTable)
        .set({
          ...parsed.data,
          publishedAt:
            status === "published"
              ? current.publishedAt ?? new Date()
              : null,
        })
        .where(eq(journalPostsTable.id, current.id))
        .returning();

      const [revision] = await tx
        .insert(journalPostRevisionsTable)
        .values({
          journalPostId: updated!.id,
          snapshot: journalSnapshot(updated!),
          contentHash: journalFingerprint(updated!),
          createdByClerkUserId: req.staff!.clerkUserId,
        })
        .returning();

      await tx.insert(auditLogsTable).values({
        actorClerkUserId: req.staff!.clerkUserId,
        action: "journal.updated",
        entityType: "journal_post",
        entityId: updated!.id,
        metadata: {
          previousSlug: current.slug,
          slug: updated!.slug,
          previousStatus: current.status,
          status: updated!.status,
          previousContentHash: journalFingerprint(current),
          contentHash: journalFingerprint(updated!),
          previousRevisionId: previousRevision?.id ?? null,
          revisionId: revision!.id,
        },
      });
      return { kind: "updated" as const, post: updated! };
    });

    if (!post) {
      res.status(404).json({ error: "Article not found" });
      return;
    }
    if (post.kind === "conflict") {
      res.status(409).json({ error: "This article changed while you were editing it. Reload it before saving again." });
      return;
    }
    if (post.kind === "relation_error") {
      res.status(400).json({ error: post.message });
      return;
    }

    res.json(UpdateStaffJournalPostResponse.parse(post.post));
  },
);

router.get(
  "/staff/journal/:id/revisions",
  requireStaffRoles("owner", "editor"),
  async (req, res): Promise<void> => {
    const params = ListStaffJournalPostRevisionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid article reference" });
      return;
    }

    const [post] = await db
      .select({ id: journalPostsTable.id })
      .from(journalPostsTable)
      .where(eq(journalPostsTable.id, params.data.id))
      .limit(1);
    if (!post) {
      res.status(404).json({ error: "Article not found" });
      return;
    }

    const revisions = await db
      .select({
        id: journalPostRevisionsTable.id,
        journalPostId: journalPostRevisionsTable.journalPostId,
        snapshot: journalPostRevisionsTable.snapshot,
        contentHash: journalPostRevisionsTable.contentHash,
        createdAt: journalPostRevisionsTable.createdAt,
      })
      .from(journalPostRevisionsTable)
      .where(eq(journalPostRevisionsTable.journalPostId, post.id))
      .orderBy(desc(journalPostRevisionsTable.createdAt))
      .limit(100);

    res.json(ListStaffJournalPostRevisionsResponse.parse(revisions));
  },
);

// ── FAQ management ─────────────────────────────────────────────────────────

<<<<<<< HEAD
export const faqSnapshot = (row: typeof faqItemsTable.$inferSelect) => ({
  question: row.question,
  answer: row.answer,
  category: row.category,
  sortOrder: row.sortOrder,
  isPublished: row.isPublished,
});

export const buildFaqCreateAuditMetadata = (row: typeof faqItemsTable.$inferSelect) => ({
  snapshot: faqSnapshot(row),
  transition: { from: null, to: row.isPublished ? "published" : "draft" },
=======
router.get("/staff/faq", requireStaffRoles("owner", "editor"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(faqItemsTable).orderBy(asc(faqItemsTable.sortOrder), asc(faqItemsTable.createdAt));
  res.json(rows);
>>>>>>> github/main
});

router.post("/staff/faq", requireStaffRoles("owner", "editor"), async (req, res): Promise<void> => {
  const { question, answer, category, sortOrder, isPublished } = req.body as Record<string, unknown>;
  if (typeof question !== "string" || !question.trim() || typeof answer !== "string" || !answer.trim()) {
    res.status(400).json({ error: "question and answer are required" });
    return;
  }
  const [row] = await db.insert(faqItemsTable).values({
    question: question.trim(),
    answer: answer.trim(),
    category: typeof category === "string" && category.trim() ? category.trim() : null,
    sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
<<<<<<< HEAD
    isPublished: typeof isPublished === "boolean" ? isPublished : false,
  }).returning();
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId,
    action: "faq.created",
    entityType: "faq_item",
    entityId: row!.id,
    metadata: buildFaqCreateAuditMetadata(row!),
  });
=======
    isPublished: isPublished !== false,
  }).returning();
  await db.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "faq.created", entityType: "faq_item", entityId: row!.id, metadata: { question: row!.question } });
>>>>>>> github/main
  res.status(201).json(row);
});

router.patch("/staff/faq/:id", requireStaffRoles("owner", "editor"), async (req, res): Promise<void> => {
  const { question, answer, category, sortOrder, isPublished } = req.body as Record<string, unknown>;
<<<<<<< HEAD
  const [current] = await db.select().from(faqItemsTable).where(eq(faqItemsTable.id, req.params.id as string)).limit(1);
  if (!current) { res.status(404).json({ error: "FAQ item not found" }); return; }
=======
>>>>>>> github/main
  const updates: Partial<typeof faqItemsTable.$inferInsert> = {};
  if (typeof question === "string" && question.trim()) updates.question = question.trim();
  if (typeof answer === "string" && answer.trim()) updates.answer = answer.trim();
  if (category !== undefined) updates.category = typeof category === "string" && category.trim() ? category.trim() : null;
  if (typeof sortOrder === "number") updates.sortOrder = sortOrder;
  if (typeof isPublished === "boolean") updates.isPublished = isPublished;
  if (!Object.keys(updates).length) { res.status(400).json({ error: "No valid fields to update" }); return; }
  updates.updatedAt = new Date();
<<<<<<< HEAD
  const [row] = await db.update(faqItemsTable).set(updates).where(eq(faqItemsTable.id, current.id)).returning();
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId,
    action: "faq.updated",
    entityType: "faq_item",
    entityId: row!.id,
    metadata: buildFaqUpdateAuditMetadata(current, row!),
  });
=======
  const [row] = await db.update(faqItemsTable).set(updates).where(eq(faqItemsTable.id, req.params.id as string)).returning();
  if (!row) { res.status(404).json({ error: "FAQ item not found" }); return; }
  await db.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "faq.updated", entityType: "faq_item", entityId: row.id, metadata: {} });
>>>>>>> github/main
  res.json(row);
});

router.delete("/staff/faq/:id", requireStaffRoles("owner", "editor"), async (req, res): Promise<void> => {
<<<<<<< HEAD
  const [current] = await db.select().from(faqItemsTable).where(eq(faqItemsTable.id, req.params.id as string)).limit(1);
  if (!current) { res.status(404).json({ error: "FAQ item not found" }); return; }
  await db.delete(faqItemsTable).where(eq(faqItemsTable.id, current.id));
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId,
    action: "faq.deleted",
    entityType: "faq_item",
    entityId: current.id,
    metadata: buildFaqDeleteAuditMetadata(current),
  });
  res.status(204).send();
});

router.get("/staff/faq/:id/history", requireStaffRoles("owner", "editor"), async (req, res): Promise<void> => {
  const [item] = await db.select({ id: faqItemsTable.id }).from(faqItemsTable).where(eq(faqItemsTable.id, req.params.id as string)).limit(1);
  const events = await db.select({
    id: auditLogsTable.id,
    actorClerkUserId: auditLogsTable.actorClerkUserId,
    action: auditLogsTable.action,
    metadata: auditLogsTable.metadata,
    createdAt: auditLogsTable.createdAt,
  }).from(auditLogsTable)
    .where(eq(auditLogsTable.entityId, req.params.id as string))
    .orderBy(desc(auditLogsTable.createdAt));
  if (!item && !events.length) { res.status(404).json({ error: "FAQ item not found" }); return; }
  res.json(sortFaqHistoryNewestFirst(events));
});

export default router;

export const buildFaqUpdateAuditMetadata = (
  previous: typeof faqItemsTable.$inferSelect,
  current: typeof faqItemsTable.$inferSelect,
) => ({
  previousSnapshot: faqSnapshot(previous),
  snapshot: faqSnapshot(current),
  transition: {
    from: previous.isPublished ? "published" : "draft",
    to: current.isPublished ? "published" : "draft",
  },
});

export type FaqHistoryEvent = {
  id: string;
  actorClerkUserId: string;
  action: string;
  metadata: unknown;
  createdAt: Date;
};

export function sortFaqHistoryNewestFirst<T extends Pick<FaqHistoryEvent, "createdAt">>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export const buildFaqDeleteAuditMetadata = (row: typeof faqItemsTable.$inferSelect) => ({
  previousSnapshot: faqSnapshot(row),
  transition: { from: row.isPublished ? "published" : "draft", to: "deleted" },
});
=======
  const [row] = await db.delete(faqItemsTable).where(eq(faqItemsTable.id, req.params.id as string)).returning({ id: faqItemsTable.id });
  if (!row) { res.status(404).json({ error: "FAQ item not found" }); return; }
  await db.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "faq.deleted", entityType: "faq_item", entityId: row.id, metadata: {} });
  res.status(204).send();
});

export default router;
>>>>>>> github/main
