import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, siteContentTable, siteContentRevisionsTable, auditLogsTable } from "@workspace/db";
import {
  GetStaffProductEditorParams, ListStaffProductIndexQueryParams, ListStaffProductIndexResponse,
  SaveStaffProductEditorBody, SaveStaffProductEditorParams, SaveStaffProductEditorResponse,
  GetStaffProductEditorResponse,
} from "@workspace/api-zod";
import { requireStaffRoles } from "../middlewares/staff";
import { PLATFORM_CONTENT_MEDIA_LOCK } from "../lib/collection-cover-cleanup";
import { validateProductMediaAssets } from "../lib/product-media-validation";
import type { PlatformContent } from "../lib/platform-content";
import {
  PlatformProductEditSchema, productCandidate, productFromDocument,
  productEditorProjection, productLocalReferenceIssues, productReferenceChecks, productVersionProjection,
} from "../lib/product-editor-transport";

const router: IRouter = Router();
const roles = requireStaffRoles("owner", "administrator", "editor");
const platform = eq(siteContentTable.key, "platform");
const draft = sql`${siteContentTable.draft}`;

router.get("/staff/content/platform/product-index", roles, async (req, res): Promise<void> => {
  const query = ListStaffProductIndexQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Provide a valid search and page size." }); return; }
  const { q = "", after = "", limit = 25 } = query.data;
  const rows = await db.select({
    slug: sql<string>`p->>'slug'`,
    name: sql<string>`p->>'name'`,
  }).from(siteContentTable)
    .innerJoin(sql`lateral jsonb_array_elements(${siteContentTable.draft}->'products') p`, sql`true`)
    .where(and(platform, sql`(p->>'slug') collate "C" > ${after} collate "C"`,
      sql`(strpos(lower(p->>'name'), lower(${q})) > 0 or strpos(lower(p->>'slug'), lower(${q})) > 0)`))
    .orderBy(sql`(p->>'slug') collate "C"`).limit(limit + 1);
  res.set("Cache-Control", "no-store");
  res.json(ListStaffProductIndexResponse.parse({
    items: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1]!.slug : null,
  }));
});

router.get("/staff/content/platform/products/:slug/editor", roles, async (req, res): Promise<void> => {
  const params = GetStaffProductEditorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Provide a valid product slug." }); return; }
  const { slug } = params.data;
  const [row] = await db.select(productEditorProjection(slug)).from(siteContentTable).where(platform).limit(1);
  if (!row?.product) { res.status(404).json({ error: "This product is no longer in the saved draft." }); return; }
  res.set("Cache-Control", "no-store");
  res.json(GetStaffProductEditorResponse.parse(row));
});

router.put("/staff/content/platform/products/:slug/editor", roles, async (req, res): Promise<void> => {
  const params = SaveStaffProductEditorParams.safeParse(req.params);
  const input = SaveStaffProductEditorBody.safeParse(req.body);
  const product = PlatformProductEditSchema.safeParse(input.success ? input.data.product : undefined);
  if (!params.success || !input.success || !product.success || product.data.slug !== params.data.slug) {
    res.status(400).json({ error: "Provide a valid product, unchanged slug and expected draft version.",
      issues: product.success ? [] : product.error.issues }); return;
  }
  const localIssues = productLocalReferenceIssues(product.data);
  if (localIssues.length) { res.status(400).json({ error: "Product references are invalid.", issues: localIssues }); return; }
  const expected = new Date(input.data.expectedDraftUpdatedAt);
  const { slug } = params.data;
  const result = await db.transaction(async (tx) => {
    // Same serialization boundary as publication, uploads and orphan cleanup.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
    const candidate = productCandidate(slug, product.data);
    const [current] = await tx.select({
      exists: sql<boolean>`${productFromDocument(draft, slug)} is not null`,
      checks: productReferenceChecks(candidate, slug),
    }).from(siteContentTable).where(and(platform, eq(siteContentTable.draftUpdatedAt, expected))).limit(1);
    if (!current) return { kind: "conflict" as const };
    if (!current.exists) return { kind: "missing" as const };
    const failed = Object.entries(current.checks as Record<string, boolean>).filter(([, ok]) => ok !== true).map(([key]) => key);
    if (failed.length) return { kind: "invalid" as const, issues: failed };
    const mediaIssues = await validateProductMediaAssets({ products: [product.data] } as PlatformContent);
    if (mediaIssues.length) return { kind: "invalid" as const, issues: mediaIssues };
    const now = new Date(Math.max(Date.now(), expected.getTime() + 1));
    const [updated] = await tx.update(siteContentTable).set({
      draft: candidate, draftUpdatedAt: now, updatedByClerkUserId: req.staff!.clerkUserId,
    }).where(and(platform, eq(siteContentTable.draftUpdatedAt, expected))).returning({
      ...productVersionProjection, product: productFromDocument(draft, slug),
    });
    if (!updated) return { kind: "conflict" as const };
    // The database history boundary chooses a verified delta or checkpoint.
    // No full catalogue is downloaded/re-uploaded; audit hashes stay unchanged.
    const hash = sql`encode(sha256(convert_to(${siteContentTable.draft}::text, 'UTF8')), 'hex')`;
    const revision = await tx.execute<{ id: string }>(sql`
      insert into ${siteContentRevisionsTable} (content_key, event, snapshot, content_hash, hash_encoding, created_by_clerk_user_id)
      select ${siteContentTable.key}, 'draft_saved', ${siteContentTable.draft}, ${hash}, 'postgres-jsonb-text', ${req.staff!.clerkUserId}
      from ${siteContentTable} where ${platform} returning id`);
    await tx.execute(sql`
      insert into ${auditLogsTable} (actor_clerk_user_id, action, entity_type, entity_id, metadata)
      select ${req.staff!.clerkUserId}, 'platform_content.draft_saved', 'site_content', ${siteContentTable.key},
      jsonb_build_object('scope','product','slug',${slug}::text,'revisionId',${revision.rows[0]!.id}::text,
        'contentHash',${hash},'hashEncoding','postgres-jsonb-text',
        'confirmedCommerceMappings', (select coalesce(jsonb_agg(jsonb_build_object(
          'slug', p->>'slug', 'productHash', p#>>'{commerceMappingConfirmation,productHash}',
          'confirmedAt', p#>>'{commerceMappingConfirmation,confirmedAt}',
          'confidence', p#>'{commerceMappingConfirmation,confidence}')), '[]')
          from jsonb_array_elements(${siteContentTable.draft}->'products') p where p ? 'commerceMappingConfirmation'))
      from ${siteContentTable} where ${platform}`);
    return { kind: "saved" as const, row: updated };
  });
  if (result.kind === "conflict") { res.status(409).json({ error: "The saved draft changed. Your edits were not saved. Keep them and reload the saved product before retrying." }); return; }
  if (result.kind === "missing") { res.status(404).json({ error: "This product is no longer in the draft. Use the full catalogue to create a product." }); return; }
  if (result.kind === "invalid") { res.status(400).json({ error: "The product would break catalogue references, media ownership or mapping ownership.", issues: result.issues }); return; }
  res.set("Cache-Control", "no-store");
  res.json(SaveStaffProductEditorResponse.parse(result.row));
});

export default router;
