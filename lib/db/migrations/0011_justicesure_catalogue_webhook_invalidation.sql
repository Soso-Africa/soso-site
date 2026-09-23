ALTER TABLE "soso_commerce_webhook_events"
  ADD COLUMN IF NOT EXISTS "event_occurred_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "catalogue_identifiers" jsonb DEFAULT '[]'::jsonb NOT NULL;

CREATE INDEX IF NOT EXISTS "soso_commerce_webhook_catalogue_event_idx"
  ON "soso_commerce_webhook_events" ("event_type", "event_occurred_at");