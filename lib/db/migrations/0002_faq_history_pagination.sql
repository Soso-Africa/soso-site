-- Keep per-FAQ immutable audit history fast as the shared audit log grows.
CREATE INDEX IF NOT EXISTS "soso_audit_logs_entity_id_created_idx"
  ON "soso_audit_logs" ("entity_type", "entity_id", "created_at" DESC, "id" DESC);