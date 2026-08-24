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
} from "@workspace/db";
import { asc, desc, eq, sql } from "drizzle-orm";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";

const router: IRouter = Router();

router.use("/staff", requireStaff);

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
    const parsed = CreateStaffJournalPostBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please complete the article details" });
      return;
    }

    const post = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(journalPostsTable)
        .values({
          ...parsed.data,
          publishedAt: parsed.data.status === "published" ? new Date() : null,
        })
        .returning();

      const [revision] = await tx
        .insert(journalPostRevisionsTable)
        .values({
          journalPostId: created!.id,
          snapshot: journalSnapshot(created!),
          contentHash: journalFingerprint(created!),
          createdByClerkUserId: req.staff!.clerkUserId,
        })
        .returning();

      await tx.insert(auditLogsTable).values({
        actorClerkUserId: req.staff!.clerkUserId,
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
      return created!;
    });

    res.status(201).json(CreateStaffJournalPostResponse.parse(post));
  },
);

router.patch(
  "/staff/journal/:id",
  requireStaffRoles("owner", "editor"),
  async (req, res): Promise<void> => {
    const params = UpdateStaffJournalPostParams.safeParse(req.params);
    const parsed = UpdateStaffJournalPostBody.safeParse(req.body);
    if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) {
      res.status(400).json({ error: "Please provide valid article updates" });
      return;
    }

    const post = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(journalPostsTable)
        .where(eq(journalPostsTable.id, params.data.id))
        .limit(1);
      if (!current) return null;
      const [previousRevision] = await tx
        .select({ id: journalPostRevisionsTable.id })
        .from(journalPostRevisionsTable)
        .where(eq(journalPostRevisionsTable.journalPostId, current.id))
        .orderBy(desc(journalPostRevisionsTable.createdAt))
        .limit(1);

      const status = parsed.data.status ?? current.status;
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
      return updated!;
    });

    if (!post) {
      res.status(404).json({ error: "Article not found" });
      return;
    }

    res.json(UpdateStaffJournalPostResponse.parse(post));
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

router.get("/staff/faq", requireStaffRoles("owner", "editor"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(faqItemsTable).orderBy(asc(faqItemsTable.sortOrder), asc(faqItemsTable.createdAt));
  res.json(rows);
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
    isPublished: isPublished !== false,
  }).returning();
  await db.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "faq.created", entityType: "faq_item", entityId: row!.id, metadata: { question: row!.question } });
  res.status(201).json(row);
});

router.patch("/staff/faq/:id", requireStaffRoles("owner", "editor"), async (req, res): Promise<void> => {
  const { question, answer, category, sortOrder, isPublished } = req.body as Record<string, unknown>;
  const updates: Partial<typeof faqItemsTable.$inferInsert> = {};
  if (typeof question === "string" && question.trim()) updates.question = question.trim();
  if (typeof answer === "string" && answer.trim()) updates.answer = answer.trim();
  if (category !== undefined) updates.category = typeof category === "string" && category.trim() ? category.trim() : null;
  if (typeof sortOrder === "number") updates.sortOrder = sortOrder;
  if (typeof isPublished === "boolean") updates.isPublished = isPublished;
  if (!Object.keys(updates).length) { res.status(400).json({ error: "No valid fields to update" }); return; }
  updates.updatedAt = new Date();
  const [row] = await db.update(faqItemsTable).set(updates).where(eq(faqItemsTable.id, req.params.id as string)).returning();
  if (!row) { res.status(404).json({ error: "FAQ item not found" }); return; }
  await db.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "faq.updated", entityType: "faq_item", entityId: row.id, metadata: {} });
  res.json(row);
});

router.delete("/staff/faq/:id", requireStaffRoles("owner", "editor"), async (req, res): Promise<void> => {
  const [row] = await db.delete(faqItemsTable).where(eq(faqItemsTable.id, req.params.id as string)).returning({ id: faqItemsTable.id });
  if (!row) { res.status(404).json({ error: "FAQ item not found" }); return; }
  await db.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "faq.deleted", entityType: "faq_item", entityId: row.id, metadata: {} });
  res.status(204).send();
});

export default router;