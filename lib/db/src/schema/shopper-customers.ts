import { check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shopperCustomersTable = pgTable("soso_shopper_customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantScope: text("merchant_scope").notNull(),
  commerceOrigin: text("commerce_origin").notNull(),
  environment: text("environment", { enum: ["test", "live"] }).notNull(),
  authIssuer: text("auth_issuer").notNull(),
  authSubject: text("auth_subject").notNull(),
  externalId: text("external_id").notNull(),
  remoteCustomerId: uuid("remote_customer_id").notNull(),
  verifiedEmail: text("verified_email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("soso_shopper_customers_environment_check", sql`${table.environment} IN ('test', 'live')`),
  uniqueIndex("soso_shopper_identity_unique").on(table.merchantScope, table.commerceOrigin, table.environment, table.authIssuer, table.authSubject),
  uniqueIndex("soso_shopper_external_unique").on(table.merchantScope, table.commerceOrigin, table.environment, table.externalId),
  uniqueIndex("soso_shopper_remote_unique").on(table.merchantScope, table.commerceOrigin, table.environment, table.remoteCustomerId),
]);
export const insertShopperCustomerSchema = createInsertSchema(shopperCustomersTable).omit({ id: true, createdAt: true });
export type InsertShopperCustomer = z.infer<typeof insertShopperCustomerSchema>;
export type ShopperCustomer = typeof shopperCustomersTable.$inferSelect;
