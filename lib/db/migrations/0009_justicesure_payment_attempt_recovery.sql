ALTER TABLE "soso_commerce_checkout_attempts"
  ADD COLUMN IF NOT EXISTS "justicesure_payment_attempt_id" text,
  ADD COLUMN IF NOT EXISTS "payment_recovery_checked_at" timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS "soso_commerce_attempt_justicesure_payment_attempt_idx"
  ON "soso_commerce_checkout_attempts" ("justicesure_payment_attempt_id")
  WHERE "justicesure_payment_attempt_id" IS NOT NULL;