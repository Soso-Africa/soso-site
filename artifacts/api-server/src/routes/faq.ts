import { Router, type IRouter } from "express";
<<<<<<< HEAD
import { faqItemsTable, policyDocumentsTable, db } from "@workspace/db";
import { eq, asc, and, desc } from "drizzle-orm";
=======
import { faqItemsTable, db } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
>>>>>>> github/main

const router: IRouter = Router();

const STATIC_FAQ_ITEMS = [
  { id: "how-made-to-order-works", category: "Ordering", question: "How does the SOSO made-to-order process work?", answer: "Select a piece from the collection, choose your size or opt for Custom sizing, then proceed to secure payment. After payment is confirmed, the SOSO atelier contacts you directly to discuss making details — finish direction, measurements where needed, and next steps. Your garment is then made specifically for you." },
  { id: "what-happens-after-payment", category: "Ordering", question: "What happens after I pay?", answer: "Once your payment is confirmed, you will receive a payment confirmation. The SOSO atelier will then reach out to you to confirm the production details for your piece — including any measurements, finish preferences, or styling choices. Made-to-order garments are not produced until after payment is received." },
  { id: "standard-sizes", category: "Sizing", question: "What standard sizes are available?", answer: "SOSO garments are available in S, M, L, XL, and XXL. Each product page includes a fit guide with measurements to help you choose the right size. If your measurements fall between sizes or outside the standard range, Custom sizing is available." },
  { id: "custom-sizing", category: "Sizing", question: "What is Custom sizing?", answer: "Selecting Custom means your garment will be made to your personal measurements. After payment, the atelier will collect the measurements required for your specific piece." },
  { id: "stylist-help", category: "Sizing", question: "How do I get sizing help before I order?", answer: "You can ask a SOSO stylist a question at any point before checkout — use the 'Ask a stylist' option on the product page, during checkout, or from the homepage." },
  { id: "change-after-payment", category: "Ordering", question: "Can I change my order after payment?", answer: "If you need to change any details after payment, contact the SOSO atelier as soon as possible. Because garments are made to order and production begins quickly, changes may not always be possible once making has started." },
  { id: "care-guide", category: "Care", question: "How should I care for my SOSO garment?", answer: "Most SOSO garments should be hand-washed or gently machine-washed in cool water, then line-dried away from direct sunlight. Iron on a cool or medium setting, and store folded rather than hung to preserve shape." },
  { id: "what-is-bespoke", category: "About SOSO", question: "What makes SOSO a bespoke house?", answer: "Every SOSO piece is made specifically for the person who orders it. Nothing is taken from a production rack. The atelier confirms details, finish preferences, and measurements after each payment." },
  { id: "delivery-questions", category: "Delivery", question: "Where does SOSO deliver?", answer: "Delivery details, regions, and timelines will be confirmed by the atelier after your payment is received. If you have a specific delivery question before ordering, use the 'Ask a stylist' option." },
  { id: "payment-security", category: "Payment", question: "Is my payment secure?", answer: "SOSO uses a secure, hosted payment process. Your card details are never stored by SOSO — they are handled entirely by the payment provider." },
];

router.get("/faq", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(faqItemsTable)
      .where(eq(faqItemsTable.isPublished, true))
      .orderBy(asc(faqItemsTable.sortOrder), asc(faqItemsTable.createdAt));

    if (rows.length > 0) {
      res.json(rows.map((r) => ({ id: r.id, category: r.category ?? "General", question: r.question, answer: r.answer })));
      return;
    }
  } catch {
    // fall through to static
  }
  res.json(STATIC_FAQ_ITEMS);
});

<<<<<<< HEAD
// Public policy responses only expose an explicitly published, effective version.
router.get("/policies/:slug", async (req, res): Promise<void> => {
  const [row] = await db.select().from(policyDocumentsTable)
    .where(and(eq(policyDocumentsTable.slug, req.params.slug), eq(policyDocumentsTable.status, "published")))
    .orderBy(desc(policyDocumentsTable.version)).limit(1);
  if (!row || !row.effectiveAt || row.effectiveAt > new Date()) {
    res.status(404).json({ error: "No effective policy is published" });
    return;
  }
  res.json({ slug: row.slug, title: row.title, summary: row.summary, sections: row.sections, version: row.version, effectiveAt: row.effectiveAt });
});

=======
>>>>>>> github/main
export default router;
