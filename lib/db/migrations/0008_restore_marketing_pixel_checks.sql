-- Restore checks omitted by older drizzle-kit pushes.
-- Keep this migration idempotent for fresh and legacy schemas.
DO $$ BEGIN
  ALTER TABLE "soso_marketing_pixel_setting_revisions"
    ADD CONSTRAINT "soso_marketing_pixel_setting_revisions_revision_check"
    CHECK ("revision" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "soso_marketing_pixel_settings"
    ADD CONSTRAINT "soso_marketing_pixel_settings_schema_version_check"
    CHECK ("schema_version" = 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "soso_marketing_pixel_settings"
    ADD CONSTRAINT "soso_marketing_pixel_settings_revision_check"
    CHECK ("revision" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;