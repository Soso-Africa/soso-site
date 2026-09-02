-- Full Drizzle baseline for a completely empty SOSO PostgreSQL schema.
--
-- This file is intentionally not rerunnable on an existing SOSO schema. The
-- migration runner applies it only when no SOSO objects exist, then applies all
-- later additive migrations in filename order.

CREATE TYPE "soso_commerce_attempt_status" AS ENUM('starting', 'payment_pending', 'paid', 'cancelled', 'refunded', 'fulfilled', 'failed');
CREATE TYPE "soso_commerce_webhook_status" AS ENUM('processing', 'completed', 'failed');
CREATE TYPE "soso_consent_state" AS ENUM('essential_only', 'analytics', 'marketing');
CREATE TYPE "soso_measurement_revision_actor" AS ENUM('customer', 'staff', 'system');
CREATE TYPE "soso_measurement_status" AS ENUM('needed', 'submitted', 'clarification_requested', 'confirmed', 'cancelled');
CREATE TYPE "soso_measurement_unit" AS ENUM('cm', 'in');
CREATE TYPE "soso_notification_severity" AS ENUM('info', 'attention', 'urgent');
CREATE TYPE "soso_order_item_selection_type" AS ENUM('standard', 'custom');
CREATE TYPE "soso_order_status" AS ENUM('payment_pending', 'paid', 'atelier_confirmation', 'in_production', 'ready', 'fulfilled', 'cancelled', 'refunded');
CREATE TYPE "soso_privacy_request_status" AS ENUM('received', 'identity_verified', 'in_progress', 'completed', 'rejected');
CREATE TYPE "soso_privacy_request_type" AS ENUM('access', 'deletion');
CREATE TYPE "soso_refund_request_status" AS ENUM('requested', 'approved', 'declined');
CREATE TYPE "soso_staff_role" AS ENUM('owner', 'administrator', 'operations', 'stylist', 'editor', 'analyst');

CREATE TABLE "soso_analytics_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" text,
  "event_version" integer DEFAULT 1 NOT NULL,
  "anonymous_id" text NOT NULL,
  "session_id" text,
  "event_name" text NOT NULL,
  "path" text NOT NULL,
  "referrer" text,
  "source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "device_type" text,
  "consent" "soso_consent_state" DEFAULT 'essential_only' NOT NULL,
  "properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_clerk_user_id" text NOT NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_commerce_checkout_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ownership_token_hash" text NOT NULL,
  "request_hash" text NOT NULL,
  "customer_name" text NOT NULL,
  "customer_email" text NOT NULL,
  "customer_phone" text NOT NULL,
  "items" jsonb NOT NULL,
  "fulfillment" jsonb NOT NULL,
  "order_idempotency_key" text NOT NULL,
  "payment_idempotency_key" text NOT NULL,
  "justicesure_order_id" text,
  "local_order_id" uuid,
  "provider" text,
  "payment_reference" text,
  "checkout_url" text,
  "status" "soso_commerce_attempt_status" DEFAULT 'starting' NOT NULL,
  "last_error_code" text,
  "last_error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_commerce_webhook_events" (
  "event_id" text PRIMARY KEY NOT NULL,
  "event_type" text NOT NULL,
  "api_version" text NOT NULL,
  "payload_hash" text NOT NULL,
  "status" "soso_commerce_webhook_status" DEFAULT 'processing' NOT NULL,
  "processing_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_consent_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "anonymous_id" text NOT NULL,
  "state" "soso_consent_state" NOT NULL,
  "region" text,
  "policy_version" text NOT NULL,
  "source" text DEFAULT 'banner' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_customer_enquiries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text,
  "email" text,
  "phone" text,
  "product_slug" text,
  "message" text NOT NULL,
  "status" text DEFAULT 'new' NOT NULL,
  "handling_notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_faq_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "category" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_published" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_journal_post_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "journal_post_id" uuid NOT NULL,
  "snapshot" jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "created_by_clerk_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_journal_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "excerpt" text NOT NULL,
  "body" text NOT NULL,
  "cover_image_url" text,
  "cover_image_alt" text,
  "author_name" text NOT NULL,
  "category" text,
  "tags" jsonb,
  "seo_title" text,
  "seo_description" text,
  "read_time_minutes" integer,
  "related_product_slugs" jsonb,
  "related_article_slugs" jsonb,
  "status" text DEFAULT 'draft' NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_marketing_pixel_setting_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "settings_key" text NOT NULL,
  "revision" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_by_clerk_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "soso_marketing_pixel_setting_revisions_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "soso_marketing_pixel_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "settings" jsonb NOT NULL,
  "updated_by_clerk_user_id" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "soso_marketing_pixel_settings_schema_version_check" CHECK ("schema_version" = 1),
  CONSTRAINT "soso_marketing_pixel_settings_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "soso_measurement_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_item_id" uuid NOT NULL,
  "status" "soso_measurement_status" DEFAULT 'needed' NOT NULL,
  "unit" "soso_measurement_unit",
  "values" jsonb,
  "customer_note" text,
  "clarification_note" text,
  "production_exception" text,
  "version" integer DEFAULT 1 NOT NULL,
  "submitted_at" timestamp with time zone,
  "confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_measurement_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "measurement_request_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "actor_type" "soso_measurement_revision_actor" NOT NULL,
  "actor_id" text,
  "action" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_operational_notification_acknowledgements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "notification_id" uuid NOT NULL,
  "clerk_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_operational_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "severity" "soso_notification_severity" DEFAULT 'info' NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "target_role" "soso_staff_role",
  "acknowledged_at" timestamp with time zone,
  "acknowledged_by_clerk_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_order_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "line_number" integer NOT NULL,
  "commerce_product_id" text NOT NULL,
  "commerce_variant_id" text,
  "product_slug" text NOT NULL,
  "product_name" text NOT NULL,
  "selection_type" "soso_order_item_selection_type" DEFAULT 'standard' NOT NULL,
  "selected_size" text,
  "selected_colour_id" text,
  "selected_colour_label" text,
  "selected_colour_hex" text,
  "custom_colour" text,
  "quantity" integer NOT NULL,
  "unit_price" numeric(12, 2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_number" text NOT NULL,
  "customer_email" text NOT NULL,
  "customer_name" text NOT NULL,
  "customer_phone" text,
  "currency" text DEFAULT 'NGN' NOT NULL,
  "subtotal" numeric(12, 2) NOT NULL,
  "total" numeric(12, 2) NOT NULL,
  "status" "soso_order_status" DEFAULT 'payment_pending' NOT NULL,
  "source" text DEFAULT 'storefront' NOT NULL,
  "payment_provider" text,
  "payment_reference" text,
  "atelier_notes" text,
  "delivery_notes" text,
  "refund_request_status" "soso_refund_request_status",
  "refund_request_reason" text,
  "refund_decision_note" text,
  "refund_requested_at" timestamp with time zone,
  "refund_reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_policy_document_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "policy_document_id" uuid NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_by_clerk_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_policy_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "sections" jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "reviewed_by_clerk_user_id" text,
  "reviewed_at" timestamp with time zone,
  "approved_by_clerk_user_id" text,
  "approved_at" timestamp with time zone,
  "effective_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "created_by_clerk_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_policy_versions" (
  "version" text PRIMARY KEY NOT NULL,
  "first_recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_privacy_access_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "privacy_request_id" uuid NOT NULL,
  "package_hash" text NOT NULL,
  "payload" jsonb NOT NULL,
  "row_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_clerk_user_id" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "downloaded_at" timestamp with time zone,
  "downloaded_by_clerk_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_privacy_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_type" "soso_privacy_request_type" NOT NULL,
  "requester_name" text,
  "requester_email" text NOT NULL,
  "policy_version" text DEFAULT 'unconfigured' NOT NULL,
  "status" "soso_privacy_request_status" DEFAULT 'received' NOT NULL,
  "verification_note" text,
  "verified_at" timestamp with time zone,
  "verified_by_clerk_user_id" text,
  "resolution_note" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_rate_limit_buckets" (
  "key" text PRIMARY KEY NOT NULL,
  "request_count" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "soso_redirect_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "redirect_id" uuid NOT NULL,
  "event" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_by_clerk_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_redirects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "from_path" text NOT NULL,
  "to_path" text NOT NULL,
  "status_code" integer DEFAULT 301 NOT NULL,
  "is_published" boolean DEFAULT true NOT NULL,
  "updated_by_clerk_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_site_content_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "content_key" text NOT NULL,
  "event" text NOT NULL,
  "snapshot" jsonb,
  "content_hash" text NOT NULL,
  "created_by_clerk_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_site_content" (
  "key" text PRIMARY KEY NOT NULL,
  "draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "published" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "draft_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone,
  "updated_by_clerk_user_id" text,
  "published_by_clerk_user_id" text
);

CREATE TABLE "soso_staff_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "staff_user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "soso_staff_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "clerk_user_id" text NOT NULL,
  "email" text NOT NULL,
  "password_hash" text,
  "password_changed_at" timestamp with time zone,
  "role" "soso_staff_role" NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "soso_commerce_checkout_attempts" ADD CONSTRAINT "soso_commerce_checkout_attempts_local_order_id_soso_orders_id_fk" FOREIGN KEY ("local_order_id") REFERENCES "soso_orders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "soso_journal_post_revisions" ADD CONSTRAINT "soso_journal_post_revisions_journal_post_id_soso_journal_posts_id_fk" FOREIGN KEY ("journal_post_id") REFERENCES "soso_journal_posts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "soso_marketing_pixel_setting_revisions" ADD CONSTRAINT "soso_marketing_pixel_setting_revisions_settings_key_soso_marketing_pixel_settings_key_fk" FOREIGN KEY ("settings_key") REFERENCES "soso_marketing_pixel_settings"("key") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "soso_measurement_requests" ADD CONSTRAINT "soso_measurement_requests_order_item_id_soso_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "soso_order_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "soso_measurement_revisions" ADD CONSTRAINT "soso_measurement_revisions_measurement_request_id_soso_measurement_requests_id_fk" FOREIGN KEY ("measurement_request_id") REFERENCES "soso_measurement_requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "soso_operational_notification_acknowledgements" ADD CONSTRAINT "soso_operational_notification_acknowledgements_notification_id_soso_operational_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "soso_operational_notifications"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "soso_order_items" ADD CONSTRAINT "soso_order_items_order_id_soso_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "soso_orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "soso_policy_document_revisions" ADD CONSTRAINT "soso_policy_document_revisions_policy_document_id_soso_policy_documents_id_fk" FOREIGN KEY ("policy_document_id") REFERENCES "soso_policy_documents"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "soso_privacy_access_packages" ADD CONSTRAINT "soso_privacy_access_packages_privacy_request_id_soso_privacy_requests_id_fk" FOREIGN KEY ("privacy_request_id") REFERENCES "soso_privacy_requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "soso_site_content_revisions" ADD CONSTRAINT "soso_site_content_revisions_content_key_soso_site_content_key_fk" FOREIGN KEY ("content_key") REFERENCES "soso_site_content"("key") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "soso_staff_sessions" ADD CONSTRAINT "soso_staff_sessions_staff_user_id_soso_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "soso_staff_users"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "soso_analytics_events_event_id_idx" ON "soso_analytics_events" USING btree ("event_id");
CREATE INDEX "soso_analytics_events_name_occurred_idx" ON "soso_analytics_events" USING btree ("event_name","occurred_at");
CREATE INDEX "soso_analytics_events_path_occurred_idx" ON "soso_analytics_events" USING btree ("path","occurred_at");
CREATE INDEX "soso_audit_logs_entity_created_idx" ON "soso_audit_logs" USING btree ("entity_type","created_at");
CREATE INDEX "soso_audit_logs_entity_id_created_idx" ON "soso_audit_logs" USING btree ("entity_type","entity_id","created_at" DESC,"id" DESC);
CREATE UNIQUE INDEX "soso_commerce_attempt_order_key_idx" ON "soso_commerce_checkout_attempts" USING btree ("order_idempotency_key");
CREATE UNIQUE INDEX "soso_commerce_attempt_payment_key_idx" ON "soso_commerce_checkout_attempts" USING btree ("payment_idempotency_key");
CREATE UNIQUE INDEX "soso_commerce_attempt_justicesure_order_idx" ON "soso_commerce_checkout_attempts" USING btree ("justicesure_order_id");
CREATE INDEX "soso_commerce_attempt_status_created_idx" ON "soso_commerce_checkout_attempts" USING btree ("status","created_at");
CREATE INDEX "soso_commerce_webhook_status_updated_idx" ON "soso_commerce_webhook_events" USING btree ("status","updated_at");
CREATE INDEX "soso_consent_records_anonymous_created_idx" ON "soso_consent_records" USING btree ("anonymous_id","created_at");
CREATE INDEX "soso_customer_enquiries_status_created_idx" ON "soso_customer_enquiries" USING btree ("status","created_at");
CREATE INDEX "soso_faq_items_sort_idx" ON "soso_faq_items" USING btree ("sort_order","is_published");
CREATE INDEX "soso_journal_post_revisions_post_created_idx" ON "soso_journal_post_revisions" USING btree ("journal_post_id","created_at");
CREATE UNIQUE INDEX "soso_journal_posts_slug_idx" ON "soso_journal_posts" USING btree ("slug");
CREATE INDEX "soso_journal_posts_status_published_idx" ON "soso_journal_posts" USING btree ("status","published_at");
CREATE UNIQUE INDEX "soso_marketing_pixel_revisions_key_revision_idx" ON "soso_marketing_pixel_setting_revisions" USING btree ("settings_key","revision");
CREATE INDEX "soso_marketing_pixel_revisions_key_created_idx" ON "soso_marketing_pixel_setting_revisions" USING btree ("settings_key","created_at");
CREATE UNIQUE INDEX "soso_measurement_requests_order_item_idx" ON "soso_measurement_requests" USING btree ("order_item_id");
CREATE INDEX "soso_measurement_requests_status_updated_idx" ON "soso_measurement_requests" USING btree ("status","updated_at");
CREATE UNIQUE INDEX "soso_measurement_revisions_request_version_idx" ON "soso_measurement_revisions" USING btree ("measurement_request_id","version");
CREATE INDEX "soso_measurement_revisions_request_created_idx" ON "soso_measurement_revisions" USING btree ("measurement_request_id","created_at");
CREATE UNIQUE INDEX "soso_notification_acknowledgements_notification_staff_idx" ON "soso_operational_notification_acknowledgements" USING btree ("notification_id","clerk_user_id");
CREATE INDEX "soso_notification_acknowledgements_staff_created_idx" ON "soso_operational_notification_acknowledgements" USING btree ("clerk_user_id","created_at");
CREATE INDEX "soso_operational_notifications_created_idx" ON "soso_operational_notifications" USING btree ("created_at");
CREATE INDEX "soso_operational_notifications_target_idx" ON "soso_operational_notifications" USING btree ("target_role","created_at");
CREATE INDEX "soso_order_items_order_idx" ON "soso_order_items" USING btree ("order_id");
CREATE UNIQUE INDEX "soso_order_items_order_line_idx" ON "soso_order_items" USING btree ("order_id","line_number");
CREATE UNIQUE INDEX "soso_orders_order_number_idx" ON "soso_orders" USING btree ("order_number");
CREATE INDEX "soso_orders_status_created_idx" ON "soso_orders" USING btree ("status","created_at");
CREATE INDEX "soso_policy_revisions_document_created_idx" ON "soso_policy_document_revisions" USING btree ("policy_document_id","created_at");
CREATE INDEX "soso_policy_documents_slug_status_idx" ON "soso_policy_documents" USING btree ("slug","status");
CREATE UNIQUE INDEX "soso_policy_documents_slug_version_idx" ON "soso_policy_documents" USING btree ("slug","version");
CREATE UNIQUE INDEX "soso_privacy_access_packages_request_idx" ON "soso_privacy_access_packages" USING btree ("privacy_request_id");
CREATE INDEX "soso_privacy_access_packages_expiry_idx" ON "soso_privacy_access_packages" USING btree ("expires_at");
CREATE INDEX "soso_privacy_requests_status_created_idx" ON "soso_privacy_requests" USING btree ("status","created_at");
CREATE INDEX "soso_privacy_requests_email_created_idx" ON "soso_privacy_requests" USING btree ("requester_email","created_at");
CREATE INDEX "soso_rate_limit_buckets_expires_idx" ON "soso_rate_limit_buckets" USING btree ("expires_at");
CREATE INDEX "soso_redirect_revisions_redirect_created_idx" ON "soso_redirect_revisions" USING btree ("redirect_id","created_at");
CREATE UNIQUE INDEX "soso_redirects_from_path_idx" ON "soso_redirects" USING btree ("from_path");
CREATE INDEX "soso_site_content_revisions_key_created_idx" ON "soso_site_content_revisions" USING btree ("content_key","created_at");
CREATE UNIQUE INDEX "soso_staff_sessions_token_idx" ON "soso_staff_sessions" USING btree ("token_hash");
CREATE INDEX "soso_staff_sessions_staff_expiry_idx" ON "soso_staff_sessions" USING btree ("staff_user_id","expires_at");
CREATE UNIQUE INDEX "soso_staff_users_clerk_user_id_idx" ON "soso_staff_users" USING btree ("clerk_user_id");
CREATE UNIQUE INDEX "soso_staff_users_email_idx" ON "soso_staff_users" USING btree ("email");