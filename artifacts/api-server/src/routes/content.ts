import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import {
  CreateEnquiryBody,
  CreateEnquiryResponse,
  CreatePrivacyRequestBody,
  CreatePrivacyRequestResponse,
  GetJournalPostParams,
  GetJournalPostResponse,
  ListJournalPostsResponse,
} from "@workspace/api-zod";
import {
  auditLogsTable,
  customerEnquiriesTable,
  db,
  journalPostsTable,
  operationalNotificationsTable,
  privacyRequestsTable,
  rateLimitBucketsTable,
  siteContentTable,
} from "@workspace/db";
import { and, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { currentPrivacyPolicyVersion, recordPrivacyPolicyVersion } from "../lib/privacyPolicy";
import { PlatformContentSchema } from "../lib/platform-content";

const router: IRouter = Router();
const ENQUIRY_RATE_WINDOW_MS = 60_000;
const MAX_ENQUIRIES_PER_IP_WINDOW = 8;
const PRIVACY_REQUEST_RATE_WINDOW_MS = 60 * 60_000;
const MAX_PRIVACY_REQUESTS_PER_IP_WINDOW = 3;

async function isEnquiryRateLimited(ipAddress: string): Promise<boolean> {
  return isRateLimited("enquiries", ipAddress, ENQUIRY_RATE_WINDOW_MS, MAX_ENQUIRIES_PER_IP_WINDOW);
}

async function isRateLimited(namespace: string, ipAddress: string, windowMs: number, maximum: number): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);
  const key = createHash("sha256").update(`${namespace}:ip:${ipAddress}`).digest("hex");

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

  return (bucket?.requestCount ?? 0) > maximum;
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

router.post("/privacy-requests", async (req, res): Promise<void> => {
  const parsed = CreatePrivacyRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please provide a valid privacy request" });
    return;
  }

  if (await isRateLimited("privacy-requests", req.ip ?? "unknown", PRIVACY_REQUEST_RATE_WINDOW_MS, MAX_PRIVACY_REQUESTS_PER_IP_WINDOW)) {
    res.status(429).json({ error: "Too many requests. Please wait before trying again." });
    return;
  }

  const policyVersion = currentPrivacyPolicyVersion();
  await db.transaction(async (tx) => {
    await recordPrivacyPolicyVersion(tx, policyVersion);
    const [request] = await tx
      .insert(privacyRequestsTable)
      .values({ ...parsed.data, policyVersion })
      .returning({ id: privacyRequestsTable.id, requestType: privacyRequestsTable.requestType });
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: "public",
      action: "privacy_request.submitted",
      entityType: "privacy_request",
      entityId: request!.id,
      metadata: { requestType: request!.requestType, policyVersion },
    });
    await tx.insert(operationalNotificationsTable).values({
      severity: "attention",
      title: "Privacy request received",
      body: "A privacy request is awaiting identity verification.",
      targetRole: "owner",
    });
  });

  // Do not expose a record identifier or whether the requester is known.
  res.status(202).json(CreatePrivacyRequestResponse.parse({ accepted: true }));
});

router.get("/journal", async (_req, res): Promise<void> => {
  const posts = await db
    .select({
      slug: journalPostsTable.slug,
      title: journalPostsTable.title,
      excerpt: journalPostsTable.excerpt,
      coverImageUrl: journalPostsTable.coverImageUrl,
      coverImageAlt: journalPostsTable.coverImageAlt,
      authorName: journalPostsTable.authorName,
      category: journalPostsTable.category,
      tags: journalPostsTable.tags,
      readTimeMinutes: journalPostsTable.readTimeMinutes,
      publishedAt: journalPostsTable.publishedAt,
    })
    .from(journalPostsTable)
    .where(and(eq(journalPostsTable.status, "published"), isNotNull(journalPostsTable.publishedAt)))
    .orderBy(desc(journalPostsTable.publishedAt));

  res.json(ListJournalPostsResponse.parse(posts));
});

router.get("/content/site", async (_req, res): Promise<void> => {
  const [row] = await db.select({ content: siteContentTable.published, publishedAt: siteContentTable.publishedAt })
    .from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
  if (!row || !row.publishedAt || Object.keys(row.content).length === 0) {
    res.status(404).json({ error: "Platform content is not published" });
    return;
  }
  const parsed = PlatformContentSchema.safeParse(row.content);
  if (!parsed.success) { res.status(500).json({ error: "Published platform content is invalid" }); return; }
  res.json({ content: parsed.data.site });
});

router.get("/content/platform", async (_req, res): Promise<void> => {
  const [row] = await db.select({ content: siteContentTable.published, publishedAt: siteContentTable.publishedAt })
    .from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
  if (!row || !row.publishedAt || Object.keys(row.content).length === 0) {
    res.status(404).json({ error: "Platform content is not published" });
    return;
  }
  const parsed = PlatformContentSchema.safeParse(row.content);
  if (!parsed.success) { res.status(500).json({ error: "Published platform content is invalid" }); return; }
  res.json({ content: parsed.data, publishedAt: row.publishedAt });
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

  res.json(GetJournalPostResponse.parse({ ...post, updatedAt: post.updatedAt.toISOString() }));
});

export default router;