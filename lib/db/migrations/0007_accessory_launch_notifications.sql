-- Additive, idempotent storage for purpose-limited accessory launch requests.
CREATE TABLE IF NOT EXISTS "soso_accessory_launch_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "product_slug" text NOT NULL,
  "accessory_category" text NOT NULL,
  "email_notification_consent" boolean NOT NULL,
  "policy_version" text DEFAULT 'accessory-launch-v1' NOT NULL,
  "consented_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "soso_accessory_launch_notifications_identity_idx"
  ON "soso_accessory_launch_notifications" USING btree ("email", "product_slug", "accessory_category");

CREATE INDEX IF NOT EXISTS "soso_accessory_launch_notifications_created_idx"
  ON "soso_accessory_launch_notifications" USING btree ("created_at");

ALTER TABLE "soso_accessory_launch_notifications"
  ADD COLUMN IF NOT EXISTS "policy_version" text DEFAULT 'accessory-launch-v1' NOT NULL;