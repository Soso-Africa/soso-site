import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { faqItemsTable, policyDocumentsTable, db } from "@workspace/db";
import { eq, asc, and, desc, isNotNull, lte } from "drizzle-orm";

const router: IRouter = Router();
const policySlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const policySection = z.object({
  id: policySlug,
  heading: z.string().trim().min(1).max(240),
  paragraphs: z.array(z.string().trim().min(1).max(10_000)).min(1).optional(),
  bullets: z.array(z.string().trim().min(1).max(1_000)).min(1).optional(),
}).strict().refine((section) => Boolean(section.paragraphs?.length || section.bullets?.length));
const publishedPolicy = z.object({
  slug: policySlug,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1_000),
  sections: z.array(policySection).min(1),
  version: z.number().int().positive(),
  effectiveAt: z.coerce.date(),
}).strict();
function toPublicPolicy(row: typeof policyDocumentsTable.$inferSelect) {
  return publishedPolicy.safeParse({
    slug: row.slug, title: row.title, summary: row.summary, sections: row.sections,
    version: row.version, effectiveAt: row.effectiveAt,
  });
}

type PublicFaqRow = Pick<typeof faqItemsTable.$inferSelect, "id" | "category" | "question" | "answer">;

async function listPublishedFaqItems(): Promise<PublicFaqRow[]> {
  return db
      .select()
      .from(faqItemsTable)
      .where(eq(faqItemsTable.isPublished, true))
      .orderBy(asc(faqItemsTable.sortOrder), asc(faqItemsTable.createdAt));
}

export function createFaqReadHandler(
  readPublished: () => Promise<PublicFaqRow[]> = listPublishedFaqItems,
) {
  return async (_req: Request, res: Response): Promise<void> => {
    const rows = await readPublished();
  res.json(rows.map((r) => ({ id: r.id, category: r.category ?? "General", question: r.question, answer: r.answer })));
  };
}

router.get("/faq", createFaqReadHandler());

// Public policy responses only expose explicitly published, effective versions.
router.get("/policies", async (_req, res): Promise<void> => {
  const rows = await db.select().from(policyDocumentsTable)
    .where(and(
      eq(policyDocumentsTable.status, "published"),
      isNotNull(policyDocumentsTable.effectiveAt),
      lte(policyDocumentsTable.effectiveAt, new Date()),
    ))
    .orderBy(asc(policyDocumentsTable.slug), desc(policyDocumentsTable.version));
  const latestBySlug = new Map<string, typeof rows[number]>();
  for (const row of rows) if (!latestBySlug.has(row.slug)) latestBySlug.set(row.slug, row);

  const policies = Array.from(latestBySlug.values()).map((row) => {
    const parsed = toPublicPolicy(row);
    if (!parsed.success) return null;
    return {
      slug: parsed.data.slug, title: parsed.data.title, summary: parsed.data.summary,
      version: parsed.data.version, effectiveAt: parsed.data.effectiveAt,
    };
  });
  if (policies.some((policy) => policy === null)) {
    res.status(500).json({ error: "Published policy content is invalid" });
    return;
  }
  res.json(policies);
});

router.get("/policies/:slug", async (req, res): Promise<void> => {
  const slug = policySlug.safeParse(req.params.slug);
  if (!slug.success) { res.status(400).json({ error: "Invalid policy slug" }); return; }
  const [row] = await db.select().from(policyDocumentsTable)
    .where(and(
      eq(policyDocumentsTable.slug, slug.data),
      eq(policyDocumentsTable.status, "published"),
      isNotNull(policyDocumentsTable.effectiveAt),
      lte(policyDocumentsTable.effectiveAt, new Date()),
    ))
    .orderBy(desc(policyDocumentsTable.version)).limit(1);
  if (!row) {
    res.status(404).json({ error: "No effective policy is published" });
    return;
  }
  const parsed = toPublicPolicy(row);
  if (!parsed.success) {
    res.status(500).json({ error: "Published policy content is invalid" });
    return;
  }
  res.json(parsed.data);
});

export default router;
