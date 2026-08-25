import assert from "node:assert/strict";
import test from "node:test";
import { auditLogsTable, db, journalPostRevisionsTable, journalPostsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
const journalSeed = await (new Function("url", "return import(url)")(
  new URL("../../../../lib/db/scripts/seed-soso-journal-launch.mjs", import.meta.url).href,
) as Promise<{
  JOURNAL_SEED_ACTOR: string;
  seedSosoJournalLaunch(input: { databaseUrl?: string }): Promise<{ createdSlugs: string[]; skippedSlugs: string[] }>;
}>);
const { JOURNAL_SEED_ACTOR, seedSosoJournalLaunch } = journalSeed;

const weddingSlug = "what-to-wear-to-a-nigerian-wedding";
const buyingSlug = "how-to-buy-luxury-nigerian-menswear-online";

test("launch Journal seed is published, useful, and idempotent", async () => {
  await db.delete(journalPostsTable).where(sql`${journalPostsTable.slug} IN (${weddingSlug}, ${buyingSlug})`);
  const first = await seedSosoJournalLaunch({ databaseUrl: process.env.DATABASE_URL });
  assert.deepEqual(first.createdSlugs.sort(), [buyingSlug, weddingSlug].sort());

  const posts = await db.select().from(journalPostsTable)
    .where(sql`${journalPostsTable.slug} IN (${weddingSlug}, ${buyingSlug})`);
  assert.equal(posts.length, 2);
  for (const post of posts) {
    assert.equal(post.status, "published");
    assert.equal(post.authorName, "SOSO Africa Editorial");
    assert.ok(post.coverImageUrl?.startsWith("/images/soso/"));
    assert.ok(post.coverImageAlt);
    assert.ok(post.seoTitle);
    assert.ok(post.seoDescription);
    assert.ok(post.body.includes("## FAQ"));
    assert.ok(post.relatedProductSlugs?.length);
    assert.deepEqual(post.relatedArticleSlugs, [post.slug === weddingSlug ? buyingSlug : weddingSlug]);
    const revisions = await db.select().from(journalPostRevisionsTable)
      .where(eq(journalPostRevisionsTable.journalPostId, post.id));
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0]?.createdByClerkUserId, JOURNAL_SEED_ACTOR);
  }
  const audits = await db.select().from(auditLogsTable)
    .where(and(
      eq(auditLogsTable.action, "journal.created"),
      sql`${auditLogsTable.entityId} IN (${posts[0]!.id}, ${posts[1]!.id})`,
    ));
  assert.equal(audits.length, 2);
  for (const audit of audits) {
    assert.equal(audit.actorClerkUserId, JOURNAL_SEED_ACTOR);
    assert.equal(audit.entityType, "journal_post");
    assert.equal((audit.metadata as { source?: string }).source, "launch_journal_seed_v1");
    const revisionId = (audit.metadata as { revisionId?: string }).revisionId;
    assert.ok(revisionId);
    const [revision] = await db.select({ id: journalPostRevisionsTable.id })
      .from(journalPostRevisionsTable)
      .where(and(
        eq(journalPostRevisionsTable.id, revisionId),
        eq(journalPostRevisionsTable.journalPostId, audit.entityId!),
      ));
    assert.equal(revision?.id, revisionId);
  }
  assert.match(posts.find((post) => post.slug === buyingSlug)!.body, /confirm.*destination.*timing/i);

  const second = await seedSosoJournalLaunch({ databaseUrl: process.env.DATABASE_URL });
  assert.deepEqual(second.createdSlugs, []);
  const revisionCount = await db.select({ count: sql<number>`count(*)::int` }).from(journalPostRevisionsTable)
    .where(sql`${journalPostRevisionsTable.journalPostId} IN (${posts[0]!.id}, ${posts[1]!.id})`);
  assert.equal(revisionCount[0]?.count, 2);
  const auditCount = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogsTable)
    .where(and(
      eq(auditLogsTable.action, "journal.created"),
      sql`${auditLogsTable.entityId} IN (${posts[0]!.id}, ${posts[1]!.id})`,
    ));
  assert.equal(auditCount[0]?.count, 2);
});

for (const existingStatus of ["draft", "archived"]) {
  test(`launch Journal seed preserves an existing ${existingStatus} counterpart without linking to it`, async () => {
    await db.delete(journalPostsTable).where(sql`${journalPostsTable.slug} IN (${weddingSlug}, ${buyingSlug})`);
    const original = {
      slug: weddingSlug, title: "Staff title", excerpt: "Staff excerpt", body: "Staff body",
      authorName: "Staff Editor", status: existingStatus, relatedArticleSlugs: ["staff-selected-article"],
    };
    const [staffPost] = await db.insert(journalPostsTable).values(original).returning();
    const result = await seedSosoJournalLaunch({ databaseUrl: process.env.DATABASE_URL });
    assert.deepEqual(result.createdSlugs, [buyingSlug]);
    assert.ok(result.skippedSlugs.includes(weddingSlug));

    const [preserved] = await db.select().from(journalPostsTable)
      .where(eq(journalPostsTable.id, staffPost!.id));
    assert.deepEqual(preserved, staffPost);
    assert.equal(preserved?.title, original.title);
    assert.equal(preserved?.body, original.body);
    assert.equal(preserved?.status, existingStatus);
    assert.equal(preserved?.authorName, original.authorName);
    assert.deepEqual(preserved?.relatedArticleSlugs, original.relatedArticleSlugs);

    const [created] = await db.select().from(journalPostsTable)
      .where(eq(journalPostsTable.slug, buyingSlug));
    assert.equal(created?.status, "published");
    assert.deepEqual(created?.relatedArticleSlugs, []);

    const rerun = await seedSosoJournalLaunch({ databaseUrl: process.env.DATABASE_URL });
    assert.deepEqual(rerun.createdSlugs, []);
    const preservedRevisions = await db.select().from(journalPostRevisionsTable)
      .where(eq(journalPostRevisionsTable.journalPostId, staffPost!.id));
    assert.equal(preservedRevisions.length, 0);
  });
}