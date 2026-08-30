CREATE INDEX IF NOT EXISTS "soso_analytics_events_consent_occurred_idx"
  ON "soso_analytics_events" USING btree ("consent", "occurred_at");