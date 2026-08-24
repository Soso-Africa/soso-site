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

export const staffUsersTable = pgTable(
  "soso_staff_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email").notNull(),
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
    productSlug: text("product_slug").notNull(),
    productName: text("product_name").notNull(),
    selectedSize: text("selected_size"),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("soso_order_items_order_idx").on(table.orderId)],
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
    status: privacyRequestStatusEnum("status").notNull().default("received"),
    verificationNote: text("verification_note"),
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

export const redirectsTable = pgTable(
  "soso_redirects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromPath: text("from_path").notNull(),
    toPath: text("to_path").notNull(),
    statusCode: integer("status_code").notNull().default(301),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("soso_redirects_from_path_idx").on(table.fromPath)],
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
  (table) => [index("soso_audit_logs_entity_created_idx").on(table.entityType, table.createdAt)],
);

export const insertStaffUserSchema = createInsertSchema(staffUsersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true, createdAt: true });
export const insertCustomerEnquirySchema = createInsertSchema(customerEnquiriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPrivacyRequestSchema = createInsertSchema(privacyRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOperationalNotificationSchema = createInsertSchema(operationalNotificationsTable).omit({ id: true, createdAt: true, acknowledgedAt: true, acknowledgedByClerkUserId: true });
export const insertOperationalNotificationAcknowledgementSchema = createInsertSchema(operationalNotificationAcknowledgementsTable).omit({ id: true, createdAt: true });
export const insertJournalPostSchema = createInsertSchema(journalPostsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAnalyticsEventSchema = createInsertSchema(analyticsEventsTable).omit({ id: true, occurredAt: true });
export const insertConsentRecordSchema = createInsertSchema(consentRecordsTable).omit({ id: true, createdAt: true });

export type FaqItem = typeof faqItemsTable.$inferSelect;
export type Redirect = typeof redirectsTable.$inferSelect;
export type StaffUser = typeof staffUsersTable.$inferSelect;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type CustomerEnquiry = typeof customerEnquiriesTable.$inferSelect;
export type PrivacyRequest = typeof privacyRequestsTable.$inferSelect;
export type OperationalNotification = typeof operationalNotificationsTable.$inferSelect;
export type OperationalNotificationAcknowledgement = typeof operationalNotificationAcknowledgementsTable.$inferSelect;
export type JournalPost = typeof journalPostsTable.$inferSelect;
export type JournalPostRevision = typeof journalPostRevisionsTable.$inferSelect;
export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
export type ConsentRecord = typeof consentRecordsTable.$inferSelect;
export type InsertStaffUser = z.infer<typeof insertStaffUserSchema>;