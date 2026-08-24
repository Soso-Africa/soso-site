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
  policyDocumentsTable,
  policyDocumentRevisionsTable,
  journalPostRevisionsTable,
  journalPostsTable,
  siteContentTable,
} from "@workspace/db";
import { asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";

const router: IRouter = Router();

router.use("/staff", requireStaff);

router.get("/staff/content/site", requireStaffRoles("owner", "editor"), async (_req, res): Promise<void> => {
  const [row] = await db.update(policyDocumentsTable).set({ status: "published", effectiveAt, publishedAt: new Date(), updatedAt: new Date() }).where(eq(policyDocumentsTable.id, current.id)).returning();

const policyShape = (row: typeof policyDocumentsTable.$inferSelect) => ({
  ...row,
  effectiveAt: row.effectiveAt?.toISOString() ?? null,
  reviewedAt: row.reviewedAt?.toISOString() ?? null,
  approvedAt: row.approvedAt?.toISOString() ?? null,
  publishedAt: row.publishedAt?.toISOString() ?? null,
});

  const policyId = req.params.id as string;

  const effectiveAt = req.body.effectiveAt ? new Date(req.body.effectiveAt) : new Date();
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
  const [row] = await db.update(policyDocumentsTable).set({ status: "published", effectiveAt, publishedAt: new Date(), updatedAt: new Date() }).where(eq(policyDocumentsTable.id, current.id)).returning();

const policyShape = (row: typeof policyDocumentsTable.$inferSelect) => ({
  ...row,
  effectiveAt: row.effectiveAt?.toISOString() ?? null,
  reviewedAt: row.reviewedAt?.toISOString() ?? null,
  approvedAt: row.approvedAt?.toISOString() ?? null,
  publishedAt: row.publishedAt?.toISOString() ?? null,
});

  const policyId = req.params.id as string;

  const effectiveAt = req.body.effectiveAt ? new Date(req.body.effectiveAt) : new Date();
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
  const now = new Date();
  const [row] = await db.update(policyDocumentsTable).set({ status: "published", effectiveAt, publishedAt: new Date(), updatedAt: new Date() }).where(eq(policyDocumentsTable.id, current.id)).returning();

const policyShape = (row: typeof policyDocumentsTable.$inferSelect) => ({
  ...row,
  effectiveAt: row.effectiveAt?.toISOString() ?? null,
  reviewedAt: row.reviewedAt?.toISOString() ?? null,
  approvedAt: row.approvedAt?.toISOString() ?? null,
  publishedAt: row.publishedAt?.toISOString() ?? null,
});

  const policyId = req.params.id as string;

  const effectiveAt = req.body.effectiveAt ? new Date(req.body.effectiveAt) : new Date();
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId, action: "site_content.published",
    entityType: "site_content", entityId: "site", metadata: { publishedAt: now.toISOString() },
  });
  res.json(row);
});

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
    const parsed = UpdateStaffJournalPostBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please complete the article details" });
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
  const [row] = await db.update(policyDocumentsTable).set({ status: "published", effectiveAt, publishedAt: new Date(), updatedAt: new Date() }).where(eq(policyDocumentsTable.id, current.id)).returning();

const policyShape = (row: typeof policyDocumentsTable.$inferSelect) => ({
  ...row,
  effectiveAt: row.effectiveAt?.toISOString() ?? null,
  reviewedAt: row.reviewedAt?.toISOString() ?? null,
  approvedAt: row.approvedAt?.toISOString() ?? null,
  publishedAt: row.publishedAt?.toISOString() ?? null,
});

  const policyId = req.params.id as string;

  const effectiveAt = req.body.effectiveAt ? new Date(req.body.effectiveAt) : new Date();
  await db.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "faq.created", entityType: "faq_item", entityId: row!.id, metadata: { question: row!.question } });
  res.status(201).json(row);
});

router.patch("/staff/faq/:id", requireStaffRoles("owner", "editor"), async (req, res): Promise<void> => {
  const { question, answer, category, sortOrder, isPublished } = req.body as Record<string, unknown>;
  const updates: Partial<typeof policyDocumentsTable.$inferInsert> = { updatedAt: new Date(), reviewedAt: null, reviewedByClerkUserId: null, approvedAt: null, approvedByClerkUserId: null, publishedAt: null };
  if (typeof title === "string" && title.trim()) updates.title = title.trim();
  if (typeof summary === "string" && summary.trim()) updates.summary = summary.trim();
  if (Array.isArray(sections)) updates.sections = sections;
  if (typeof req.body.status === "string" && ["draft", "review"].includes(req.body.status)) updates.status = req.body.status;
  const [row] = await db.update(policyDocumentsTable).set({ status: "published", effectiveAt, publishedAt: new Date(), updatedAt: new Date() }).where(eq(policyDocumentsTable.id, current.id)).returning();

const policyShape = (row: typeof policyDocumentsTable.$inferSelect) => ({
  ...row,
  effectiveAt: row.effectiveAt?.toISOString() ?? null,
  reviewedAt: row.reviewedAt?.toISOString() ?? null,
  approvedAt: row.approvedAt?.toISOString() ?? null,
  publishedAt: row.publishedAt?.toISOString() ?? null,
});

  const policyId = req.params.id as string;

  const effectiveAt = req.body.effectiveAt ? new Date(req.body.effectiveAt) : new Date();
  if (!row) { res.status(404).json({ error: "Policy not found" }); return; }
  await db.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "policy.reviewed", entityType: "policy_document", entityId: row.id, metadata: {} });
  res.json(policyShape(row));
});

router.post("/staff/policies/:id/approve", requireStaffRoles("owner"), async (req, res): Promise<void> => {
  const [row] = await db.update(policyDocumentsTable).set({ status: "published", effectiveAt, publishedAt: new Date(), updatedAt: new Date() }).where(eq(policyDocumentsTable.id, current.id)).returning();

const policyShape = (row: typeof policyDocumentsTable.$inferSelect) => ({
  ...row,
  effectiveAt: row.effectiveAt?.toISOString() ?? null,
  reviewedAt: row.reviewedAt?.toISOString() ?? null,
  approvedAt: row.approvedAt?.toISOString() ?? null,
  publishedAt: row.publishedAt?.toISOString() ?? null,
});

  const policyId = req.params.id as string;

  const effectiveAt = req.body.effectiveAt ? new Date(req.body.effectiveAt) : new Date();
  await db.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "policy.published", entityType: "policy_document", entityId: row!.id, metadata: { version: row!.version, effectiveAt: effectiveAt.toISOString() } });
  res.json(policyShape(row!));
});

router.get("/staff/policies/:id/revisions", requireStaffRoles("owner", "editor"), async (req, res): Promise<void> => {
  res.json(await db.select().from(policyDocumentRevisionsTable).where(eq(policyDocumentRevisionsTable.policyDocumentId, req.params.id as string)).orderBy(desc(policyDocumentRevisionsTable.createdAt)));
});

export default router;

  const current = (await db.select().from(policyDocumentsTable).where(eq(policyDocumentsTable.id, req.params.id as string)).limit(1))[0];

  const { slug, title, summary, sections } = req.body as Record<string, unknown>;

  const existing = await db.select({ version: policyDocumentsTable.version }).from(policyDocumentsTable)
    .where(eq(policyDocumentsTable.slug, slug as string)).orderBy(desc(policyDocumentsTable.version)).limit(1);

  const { title, summary, sections } = req.body as Record<string, unknown>;
