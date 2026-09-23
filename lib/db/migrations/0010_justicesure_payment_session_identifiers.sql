ALTER TABLE "soso_commerce_checkout_attempts"
  ADD COLUMN IF NOT EXISTS "justicesure_payment_intent_id" text,
  ADD COLUMN IF NOT EXISTS "justicesure_original_charge" jsonb;