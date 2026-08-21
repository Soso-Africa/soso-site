import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import {
  CreateEnquiryBody,
  CreateEnquiryResponse,
  GetJournalPostParams,
  GetJournalPostResponse,
  ListJournalPostsResponse,
} from "@workspace/api-zod";
import { customerEnquiriesTable, db, journalPostsTable, rateLimitBucketsTable } from "@workspace/db";
import { and, desc, eq, isNotNull, lt, sql } from "drizzle-orm";

const router: IRouter = Router();
const ENQUIRY_RATE_WINDOW_MS = 60_000;
const MAX_ENQUIRIES_PER_IP_WINDOW = 8;

async function isEnquiryRateLimited(ipAddress: string): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ENQUIRY_RATE_WINDOW_MS);
  const key = createHash("sha256").update(`enquiries:ip:${ipAddress}`).digest("hex");

  await db.delete(rateLimitBucketsTable).where(lt(rateLimitBucketsTable.expiresAt, now));

  const [bucket] = await db
    .insert(rateLimitBucketsTable)
    .values({ key, requestCount: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimitBucketsTable.key,
      set: {
        requestCount: sql<number>`case
          when ${rateLimitBucketsTable.expiresAt} <= ${now} then 1
          else ${rateLimitBucketsTable.requestCount} + 1
        end`,
        expiresAt: sql<Date>`case
          when ${rateLimitBucketsTable.expiresAt} <= ${now} then ${expiresAt}
          else ${rateLimitBucketsTable.expiresAt}
        end`,
      },
    })
    .returning({ requestCount: rateLimitBucketsTable.requestCount });

  return (bucket?.requestCount ?? 0) > MAX_ENQUIRIES_PER_IP_WINDOW;
}

router.post("/enquiries", async (req, res): Promise<void> => {
  const parsed = CreateEnquiryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please provide a complete question" });
    return;
  }

  if (await isEnquiryRateLimited(req.ip ?? "unknown")) {
    res.status(429).json({ error: "Too many enquiries. Please wait a moment and try again." });
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