import { Router, type IRouter } from "express";
import {
  CreateEnquiryBody,
  CreateEnquiryResponse,
  GetJournalPostParams,
  GetJournalPostResponse,
  ListJournalPostsResponse,
} from "@workspace/api-zod";
import { customerEnquiriesTable, db, journalPostsTable } from "@workspace/db";
import { and, desc, eq, isNotNull } from "drizzle-orm";

const router: IRouter = Router();

router.post("/enquiries", async (req, res): Promise<void> => {
  const parsed = CreateEnquiryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please provide a complete question" });
    return;
  }

  const [enquiry] = await db.insert(customerEnquiriesTable).values(parsed.data).returning();
  res.status(201).json(CreateEnquiryResponse.parse(enquiry));
});

router.get("/journal", async (_req, res): Promise<void> => {
  const posts = await db
    .select({
      slug: journalPostsTable.slug,
      title: journalPostsTable.title,
      excerpt: journalPostsTable.excerpt,
      coverImageUrl: journalPostsTable.coverImageUrl,
      authorName: journalPostsTable.authorName,
      publishedAt: journalPostsTable.publishedAt,
    })
    .from(journalPostsTable)
    .where(and(eq(journalPostsTable.status, "published"), isNotNull(journalPostsTable.publishedAt)))
    .orderBy(desc(journalPostsTable.publishedAt));

  res.json(ListJournalPostsResponse.parse(posts));
});

router.get("/journal/:slug", async (req, res): Promise<void> => {
  const params = GetJournalPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid article address" });
    return;
  }

  const [post] = await db
    .select()
    .from(journalPostsTable)
    .where(
      and(
        eq(journalPostsTable.slug, params.data.slug),
        eq(journalPostsTable.status, "published"),
        isNotNull(journalPostsTable.publishedAt),
      ),
    )
    .limit(1);

  if (!post) {
    res.status(404).json({ error: "Article not found" });
    return;
  }

  res.json(GetJournalPostResponse.parse(post));
});

export default router;