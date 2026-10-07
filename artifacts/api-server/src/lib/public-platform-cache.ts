import { db, siteContentTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { PlatformContentSchema, type PlatformContent } from "./platform-content";
import { createVersionCheckedCache } from "./version-checked-cache";

// Catalogue webhooks can change published JSON without changing publishedAt.
// A DB-side fingerprint covers those changes too, with a tiny wire result.
const fingerprint = sql<string>`md5(${siteContentTable.published}::text)`;
type PublicSnapshot = { content: PlatformContent; publishedAt: Date };
const versionOf = (hash: string, publishedAt: Date) => `${hash}:${publishedAt.toISOString()}`;

/**
 * Only public content routes use this reader. Checkout/payment and Staff
 * validation retain their uncached authoritative readers.
 */
export const readPublicPlatformSnapshot = createVersionCheckedCache<PublicSnapshot>({
  async readVersion() {
    const [row] = await db.select({ fingerprint, publishedAt: siteContentTable.publishedAt })
      .from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
    return row?.publishedAt ? versionOf(row.fingerprint, row.publishedAt) : null;
  },
  async load() {
    const [row] = await db.select({
      fingerprint,
      content: siteContentTable.published,
      publishedAt: siteContentTable.publishedAt,
    }).from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
    if (!row?.publishedAt || Object.keys(row.content).length === 0) return null;
    const parsed = PlatformContentSchema.safeParse(row.content);
    if (!parsed.success) throw new Error("Published platform content is invalid");
    return {
      version: versionOf(row.fingerprint, row.publishedAt),
      value: { content: parsed.data, publishedAt: row.publishedAt },
    };
  },
});