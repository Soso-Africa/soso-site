-- Additive production migration from the schema at commit 1b2f54e.
-- Keep this migration idempotent: production may have received some changes
-- through an earlier drizzle-kit push or schema-diff operation.

ALTER TYPE "soso_staff_role" ADD VALUE IF NOT EXISTS 'administrator' AFTER 'owner';

CREATE TABLE IF NOT EXISTS "soso_site_content_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "content_key" text NOT NULL,
  "event" text NOT NULL,
  "snapshot" jsonb,
  "content_hash" text NOT NULL,
  "created_by_clerk_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "soso_site_content_revisions_content_key_soso_site_content_key_fk"
    FOREIGN KEY ("content_key")
    REFERENCES "soso_site_content"("key")
    ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "soso_site_content_revisions_key_created_idx"
  ON "soso_site_content_revisions" USING btree ("content_key", "created_at");

ALTER TABLE "soso_redirects"
  ADD COLUMN IF NOT EXISTS "is_published" boolean DEFAULT true NOT NULL;

ALTER TABLE "soso_redirects"
  ADD COLUMN IF NOT EXISTS "updated_by_clerk_user_id" text;

ALTER TABLE "soso_redirects"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "soso_redirect_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "redirect_id" uuid NOT NULL,
  "event" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_by_clerk_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "soso_redirect_revisions_redirect_created_idx"
  ON "soso_redirect_revisions" USING btree ("redirect_id", "created_at");

CREATE TABLE IF NOT EXISTS "soso_content_seed_state" (
  "key" text PRIMARY KEY NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "soso_faq_items"
  ("question", "answer", "category", "sort_order", "is_published")
SELECT
  seed."question",
  seed."answer",
  seed."category",
  seed."sort_order",
  seed."is_published"
FROM (
  VALUES
    ('How does the SOSO made-to-order process work?', 'Select a piece from the collection, choose your size or opt for Custom sizing, then proceed to secure payment. After payment is confirmed, the SOSO atelier contacts you directly to discuss making details — finish direction, measurements where needed, and next steps. Your garment is then made specifically for you.', 'Ordering', 0, true),
    ('What happens after I pay?', 'Once your payment is confirmed, you will receive a payment confirmation. The SOSO atelier will then reach out to you to confirm the production details for your piece — including any measurements, finish preferences, or styling choices. Made-to-order garments are not produced until after payment is received.', 'Ordering', 1, true),
    ('What standard sizes are available?', 'SOSO garments are available in S, M, L, XL, and XXL. Each product page includes a fit guide with measurements to help you choose the right size. If your measurements fall between sizes or outside the standard range, Custom sizing is available.', 'Sizing', 2, true),
    ('What is Custom sizing?', 'Selecting Custom means your garment will be made to your personal measurements. After payment, the atelier will collect the measurements required for your specific piece.', 'Sizing', 3, true),
    ('How do I get sizing help before I order?', 'You can ask a SOSO stylist a question at any point before checkout — use the ''Ask a stylist'' option on the product page, during checkout, or from the homepage.', 'Sizing', 4, true),
    ('Can I change my order after payment?', 'If you need to change any details after payment, contact the SOSO atelier as soon as possible. Because garments are made to order and production begins quickly, changes may not always be possible once making has started.', 'Ordering', 5, true),
    ('How should I care for my SOSO garment?', 'Most SOSO garments should be hand-washed or gently machine-washed in cool water, then line-dried away from direct sunlight. Iron on a cool or medium setting, and store folded rather than hung to preserve shape.', 'Care', 6, true),
    ('What makes SOSO a bespoke house?', 'Every SOSO piece is made specifically for the person who orders it. Nothing is taken from a production rack. The atelier confirms details, finish preferences, and measurements after each payment.', 'About SOSO', 7, true),
    ('Where does SOSO deliver?', 'Delivery details, regions, and timelines will be confirmed by the atelier after your payment is received. If you have a specific delivery question before ordering, use the ''Ask a stylist'' option.', 'Delivery', 8, true),
    ('Is my payment secure?', 'SOSO uses a secure, hosted payment process. Your card details are never stored by SOSO — they are handled entirely by the payment provider.', 'Payment', 9, true)
) AS seed("question", "answer", "category", "sort_order", "is_published")
WHERE NOT EXISTS (
  SELECT 1 FROM "soso_content_seed_state" WHERE "key" = 'approved-faq-v1'
)
AND NOT EXISTS (SELECT 1 FROM "soso_faq_items");

INSERT INTO "soso_content_seed_state" ("key")
VALUES ('approved-faq-v1')
ON CONFLICT ("key") DO NOTHING;