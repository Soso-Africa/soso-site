import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import {
  CreateStaffJournalPostBody,
  CreateStaffJournalPostResponse,
  ListStaffJournalPostRevisionsParams,
  ListStaffJournalPostRevisionsResponse,
  ListStaffJournalPostsResponse,
  ListStaffFaqHistoryQueryParams,
  ListStaffFaqHistoryResponse,
  UpdateStaffJournalPostBody,
  UpdateStaffJournalPostParams,
  UpdateStaffJournalPostResponse,
} from "@workspace/api-zod";
import {
  auditLogsTable,
  commerceWebhookEventsTable,
  db,
  faqItemsTable,
  journalPostRevisionsTable,
  journalPostsTable,
  policyDocumentsTable,
  policyDocumentRevisionsTable,
  siteContentTable,
  siteContentRevisionsTable,
  staffUsersTable,
} from "@workspace/db";
import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { ensurePlatformContent, platformContentHash, PlatformContentSchema, type PlatformContent } from "../lib/platform-content";
import { validateHomepageHeroMediaAssets } from "../lib/hero-media-validation";
import { validateHomepageMerchandisingMediaAssets } from "../lib/homepage-media-validation";
import { validateLegacyProductPublication } from "../lib/legacy-product-publication";
import { validateAccessoryProductPublication } from "../lib/accessory-product-publication";
import { validateCollectionMediaAssets, validateManagedImageAsset, validateProductMediaAssets } from "../lib/product-media-validation";
import { publishSiteDraft, saveSiteDraft } from "./site-content-policy";
import { z } from "zod";
import { JusticeSureCommerceClient, JusticeSureRequestError } from "../lib/justicesureCommerce";
import {
  buildCatalogueSnapshot,
  findWebhookStaleMappings,
  suggestCatalogueMappings,
  validateCatalogueMappings,
  type CatalogueWebhookInvalidation,
  type LocalCatalogueProduct,
} from "../lib/catalogue-mapping";
import {
  PLATFORM_CONTENT_MEDIA_LOCK,
  processPendingCollectionCoverCleanup,
  queueCollectionCoverCleanup,
  replacedCollectionCoverUploadPaths,
} from "../lib/collection-cover-cleanup";

const router: IRouter = Router();

router.use("/staff", requireStaff);

router.get("/staff/content/site", requireStaffRoles("owner", "administrator", "editor"), async (_req, res): Promise<void> => {
  const [row] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "site")).limit(1);
  res.json(row ?? {
    key: "site",
    draft: {},
    published: {},
    draftUpdatedAt: null,
    publishedAt: null,
    updatedByClerkUserId: null,
    publishedByClerkUserId: null,
  });
});

router.put("/staff/content/site", requireStaffRoles("owner", "administrator", "editor"), async (req, res): Promise<void> => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({ error: "Content must be an object" });
    return;
  }
  const allowedKeys = new Set([
    "heroEyebrow", "heroTitle", "heroAccent", "heroDescription", "heroImageUrl",
    "heroImageAlt", "primaryCta", "primaryCtaHref", "stylistCta", "announcement",
    "footerDescription", "instagramUrl", "whatsappUrl",
    "navKaftansLabel", "navAgbadasLabel", "navShirtsLabel", "contactEmail", "contactPhone",
  ]);
  const draft: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
    if (!allowedKeys.has(key) || typeof value !== "string" || value.length > 500) {
      res.status(400).json({ error: `Invalid site content field: ${key}` });
      return;
    }
    draft[key] = value.trim();
  }
  for (const key of ["heroImageUrl", "instagramUrl", "whatsappUrl"]) {
    if (draft[key] && !/^https?:\/\/|^\//.test(draft[key])) {
      res.status(400).json({ error: `${key} must be an https URL or local path` });
      return;
    }
  }
  if (draft.primaryCtaHref && !draft.primaryCtaHref.startsWith("/")) {
    res.status(400).json({ error: "Primary CTA must link to a local storefront path" });
    return;
  }
  const [current] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "site")).limit(1);
  const next = saveSiteDraft(current, draft, req.staff!.clerkUserId);
  const nextValues = {
    key: next.key, draft: next.draft, published: next.published,
    draftUpdatedAt: next.draftUpdatedAt ?? undefined, publishedAt: next.publishedAt ?? undefined,
    updatedByClerkUserId: next.updatedByClerkUserId ?? undefined,
    publishedByClerkUserId: next.publishedByClerkUserId ?? undefined,
  };
  const [row] = await db.insert(siteContentTable).values(nextValues).onConflictDoUpdate({
    target: siteContentTable.key,
    set: nextValues,
  }).returning();
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId, action: "site_content.draft_saved",
    entityType: "site_content", entityId: "site",
    metadata: { keys: Object.keys(draft) },
  });
  res.json(row);
});

router.post("/staff/content/site/publish", requireStaffRoles("owner", "administrator", "editor"), async (req, res): Promise<void> => {
  const [existing] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "site")).limit(1);
  if (!existing) { res.status(409).json({ error: "Save a draft before publishing" }); return; }
  const { row: published, audit } = publishSiteDraft(existing, req.staff!.clerkUserId);
  const [row] = await db.update(siteContentTable).set({
    ...published,
    draftUpdatedAt: published.draftUpdatedAt ?? undefined,
    updatedByClerkUserId: published.updatedByClerkUserId ?? undefined,
  }).where(eq(siteContentTable.key, "site")).returning();
  await db.insert(auditLogsTable).values({
    actorClerkUserId: audit.actorClerkUserId, action: audit.action,
    entityType: audit.entityType, entityId: audit.entityId, metadata: audit.metadata,
  });
  res.json(row);
});

const platformRoles = requireStaffRoles("owner", "administrator", "editor");
const catalogueSlug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);

type MappingHistoryAudit = {
  id: string;
  actorClerkUserId: string;
  createdAt: Date;
  metadata: unknown;
};

type MappingHistoryRevision = {
  id: string;
  snapshot: unknown;
};

export type CatalogueMappingHistoryEntry = {
  id: string;
  confirmedAt: string;
  confirmedByClerkUserId: string;
  confirmedByEmail?: string;
  confidence: number;
  evidence: string[];
  source: "automatic" | "manual";
  sosoFingerprintChangedLater: boolean;
  justiceSureFingerprintChangedLater: boolean;
};

const mappingHistorySnapshot = z.object({
  products: z.array(z.object({
    slug: z.string(),
    commerceMappingConfirmation: z.object({
      productHash: z.string(),
      localHash: z.string(),
      confirmedAt: z.string(),
      confidence: z.number(),
      source: z.enum(["automatic", "manual"]),
      evidence: z.array(z.string()),
    }).optional(),
  }).passthrough()),
}).passthrough();

export function buildCatalogueMappingHistory(
  slug: string,
  audits: MappingHistoryAudit[],
  revisions: MappingHistoryRevision[],
  staffEmails: Map<string, string> = new Map(),
): CatalogueMappingHistoryEntry[] {
  const revisionById = new Map(revisions.map((revision) => [revision.id, revision.snapshot]));
  const confirmations = audits
    .flatMap((audit) => {
      const metadata = audit.metadata && typeof audit.metadata === "object"
        ? audit.metadata as Record<string, unknown>
        : {};
      const revisionId = typeof metadata.revisionId === "string" ? metadata.revisionId : null;
      const parsed = mappingHistorySnapshot.safeParse(revisionId ? revisionById.get(revisionId) : undefined);
      if (!parsed.success) return [];
      const confirmation = parsed.data.products.find((product) => product.slug === slug)?.commerceMappingConfirmation;
      if (!confirmation) return [];
      return [{
        audit,
        confirmation,
        key: `${confirmation.confirmedAt}:${confirmation.productHash}:${confirmation.localHash}`,
      }];
    })
    .sort((left, right) => left.audit.createdAt.getTime() - right.audit.createdAt.getTime());

  const unique = confirmations.filter((entry, index) =>
    confirmations.findIndex((candidate) => candidate.key === entry.key) === index);

  return unique.map(({ audit, confirmation }, index) => {
    const later = unique.slice(index + 1);
    return {
      id: audit.id,
      confirmedAt: confirmation.confirmedAt,
      confirmedByClerkUserId: audit.actorClerkUserId,
      ...(staffEmails.get(audit.actorClerkUserId)
        ? { confirmedByEmail: staffEmails.get(audit.actorClerkUserId) }
        : {}),
      confidence: confirmation.confidence,
      evidence: confirmation.evidence,
      source: confirmation.source,
      sosoFingerprintChangedLater: later.some(({ confirmation: candidate }) =>
        candidate.localHash !== confirmation.localHash),
      justiceSureFingerprintChangedLater: later.some(({ confirmation: candidate }) =>
        candidate.productHash !== confirmation.productHash),
    };
  }).reverse();
}

const catalogueMappingProductInput = z.object({
  slug: z.string().min(1).max(160),
  name: z.string().min(1).max(200),
  price: z.number().int().positive(),
  standardEligible: z.boolean(),
  customEligible: z.boolean(),
  standardSizes: z.array(z.string().min(1).max(40)),
  fulfilmentState: z.enum(["ready_now", "made_immediately", "unavailable"]),
  commerceProductId: z.string().uuid().optional(),
  commerceVariantIds: z.record(z.string(), z.string().uuid()).optional(),
}).strict();

const catalogueMappingConfirmationInput = z.object({
  slug: z.string().min(1).max(160),
  productId: z.string().uuid(),
  variantIds: z.array(z.string().uuid()).max(100),
  confirmedAt: z.string().datetime({ offset: true }),
}).strict();

type MappingProductSource = z.infer<typeof catalogueMappingProductInput> & {
  commerceMappingConfirmation?: {
    productHash: string;
    localHash: string;
    confidence: number;
  };
};

function toLocalMappingProduct(product: MappingProductSource): LocalCatalogueProduct {
  return {
    slug: product.slug,
    name: product.name,
    price: product.price,
    eligibility: product.fulfilmentState === "unavailable"
      ? "unavailable"
      : { standard: product.standardEligible, custom: product.customEligible },
    standardSizes: product.standardEligible ? product.standardSizes : [],
    commerceProductId: product.commerceProductId,
    commerceVariantIds: product.commerceVariantIds,
  };
}

async function validateCurrentCommerceMappings(
  products: MappingProductSource[],
  requireConfirmation: boolean,
): Promise<string[]> {
  const mapped = products.filter((product) => product.commerceProductId);
  const missingIssues = requireConfirmation
    ? products
      .filter((product) => product.fulfilmentState !== "unavailable" && !product.commerceProductId)
      .map((product) => `${product.slug}: available products require a confirmed JusticeSure product and variant mapping before publishing.`)
    : [];
  if (mapped.length === 0) return missingIssues;
  const identifierOwners = new Map<string, string>();
  const duplicateIssues: string[] = [];
  for (const product of mapped) {
    for (const identifier of [
      product.commerceProductId!,
      ...Object.values(product.commerceVariantIds ?? {}),
    ]) {
      const owner = identifierOwners.get(identifier);
      if (owner && owner !== product.slug) {
        duplicateIssues.push(`${product.slug}: JusticeSure identifier ${identifier} is already assigned to ${owner}.`);
      } else {
        identifierOwners.set(identifier, product.slug);
      }
    }
  }
  const catalogue = await new JusticeSureCommerceClient().listProducts();
  const validation = validateCatalogueMappings(mapped.map(toLocalMappingProduct), catalogue);
  const issues = [
    ...missingIssues,
    ...duplicateIssues,
    ...validation.issues.map((issue) => `${issue.slug}: ${issue.message}`),
  ];
  for (const mapping of validation.mappings) {
    if (mapping.status !== "matched") continue;
    const product = mapped.find((candidate) => candidate.slug === mapping.slug);
    const confirmation = product?.commerceMappingConfirmation;
    if (confirmation && confirmation.productHash !== mapping.productHash) {
      issues.push(`${mapping.slug}: JusticeSure product, variant, stock, price, or attributes changed after confirmation.`);
    }
    if (confirmation && confirmation.localHash !== mapping.localHash) {
      issues.push(`${mapping.slug}: SOSO product identity, price, eligibility, choices, or selected identifiers changed after confirmation.`);
    }
    if (requireConfirmation && (!confirmation || confirmation.confidence < 95)) {
      issues.push(`${mapping.slug}: confirm the current high-confidence JusticeSure mapping before publishing.`);
    }
  }
  return issues;
}

router.post("/staff/commerce/catalogue-mapping/preview", platformRoles, async (req, res): Promise<void> => {
  const parsed = z.object({ products: z.array(catalogueMappingProductInput).max(1000) }).strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide valid SOSO catalogue products.", issues: parsed.error.issues });
    return;
  }
  try {
    const catalogue = await new JusticeSureCommerceClient().listProducts();
    const snapshot = buildCatalogueSnapshot(catalogue);
    const suggestions = suggestCatalogueMappings(parsed.data.products.map(toLocalMappingProduct), catalogue, snapshot)
      .map((mapping) => ({
        slug: mapping.slug,
        status: mapping.status === "matched" ? "confident" : mapping.status === "unsafe" ? "blocked" : "needs_review",
        confidence: mapping.confidence,
        evidence: mapping.evidence,
        ...(mapping.productId ? { productId: mapping.productId } : {}),
        ...(mapping.productHash ? { productHash: mapping.productHash } : {}),
        ...(mapping.localHash ? { localHash: mapping.localHash } : {}),
        variantIds: mapping.variantIds,
        choiceLabels: mapping.choiceLabels,
        issues: mapping.status === "matched" ? [] : mapping.evidence,
      }));
    res.json({ snapshotHash: snapshot.hash, fetchedAt: snapshot.fetchedAt, suggestions });
  } catch (error) {
    const message = error instanceof JusticeSureRequestError && error.status < 500
      ? error.message
      : "JusticeSure catalogue mapping is temporarily unavailable.";
    res.status(503).json({ error: message });
  }
});

router.post("/staff/commerce/catalogue-mapping/invalidations", platformRoles, async (req, res): Promise<void> => {
  const parsed = z.object({
    confirmations: z.array(catalogueMappingConfirmationInput).max(1000),
  }).strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide valid confirmed JusticeSure mappings.", issues: parsed.error.issues });
    return;
  }
  if (parsed.data.confirmations.length === 0) {
    res.json({ staleSlugs: [] });
    return;
  }
  const mappings = parsed.data.confirmations.map((confirmation) => ({
    slug: confirmation.slug,
    productId: confirmation.productId,
    variantIds: confirmation.variantIds,
    confirmedAt: new Date(confirmation.confirmedAt),
  }));
  const earliestConfirmation = new Date(Math.min(...mappings.map(({ confirmedAt }) => confirmedAt.getTime())));
  const rows = await db.select({
    identifiers: commerceWebhookEventsTable.catalogueIdentifiers,
    occurredAt: commerceWebhookEventsTable.eventOccurredAt,
  }).from(commerceWebhookEventsTable).where(and(
    eq(commerceWebhookEventsTable.status, "completed"),
    inArray(commerceWebhookEventsTable.eventType, ["commerce.product.updated", "commerce.inventory.updated"]),
    gte(commerceWebhookEventsTable.eventOccurredAt, earliestConfirmation),
  ));
  const staleSlugs = findWebhookStaleMappings(
    mappings,
    rows.flatMap((row) => row.occurredAt && row.identifiers.length > 0
      ? [{ identifiers: row.identifiers, occurredAt: row.occurredAt }]
      : []),
  );
  res.json({ staleSlugs });
});

export function findStaleCatalogueProducts(
  content: unknown,
  invalidations: CatalogueWebhookInvalidation[],
): Array<{ slug: string; name: string }> {
  const parsed = PlatformContentSchema.safeParse(content);
  if (!parsed.success) return [];
  const confirmed = parsed.data.products.flatMap((product) =>
    product.commerceProductId && product.commerceMappingConfirmation
      ? [{
        slug: product.slug,
        productId: product.commerceProductId,
        variantIds: Object.values(product.commerceVariantIds ?? {}),
        confirmedAt: new Date(product.commerceMappingConfirmation.confirmedAt),
      }]
      : []);
  const staleSlugs = new Set(findWebhookStaleMappings(confirmed, invalidations));
  return parsed.data.products
    .filter((product) => staleSlugs.has(product.slug))
    .map((product) => ({ slug: product.slug, name: product.name }));
}

router.get("/staff/commerce/catalogue-mapping/stale", platformRoles, async (_req, res): Promise<void> => {
  await ensurePlatformContent();
  const [row] = await db.select({ draft: siteContentTable.draft })
    .from(siteContentTable)
    .where(eq(siteContentTable.key, "platform"))
    .limit(1);
  const parsed = PlatformContentSchema.safeParse(row?.draft);
  if (!parsed.success) {
    res.json({ products: [] });
    return;
  }
  const confirmationDates = parsed.data.products.flatMap((product) =>
    product.commerceProductId && product.commerceMappingConfirmation
      ? [new Date(product.commerceMappingConfirmation.confirmedAt)]
      : []);
  if (confirmationDates.length === 0) {
    res.json({ products: [] });
    return;
  }
  const earliestConfirmation = new Date(Math.min(...confirmationDates.map((date) => date.getTime())));
  const events = await db.select({
    identifiers: commerceWebhookEventsTable.catalogueIdentifiers,
    occurredAt: commerceWebhookEventsTable.eventOccurredAt,
  }).from(commerceWebhookEventsTable).where(and(
    eq(commerceWebhookEventsTable.status, "completed"),
    inArray(commerceWebhookEventsTable.eventType, ["commerce.product.updated", "commerce.inventory.updated"]),
    gte(commerceWebhookEventsTable.eventOccurredAt, earliestConfirmation),
  ));
  const invalidations = events.flatMap((event) =>
    event.occurredAt && event.identifiers.length > 0
      ? [{ identifiers: event.identifiers, occurredAt: event.occurredAt }]
      : []);
  res.json({ products: findStaleCatalogueProducts(parsed.data, invalidations) });
});

router.get("/staff/commerce/catalogue-mapping/:slug/history", platformRoles, async (req, res): Promise<void> => {
  const parsedSlug = catalogueSlug.safeParse(req.params.slug);
  if (!parsedSlug.success) {
    res.status(400).json({ error: "Provide a valid catalogue product slug." });
    return;
  }
  const audits = await db.select({
    id: auditLogsTable.id,
    actorClerkUserId: auditLogsTable.actorClerkUserId,
    createdAt: auditLogsTable.createdAt,
    metadata: auditLogsTable.metadata,
  }).from(auditLogsTable).where(and(
    eq(auditLogsTable.action, "platform_content.draft_saved"),
    eq(auditLogsTable.entityType, "site_content"),
    eq(auditLogsTable.entityId, "platform"),
  )).orderBy(desc(auditLogsTable.createdAt)).limit(500);

  const revisionIds = audits.flatMap(({ metadata }) => {
    if (!metadata || typeof metadata !== "object") return [];
    const revisionId = (metadata as Record<string, unknown>).revisionId;
    return typeof revisionId === "string" ? [revisionId] : [];
  });
  const revisions = revisionIds.length > 0
    ? await db.select({
      id: siteContentRevisionsTable.id,
      snapshot: siteContentRevisionsTable.snapshot,
    }).from(siteContentRevisionsTable).where(inArray(siteContentRevisionsTable.id, revisionIds))
    : [];
  const actorIds = Array.from(new Set(audits.map(({ actorClerkUserId }) => actorClerkUserId)));
  const staff = actorIds.length > 0
    ? await db.select({
      clerkUserId: staffUsersTable.clerkUserId,
      email: staffUsersTable.email,
    }).from(staffUsersTable).where(inArray(staffUsersTable.clerkUserId, actorIds))
    : [];
  const history = buildCatalogueMappingHistory(
    parsedSlug.data,
    audits,
    revisions,
    new Map(staff.map(({ clerkUserId, email }) => [clerkUserId, email])),
  );
  res.json({ history });
});

function expectedDraftDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function preservesLegacySparseFeaturedProvenance(stored: unknown, incoming: PlatformContent): boolean {
  if (!incoming.homepage.featured.legacySparseCompatibility) return true;
  const current = PlatformContentSchema.safeParse(stored);
  if (!current.success || !current.data.homepage.featured.legacySparseCompatibility) return false;
  const currentSlugs = current.data.products.map((product) => product.slug).sort();
  const incomingSlugs = incoming.products.map((product) => product.slug).sort();
  if (currentSlugs.length !== incomingSlugs.length || currentSlugs.some((slug, index) => slug !== incomingSlugs[index])) return false;
  const uniqueCount = currentSlugs.length;
  const currentInitial = current.data.homepage.featured.productSlugs.slice(0, uniqueCount);
  const incomingInitial = incoming.homepage.featured.productSlugs.slice(0, uniqueCount);
  return currentInitial.length === incomingInitial.length
    && currentInitial.every((slug, index) => slug === incomingInitial[index]);
}

router.get("/staff/content/platform", platformRoles, async (_req, res): Promise<void> => {
  await ensurePlatformContent();
  const [row] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
  if (!row) { res.status(503).json({ error: "Platform content is unavailable" }); return; }
  res.json(row);
});

router.put("/staff/content/platform", platformRoles, async (req, res): Promise<void> => {
  const parsed = PlatformContentSchema.safeParse(req.body?.content);
  const expected = expectedDraftDate(req.body?.expectedDraftUpdatedAt);
  if (!parsed.success || !expected) {
    res.status(400).json({ error: "Provide complete valid platform content and expectedDraftUpdatedAt", issues: parsed.success ? undefined : parsed.error.issues });
    return;
  }
  await ensurePlatformContent();
  const [currentDraft] = await db.select().from(siteContentTable)
    .where(and(eq(siteContentTable.key, "platform"), eq(siteContentTable.draftUpdatedAt, expected))).limit(1);
  if (!currentDraft) { res.status(409).json({ error: "Platform content changed while you were editing. Reload before saving." }); return; }
  if (!preservesLegacySparseFeaturedProvenance(currentDraft.draft, parsed.data)) {
    res.status(400).json({ error: "Legacy sparse featured compatibility can only be preserved from the current migrated draft." });
    return;
  }
  const mediaIssues = [
    ...await validateHomepageHeroMediaAssets(parsed.data),
    ...await validateHomepageMerchandisingMediaAssets(parsed.data),
    ...await validateProductMediaAssets(parsed.data),
    ...await validateCollectionMediaAssets(parsed.data),
  ];
  if (mediaIssues.length > 0) {
    res.status(400).json({ error: "Storefront media did not pass publishing checks", issues: mediaIssues });
    return;
  }
  try {
    const commerceIssues = await validateCurrentCommerceMappings(parsed.data.products, false);
    if (commerceIssues.length > 0) {
      res.status(400).json({ error: "JusticeSure mappings did not pass live draft checks", issues: commerceIssues });
      return;
    }
  } catch {
    res.status(503).json({ error: "JusticeSure catalogue could not be revalidated. The draft was not saved." });
    return;
  }
  const now = new Date();
  const replacedCoverPaths = replacedCollectionCoverUploadPaths(currentDraft.draft, parsed.data);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
    const lockedMediaIssues = [
      ...await validateHomepageHeroMediaAssets(parsed.data),
      ...await validateHomepageMerchandisingMediaAssets(parsed.data),
      ...await validateProductMediaAssets(parsed.data),
      ...await validateCollectionMediaAssets(parsed.data),
    ];
    if (lockedMediaIssues.length > 0) {
      return { kind: "media_invalid" as const, issues: lockedMediaIssues };
    }
    const [updated] = await tx.update(siteContentTable).set({
      draft: parsed.data,
      draftUpdatedAt: now,
      updatedByClerkUserId: req.staff!.clerkUserId,
    }).where(and(eq(siteContentTable.key, "platform"), eq(siteContentTable.draftUpdatedAt, expected))).returning();
    if (!updated) return { kind: "conflict" as const };
    const hash = platformContentHash(parsed.data);
    const [revision] = await tx.insert(siteContentRevisionsTable).values({
      contentKey: "platform", event: "draft_saved", snapshot: parsed.data,
      contentHash: hash, createdByClerkUserId: req.staff!.clerkUserId,
    }).returning({ id: siteContentRevisionsTable.id });
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId, action: "platform_content.draft_saved",
      entityType: "site_content", entityId: "platform", metadata: {
        contentHash: hash,
        revisionId: revision!.id,
        confirmedCommerceMappings: parsed.data.products
          .filter((product) => product.commerceMappingConfirmation)
          .map((product) => ({
            slug: product.slug,
            productHash: product.commerceMappingConfirmation!.productHash,
            confirmedAt: product.commerceMappingConfirmation!.confirmedAt,
            confidence: product.commerceMappingConfirmation!.confidence,
          })),
      },
    });
    await queueCollectionCoverCleanup(tx, replacedCoverPaths, req.staff!.clerkUserId);
    return { kind: "saved" as const, row: updated };
  });
  if (result.kind === "conflict") { res.status(409).json({ error: "Platform content changed while you were editing. Reload before saving." }); return; }
  if (result.kind === "media_invalid") {
    res.status(400).json({ error: "Storefront media changed before the draft could be saved", issues: result.issues });
    return;
  }
  try {
    await processPendingCollectionCoverCleanup();
  } catch (error) {
    req.log.error({ err: error }, "Failed to process queued collection cover cleanup");
  }
  res.json(result.row);
});

router.post("/staff/content/platform/publish", platformRoles, async (req, res): Promise<void> => {
  const expected = expectedDraftDate(req.body?.expectedDraftUpdatedAt);
  if (!expected) { res.status(400).json({ error: "expectedDraftUpdatedAt is required" }); return; }
  await ensurePlatformContent();
  const [candidate] = await db.select().from(siteContentTable)
    .where(and(eq(siteContentTable.key, "platform"), eq(siteContentTable.draftUpdatedAt, expected))).limit(1);
  if (!candidate) { res.status(409).json({ error: "Platform content changed before it could be published." }); return; }
  const candidateContent = PlatformContentSchema.safeParse(candidate.draft);
  if (!candidateContent.success) {
    res.status(400).json({ error: "The current draft is invalid", issues: candidateContent.error.issues });
    return;
  }
  const legacyProductIssues = validateLegacyProductPublication(candidateContent.data);
  if (legacyProductIssues.length > 0) {
    res.status(400).json({
      error: "Legacy products did not pass publishing checks",
      issues: legacyProductIssues,
    });
    return;
  }
  const accessoryProductIssues = validateAccessoryProductPublication(candidateContent.data);
  if (accessoryProductIssues.length > 0) {
    res.status(400).json({
      error: "Accessories did not pass publishing checks",
      issues: accessoryProductIssues,
    });
    return;
  }
  const mediaIssues = [
    ...await validateHomepageHeroMediaAssets(candidateContent.data),
    ...await validateHomepageMerchandisingMediaAssets(candidateContent.data),
    ...await validateProductMediaAssets(candidateContent.data),
    ...await validateCollectionMediaAssets(candidateContent.data),
  ];
  if (mediaIssues.length > 0) {
    res.status(400).json({ error: "Storefront media did not pass publishing checks", issues: mediaIssues });
    return;
  }
  try {
    const commerceIssues = await validateCurrentCommerceMappings(candidateContent.data.products, true);
    if (commerceIssues.length > 0) {
      res.status(400).json({ error: "JusticeSure mappings did not pass live publishing checks", issues: commerceIssues });
      return;
    }
  } catch {
    res.status(503).json({ error: "JusticeSure catalogue could not be revalidated. Nothing was published." });
    return;
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
    const [current] = await tx.select().from(siteContentTable)
      .where(and(eq(siteContentTable.key, "platform"), eq(siteContentTable.draftUpdatedAt, expected))).limit(1);
    if (!current) return { kind: "conflict" as const };
    const parsed = PlatformContentSchema.safeParse(current.draft);
    if (!parsed.success) return { kind: "invalid" as const, issues: parsed.error.issues };
    const legacyProductIssues = validateLegacyProductPublication(parsed.data);
    if (legacyProductIssues.length > 0) {
      return { kind: "legacy_invalid" as const, issues: legacyProductIssues };
    }
    const accessoryProductIssues = validateAccessoryProductPublication(parsed.data);
    if (accessoryProductIssues.length > 0) {
      return { kind: "accessory_invalid" as const, issues: accessoryProductIssues };
    }
    const now = new Date();
    const [updated] = await tx.update(siteContentTable).set({
      published: parsed.data, publishedAt: now, publishedByClerkUserId: req.staff!.clerkUserId,
    }).where(and(eq(siteContentTable.key, "platform"), eq(siteContentTable.draftUpdatedAt, expected))).returning();
    if (!updated) return { kind: "conflict" as const };
    const hash = platformContentHash(parsed.data);
    const [revision] = await tx.insert(siteContentRevisionsTable).values({
      contentKey: "platform", event: "published", snapshot: parsed.data,
      contentHash: hash, createdByClerkUserId: req.staff!.clerkUserId,
    }).returning({ id: siteContentRevisionsTable.id });
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId, action: "platform_content.published",
      entityType: "site_content", entityId: "platform", metadata: { contentHash: hash, revisionId: revision!.id, publishedAt: now.toISOString() },
    });
    return { kind: "published" as const, row: updated };
  });
  if (result.kind === "conflict") { res.status(409).json({ error: "Platform content changed before it could be published." }); return; }
  if (result.kind === "invalid") { res.status(400).json({ error: "The current draft is invalid", issues: result.issues }); return; }
  if (result.kind === "legacy_invalid") {
    res.status(400).json({ error: "Legacy products did not pass publishing checks", issues: result.issues });
    return;
  }
  if (result.kind === "accessory_invalid") {
    res.status(400).json({ error: "Accessories did not pass publishing checks", issues: result.issues });
    return;
  }
  try {
    await processPendingCollectionCoverCleanup();
  } catch (error) {
    req.log.error({ err: error }, "Failed to process queued collection cover cleanup after publishing");
  }
  res.json(result.row);
});

router.post("/staff/content/platform/unpublish", platformRoles, async (req, res): Promise<void> => {
  const expected = expectedDraftDate(req.body?.expectedDraftUpdatedAt);
  if (!expected) { res.status(400).json({ error: "expectedDraftUpdatedAt is required" }); return; }
  await ensurePlatformContent();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
    const [updated] = await tx.update(siteContentTable).set({
      published: {}, publishedAt: null, publishedByClerkUserId: null,
    }).where(and(eq(siteContentTable.key, "platform"), eq(siteContentTable.draftUpdatedAt, expected))).returning();
    if (!updated) return null;
    const [revision] = await tx.insert(siteContentRevisionsTable).values({
      contentKey: "platform", event: "unpublished", snapshot: null,
      contentHash: platformContentHash(null), createdByClerkUserId: req.staff!.clerkUserId,
    }).returning({ id: siteContentRevisionsTable.id });
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId, action: "platform_content.unpublished",
      entityType: "site_content", entityId: "platform", metadata: { revisionId: revision!.id },
    });
    return updated;
  });
  if (!result) { res.status(409).json({ error: "Platform content changed before it could be unpublished." }); return; }
  try {
    await processPendingCollectionCoverCleanup();
  } catch (error) {
    req.log.error({ err: error }, "Failed to process queued collection cover cleanup after unpublishing");
  }
  res.json(result);
});

router.get("/staff/content/platform/revisions", platformRoles, async (_req, res): Promise<void> => {
  const rows = await db.select().from(siteContentRevisionsTable)
    .where(eq(siteContentRevisionsTable.contentKey, "platform"))
    .orderBy(desc(siteContentRevisionsTable.createdAt)).limit(100);
  res.json(rows);
});

const policyRoles = requireStaffRoles("owner", "administrator", "editor");

const policySlug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
export const PolicySectionSchema = z.object({
  id: policySlug,
  heading: z.string().trim().min(1).max(240),
  paragraphs: z.array(z.string().trim().min(1).max(10_000)).min(1).optional(),
  bullets: z.array(z.string().trim().min(1).max(1_000)).min(1).optional(),
}).strict().refine((section) => Boolean(section.paragraphs?.length || section.bullets?.length), {
  message: "Each policy section must contain paragraphs or bullets",
});
export const PolicyInputSchema = z.object({
  slug: policySlug,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1_000),
  sections: z.array(PolicySectionSchema).min(1),
}).strict();

export function parsePolicyBody(body: unknown) {
  const parsed = PolicyInputSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

router.get("/staff/policies", policyRoles, async (_req, res): Promise<void> => {
  res.json(await db.select().from(policyDocumentsTable).orderBy(desc(policyDocumentsTable.updatedAt)).limit(200));
});

router.post("/staff/policies", policyRoles, async (req, res): Promise<void> => {
  const input = parsePolicyBody(req.body);
  if (!input) { res.status(400).json({ error: "Provide a valid policy slug, title, summary and sections" }); return; }
  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"soso-policy:" + input.slug}))`);
    const [latest] = await tx.select({ version: policyDocumentsTable.version }).from(policyDocumentsTable)
      .where(eq(policyDocumentsTable.slug, input.slug)).orderBy(desc(policyDocumentsTable.version)).limit(1);
    const [created] = await tx.insert(policyDocumentsTable).values({
      ...input, version: (latest?.version ?? 0) + 1, status: "draft", createdByClerkUserId: req.staff!.clerkUserId,
    }).returning();
    await tx.insert(policyDocumentRevisionsTable).values({ policyDocumentId: created!.id, snapshot: created!, createdByClerkUserId: req.staff!.clerkUserId });
    await tx.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "policy.created", entityType: "policy_document", entityId: created!.id, metadata: { slug: created!.slug, version: created!.version } });
    return created!;
  });
  res.status(201).json(row);
});

router.put("/staff/policies/:id", policyRoles, async (req, res): Promise<void> => {
  const input = parsePolicyBody(req.body);
  if (!input) { res.status(400).json({ error: "Provide a valid policy slug, title, summary and sections" }); return; }
  const [current] = await db.select().from(policyDocumentsTable).where(eq(policyDocumentsTable.id, req.params.id as string)).limit(1);
  if (!current) { res.status(404).json({ error: "Policy not found" }); return; }
  if (current.status !== "draft") { res.status(409).json({ error: "Published policy versions are immutable; create a new version" }); return; }
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(policyDocumentsTable).set({ ...input, updatedAt: new Date() }).where(eq(policyDocumentsTable.id, current.id)).returning();
    await tx.insert(policyDocumentRevisionsTable).values({ policyDocumentId: current.id, snapshot: updated!, createdByClerkUserId: req.staff!.clerkUserId });
    await tx.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "policy.updated", entityType: "policy_document", entityId: current.id, metadata: { slug: updated!.slug, version: updated!.version } });
    return updated!;
  });
  res.json(row);
});

router.post("/staff/policies/:id/publish", policyRoles, async (req, res): Promise<void> => {
  const effectiveAt = typeof req.body?.effectiveAt === "string" ? new Date(req.body.effectiveAt) : new Date();
  if (Number.isNaN(effectiveAt.getTime())) { res.status(400).json({ error: "effectiveAt must be a valid date-time" }); return; }
  const row = await db.transaction(async (tx) => {
    const [draft] = await tx.select().from(policyDocumentsTable)
      .where(and(eq(policyDocumentsTable.id, req.params.id as string), eq(policyDocumentsTable.status, "draft"))).limit(1);
    if (!draft) return { kind: "missing" as const };
    if (!PolicyInputSchema.safeParse(draft).success) return { kind: "invalid" as const };
    const [updated] = await tx.update(policyDocumentsTable).set({
      status: "published", reviewedByClerkUserId: req.staff!.clerkUserId, reviewedAt: new Date(),
      approvedByClerkUserId: req.staff!.clerkUserId, approvedAt: new Date(), effectiveAt,
      publishedAt: new Date(), updatedAt: new Date(),
    }).where(and(eq(policyDocumentsTable.id, req.params.id as string), eq(policyDocumentsTable.status, "draft"))).returning();
    if (!updated) return { kind: "missing" as const };
    await tx.insert(policyDocumentRevisionsTable).values({ policyDocumentId: updated.id, snapshot: updated, createdByClerkUserId: req.staff!.clerkUserId });
    await tx.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "policy.published", entityType: "policy_document", entityId: updated.id, metadata: { slug: updated.slug, version: updated.version, effectiveAt: effectiveAt.toISOString() } });
    return { kind: "published" as const, row: updated };
  });
  if (row.kind === "missing") { res.status(404).json({ error: "Policy not found" }); return; }
  if (row.kind === "invalid") { res.status(400).json({ error: "The current policy draft is invalid" }); return; }
  res.json(row.row);
});

router.get("/staff/policies/:id/history", policyRoles, async (req, res): Promise<void> => {
  const rows = await db.select().from(policyDocumentRevisionsTable)
    .where(eq(policyDocumentRevisionsTable.policyDocumentId, req.params.id as string))
    .orderBy(desc(policyDocumentRevisionsTable.createdAt)).limit(100);
  res.json(rows);
});

router.delete("/staff/policies/:id", policyRoles, async (req, res): Promise<void> => {
  const [current] = await db.select().from(policyDocumentsTable).where(eq(policyDocumentsTable.id, req.params.id as string)).limit(1);
  if (!current) { res.status(404).json({ error: "Policy not found" }); return; }
  if (current.status !== "draft") { res.status(409).json({ error: "Only draft policy versions can be archived" }); return; }
  await db.transaction(async (tx) => {
    const [archived] = await tx.update(policyDocumentsTable).set({ status: "archived", updatedAt: new Date() })
      .where(eq(policyDocumentsTable.id, current.id)).returning();
    await tx.insert(policyDocumentRevisionsTable).values({ policyDocumentId: current.id, snapshot: archived!, createdByClerkUserId: req.staff!.clerkUserId });
    await tx.insert(auditLogsTable).values({ actorClerkUserId: req.staff!.clerkUserId, action: "policy.archived", entityType: "policy_document", entityId: current.id, metadata: { slug: current.slug, version: current.version } });
  });
  res.status(204).send();
});

type JournalPostCore = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  authorName: string;
  category: string | null;
  tags: string[] | null;
  seoTitle: string | null;
  seoDescription: string | null;
  readTimeMinutes: number | null;
  relatedProductSlugs: string[] | null;
  relatedArticleSlugs: string[] | null;
  status: string;
};

function journalFingerprint(post: JournalPostCore): string {
  return createHash("sha256")
    .update(JSON.stringify(post))
    .digest("hex");
}

function journalSnapshot(post: JournalPostCore & { publishedAt: Date | null }) {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    coverImageUrl: post.coverImageUrl,
    coverImageAlt: post.coverImageAlt,
    authorName: post.authorName,
    category: post.category,
    tags: post.tags,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    readTimeMinutes: post.readTimeMinutes,
    relatedProductSlugs: post.relatedProductSlugs,
    relatedArticleSlugs: post.relatedArticleSlugs,
    status: post.status,
    publishedAt: post.publishedAt?.toISOString() ?? null,
  };
}

async function validateRelatedArticles(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sourceSlug: string,
  relatedArticleSlugs: string[] | null | undefined,
  nextStatus: string,
): Promise<string | null> {
  const slugs = Array.from(new Set((relatedArticleSlugs ?? []).map((slug) => slug.trim()).filter(Boolean)));
  if (!slugs.length) return null;
  if (slugs.includes(sourceSlug)) return "An article cannot link to itself";
  const related = await tx.select({ slug: journalPostsTable.slug, status: journalPostsTable.status })
    .from(journalPostsTable).where(inArray(journalPostsTable.slug, slugs));
  if (related.length !== slugs.length) return "Every related article must exist before it can be linked";
  if (related.some((post) => post.status === "archived")) return "Archived articles cannot be used as related content";
  if (nextStatus === "published" && related.some((post) => post.status !== "published")) {
    return "Published articles may only link to other published articles";
  }
  return null;
}

router.get("/staff/journal", requireStaffRoles("owner", "administrator", "editor"), async (_req, res): Promise<void> => {
  const posts = await db
    .select()
    .from(journalPostsTable)
    .orderBy(desc(journalPostsTable.updatedAt))
    .limit(100);

  res.json(ListStaffJournalPostsResponse.parse(posts));
});

router.post(
  "/staff/journal",
  requireStaffRoles("owner", "administrator", "editor"),
  async (req, res): Promise<void> => {
    const parsed = CreateStaffJournalPostBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please complete the article details" });
      return;
    }
    if (parsed.data.coverImageUrl) {
      const coverIssue = await validateManagedImageAsset(parsed.data.coverImageUrl);
      if (coverIssue) {
        res.status(400).json({ error: coverIssue });
        return;
      }
    }
    const result = await db.transaction(async (tx) => {
      const relationError = await validateRelatedArticles(
        tx,
        parsed.data.slug,
        parsed.data.relatedArticleSlugs,
        parsed.data.status,
      );
      if (relationError) return { kind: "relation_error" as const, message: relationError };
      const [created] = await tx.insert(journalPostsTable).values({
        ...parsed.data,
        publishedAt: parsed.data.status === "published" ? new Date() : null,
      })
        .returning();
      const [revision] = await tx
        .insert(journalPostRevisionsTable)
        .values({
          journalPostId: created!.id,
          snapshot: journalSnapshot(created!),
          contentHash: journalFingerprint(created!),
          createdByClerkUserId: req.staff!.clerkUserId,
        })
        .returning();
      await tx.insert(auditLogsTable).values({
        actorClerkUserId: req.staff!.clerkUserId,
        action: "journal.created",
        entityType: "journal_post",
        entityId: created!.id,
        metadata: { slug: created!.slug, status: created!.status, contentHash: journalFingerprint(created!), revisionId: revision!.id },
      });
      return { kind: "created" as const, post: created! };
    });
    if (result.kind === "relation_error") {
      res.status(400).json({ error: result.message });
      return;
    }
    res.status(201).json(CreateStaffJournalPostResponse.parse(result.post));
  },
);

router.patch(
  "/staff/journal/:id",
  requireStaffRoles("owner", "administrator", "editor"),
  async (req, res): Promise<void> => {
    const params = ListStaffJournalPostRevisionsParams.safeParse(req.params);
    const parsed = UpdateStaffJournalPostBody.safeParse(req.body);
    if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) {
      res.status(400).json({ error: "Please provide valid article updates" });
      return;
    }
    const revisionHeader = req.header("x-soso-expected-revision");
    const expectedRevision = revisionHeader ? new Date(revisionHeader) : null;
    if (revisionHeader && (!expectedRevision || Number.isNaN(expectedRevision.getTime()))) {
      res.status(400).json({ error: "The article revision reference is invalid" });
      return;
    }

    const post = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(journalPostsTable)
        .where(eq(journalPostsTable.id, params.data.id))
        .limit(1);
      if (!current) return null;
      if (expectedRevision && current.updatedAt.getTime() !== expectedRevision.getTime()) {
        return { kind: "conflict" as const };
      }
      const nextStatus = parsed.data.status ?? current.status;
      const nextCoverImageUrl = parsed.data.coverImageUrl === undefined
        ? current.coverImageUrl
        : parsed.data.coverImageUrl;
      if (nextCoverImageUrl) {
        const coverIssue = await validateManagedImageAsset(nextCoverImageUrl);
        if (coverIssue) return { kind: "cover_error" as const, message: coverIssue };
      }
      const relationError = await validateRelatedArticles(
        tx,
        parsed.data.slug ?? current.slug,
        parsed.data.relatedArticleSlugs ?? current.relatedArticleSlugs,
        nextStatus,
      );
      if (relationError) return { kind: "relation_error" as const, message: relationError };
      const [previousRevision] = await tx
        .select({ id: journalPostRevisionsTable.id })
        .from(journalPostRevisionsTable)
        .where(eq(journalPostRevisionsTable.journalPostId, current.id))
        .orderBy(desc(journalPostRevisionsTable.createdAt))
        .limit(1);

      const status = nextStatus;
      const [updated] = await tx
        .update(journalPostsTable)
        .set({
          ...parsed.data,
          publishedAt:
            status === "published"
              ? current.publishedAt ?? new Date()
              : null,
        })
        .where(eq(journalPostsTable.id, current.id))
        .returning();

      const [revision] = await tx
        .insert(journalPostRevisionsTable)
        .values({
          journalPostId: updated!.id,
          snapshot: journalSnapshot(updated!),
          contentHash: journalFingerprint(updated!),
          createdByClerkUserId: req.staff!.clerkUserId,
        })
        .returning();

      await tx.insert(auditLogsTable).values({
        actorClerkUserId: req.staff!.clerkUserId,
        action: "journal.updated",
        entityType: "journal_post",
        entityId: updated!.id,
        metadata: {
          previousSlug: current.slug,
          slug: updated!.slug,
          previousStatus: current.status,
          status: updated!.status,
          previousContentHash: journalFingerprint(current),
          contentHash: journalFingerprint(updated!),
          previousRevisionId: previousRevision?.id ?? null,
          revisionId: revision!.id,
        },
      });
      return { kind: "updated" as const, post: updated! };
    });

    if (!post) {
      res.status(404).json({ error: "Article not found" });
      return;
    }
    if (post.kind === "conflict") {
      res.status(409).json({ error: "This article changed while you were editing it. Reload it before saving again." });
      return;
    }
    if (post.kind === "relation_error") {
      res.status(400).json({ error: post.message });
      return;
    }
    if (post.kind === "cover_error") {
      res.status(400).json({ error: post.message });
      return;
    }

    res.json(UpdateStaffJournalPostResponse.parse(post.post));
  },
);

router.get(
  "/staff/journal/:id/revisions",
  requireStaffRoles("owner", "administrator", "editor"),
  async (req, res): Promise<void> => {
    const params = ListStaffJournalPostRevisionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid article reference" });
      return;
    }

    const [post] = await db
      .select({ id: journalPostsTable.id })
      .from(journalPostsTable)
      .where(eq(journalPostsTable.id, params.data.id))
      .limit(1);
    if (!post) {
      res.status(404).json({ error: "Article not found" });
      return;
    }

    const revisions = await db
      .select({
        id: journalPostRevisionsTable.id,
        journalPostId: journalPostRevisionsTable.journalPostId,
        snapshot: journalPostRevisionsTable.snapshot,
        contentHash: journalPostRevisionsTable.contentHash,
        createdAt: journalPostRevisionsTable.createdAt,
      })
      .from(journalPostRevisionsTable)
      .where(eq(journalPostRevisionsTable.journalPostId, post.id))
      .orderBy(desc(journalPostRevisionsTable.createdAt))
      .limit(100);

    res.json(ListStaffJournalPostRevisionsResponse.parse(revisions));
  },
);

// ── FAQ management ─────────────────────────────────────────────────────────

export const faqSnapshot = (row: typeof faqItemsTable.$inferSelect) => ({
  question: row.question,
  answer: row.answer,
  category: row.category,
  sortOrder: row.sortOrder,
  isPublished: row.isPublished,
});

export const buildFaqCreateAuditMetadata = (row: typeof faqItemsTable.$inferSelect) => ({
  snapshot: faqSnapshot(row),
  transition: { from: null, to: row.isPublished ? "published" : "draft" },
});

router.get("/staff/faq", requireStaffRoles("owner", "administrator", "editor"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(faqItemsTable)
    .orderBy(asc(faqItemsTable.sortOrder), asc(faqItemsTable.createdAt));
  res.json(rows);
});

router.post("/staff/faq", requireStaffRoles("owner", "administrator", "editor"), async (req, res): Promise<void> => {
  const { question, answer, category, sortOrder, isPublished } = req.body as Record<string, unknown>;
  if (typeof question !== "string" || !question.trim() || typeof answer !== "string" || !answer.trim()) {
    res.status(400).json({ error: "question and answer are required" });
    return;
  }
  const [row] = await db.insert(faqItemsTable).values({
    question: question.trim(),
    answer: answer.trim(),
    category: typeof category === "string" && category.trim() ? category.trim() : null,
    sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    isPublished: typeof isPublished === "boolean" ? isPublished : false,
  }).returning();
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId,
    action: "faq.created",
    entityType: "faq_item",
    entityId: row!.id,
    metadata: buildFaqCreateAuditMetadata(row!),
  });
  res.status(201).json(row);
});

router.patch("/staff/faq/:id", requireStaffRoles("owner", "administrator", "editor"), async (req, res): Promise<void> => {
  const { question, answer, category, sortOrder, isPublished } = req.body as Record<string, unknown>;
  const [current] = await db.select().from(faqItemsTable).where(eq(faqItemsTable.id, req.params.id as string)).limit(1);
  if (!current) { res.status(404).json({ error: "FAQ item not found" }); return; }
  const updates: Partial<typeof faqItemsTable.$inferInsert> = {};
  if (typeof question === "string" && question.trim()) updates.question = question.trim();
  if (typeof answer === "string" && answer.trim()) updates.answer = answer.trim();
  if (category !== undefined) updates.category = typeof category === "string" && category.trim() ? category.trim() : null;
  if (typeof sortOrder === "number") updates.sortOrder = sortOrder;
  if (typeof isPublished === "boolean") updates.isPublished = isPublished;
  if (!Object.keys(updates).length) { res.status(400).json({ error: "No valid fields to update" }); return; }
  updates.updatedAt = new Date();
  const [row] = await db.update(faqItemsTable).set(updates).where(eq(faqItemsTable.id, current.id)).returning();
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId,
    action: "faq.updated",
    entityType: "faq_item",
    entityId: row!.id,
    metadata: buildFaqUpdateAuditMetadata(current, row!),
  });
  res.json(row);
});

router.delete("/staff/faq/:id", requireStaffRoles("owner", "administrator", "editor"), async (req, res): Promise<void> => {
  const [current] = await db.select().from(faqItemsTable).where(eq(faqItemsTable.id, req.params.id as string)).limit(1);
  if (!current) { res.status(404).json({ error: "FAQ item not found" }); return; }
  await db.delete(faqItemsTable).where(eq(faqItemsTable.id, current.id));
  await db.insert(auditLogsTable).values({
    actorClerkUserId: req.staff!.clerkUserId,
    action: "faq.deleted",
    entityType: "faq_item",
    entityId: current.id,
    metadata: buildFaqDeleteAuditMetadata(current),
  });
  res.status(204).send();
});

const faqHistoryCursorSchema = z.object({
  id: z.string().uuid(),
}).strict();

type FaqHistoryCursor = z.infer<typeof faqHistoryCursorSchema>;

export function encodeFaqHistoryCursor(cursor: FaqHistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeFaqHistoryCursor(cursor: string): FaqHistoryCursor {
  try {
    return faqHistoryCursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new Error("Invalid FAQ history cursor");
  }
}

export function buildFaqHistoryPage<T extends { id: string; createdAt: Date }>(events: readonly T[], limit: number) {
  const hasMore = events.length > limit;
  const items = hasMore ? events.slice(0, limit) : [...events];
  const lastItem = items.at(-1);
  return {
    items,
    nextCursor: hasMore && lastItem
      ? encodeFaqHistoryCursor({ id: lastItem.id })
      : null,
  };
}

export async function queryFaqHistoryEvents(
  faqId: string,
  limit: number,
  cursor?: FaqHistoryCursor,
) {
  const filters = [
    eq(auditLogsTable.entityType, "faq_item"),
    eq(auditLogsTable.entityId, faqId),
  ];
  if (cursor) {
    const [cursorEvent] = await db.select({
      createdAt: sql<string>`${auditLogsTable.createdAt}::text`,
    }).from(auditLogsTable).where(and(
      eq(auditLogsTable.entityType, "faq_item"),
      eq(auditLogsTable.entityId, faqId),
      eq(auditLogsTable.id, cursor.id),
    )).limit(1);
    if (!cursorEvent) throw new Error("FAQ history cursor not found");
    filters.push(sql`(
      ${auditLogsTable.createdAt},
      ${auditLogsTable.id}
    ) < (
      ${cursorEvent.createdAt}::timestamptz,
      ${cursor.id}::uuid
    )`);
  }

  return db.select({
    id: auditLogsTable.id,
    actorClerkUserId: auditLogsTable.actorClerkUserId,
    action: auditLogsTable.action,
    metadata: auditLogsTable.metadata,
    createdAt: auditLogsTable.createdAt,
  }).from(auditLogsTable)
    .where(and(...filters))
    .orderBy(desc(auditLogsTable.createdAt), desc(auditLogsTable.id))
    .limit(limit + 1);
}

router.get("/staff/faq-history", requireStaffRoles("owner", "administrator", "editor"), async (req, res): Promise<void> => {
  const query = ListStaffFaqHistoryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid FAQ history query" });
    return;
  }

  let cursor: FaqHistoryCursor | undefined;
  if (query.data.cursor) {
    try {
      cursor = decodeFaqHistoryCursor(query.data.cursor);
    } catch {
      res.status(400).json({ error: "Invalid FAQ history cursor" });
      return;
    }
  }

  let events;
  try {
    events = await queryFaqHistoryEvents(query.data.id, query.data.limit, cursor);
  } catch {
    res.status(400).json({ error: "Invalid FAQ history cursor" });
    return;
  }
  const [item] = await db.select({ id: faqItemsTable.id }).from(faqItemsTable)
    .where(eq(faqItemsTable.id, query.data.id)).limit(1);

  if (!item && !events.length) {
    const [existingHistory] = await db.select({ id: auditLogsTable.id }).from(auditLogsTable)
      .where(and(
        eq(auditLogsTable.entityType, "faq_item"),
        eq(auditLogsTable.entityId, query.data.id),
      ))
      .limit(1);
    if (!existingHistory) {
      res.status(404).json({ error: "FAQ item not found" });
      return;
    }
  }

  res.json(ListStaffFaqHistoryResponse.parse(buildFaqHistoryPage(events, query.data.limit)));
});

export default router;

export const buildFaqUpdateAuditMetadata = (
  previous: typeof faqItemsTable.$inferSelect,
  current: typeof faqItemsTable.$inferSelect,
) => ({
  previousSnapshot: faqSnapshot(previous),
  snapshot: faqSnapshot(current),
  transition: {
    from: previous.isPublished ? "published" : "draft",
    to: current.isPublished ? "published" : "draft",
  },
});

export const buildFaqDeleteAuditMetadata = (row: typeof faqItemsTable.$inferSelect) => ({
  previousSnapshot: faqSnapshot(row),
  transition: { from: row.isPublished ? "published" : "draft", to: "deleted" },
});
