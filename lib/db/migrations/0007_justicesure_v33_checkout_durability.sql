ALTER TABLE "soso_commerce_checkout_attempts"
  ADD COLUMN IF NOT EXISTS "quote_id" uuid,
  ADD COLUMN IF NOT EXISTS "quote_snapshot" jsonb,
  ADD COLUMN IF NOT EXISTS "display_currency" text,
  ADD COLUMN IF NOT EXISTS "payment_method" text,
  ADD COLUMN IF NOT EXISTS "notes" text,
  ADD COLUMN IF NOT EXISTS "order_request_body" jsonb,
  ADD COLUMN IF NOT EXISTS "payment_session_request_body" jsonb;

ALTER TABLE "soso_commerce_webhook_events"
  ADD COLUMN IF NOT EXISTS "lease_generation" integer DEFAULT 1 NOT NULL;