import { pgTable, uuid, text, jsonb, timestamp, integer, index } from "drizzle-orm/pg-core";

// No authorization material belongs in either table.
export const catalogueImportUploadsTable = pgTable("soso_catalogue_import_uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  sourceIdentity: text("source_identity").notNull(),
  sourceVersion: text("source_version").notNull(),
  hash: text("hash").notNull(),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull().unique(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  authorizedAt: timestamp("authorized_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("soso_import_upload_owner_hash_idx").on(t.ownerId, t.hash)]);

export const catalogueImportSessionsTable = pgTable("soso_catalogue_import_sessions", {
  ownerId: text("owner_id").primaryKey(),
  review: jsonb("review"),
  version: integer("version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
