CREATE TABLE IF NOT EXISTS "soso_marketing_pixel_settings" (
  "key" text PRIMARY KEY,
  "schema_version" integer NOT NULL DEFAULT 1,
  "revision" integer NOT NULL DEFAULT 1,
  "settings" jsonb NOT NULL,
  "updated_by_clerk_user_id" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "soso_marketing_pixel_settings_schema_version_check" CHECK ("schema_version" = 1),
  CONSTRAINT "soso_marketing_pixel_settings_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE IF NOT EXISTS "soso_marketing_pixel_setting_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "settings_key" text NOT NULL REFERENCES "soso_marketing_pixel_settings"("key") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_by_clerk_user_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "soso_marketing_pixel_setting_revisions_revision_check" CHECK ("revision" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "soso_marketing_pixel_revisions_key_revision_idx"
  ON "soso_marketing_pixel_setting_revisions" ("settings_key", "revision");

CREATE INDEX IF NOT EXISTS "soso_marketing_pixel_revisions_key_created_idx"
  ON "soso_marketing_pixel_setting_revisions" ("settings_key", "created_at");