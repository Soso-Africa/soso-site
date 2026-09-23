-- Cover the staff momentum report's date scan, grouping keys, and normalized
-- identity expression without exposing or returning subscriber addresses.
DROP INDEX IF EXISTS "soso_accessory_launch_notifications_created_idx";

CREATE INDEX IF NOT EXISTS "soso_accessory_launch_notifications_summary_idx"
  ON "soso_accessory_launch_notifications" USING btree (
    "created_at",
    "accessory_category",
    "product_slug",
    lower("email")
  );