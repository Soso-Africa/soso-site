import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const staffRoleEnum = pgEnum("soso_staff_role", [
  "owner",
  "administrator",
  "operations",
  "stylist",
  "editor",
  "analyst",
]);

export const orderStatusEnum = pgEnum("soso_order_status", [
  "payment_pending",
  "paid",
  "atelier_confirmation",
  "in_production",
  "ready",
  "fulfilled",
  "cancelled",
  "refunded",
]);

export const consentStateEnum = pgEnum("soso_consent_state", [
  "essential_only",
  "analytics",
  "marketing",
]);

export const privacyRequestTypeEnum = pgEnum("soso_privacy_request_type", [
  "access",
  "deletion",
]);

export const privacyRequestStatusEnum = pgEnum("soso_privacy_request_status", [
  "received",
  "identity_verified",
  "in_progress",
  "completed",
  "rejected",
]);

export const notificationSeverityEnum = pgEnum("soso_notification_severity", [
  "info",
  "attention",
  "urgent",
]);

export const refundRequestStatusEnum = pgEnum("soso_refund_request_status", [
  "requested",
  "approved",
  "declined",
]);

export const commerceAttemptStatusEnum = pgEnum("soso_commerce_attempt_status", [
  "starting",
  "payment_pending",
  "paid",
  "cancelled",
  "refunded",
  "fulfilled",
  "failed",
]);

export const commerceWebhookStatusEnum = pgEnum("soso_commerce_webhook_status", [
  "processing",
  "completed",
  "failed",
]);

export const orderItemSelectionTypeEnum = pgEnum("soso_order_item_selection_type", [
  "standard",
  "custom",
]);

export const measurementStatusEnum = pgEnum("soso_measurement_status", [
  "needed",
  "submitted",
  "clarification_requested",
  "confirmed",
  "cancelled",
]);

export const measurementUnitEnum = pgEnum("soso_measurement_unit", ["cm", "in"]);

export const measurementRevisionActorEnum = pgEnum("soso_measurement_revision_actor", [
  "customer",
  "staff",
  "system",
]);

export const staffUsersTable = pgTable(
  "soso_staff_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    role: staffRoleEnum("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("soso_staff_users_clerk_user_id_idx").on(table.clerkUserId),
    uniqueIndex("soso_staff_users_email_idx").on(table.email),
  ],
);

export const staffSessionsTable = pgTable(
  "soso_staff_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: uuid("staff_user_id").notNull().references(() => staffUsersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("soso_staff_sessions_token_idx").on(table.tokenHash),
    index("soso_staff_sessions_staff_expiry_idx").on(table.staffUserId, table.expiresAt),
  ],
);

export const ordersTable = pgTable(
  "soso_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    currency: text("currency").notNull().default("NGN"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    status: orderStatusEnum("status").notNull().default("payment_pending"),
    source: text("source").notNull().default("storefront"),
    paymentProvider: text("payment_provider"),
    paymentReference: text("payment_reference"),
    atelierNotes: text("atelier_notes"),
    deliveryNotes: text("delivery_notes"),
    refundRequestStatus: refundRequestStatusEnum("refund_request_status"),
    refundRequestReason: text("refund_request_reason"),
    refundDecisionNote: text("refund_decision_note"),
    refundRequestedAt: timestamp("refund_requested_at", { withTimezone: true }),
    refundReviewedAt: timestamp("refund_reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("soso_orders_order_number_idx").on(table.orderNumber),
    index("soso_orders_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const orderItemsTable = pgTable(
  "soso_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    commerceProductId: text("commerce_product_id").notNull(),
    commerceVariantId: text("commerce_variant_id"),
    productSlug: text("product_slug").notNull(),
    productName: text("product_name").notNull(),
    selectionType: orderItemSelectionTypeEnum("selection_type").notNull().default("standard"),
    selectedSize: text("selected_size"),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("soso_order_items_order_idx").on(table.orderId),
    uniqueIndex("soso_order_items_order_line_idx").on(table.orderId, table.lineNumber),
  ],
);

export const measurementRequestsTable = pgTable(
  "soso_measurement_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id").notNull().references(() => orderItemsTable.id, { onDelete: "cascade" }),
    status: measurementStatusEnum("status").notNull().default("needed"),
    unit: measurementUnitEnum("unit"),
    values: jsonb("values"),
    customerNote: text("customer_note"),
    clarificationNote: text("clarification_note"),
    productionException: text("production_exception"),
    version: integer("version").notNull().default(1),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("soso_measurement_requests_order_item_idx").on(table.orderItemId),
    index("soso_measurement_requests_status_updated_idx").on(table.status, table.updatedAt),
  ],
);

export const measurementRevisionsTable = pgTable(
  "soso_measurement_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    measurementRequestId: uuid("measurement_request_id").notNull().references(() => measurementRequestsTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    actorType: measurementRevisionActorEnum("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("soso_measurement_revisions_request_version_idx").on(table.measurementRequestId, table.version),
    index("soso_measurement_revisions_request_created_idx").on(table.measurementRequestId, table.createdAt),
  ],
);

export const commerceCheckoutAttemptsTable = pgTable(
  "soso_commerce_checkout_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownershipTokenHash: text("ownership_token_hash").notNull(),
    requestHash: text("request_hash").notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull(),
    items: jsonb("items").notNull(),
    fulfillment: jsonb("fulfillment").notNull(),
    orderIdempotencyKey: text("order_idempotency_key").notNull(),
    paymentIdempotencyKey: text("payment_idempotency_key").notNull(),
    justiceSureOrderId: text("justicesure_order_id"),
    localOrderId: uuid("local_order_id").references(() => ordersTable.id, { onDelete: "set null" }),
    provider: text("provider"),
    paymentReference: text("payment_reference"),
    checkoutUrl: text("checkout_url"),
    status: commerceAttemptStatusEnum("status").notNull().default("starting"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("soso_commerce_attempt_order_key_idx").on(table.orderIdempotencyKey),
    uniqueIndex("soso_commerce_attempt_payment_key_idx").on(table.paymentIdempotencyKey),
    uniqueIndex("soso_commerce_attempt_justicesure_order_idx").on(table.justiceSureOrderId),
    index("soso_commerce_attempt_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const commerceWebhookEventsTable = pgTable(
  "soso_commerce_webhook_events",
  {
    eventId: text("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    apiVersion: text("api_version").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: commerceWebhookStatusEnum("status").notNull().default("processing"),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("soso_commerce_webhook_status_updated_idx").on(table.status, table.updatedAt),
  ],
);

export const customerEnquiriesTable = pgTable(
  "soso_customer_enquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    productSlug: text("product_slug"),
    message: text("message").notNull(),
    status: text("status").notNull().default("new"),
    handlingNotes: text("handling_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("soso_customer_enquiries_status_created_idx").on(table.status, table.createdAt)],
);

export const privacyRequestsTable = pgTable(
  "soso_privacy_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestType: privacyRequestTypeEnum("request_type").notNull(),
    requesterName: text("requester_name"),
    requesterEmail: text("requester_email").notNull(),
    policyVersion: text("policy_version").notNull().default("unconfigured"),
    status: privacyRequestStatusEnum("status").notNull().default("received"),
    verificationNote: text("verification_note"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByClerkUserId: text("verified_by_clerk_user_id"),
    resolutionNote: text("resolution_note"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("soso_privacy_requests_status_created_idx").on(table.status, table.createdAt),
    index("soso_privacy_requests_email_created_idx").on(table.requesterEmail, table.createdAt),
  ],
);

/**
 * Controlled, short-lived subject-access packages. The package content never
 * appears in audit metadata or public responses; it is only available to an
 * authenticated owner through the one-time download route.
 */
export const privacyAccessPackagesTable = pgTable(
  "soso_privacy_access_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    privacyRequestId: uuid("privacy_request_id").notNull().references(() => privacyRequestsTable.id, { onDelete: "cascade" }),
    packageHash: text("package_hash").notNull(),
    payload: jsonb("payload").notNull(),
    rowCounts: jsonb("row_counts").notNull().default({}),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
    downloadedByClerkUserId: text("downloaded_by_clerk_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("soso_privacy_access_packages_request_idx").on(table.privacyRequestId),
    index("soso_privacy_access_packages_expiry_idx").on(table.expiresAt),
  ],
);

/**
 * Version identifiers only. Legal copy, approval decisions, and retention
 * rules intentionally remain outside the application database.
 */
export const policyVersionsTable = pgTable(
  "soso_policy_versions",
  {
    version: text("version").primaryKey(),
    firstRecordedAt: timestamp("first_recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const operationalNotificationsTable = pgTable(
  "soso_operational_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    severity: notificationSeverityEnum("severity").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    targetRole: staffRoleEnum("target_role"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedByClerkUserId: text("acknowledged_by_clerk_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("soso_operational_notifications_created_idx").on(table.createdAt),
    index("soso_operational_notifications_target_idx").on(table.targetRole, table.createdAt),
  ],
);

export const operationalNotificationAcknowledgementsTable = pgTable(
  "soso_operational_notification_acknowledgements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id").notNull().references(() => operationalNotificationsTable.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("soso_notification_acknowledgements_notification_staff_idx").on(table.notificationId, table.clerkUserId),
    index("soso_notification_acknowledgements_staff_created_idx").on(table.clerkUserId, table.createdAt),
  ],
);

export const journalPostsTable = pgTable(
  "soso_journal_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    body: text("body").notNull(),
    coverImageUrl: text("cover_image_url"),
    coverImageAlt: text("cover_image_alt"),
    authorName: text("author_name").notNull(),
    category: text("category"),
    tags: jsonb("tags").$type<string[]>(),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    readTimeMinutes: integer("read_time_minutes"),
    relatedProductSlugs: jsonb("related_product_slugs").$type<string[]>(),
    relatedArticleSlugs: jsonb("related_article_slugs").$type<string[]>(),
    status: text("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("soso_journal_posts_slug_idx").on(table.slug),
    index("soso_journal_posts_status_published_idx").on(table.status, table.publishedAt),
  ],
);

export const journalPostRevisionsTable = pgTable(
  "soso_journal_post_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    journalPostId: uuid("journal_post_id").notNull().references(() => journalPostsTable.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").notNull(),
    contentHash: text("content_hash").notNull(),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("soso_journal_post_revisions_post_created_idx").on(table.journalPostId, table.createdAt)],
);

export const analyticsEventsTable = pgTable(
  "soso_analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id"),
    eventVersion: integer("event_version").notNull().default(1),
    anonymousId: text("anonymous_id").notNull(),
    sessionId: text("session_id"),
    eventName: text("event_name").notNull(),
    path: text("path").notNull(),
    referrer: text("referrer"),
    source: text("source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    deviceType: text("device_type"),
    consent: consentStateEnum("consent").notNull().default("essential_only"),
    properties: jsonb("properties").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("soso_analytics_events_event_id_idx").on(table.eventId),
    index("soso_analytics_events_consent_occurred_idx").on(table.consent, table.occurredAt),
    index("soso_analytics_events_name_occurred_idx").on(table.eventName, table.occurredAt),
    index("soso_analytics_events_path_occurred_idx").on(table.path, table.occurredAt),
  ],
);

export const consentRecordsTable = pgTable(
  "soso_consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    anonymousId: text("anonymous_id").notNull(),
    state: consentStateEnum("state").notNull(),
    region: text("region"),
    policyVersion: text("policy_version").notNull(),
    source: text("source").notNull().default("banner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("soso_consent_records_anonymous_created_idx").on(table.anonymousId, table.createdAt)],
);

export const rateLimitBucketsTable = pgTable(
  "soso_rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    requestCount: integer("request_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("soso_rate_limit_buckets_expires_idx").on(table.expiresAt)],
);

export const faqItemsTable = pgTable(
  "soso_faq_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    category: text("category"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("soso_faq_items_sort_idx").on(table.sortOrder, table.isPublished)],
);

export const policyDocumentsTable = pgTable(
  "soso_policy_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    sections: jsonb("sections").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"),
    reviewedByClerkUserId: text("reviewed_by_clerk_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    approvedByClerkUserId: text("approved_by_clerk_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("soso_policy_documents_slug_status_idx").on(table.slug, table.status),
    uniqueIndex("soso_policy_documents_slug_version_idx").on(table.slug, table.version),
  ],
);

export const siteContentTable = pgTable(
  "soso_site_content",
  {
    key: text("key").primaryKey(),
    draft: jsonb("draft").$type<Record<string, unknown>>().notNull().default({}),
    published: jsonb("published").$type<Record<string, unknown>>().notNull().default({}),
    draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    updatedByClerkUserId: text("updated_by_clerk_user_id"),
    publishedByClerkUserId: text("published_by_clerk_user_id"),
  },
);

export const siteContentRevisionsTable = pgTable(
  "soso_site_content_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentKey: text("content_key").notNull().references(() => siteContentTable.key, { onDelete: "cascade" }),
    event: text("event").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown> | null>(),
    contentHash: text("content_hash").notNull(),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("soso_site_content_revisions_key_created_idx").on(table.contentKey, table.createdAt)],
);

export const marketingPixelSettingsTable = pgTable(
  "soso_marketing_pixel_settings",
  {
    key: text("key").primaryKey(),
    schemaVersion: integer("schema_version").notNull().default(1),
    revision: integer("revision").notNull().default(1),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull(),
    updatedByClerkUserId: text("updated_by_clerk_user_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const marketingPixelSettingRevisionsTable = pgTable(
  "soso_marketing_pixel_setting_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    settingsKey: text("settings_key").notNull().references(() => marketingPixelSettingsTable.key, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("soso_marketing_pixel_revisions_key_revision_idx").on(table.settingsKey, table.revision),
    index("soso_marketing_pixel_revisions_key_created_idx").on(table.settingsKey, table.createdAt),
  ],
);

export const redirectsTable = pgTable(
  "soso_redirects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromPath: text("from_path").notNull(),
    toPath: text("to_path").notNull(),
    statusCode: integer("status_code").notNull().default(301),
    // Existing redirects were public before publication state was introduced.
    isPublished: boolean("is_published").notNull().default(true),
    updatedByClerkUserId: text("updated_by_clerk_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("soso_redirects_from_path_idx").on(table.fromPath)],
);

export const redirectRevisionsTable = pgTable(
  "soso_redirect_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    redirectId: uuid("redirect_id").notNull(),
    event: text("event").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("soso_redirect_revisions_redirect_created_idx").on(table.redirectId, table.createdAt)],
);

export const auditLogsTable = pgTable(
  "soso_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorClerkUserId: text("actor_clerk_user_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("soso_audit_logs_entity_created_idx").on(table.entityType, table.createdAt),
    index("soso_audit_logs_entity_id_created_idx").on(table.entityType, table.entityId, table.createdAt, table.id),
  ],
);

export const insertStaffUserSchema = createInsertSchema(staffUsersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStaffSessionSchema = createInsertSchema(staffSessionsTable).omit({ id: true, createdAt: true, lastSeenAt: true, revokedAt: true });
export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true, createdAt: true });
export const insertMeasurementRequestSchema = createInsertSchema(measurementRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMeasurementRevisionSchema = createInsertSchema(measurementRevisionsTable).omit({ id: true, createdAt: true });
export const insertCustomerEnquirySchema = createInsertSchema(customerEnquiriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPrivacyRequestSchema = createInsertSchema(privacyRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOperationalNotificationSchema = createInsertSchema(operationalNotificationsTable).omit({ id: true, createdAt: true, acknowledgedAt: true, acknowledgedByClerkUserId: true });
export const insertOperationalNotificationAcknowledgementSchema = createInsertSchema(operationalNotificationAcknowledgementsTable).omit({ id: true, createdAt: true });
export const insertJournalPostSchema = createInsertSchema(journalPostsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAnalyticsEventSchema = createInsertSchema(analyticsEventsTable).omit({ id: true, occurredAt: true });
export const insertConsentRecordSchema = createInsertSchema(consentRecordsTable).omit({ id: true, createdAt: true });
export const insertCommerceCheckoutAttemptSchema = createInsertSchema(commerceCheckoutAttemptsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCommerceWebhookEventSchema = createInsertSchema(commerceWebhookEventsTable).omit({ createdAt: true, updatedAt: true, completedAt: true });

export type FaqItem = typeof faqItemsTable.$inferSelect;

export type PolicyDocument = typeof policyDocumentsTable.$inferSelect;
export type SiteContent = typeof siteContentTable.$inferSelect;
export type SiteContentRevision = typeof siteContentRevisionsTable.$inferSelect;
export type MarketingPixelSettings = typeof marketingPixelSettingsTable.$inferSelect;
export type MarketingPixelSettingRevision = typeof marketingPixelSettingRevisionsTable.$inferSelect;
export type Redirect = typeof redirectsTable.$inferSelect;
export type StaffUser = typeof staffUsersTable.$inferSelect;
export type StaffSession = typeof staffSessionsTable.$inferSelect;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type MeasurementRequest = typeof measurementRequestsTable.$inferSelect;
export type MeasurementRevision = typeof measurementRevisionsTable.$inferSelect;
export type CommerceCheckoutAttempt = typeof commerceCheckoutAttemptsTable.$inferSelect;
export type CommerceWebhookEvent = typeof commerceWebhookEventsTable.$inferSelect;
export type CustomerEnquiry = typeof customerEnquiriesTable.$inferSelect;
export type PrivacyRequest = typeof privacyRequestsTable.$inferSelect;
export type PolicyVersion = typeof policyVersionsTable.$inferSelect;
export type OperationalNotification = typeof operationalNotificationsTable.$inferSelect;
export type OperationalNotificationAcknowledgement = typeof operationalNotificationAcknowledgementsTable.$inferSelect;
export type JournalPost = typeof journalPostsTable.$inferSelect;
export type JournalPostRevision = typeof journalPostRevisionsTable.$inferSelect;
export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
export type ConsentRecord = typeof consentRecordsTable.$inferSelect;
export type InsertStaffUser = z.infer<typeof insertStaffUserSchema>;
export type InsertCommerceCheckoutAttempt = z.infer<typeof insertCommerceCheckoutAttemptSchema>;
export type InsertCommerceWebhookEvent = z.infer<typeof insertCommerceWebhookEventSchema>;

export type PolicyDocumentRevision = typeof policyDocumentRevisionsTable.$inferSelect;

export const policyDocumentRevisionsTable = pgTable(
  "soso_policy_document_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    policyDocumentId: uuid("policy_document_id").notNull().references(() => policyDocumentsTable.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").notNull(),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("soso_policy_revisions_document_created_idx").on(table.policyDocumentId, table.createdAt)],
);
