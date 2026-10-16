import { pgTable, text, uuid, timestamp, integer, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shopperUsersTable = pgTable("soso_shopper_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertShopperUserSchema = createInsertSchema(shopperUsersTable).omit({ id: true, createdAt: true });
export type InsertShopperUser = z.infer<typeof insertShopperUserSchema>;
export type ShopperUser = typeof shopperUsersTable.$inferSelect;
export const shopperSessionsTable = pgTable("soso_shopper_sessions", {
  id: uuid("id").notNull().defaultRandom(),
  deviceLabel: text("device_label").notNull().default("Unknown browser / device"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => shopperUsersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("soso_shopper_sessions_user_idx").on(table.userId), uniqueIndex("soso_shopper_sessions_id_unique").on(table.id)]);
export const shopperAuthTokensTable = pgTable("soso_shopper_auth_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => shopperUsersTable.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  passwordVersion: text("password_version").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("soso_shopper_auth_tokens_user_idx").on(table.userId, table.purpose),
  check("soso_shopper_auth_tokens_purpose_check", sql`${table.purpose} IN ('verify_email', 'reset_password')`),
]);
export const shopperAuthLimitsTable = pgTable("soso_shopper_auth_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
