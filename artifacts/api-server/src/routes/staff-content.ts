import { Router, type IRouter, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import {
  GetCommerceCatalogResponse,
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
import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { ensurePlatformContent, platformContentHash, PlatformContentSchema, unfinishedProductImages, type PlatformContent } from "../lib/platform-content";
import { validateHomepageHeroMediaAssets } from "../lib/hero-media-validation";
import { validateHomepageMerchandisingMediaAssets, validateHomepageProductBindings } from "../lib/homepage-media-validation";
import { validateLegacyProductPublication } from "../lib/legacy-product-publication";
import {
  CATALOGUE_BUSINESS_APPROVALS_KEY,
  confirmedNonAccessoryProducts,
  parseCatalogueBusinessApprovalLedger,
  productBusinessFingerprint,
  validBusinessApprovalSlugs,
} from "../lib/catalogue-business-approvals";
import { validateAccessoryProductPublication } from "../lib/accessory-product-publication";
import { validateCollectionMediaAssets, validateManagedImageAsset, validateProductMediaAssets } from "../lib/product-media-validation";
import { platformProductReferences } from "../lib/platform-product-references";
import { deleteDraftProduct } from "../lib/delete-draft-product";
import { CatalogueAlertProductsSchema, catalogueAlertProjection, findStaleProjectedProducts } from "../lib/catalogue-alert-projection";
import { publishSiteDraft, saveSiteDraft } from "./site-content-policy";
import { z } from "zod";
import {
  JusticeSureCommerceClient,
  JusticeSureConfigurationError,
  JusticeSureRequestError,
  type JusticeSureCatalogProduct,
} from "../lib/justicesureCommerce";
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

function commerceFailureCategory(error: unknown): "configuration" | "provider" | "internal" {
  if (error instanceof JusticeSureConfigurationError) return "configuration";
  if (error instanceof JusticeSureRequestError) return "provider";
  return "internal";
}

function commerceUnavailable(
  res: Response,
  error: unknown,
  stage: "staff_catalogue_read" | "preview_catalogue_read" | "draft_catalogue_check" | "publication_catalogue_read",
  message: string,
): void {
  res.status(503).json({
    error: message,
    diagnostic: {
      provider: "justicesure",
      stage,
      category: commerceFailureCategory(error),
    },
  });
}

export async function validateCurrentCommerceMappings(
  products: MappingProductSource[],
  requireConfirmation: boolean,
  listProducts: () => Promise<JusticeSureCatalogProduct[]> = () => new JusticeSureCommerceClient(undefined, true).listProducts(),
  currentCatalogue?: JusticeSureCatalogProduct[],
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
  // Drafts must remain editable when JusticeSure is unavailable. The parsed
  // platform schema and these local duplicate checks are sufficient until
  // publication, which always performs a fresh live catalogue verification.
  if (!requireConfirmation) return [...missingIssues, ...duplicateIssues];
  const catalogue = currentCatalogue ?? await listProducts();
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

type ProductAvailability = {
  localState: string;
  providerStock: "in_stock" | "out_of_stock" | "unknown" | "not_mapped";
  unavailableVariants: string[];
  reasons: string[];
  canMakeAvailable: boolean;
  productId?: string;
  variantIds: Record<string, string>;
};

function productAvailability(
  content: PlatformContent,
  product: PlatformContent["products"][number],
  catalogue: JusticeSureCatalogProduct[] | null,
  mappingIssues: string[],
): ProductAvailability {
  const reasons: string[] = [];
  const unavailableVariants: string[] = [];
  const variantIds = product.commerceVariantIds ?? {};
  const productId = product.commerceProductId;
  const expectedVariantKeys = [
    ...(product.standardEligible ? product.standardSizes : []),
    ...(product.customEligible ? ["Custom"] : []),
  ];
  const foundProduct = catalogue?.find((candidate) => candidate.id === productId);
  let providerStock: ProductAvailability["providerStock"] = !productId
    ? "not_mapped"
    : catalogue && foundProduct
      ? foundProduct.inStock ? "in_stock" : "out_of_stock"
      : "unknown";

  if (product.fulfilmentState === "unavailable") {
    reasons.push("Local fulfilment is unavailable; this does not establish JusticeSure stock status.");
  }
  if (!productId) {
    reasons.push("No JusticeSure product ID is mapped.");
  } else if (!catalogue) {
    reasons.push(`JusticeSure product ${productId} stock is unknown because the live catalogue could not be read.`);
  } else if (!foundProduct) {
    reasons.push(`Mapped JusticeSure product ${productId} was not found in the live catalogue.`);
    providerStock = "unknown";
  } else if (!foundProduct.inStock) {
    reasons.push(`JusticeSure product ${productId} is out of stock.`);
  }

  for (const key of expectedVariantKeys) {
    const variantId = variantIds[key];
    if (!variantId) {
      unavailableVariants.push(key);
      reasons.push(`No JusticeSure variant ID is mapped for ${key}.`);
      continue;
    }
    const variant = foundProduct?.variants.find((candidate) => candidate.id === variantId);
    if (!catalogue || !foundProduct) {
      unavailableVariants.push(key);
      reasons.push(`JusticeSure variant ${variantId} (${key}) could not be checked against the live catalogue.`);
    } else if (!variant) {
      unavailableVariants.push(key);
      reasons.push(`Mapped JusticeSure variant ${variantId} (${key}) was not found under product ${productId}.`);
    } else if (!variant.inStock) {
      unavailableVariants.push(key);
      reasons.push(`JusticeSure variant ${variantId} (${key}) is out of stock.`);
    }
  }

  const productMappingIssues = mappingIssues.filter((issue) => issue.startsWith(`${product.slug}:`));
  reasons.push(...productMappingIssues);
  const localCandidate = { ...product, fulfilmentState: "made_immediately" as const };
  delete localCandidate.unavailableMessage;
  const candidateContent = {
    ...content,
    products: content.products.map((candidate) => candidate.slug === product.slug ? localCandidate : candidate),
  };
  const schemaValid = PlatformContentSchema.safeParse(candidateContent).success;
  if (!schemaValid) {
    reasons.push("The saved product fields do not satisfy the platform schema for made-immediately fulfilment.");
  }
  const liveMapping = catalogue
    ? validateCatalogueMappings([toLocalMappingProduct(localCandidate)], catalogue).mappings[0]
    : undefined;
  const canMakeAvailable = Boolean(
    product.fulfilmentState === "unavailable"
    && catalogue
    && foundProduct?.inStock
    && expectedVariantKeys.length > 0
    && expectedVariantKeys.every((key) => variantIds[key]
      && foundProduct.variants.some((variant) => variant.id === variantIds[key] && variant.inStock))
    && liveMapping?.status === "matched"
    && liveMapping.confidence >= 95
    && liveMapping.productId === productId
    && liveMapping.localHash
    && schemaValid,
  );
  if (!canMakeAvailable && product.fulfilmentState === "unavailable" && foundProduct?.inStock
      && unavailableVariants.length === 0 && liveMapping?.status !== "matched") {
    reasons.push(...(liveMapping?.evidence ?? ["The saved product identifiers do not form a high-confidence JusticeSure mapping."]));
  }
  if (product.fulfilmentState !== "unavailable") reasons.push("This product is already locally available.");

  return {
    localState: product.fulfilmentState,
    providerStock,
    unavailableVariants: [...new Set(unavailableVariants)],
    reasons: [...new Set(reasons)],
    canMakeAvailable,
    ...(productId ? { productId } : {}),
    variantIds: { ...variantIds },
  };
}

router.get("/staff/commerce/catalogue", platformRoles, async (_req, res): Promise<void> => {
  try {
    const client = new JusticeSureCommerceClient(undefined, true);
    res.json(GetCommerceCatalogResponse.parse({ products: await client.listProducts() }));
  } catch (error) {
    commerceUnavailable(res, error, "staff_catalogue_read", "JusticeSure catalogue is temporarily unavailable.");
  }
});

router.post("/staff/commerce/catalogue-mapping/preview", platformRoles, async (req, res): Promise<void> => {
  const parsed = z.object({ products: z.array(catalogueMappingProductInput).max(1000) }).strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide valid SOSO catalogue products.", issues: parsed.error.issues });
    return;
  }
  try {
    const catalogue = await new JusticeSureCommerceClient(undefined, true).listProducts();
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
    commerceUnavailable(res, error, "preview_catalogue_read", "JusticeSure catalogue mapping is temporarily unavailable.");
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
  // API startup owns initialization. A recurring read must not rerun
  // migrations/reconciliation or fetch both complete platform documents.
  const [row] = await db.select({ products: catalogueAlertProjection })
    .from(siteContentTable)
    .where(eq(siteContentTable.key, "platform"))
    .limit(1);
  const parsed = CatalogueAlertProductsSchema.safeParse(row?.products ?? []);
  if (!parsed.success) {
    res.status(500).json({ error: "Catalogue mapping alerts could not be read." });
    return;
  }
  const confirmationDates = parsed.data.map((product) => new Date(product.confirmedAt));
  if (confirmationDates.length === 0) {
    res.json({ products: [] });
    return;
  }
  const earliestConfirmation = new Date(Math.min(...confirmationDates.map((date) => date.getTime())));
  const identifiers = [...new Set(parsed.data.flatMap((product) =>
    [product.productId, ...Object.values(product.variantIds)]))];
  // A latest completed event per relevant identifier is sufficient to answer
  // "newer than this confirmation", without downloading an ever-growing log.
  const eventIdentifier = sql<string>`alert_ids.identifier`;
  const events = await db.select({
    identifier: eventIdentifier,
    occurredAt: sql`max(${commerceWebhookEventsTable.eventOccurredAt})`.mapWith(commerceWebhookEventsTable.eventOccurredAt),
  }).from(commerceWebhookEventsTable)
    .innerJoin(sql`lateral jsonb_array_elements_text(${commerceWebhookEventsTable.catalogueIdentifiers}) as alert_ids(identifier)`, sql`true`)
    .where(and(
    eq(commerceWebhookEventsTable.status, "completed"),
    inArray(commerceWebhookEventsTable.eventType, ["commerce.product.updated", "commerce.inventory.updated"]),
    gte(commerceWebhookEventsTable.eventOccurredAt, earliestConfirmation),
    inArray(eventIdentifier, identifiers),
  )).groupBy(eventIdentifier);
  const invalidations = events.flatMap((event) =>
    event.occurredAt
      ? [{ identifiers: [event.identifier], occurredAt: event.occurredAt }]
      : []);
  res.set("Cache-Control", "no-store");
  res.json({ products: findStaleProjectedProducts(parsed.data, invalidations) });
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

export function buildConfirmedCatalogueCandidate(
  published: PlatformContent,
  selected: PlatformContent["products"],
): { candidate: PlatformContent; prunedReferences: string[] } {
  const selectedSlugs = new Set(selected.map((product) => product.slug));
  const prunedReferences: string[] = [];
  const megaMenu = published.site.megaMenu.map((group) => {
    const featuredProductSlugs = group.featuredProductSlugs.filter((slug) => {
      if (selectedSlugs.has(slug)) return true;
      prunedReferences.push(`site.megaMenu[${group.id}].featuredProductSlugs removed omitted product ${slug}`);
      return false;
    });
    return {
      ...group,
      featuredProductSlugs,
    };
  });
  return {
    candidate: { ...published, site: { ...published.site, megaMenu }, products: selected },
    prunedReferences,
  };
}

/** Merge only scoped homepage content and an explicit Accessories visibility choice. */
export function buildHomepagePublicationCandidate(
  published: PlatformContent,
  draft: PlatformContent,
): PlatformContent {
  const hasPublishedAccessories = published.products.some((product) => product.department === "accessories");
  const draftAccessories = hasPublishedAccessories
    ? undefined
    : draft.site.megaMenu.find((group) => group.department === "accessories" || group.id === "accessories");
  const megaMenu = published.site.megaMenu.map((group) => (
    (group.department === "accessories" || group.id === "accessories") && draftAccessories
      ? { ...group, visible: draftAccessories.visible }
      : group
  ));
  return {
    ...published,
    site: { ...published.site, megaMenu },
    homepage: draft.homepage,
  };
}

router.get("/staff/content/platform", platformRoles, async (_req, res): Promise<void> => {
  await ensurePlatformContent();
  const [row] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
  if (!row) { res.status(503).json({ error: "Platform content is unavailable" }); return; }
  res.json(row);
});

router.get("/staff/content/platform/catalogue/readiness", platformRoles, async (_req, res): Promise<void> => {
  await ensurePlatformContent();
  const [row] = await db.select().from(siteContentTable)
    .where(eq(siteContentTable.key, "platform")).limit(1);
  const parsed = PlatformContentSchema.safeParse(row?.draft);
  if (!row || !parsed.success) {
    res.status(409).json({ error: "The saved platform draft is unavailable or invalid." });
    return;
  }
  const [approvalRow] = await db.select({ draft: siteContentTable.draft }).from(siteContentTable)
    .where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY)).limit(1);
  const approvedSlugs = validBusinessApprovalSlugs(parsed.data, approvalRow?.draft);
  let mappingIssues: string[];
  let catalogue: JusticeSureCatalogProduct[] | null = null;
  try {
    catalogue = await new JusticeSureCommerceClient(undefined, true).listProducts();
    mappingIssues = await validateCurrentCommerceMappings(parsed.data.products, true, undefined, catalogue);
  } catch {
    catalogue = null;
    mappingIssues = parsed.data.products.map((product) =>
      `${product.slug}: current JusticeSure mapping could not be revalidated; retry before business approval or publication.`);
  }
  const unfinished = unfinishedProductImages(parsed.data);
  const mediaIssues = await validateProductMediaAssets(parsed.data);
  const legacyIssues = validateLegacyProductPublication(parsed.data, undefined, approvedSlugs);
  const products = parsed.data.products.map((product, index) => {
    const issues = [
      ...(!approvedSlugs.has(product.slug) ? ["Business approval is required for this saved product snapshot."] : []),
      ...legacyIssues.filter((issue) => issue.productSlug === product.slug).map((issue) => issue.message),
      ...unfinished.filter((issue) => issue.path[1] === index).map((issue) => issue.message),
      ...mediaIssues.filter((issue) => issue.path[1] === index).map((issue) => issue.message),
      ...mappingIssues.filter((issue) => issue.startsWith(`${product.slug}:`)),
      ...(product.releaseState === "placeholder"
        ? ["This product remains a placeholder; approval will not change its release state or checkout availability."]
        : []),
    ];
    return {
      slug: product.slug,
      name: product.name,
      confirmed: Boolean(product.commerceMappingConfirmation)
        && !mappingIssues.some((issue) => issue.startsWith(`${product.slug}:`)),
      approved: approvedSlugs.has(product.slug),
      issues: [...new Set(issues)],
      availability: productAvailability(parsed.data, product, catalogue, mappingIssues),
    };
  });
  res.json({
    products,
    draftUpdatedAt: row.draftUpdatedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  });
});

router.post(
  "/staff/content/platform/products/:slug/availability",
  platformRoles,
  async (req, res): Promise<void> => {
    const parsedSlug = catalogueSlug.safeParse(req.params.slug);
    const body = z.object({
      expectedDraftUpdatedAt: z.string().datetime(),
      fulfilmentState: z.literal("made_immediately"),
      acknowledged: z.literal(true),
    }).strict().safeParse(req.body);
    if (!parsedSlug.success || !body.success) {
      res.status(400).json({
        error: "Provide a valid product slug, current draft timestamp, fulfilmentState: made_immediately, and acknowledged: true.",
        ...(body.success ? {} : { issues: body.error.issues }),
      });
      return;
    }

    await ensurePlatformContent();
    const expected = new Date(body.data.expectedDraftUpdatedAt);
    let result: {
      kind: "conflict" | "invalid" | "unavailable" | "saved";
      error?: string;
      issues?: unknown[];
      row?: typeof siteContentTable.$inferSelect;
    };
    try {
      result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
        const [row] = await tx.select().from(siteContentTable).where(and(
          eq(siteContentTable.key, "platform"),
          eq(siteContentTable.draftUpdatedAt, expected),
        )).limit(1);
        if (!row) return { kind: "conflict" as const };
        const content = PlatformContentSchema.safeParse(row.draft);
        if (!content.success) {
          return { kind: "invalid" as const, error: "The saved platform draft is invalid.", issues: content.error.issues };
        }
        const selected = content.data.products.find((product) => product.slug === parsedSlug.data);
        if (!selected) return { kind: "invalid" as const, error: "The product is not in the saved platform draft.", issues: [] };
        if (selected.department === "accessories") {
          return { kind: "invalid" as const, error: "Accessory availability must use its separate approval workflow.", issues: [] };
        }
        if (selected.fulfilmentState !== "unavailable") {
          return { kind: "invalid" as const, error: "The selected product is already locally available.", issues: [] };
        }
        if (!selected.commerceProductId) {
          return { kind: "invalid" as const, error: "A mapped JusticeSure product ID is required before changing local availability.", issues: [] };
        }

        let catalogue: JusticeSureCatalogProduct[];
        try {
          catalogue = await new JusticeSureCommerceClient(undefined, true).listProducts();
        } catch {
          return { kind: "unavailable" as const };
        }
        const candidateProduct = { ...selected, fulfilmentState: body.data.fulfilmentState };
        delete candidateProduct.unavailableMessage;
        const expectedVariantKeys = [
          ...(candidateProduct.standardEligible ? candidateProduct.standardSizes : []),
          ...(candidateProduct.customEligible ? ["Custom"] : []),
        ];
        const productId = candidateProduct.commerceProductId;
        const providerProduct = catalogue.find((product) => product.id === productId);
        const stockIssues: string[] = [];
        if (!providerProduct) {
          stockIssues.push(`Mapped JusticeSure product ${productId} was not found in the fresh catalogue.`);
        } else if (!providerProduct.inStock) {
          stockIssues.push(`JusticeSure product ${productId} is out of stock; local availability was not changed.`);
        }
        if (expectedVariantKeys.length === 0) {
          stockIssues.push("The saved product has no eligible Standard or Custom choices to activate.");
        }
        for (const key of expectedVariantKeys) {
          const variantId = candidateProduct.commerceVariantIds?.[key];
          if (!variantId) {
            stockIssues.push(`No JusticeSure variant ID is mapped for ${key}.`);
            continue;
          }
          const variant = providerProduct?.variants.find((entry) => entry.id === variantId);
          if (!variant) {
            stockIssues.push(`Mapped JusticeSure variant ${variantId} (${key}) was not found under product ${productId}.`);
          } else if (!variant.inStock) {
            stockIssues.push(`JusticeSure variant ${variantId} (${key}) is out of stock; local availability was not changed.`);
          }
        }
        if (stockIssues.length) {
          return { kind: "invalid" as const, error: "JusticeSure stock does not permit local availability.", issues: stockIssues };
        }

        const localMapping = toLocalMappingProduct(candidateProduct);
        const validation = validateCatalogueMappings([localMapping], catalogue);
        const mapping = validation.mappings[0];
        if (validation.issues.length || !mapping || mapping.status !== "matched" || mapping.confidence < 95) {
          return {
            kind: "invalid" as const,
            error: "The fresh JusticeSure product and variant mapping did not pass high-confidence validation.",
            issues: validation.issues.map((issue) => `${issue.slug}: ${issue.message}`)
              .concat(mapping?.evidence ?? []),
          };
        }
        if (mapping.productId !== productId || expectedVariantKeys.some((key) =>
          mapping.variantIds[key] !== candidateProduct.commerceVariantIds?.[key])) {
          return {
            kind: "invalid" as const,
            error: "Fresh JusticeSure mapping does not match the saved product and variant IDs.",
            issues: [
              `Expected JusticeSure product ID ${productId}.`,
              ...expectedVariantKeys.map((key) =>
                `Expected JusticeSure variant ID ${candidateProduct.commerceVariantIds?.[key] ?? "missing"} for ${key}.`),
            ],
          };
        }

        candidateProduct.commerceMappingConfirmation = {
          productHash: mapping.productHash!,
          localHash: mapping.localHash!,
          snapshotHash: validation.snapshot.hash,
          snapshotFetchedAt: validation.snapshot.fetchedAt,
          confirmedAt: new Date().toISOString(),
          confidence: mapping.confidence,
          source: "manual",
          evidence: mapping.evidence,
          choiceLabels: mapping.choiceLabels,
        };
        const candidateContent = {
          ...content.data,
          products: content.data.products.map((product) => product.slug === selected.slug ? candidateProduct : product),
        };
        const validatedContent = PlatformContentSchema.safeParse(candidateContent);
        if (!validatedContent.success) {
          return {
            kind: "invalid" as const,
            error: "The product fields do not satisfy platform validation for made-immediately fulfilment.",
            issues: validatedContent.error.issues,
          };
        }
        const selectedIndex = validatedContent.data.products.findIndex((product) => product.slug === selected.slug);
        const selectedOnly = { ...validatedContent.data, products: [validatedContent.data.products[selectedIndex]!] };
        const mediaIssues = [
          ...unfinishedProductImages(validatedContent.data).filter((issue) => issue.path[1] === selectedIndex),
          ...await validateProductMediaAssets(selectedOnly),
        ];
        if (mediaIssues.length) {
          return {
            kind: "invalid" as const,
            error: "Product media must pass validation before local availability can change.",
            issues: mediaIssues,
          };
        }

        const now = new Date();
        const [updated] = await tx.update(siteContentTable).set({
          draft: validatedContent.data,
          draftUpdatedAt: now,
          updatedByClerkUserId: req.staff!.clerkUserId,
        }).where(and(
          eq(siteContentTable.key, "platform"),
          eq(siteContentTable.draftUpdatedAt, expected),
        )).returning();
        if (!updated) return { kind: "conflict" as const };
        const hash = platformContentHash(validatedContent.data);
        const [revision] = await tx.insert(siteContentRevisionsTable).values({
          contentKey: "platform",
          event: "draft_saved",
          snapshot: validatedContent.data,
          contentHash: hash,
          createdByClerkUserId: req.staff!.clerkUserId,
        }).returning({ id: siteContentRevisionsTable.id });
        await tx.insert(auditLogsTable).values({
          actorClerkUserId: req.staff!.clerkUserId,
          action: "platform_content.product_availability_changed",
          entityType: "site_content",
          entityId: "platform",
          metadata: {
            slug: selected.slug,
            previousFulfilmentState: selected.fulfilmentState,
            fulfilmentState: candidateProduct.fulfilmentState,
            productId,
            variantIds: candidateProduct.commerceVariantIds ?? {},
            productHash: mapping.productHash,
            localHash: mapping.localHash,
            revisionId: revision!.id,
            contentHash: hash,
          },
        });
        return { kind: "saved" as const, row: updated };
      });
    } catch (error) {
      commerceUnavailable(res, error, "draft_catalogue_check", "JusticeSure catalogue could not be revalidated. Availability was not changed.");
      return;
    }

    if (result.kind === "conflict") {
      res.status(409).json({ error: "The saved platform draft changed. Reload the product and retry." });
    } else if (result.kind === "unavailable") {
      commerceUnavailable(res, new Error("JusticeSure catalogue unavailable"), "draft_catalogue_check", "JusticeSure catalogue could not be revalidated. Availability was not changed.");
    } else if (result.kind === "invalid") {
      res.status(400).json({ error: result.error, issues: result.issues });
    } else {
      res.json(result.row);
    }
  },
);

router.post(
  "/staff/content/platform/catalogue/approve",
  requireStaffRoles("owner", "administrator"),
  async (req, res): Promise<void> => {
    const body = z.object({
      slugs: z.array(catalogueSlug).min(1).max(1000),
      expectedDraftUpdatedAt: z.string().datetime(),
      acknowledged: z.literal(true),
    }).strict().safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Provide product slugs, the current draft timestamp, and acknowledged: true." });
      return;
    }
    if (new Set(body.data.slugs).size !== body.data.slugs.length) {
      res.status(400).json({ error: "Duplicate product slugs are not allowed." });
      return;
    }
    const expected = new Date(body.data.expectedDraftUpdatedAt);
    await ensurePlatformContent();
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
      const [row] = await tx.select().from(siteContentTable).where(and(
        eq(siteContentTable.key, "platform"),
        eq(siteContentTable.draftUpdatedAt, expected),
      )).limit(1);
      if (!row) return { kind: "conflict" as const };
      const content = PlatformContentSchema.safeParse(row.draft);
      if (!content.success) return { kind: "invalid" as const, error: "The saved draft is invalid.", issues: content.error.issues };
      const selected = body.data.slugs.map((slug) => content.data.products.find((product) => product.slug === slug));
      if (selected.some((product) => !product)) {
        return { kind: "invalid" as const, error: "One or more selected products are not in the saved draft.", issues: [] };
      }
      const products = selected as PlatformContent["products"];
      const selectedContent = { ...content.data, products };
      const issues = [
        ...unfinishedProductImages(selectedContent),
        ...await validateProductMediaAssets(selectedContent),
        ...validateAccessoryProductPublication(selectedContent),
        ...validateLegacyProductPublication(selectedContent, undefined, new Set(products.map((product) => product.slug))),
        ...products.filter((product) => !product.commerceMappingConfirmation)
          .map((product) => ({ path: ["products", product.slug, "commerceMappingConfirmation"], message: `${product.slug}: confirm its current JusticeSure mapping before business approval.` })),
      ];
      if (issues.length) return { kind: "invalid" as const, error: "Selected products are not ready for business approval.", issues };
      let commerceIssues: string[];
      try {
        commerceIssues = await validateCurrentCommerceMappings(products, true);
      } catch {
        return { kind: "unavailable" as const };
      }
      if (commerceIssues.length) {
        return { kind: "invalid" as const, error: "JusticeSure mappings did not pass fresh approval checks.", issues: commerceIssues };
      }
      const [approvalRow] = await tx.select().from(siteContentTable)
        .where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY)).limit(1);
      const ledger = parseCatalogueBusinessApprovalLedger(approvalRow?.draft);
      const approvedAt = new Date().toISOString();
      for (const product of products) {
        ledger.approvals[product.slug] = {
          fingerprint: productBusinessFingerprint(product),
          actorClerkUserId: req.staff!.clerkUserId,
          approvedAt,
        };
      }
      const [saved] = await tx.insert(siteContentTable).values({
        key: CATALOGUE_BUSINESS_APPROVALS_KEY,
        draft: ledger,
        published: {},
        draftUpdatedAt: new Date(),
        updatedByClerkUserId: req.staff!.clerkUserId,
      }).onConflictDoUpdate({
        target: siteContentTable.key,
        set: { draft: ledger, draftUpdatedAt: new Date(), updatedByClerkUserId: req.staff!.clerkUserId },
      }).returning({ key: siteContentTable.key });
      await tx.insert(auditLogsTable).values({
        actorClerkUserId: req.staff!.clerkUserId,
        action: "platform_content.catalogue_business_approved",
        entityType: "site_content",
        entityId: CATALOGUE_BUSINESS_APPROVALS_KEY,
        metadata: {
          slugs: products.map((product) => product.slug),
          approvedAt,
          fingerprints: Object.fromEntries(products.map((product) => [product.slug, productBusinessFingerprint(product)])),
        },
      });
      return { kind: "approved" as const, approvedSlugs: products.map((product) => product.slug), key: saved!.key };
    });
    if (result.kind === "conflict") {
      res.status(409).json({ error: "The saved draft changed before approval. Reload and review it again." });
    } else if (result.kind === "invalid") {
      res.status(400).json({ error: result.error, issues: result.issues });
    } else if (result.kind === "unavailable") {
      res.status(503).json({ error: "JusticeSure catalogue could not be revalidated. No approval was saved." });
    } else {
      res.json({ approvedSlugs: result.approvedSlugs });
    }
  },
);

const editablePlatformSections = [
  "site", "homepage", "pages", "collections", "sizeGuide", "productCopy", "supportCopy", "interfaceCopy",
] as const;
const editableSection = z.enum(editablePlatformSections);
type EditableSection = typeof editablePlatformSections[number];
type DraftChange =
  | { kind: "section"; section: EditableSection; value: unknown }
  | { kind: "product"; slug: string; value: unknown }
  | { kind: "delete_product"; slug: string }
  | { kind: "catalogue"; collections: unknown; upserts: { slug: string; product: unknown }[]; deletions: string[] };

function mergeDraftChange(current: PlatformContent, change: DraftChange): unknown {
  if (change.kind === "section") return { ...current, [change.section]: change.value };
  if (change.kind === "delete_product") return deleteDraftProduct(current, change.slug);
  if (change.kind === "catalogue") {
    const products = current.products.filter((product) => !change.deletions.includes(product.slug));
    for (const { slug, product } of change.upserts) {
      if (!product || typeof product !== "object" || Array.isArray(product)
          || (product as { slug?: unknown }).slug !== slug) return null;
      const index = products.findIndex((existing) => existing.slug === slug);
      if (index < 0) products.push(product as PlatformContent["products"][number]);
      else products[index] = product as PlatformContent["products"][number];
    }
    return { ...current, collections: change.collections, products };
  }
  const products = [...current.products];
  const index = products.findIndex((product) => product.slug === change.slug);
  if (!change.value || typeof change.value !== "object" || Array.isArray(change.value)
      || (change.value as { slug?: unknown }).slug !== change.slug) return null;
  if (index < 0) products.push(change.value as PlatformContent["products"][number]);
  else products[index] = change.value as PlatformContent["products"][number];
  return { ...current, products };
}

function acknowledgeCommittedPlatformDraft<Row>(res: Response, row: Row): void {
  res.json(row);
}

async function saveScopedDraft(req: Request, res: Response, change: DraftChange): Promise<void> {
  const expected = expectedDraftDate(req.body?.expectedDraftUpdatedAt);
  if (!expected) { res.status(400).json({ error: "expectedDraftUpdatedAt is required" }); return; }
  await ensurePlatformContent();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
    const [currentRow] = await tx.select().from(siteContentTable)
      .where(and(eq(siteContentTable.key, "platform"), eq(siteContentTable.draftUpdatedAt, expected))).limit(1);
    if (!currentRow) return { kind: "conflict" as const };
    const current = PlatformContentSchema.safeParse(currentRow.draft);
    if (!current.success) return { kind: "invalid" as const, error: "The saved draft is invalid. Restore it with the complete document editor.", issues: current.error.issues };
    const candidate = mergeDraftChange(current.data, change);
    if (!candidate) return { kind: "invalid" as const, error: "Product slug must match the URL and an existing product must be selected for deletion.", issues: [] };
    const parsed = PlatformContentSchema.safeParse(candidate);
    if (!parsed.success) return { kind: "invalid" as const, error: "The changed draft is invalid.", issues: parsed.error.issues };
    if (change.kind !== "delete_product" && !preservesLegacySparseFeaturedProvenance(currentRow.draft, parsed.data)) {
      return { kind: "invalid" as const, error: "Legacy sparse featured compatibility can only be preserved from the current migrated draft.", issues: [] };
    }
    const selectedProducts = change.kind === "product" ? [change.slug]
      : change.kind === "catalogue" ? change.upserts.map((item) => item.slug) : [];
    const selected = { ...parsed.data, products: parsed.data.products.filter((product) => selectedProducts.includes(product.slug)) };
    const mediaIssues = selectedProducts.length
      ? (await validateProductMediaAssets(selected)).map((issue) => ({
          ...issue,
          path: issue.path[0] === "products"
            ? ["products", parsed.data.products.findIndex((product) => product.slug === selected.products[Number(issue.path[1])]?.slug), ...issue.path.slice(2)]
            : issue.path,
        }))
      : [];
    if (change.kind === "catalogue" || (change.kind === "section" && change.section === "collections")) {
      mediaIssues.push(...await validateCollectionMediaAssets(parsed.data));
    }
    if (change.kind === "section" && change.section === "homepage") {
      mediaIssues.push(...await validateHomepageHeroMediaAssets(parsed.data), ...await validateHomepageMerchandisingMediaAssets(parsed.data));
    }
    if (mediaIssues.length) return { kind: "invalid" as const, error: "Storefront media did not pass draft checks", issues: mediaIssues };
    if (selectedProducts.length) {
      try {
        const commerceIssues = await validateCurrentCommerceMappings(selected.products, false);
        if (commerceIssues.length) return { kind: "invalid" as const, error: "JusticeSure mappings did not pass live draft checks", issues: commerceIssues };
      } catch {
        return { kind: "unavailable" as const };
      }
    }
    const now = new Date(Math.max(Date.now(), expected.getTime() + 1));
    const [updated] = await tx.update(siteContentTable).set({
      draft: parsed.data, draftUpdatedAt: now, updatedByClerkUserId: req.staff!.clerkUserId,
    }).where(and(eq(siteContentTable.key, "platform"), eq(siteContentTable.draftUpdatedAt, expected))).returning();
    if (!updated) return { kind: "conflict" as const };
    const hash = platformContentHash(parsed.data);
    const [revision] = await tx.insert(siteContentRevisionsTable).values({
      contentKey: "platform", event: "draft_saved", snapshot: parsed.data,
      contentHash: hash, createdByClerkUserId: req.staff!.clerkUserId,
    }).returning({ id: siteContentRevisionsTable.id });
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId, action: "platform_content.draft_saved",
      entityType: "site_content", entityId: "platform",
      metadata: {
        contentHash: hash, revisionId: revision!.id,
        scope: change.kind === "section" ? change.section : change.kind === "catalogue" ? "catalogue" : "product",
        ...(change.kind === "product" || change.kind === "delete_product" ? { slug: change.slug } : {}),
        confirmedCommerceMappings: parsed.data.products.filter((product) => product.commerceMappingConfirmation)
          .map((product) => ({
            slug: product.slug, productHash: product.commerceMappingConfirmation!.productHash,
            confirmedAt: product.commerceMappingConfirmation!.confirmedAt,
            confidence: product.commerceMappingConfirmation!.confidence,
          })),
      },
    });
    await queueCollectionCoverCleanup(tx, replacedCollectionCoverUploadPaths(currentRow.draft, parsed.data), req.staff!.clerkUserId);
    return { kind: "saved" as const, row: updated };
  });
  if (result.kind === "conflict") { res.status(409).json({ error: "Platform content changed while you were editing. Reload before saving." }); return; }
  if (result.kind === "invalid") { res.status(400).json({ error: result.error, issues: result.issues }); return; }
  if (result.kind === "unavailable") { res.status(503).json({ error: "JusticeSure catalogue could not be revalidated. The draft was not saved." }); return; }
  acknowledgeCommittedPlatformDraft(res, result.row);
}

router.patch("/staff/content/platform/sections/:section", platformRoles, async (req, res): Promise<void> => {
  const section = editableSection.safeParse(req.params.section);
  if (!section.success || !req.body || !Object.prototype.hasOwnProperty.call(req.body, "value")) {
    res.status(400).json({ error: "Provide an editable section and its value." }); return;
  }
  await saveScopedDraft(req, res, { kind: "section", section: section.data, value: req.body.value });
});

router.put("/staff/content/platform/products/:slug/draft", platformRoles, async (req, res): Promise<void> => {
  const slug = catalogueSlug.safeParse(req.params.slug);
  if (!slug.success || !req.body || !Object.prototype.hasOwnProperty.call(req.body, "product")) {
    res.status(400).json({ error: "Provide a valid product slug and product." }); return;
  }
  await saveScopedDraft(req, res, { kind: "product", slug: slug.data, value: req.body.product });
});

router.delete("/staff/content/platform/products/:slug/draft", platformRoles, async (req, res): Promise<void> => {
  const slug = catalogueSlug.safeParse(req.params.slug);
  if (!slug.success) { res.status(400).json({ error: "Provide a valid product slug." }); return; }
  await saveScopedDraft(req, res, { kind: "delete_product", slug: slug.data });
});

router.patch("/staff/content/platform/catalogue/draft", platformRoles, async (req, res): Promise<void> => {
  const parsed = z.object({
    expectedDraftUpdatedAt: z.string(),
    collections: z.array(z.unknown()).min(1).max(1000),
    upserts: z.array(z.object({ slug: catalogueSlug, product: z.unknown() }).strict()).max(1000),
    deletions: z.array(catalogueSlug).max(1000),
  }).strict().safeParse(req.body);
  if (!parsed.success || (!parsed.data.upserts.length && !parsed.data.deletions.length)
      || parsed.data.upserts.some((item) => !Object.prototype.hasOwnProperty.call(item, "product"))) {
    res.status(400).json({ error: "Provide collections and changed products for a coupled catalogue save." }); return;
  }
  await saveScopedDraft(req, res, {
    kind: "catalogue", collections: parsed.data.collections,
    upserts: parsed.data.upserts.map((item) => ({ slug: item.slug, product: item.product })),
    deletions: parsed.data.deletions,
  });
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
  } catch (error) {
    commerceUnavailable(res, error, "draft_catalogue_check", "JusticeSure catalogue could not be revalidated. The draft was not saved.");
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
  acknowledgeCommittedPlatformDraft(res, result.row);
});

router.post("/staff/content/platform/catalogue/publish-confirmed", platformRoles, async (req, res): Promise<void> => {
  const body = z.object({
    slugs: z.array(catalogueSlug).min(1).max(1000),
    expectedDraftUpdatedAt: z.string().datetime(),
    expectedPublishedAt: z.string().datetime(),
  }).strict().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Provide product slugs and the current draft and published timestamps." });
    return;
  }
  if (new Set(body.data.slugs).size !== body.data.slugs.length) {
    res.status(400).json({ error: "Duplicate product slugs are not allowed." });
    return;
  }
  const expectedDraft = new Date(body.data.expectedDraftUpdatedAt);
  const expectedPublished = new Date(body.data.expectedPublishedAt);
  await ensurePlatformContent();

  const validateSavedSnapshot = async (
    draftValue: unknown,
    publishedValue: unknown,
    ledgerValue: unknown,
  ): Promise<{ candidate: PlatformContent; issues: unknown[]; prunedReferences: string[] } | { error: string; issues: unknown[] } | { unavailable: true }> => {
    const draft = PlatformContentSchema.safeParse(draftValue);
    const published = PlatformContentSchema.safeParse(publishedValue);
    if (!draft.success) return { error: "The saved draft or published catalogue is invalid.", issues: draft.error.issues };
    if (!published.success) return { error: "The saved draft or published catalogue is invalid.", issues: published.error.issues };
    const confirmed = confirmedNonAccessoryProducts(draft.data);
    const expectedSlugs = confirmed.map((product) => product.slug).sort();
    const suppliedSlugs = [...body.data.slugs].sort();
    if (expectedSlugs.length !== suppliedSlugs.length || expectedSlugs.some((slug, index) => slug !== suppliedSlugs[index])) {
      return {
        error: "Select every saved confirmed non-accessory product exactly once; no other products can be included.",
        issues: [`Expected ${expectedSlugs.length} confirmed non-accessory products.`, ...expectedSlugs.map((slug) => `Required product: ${slug}`)],
      };
    }
    const selected = confirmed;
    const { candidate: candidateBase, prunedReferences } = buildConfirmedCatalogueCandidate(published.data, selected);
    const references = [...new Set(published.data.products
      .filter((product) => !expectedSlugs.includes(product.slug))
      .flatMap((product) => platformProductReferences(candidateBase, product.slug)
        .map((path) => `${path} references omitted product ${product.slug}`)))];
    if (references.length) {
      return { error: "Update public product references before releasing this exact catalogue.", issues: references };
    }
    const candidateResult = PlatformContentSchema.safeParse(candidateBase);
    if (!candidateResult.success) {
      return { error: "Published editorial content needs updates before the exact catalogue can be released.", issues: candidateResult.error.issues };
    }
    const candidate = candidateResult.data;
    const selectedContent = { ...draft.data, products: selected };
    const approvals = validBusinessApprovalSlugs(draft.data, ledgerValue);
    const issues = [
      ...selected.filter((product) => !approvals.has(product.slug))
        .map((product) => `${product.slug}: explicit business approval is required for this exact product snapshot.`),
      ...unfinishedProductImages(selectedContent),
      ...await validateProductMediaAssets(selectedContent),
      ...validateLegacyProductPublication(selectedContent, undefined, approvals),
      ...validateAccessoryProductPublication(candidate),
      ...validateHomepageProductBindings(candidate),
      ...await validateHomepageHeroMediaAssets(candidate),
      ...await validateHomepageMerchandisingMediaAssets(candidate),
      ...await validateProductMediaAssets(candidate),
      ...await validateCollectionMediaAssets(candidate),
    ];
    if (issues.length) return { error: "Confirmed products did not pass catalogue publication checks.", issues };
    try {
      const commerceIssues = await validateCurrentCommerceMappings(selected, true);
      if (commerceIssues.length) {
        return { error: "JusticeSure mappings did not pass fresh publication checks.", issues: commerceIssues };
      }
    } catch {
      return { unavailable: true };
    }
    return { candidate, issues: [], prunedReferences };
  };

  const [preflightRow] = await db.select().from(siteContentTable).where(and(
    eq(siteContentTable.key, "platform"),
    eq(siteContentTable.draftUpdatedAt, expectedDraft),
    eq(siteContentTable.publishedAt, expectedPublished),
  )).limit(1);
  if (!preflightRow) {
    res.status(409).json({ error: "Platform content changed before it could be published." });
    return;
  }
  const [preflightLedger] = await db.select({ draft: siteContentTable.draft }).from(siteContentTable)
    .where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY)).limit(1);
  const preflight = await validateSavedSnapshot(preflightRow.draft, preflightRow.published, preflightLedger?.draft);
  if ("unavailable" in preflight) {
    commerceUnavailable(res, new Error("JusticeSure catalogue unavailable"), "publication_catalogue_read", "JusticeSure catalogue could not be revalidated. Nothing was published.");
    return;
  }
  if ("error" in preflight) {
    res.status(400).json({ error: preflight.error, issues: preflight.issues });
    return;
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
    const [row] = await tx.select().from(siteContentTable).where(and(
      eq(siteContentTable.key, "platform"),
      eq(siteContentTable.draftUpdatedAt, expectedDraft),
      eq(siteContentTable.publishedAt, expectedPublished),
    )).limit(1);
    if (!row) return { kind: "conflict" as const };
    const [ledgerRow] = await tx.select({ draft: siteContentTable.draft }).from(siteContentTable)
      .where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY)).limit(1);
    const checked = await validateSavedSnapshot(row.draft, row.published, ledgerRow?.draft);
    if ("unavailable" in checked) return { kind: "unavailable" as const };
    if ("error" in checked) return { kind: "invalid" as const, error: checked.error, issues: checked.issues };
    const now = new Date();
    const [updated] = await tx.update(siteContentTable).set({
      published: checked.candidate,
      publishedAt: now,
      publishedByClerkUserId: req.staff!.clerkUserId,
    }).where(and(
      eq(siteContentTable.key, "platform"),
      eq(siteContentTable.draftUpdatedAt, expectedDraft),
      eq(siteContentTable.publishedAt, expectedPublished),
    )).returning();
    if (!updated) return { kind: "conflict" as const };
    const hash = platformContentHash(checked.candidate);
    const [revision] = await tx.insert(siteContentRevisionsTable).values({
      contentKey: "platform", event: "published_confirmed_catalogue",
      snapshot: checked.candidate, contentHash: hash,
      createdByClerkUserId: req.staff!.clerkUserId,
    }).returning({ id: siteContentRevisionsTable.id });
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId,
      action: "platform_content.confirmed_catalogue_published",
      entityType: "site_content",
      entityId: "platform",
      metadata: {
        slugs: checked.candidate.products.map((product) => product.slug),
        contentHash: hash,
        revisionId: revision!.id,
        publishedAt: now.toISOString(),
        prunedReferences: checked.prunedReferences,
      },
    });
    return { kind: "published" as const, row: updated, prunedReferences: checked.prunedReferences };
  });
  if (result.kind === "conflict") {
    res.status(409).json({ error: "The saved draft, published catalogue, or approval snapshot changed before publication." });
  } else if (result.kind === "invalid") {
    res.status(400).json({ error: result.error, issues: result.issues });
  } else if (result.kind === "unavailable") {
    res.status(503).json({ error: "JusticeSure catalogue could not be revalidated. Nothing was published." });
  } else {
    const publicationNote = result.prunedReferences.length
      ? `Published the exact confirmed catalogue with these published mega-menu adjustments: ${result.prunedReferences.join("; ")}.`
      : "Published the exact confirmed catalogue without pruning published mega-menu references.";
    res.json({ ...result.row, publicationNote });
  }
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
  const unfinishedImages = unfinishedProductImages(candidateContent.data);
  if (unfinishedImages.length > 0) {
    res.status(400).json({ error: "Finish product images before publishing", issues: unfinishedImages });
    return;
  }
  const [preflightApprovalRow] = await db.select({ draft: siteContentTable.draft }).from(siteContentTable)
    .where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY)).limit(1);
  const preflightApprovals = validBusinessApprovalSlugs(candidateContent.data, preflightApprovalRow?.draft);
  const legacyProductIssues = validateLegacyProductPublication(candidateContent.data, undefined, preflightApprovals);
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
    ...validateHomepageProductBindings(candidateContent.data),
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
  } catch (error) {
    commerceUnavailable(res, error, "publication_catalogue_read", "JusticeSure catalogue could not be revalidated. Nothing was published.");
    return;
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
    const [current] = await tx.select().from(siteContentTable)
      .where(and(eq(siteContentTable.key, "platform"), eq(siteContentTable.draftUpdatedAt, expected))).limit(1);
    if (!current) return { kind: "conflict" as const };
    const parsed = PlatformContentSchema.safeParse(current.draft);
    if (!parsed.success) return { kind: "invalid" as const, issues: parsed.error.issues };
    const [approvalRow] = await tx.select({ draft: siteContentTable.draft }).from(siteContentTable)
      .where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY)).limit(1);
    const approvals = validBusinessApprovalSlugs(parsed.data, approvalRow?.draft);
    const lockedUnfinished = unfinishedProductImages(parsed.data);
    const lockedMedia = [
      ...validateHomepageProductBindings(parsed.data),
      ...await validateHomepageHeroMediaAssets(parsed.data),
      ...await validateHomepageMerchandisingMediaAssets(parsed.data),
      ...await validateProductMediaAssets(parsed.data),
      ...await validateCollectionMediaAssets(parsed.data),
    ];
    if (lockedUnfinished.length || lockedMedia.length) {
      return { kind: "locked_media_invalid" as const, issues: [...lockedUnfinished, ...lockedMedia] };
    }
    let lockedCommerceIssues: string[];
    try {
      lockedCommerceIssues = await validateCurrentCommerceMappings(parsed.data.products, true);
    } catch {
      return { kind: "commerce_unavailable" as const };
    }
    if (lockedCommerceIssues.length) {
      return { kind: "commerce_invalid" as const, issues: lockedCommerceIssues };
    }
    const legacyProductIssues = validateLegacyProductPublication(parsed.data, undefined, approvals);
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
  if (result.kind === "locked_media_invalid") {
    res.status(400).json({ error: "Storefront media changed before publication.", issues: result.issues });
    return;
  }
  if (result.kind === "commerce_invalid") {
    res.status(400).json({ error: "JusticeSure mappings did not pass locked publication checks.", issues: result.issues });
    return;
  }
  if (result.kind === "commerce_unavailable") {
    res.status(503).json({ error: "JusticeSure catalogue could not be revalidated. Nothing was published." });
    return;
  }
  res.json(result.row);
});

router.post("/staff/content/platform/homepage/publish", platformRoles, async (req, res): Promise<void> => {
  const body = z.object({
    expectedDraftUpdatedAt: z.string().datetime(),
    expectedPublishedAt: z.string().datetime().nullable(),
  }).strict().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: "Provide the current draft timestamp and published timestamp (or null when nothing has been published).",
      issues: body.error.issues,
    });
    return;
  }
  await ensurePlatformContent();
  const expectedDraft = new Date(body.data.expectedDraftUpdatedAt);
  const expectedPublished = body.data.expectedPublishedAt === null ? null : new Date(body.data.expectedPublishedAt);
  const publishedGuard = expectedPublished
    ? eq(siteContentTable.publishedAt, expectedPublished)
    : isNull(siteContentTable.publishedAt);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
    const [current] = await tx.select().from(siteContentTable).where(and(
      eq(siteContentTable.key, "platform"),
      eq(siteContentTable.draftUpdatedAt, expectedDraft),
      publishedGuard,
    )).limit(1);
    if (!current) return { kind: "conflict" as const };
    const draft = PlatformContentSchema.safeParse(current.draft);
    const published = PlatformContentSchema.safeParse(current.published);
    if (!draft.success || !published.success) {
      return {
        kind: "invalid" as const,
        issues: !draft.success ? draft.error.issues : !published.success ? published.error.issues : [],
      };
    }
    const candidate = buildHomepagePublicationCandidate(published.data, draft.data);
    const parsed = PlatformContentSchema.safeParse(candidate);
    if (!parsed.success) return { kind: "invalid" as const, issues: parsed.error.issues };
    const bindingIssues = validateHomepageProductBindings(parsed.data, { requireCoreBindings: true });
    if (bindingIssues.length) return { kind: "bindings_invalid" as const, issues: bindingIssues };
    const mediaIssues = [
      ...await validateHomepageHeroMediaAssets(parsed.data),
      ...await validateHomepageMerchandisingMediaAssets(parsed.data),
    ];
    if (mediaIssues.length) return { kind: "media_invalid" as const, issues: mediaIssues };

    const now = new Date(Math.max(Date.now(), (expectedPublished?.getTime() ?? 0) + 1));
    const hash = platformContentHash(parsed.data);
    const [updated] = await tx.update(siteContentTable).set({
      published: parsed.data,
      publishedAt: now,
      publishedByClerkUserId: req.staff!.clerkUserId,
    }).where(and(
      eq(siteContentTable.key, "platform"),
      eq(siteContentTable.draftUpdatedAt, expectedDraft),
      publishedGuard,
    )).returning();
    if (!updated) return { kind: "conflict" as const };
    const [revision] = await tx.insert(siteContentRevisionsTable).values({
      contentKey: "platform",
      event: "published",
      snapshot: parsed.data,
      contentHash: hash,
      createdByClerkUserId: req.staff!.clerkUserId,
    }).returning({ id: siteContentRevisionsTable.id });
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId,
      action: "platform_content.homepage_published",
      entityType: "site_content",
      entityId: "platform",
      metadata: {
        scope: "homepage",
        contentHash: hash,
        revisionId: revision!.id,
        publishedAt: now.toISOString(),
      },
    });
    return { kind: "published" as const, row: updated };
  });
  if (result.kind === "conflict") {
    res.status(409).json({ error: "The saved draft or published platform content changed before homepage publishing." });
    return;
  }
  if (result.kind === "invalid") {
    res.status(400).json({ error: "The homepage publication candidate is invalid.", issues: result.issues });
    return;
  }
  if (result.kind === "bindings_invalid") {
    res.status(400).json({ error: "Homepage product bindings did not pass published-catalogue checks.", issues: result.issues });
    return;
  }
  if (result.kind === "media_invalid") {
    res.status(400).json({ error: "Homepage media did not pass locked publication checks.", issues: result.issues });
    return;
  }
  res.json(result.row);
});

router.post("/staff/content/platform/products/:slug/publish", platformRoles, async (req, res): Promise<void> => {
  const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160).safeParse(req.params.slug);
  const expectedDraft = expectedDraftDate(req.body?.expectedDraftUpdatedAt);
  const expectedPublished = expectedDraftDate(req.body?.expectedPublishedAt);
  if (!slug.success || !expectedDraft || !expectedPublished) {
    res.status(400).json({ error: "Provide a product slug and the current draft and published timestamps." });
    return;
  }
  await ensurePlatformContent();
  const [preflight] = await db.select().from(siteContentTable).where(and(
    eq(siteContentTable.key, "platform"),
    eq(siteContentTable.draftUpdatedAt, expectedDraft),
    eq(siteContentTable.publishedAt, expectedPublished),
  )).limit(1);
  if (!preflight) {
    res.status(409).json({ error: "The saved draft or published catalogue changed. Reload before publishing this product." });
    return;
  }
  const preflightDraft = PlatformContentSchema.safeParse(preflight.draft);
  if (!preflightDraft.success) {
    res.status(400).json({ error: "The saved draft is invalid.", issues: preflightDraft.error.issues });
    return;
  }
  const preflightProduct = preflightDraft.data.products.find((item) => item.slug === slug.data);
  if (preflightProduct) {
    const [approvalRow] = await db.select({ draft: siteContentTable.draft }).from(siteContentTable)
      .where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY)).limit(1);
    const approvals = validBusinessApprovalSlugs(preflightDraft.data, approvalRow?.draft);
    const legacyIssues = validateLegacyProductPublication(
      { ...preflightDraft.data, products: [preflightProduct] },
      undefined,
      approvals,
    );
    if (legacyIssues.length) {
      res.status(400).json({ error: "Legacy product approval is required.", issues: legacyIssues });
      return;
    }
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
    const [row] = await tx.select().from(siteContentTable).where(and(
      eq(siteContentTable.key, "platform"),
      eq(siteContentTable.draftUpdatedAt, expectedDraft),
      eq(siteContentTable.publishedAt, expectedPublished),
    )).limit(1);
    if (!row) return { kind: "conflict" as const };
    const draft = PlatformContentSchema.safeParse(row.draft);
    const published = PlatformContentSchema.safeParse(row.published);
    if (!draft.success || !published.success) {
      return { kind: "invalid" as const, error: "The saved draft or published catalogue is invalid. Use the full publication workflow.", issues: !draft.success ? draft.error.issues : !published.success ? published.error.issues : [] };
    }
    const product = draft.data.products.find((item) => item.slug === slug.data);
    if (!product) return { kind: "invalid" as const, error: "The product is not in the saved draft.", issues: [] };
    const previous = published.data.products.find((item) => item.slug === slug.data);
    if (product.releaseState !== "placeholder" || product.fulfilmentState !== "unavailable" ||
        product.commerceProductId || product.commerceVariantIds || product.commerceMappingConfirmation ||
        (previous && previous.fulfilmentState !== "unavailable")) {
      return { kind: "invalid" as const, error: "Product-only publishing is for browse-only, unavailable products without a JusticeSure mapping. Available products require full catalogue publication and verified checkout mappings.", issues: [] };
    }
    const products = previous
      ? published.data.products.map((item) => item.slug === slug.data ? product : item)
      : [product, ...published.data.products];
    const candidate = PlatformContentSchema.safeParse({ ...published.data, products });
    if (!candidate.success) {
      return { kind: "invalid" as const, error: "This product cannot be published without updating referenced catalogue content.", issues: candidate.error.issues };
    }
    const homepageBindingIssues = validateHomepageProductBindings(candidate.data);
    if (homepageBindingIssues.length) {
      return { kind: "invalid" as const, error: "Published homepage product bindings do not match the candidate catalogue.", issues: homepageBindingIssues };
    }
    const selectedContent = { ...candidate.data, products: [product] };
    const unfinished = unfinishedProductImages(selectedContent);
    if (unfinished.length) {
      return { kind: "invalid" as const, error: "Finish this product’s images before publishing it.", issues: unfinished };
    }
    const [approvalRow] = await tx.select({ draft: siteContentTable.draft }).from(siteContentTable)
      .where(eq(siteContentTable.key, CATALOGUE_BUSINESS_APPROVALS_KEY)).limit(1);
    const approvals = validBusinessApprovalSlugs(draft.data, approvalRow?.draft);
    const legacyIssues = validateLegacyProductPublication(selectedContent, undefined, approvals);
    if (legacyIssues.length) return { kind: "invalid" as const, error: "Legacy product approval is required.", issues: legacyIssues };
    const accessoryIssues = validateAccessoryProductPublication(selectedContent);
    if (accessoryIssues.length) return { kind: "invalid" as const, error: "Accessory publication checks failed.", issues: accessoryIssues };
    const mediaIssues = await validateProductMediaAssets(selectedContent);
    if (mediaIssues.length) return { kind: "invalid" as const, error: "This product’s media did not pass publication checks.", issues: mediaIssues };
    const now = new Date();
    const [updated] = await tx.update(siteContentTable).set({
      published: candidate.data, publishedAt: now, publishedByClerkUserId: req.staff!.clerkUserId,
    }).where(and(
      eq(siteContentTable.key, "platform"),
      eq(siteContentTable.draftUpdatedAt, expectedDraft),
      eq(siteContentTable.publishedAt, expectedPublished),
    )).returning();
    if (!updated) return { kind: "conflict" as const };
    const hash = platformContentHash(candidate.data);
    const [revision] = await tx.insert(siteContentRevisionsTable).values({
      contentKey: "platform", event: "published_product", snapshot: candidate.data,
      contentHash: hash, createdByClerkUserId: req.staff!.clerkUserId,
    }).returning({ id: siteContentRevisionsTable.id });
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId, action: "platform_content.product_published",
      entityType: "site_content", entityId: "platform",
      metadata: { slug: slug.data, contentHash: hash, revisionId: revision!.id, publishedAt: now.toISOString() },
    });
    return { kind: "published" as const, row: updated };
  });
  if (result.kind === "conflict") {
    res.status(409).json({ error: "The saved draft or published catalogue changed. Reload before publishing this product." });
  } else if (result.kind === "invalid") {
    res.status(400).json({ error: result.error, issues: result.issues });
  } else {
    res.json(result.row);
  }
});

router.post("/staff/content/platform/products/:slug/unpublish", platformRoles, async (req, res): Promise<void> => {
  const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160).safeParse(req.params.slug);
  const expectedDraft = expectedDraftDate(req.body?.expectedDraftUpdatedAt);
  const expectedPublished = expectedDraftDate(req.body?.expectedPublishedAt);
  if (!slug.success || !expectedDraft || !expectedPublished) {
    res.status(400).json({ error: "Provide a product slug and the current draft and published timestamps." });
    return;
  }
  await ensurePlatformContent();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
    const [row] = await tx.select().from(siteContentTable).where(and(
      eq(siteContentTable.key, "platform"),
      eq(siteContentTable.draftUpdatedAt, expectedDraft),
      eq(siteContentTable.publishedAt, expectedPublished),
    )).limit(1);
    if (!row) return { kind: "conflict" as const };
    const draft = PlatformContentSchema.safeParse(row.draft);
    const published = PlatformContentSchema.safeParse(row.published);
    if (!draft.success || !published.success) {
      return { kind: "invalid" as const, error: "The saved draft or published catalogue is invalid. Use the full publication workflow.", issues: !draft.success ? draft.error.issues : !published.success ? published.error.issues : [] };
    }
    if (draft.data.products.some((product) => product.slug === slug.data)) {
      return { kind: "invalid" as const, error: "Remove this product from the draft and save it before publishing its removal.", issues: [] };
    }
    const product = published.data.products.find((item) => item.slug === slug.data);
    if (!product) return { kind: "invalid" as const, error: "This product is not currently published.", issues: [] };
    if (product.fulfilmentState !== "unavailable" ||
        product.commerceProductId || product.commerceVariantIds || product.commerceMappingConfirmation) {
      return { kind: "invalid" as const, error: "Only unavailable products without JusticeSure mappings can be removed independently. Available or mapped products require full catalogue publication.", issues: [] };
    }
    const references = platformProductReferences(published.data, slug.data);
    if (references.length) {
      return { kind: "invalid" as const, error: "Remove public storefront references before unpublishing this product.", issues: references.map((path) => `${path} links to ${slug.data}`) };
    }
    const journal = await tx.select({
      slug: journalPostsTable.slug, body: journalPostsTable.body,
      relatedProductSlugs: journalPostsTable.relatedProductSlugs,
    }).from(journalPostsTable).where(eq(journalPostsTable.status, "published"));
    const journalReferences = journal.filter((post) =>
      post.relatedProductSlugs?.includes(slug.data) || journalBodyProductSlugs(post.body).includes(slug.data))
      .map((post) => `Journal “${post.slug}” links to ${slug.data}.`);
    if (journalReferences.length) {
      return { kind: "invalid" as const, error: "Remove published Journal references before unpublishing this product.", issues: journalReferences };
    }
    const candidate = PlatformContentSchema.safeParse({
      ...published.data,
      products: published.data.products.filter((item) => item.slug !== slug.data),
    });
    if (!candidate.success) {
      return { kind: "invalid" as const, error: "The public catalogue needs other changes before this product can be removed.", issues: candidate.error.issues };
    }
    const now = new Date();
    const [updated] = await tx.update(siteContentTable).set({
      published: candidate.data, publishedAt: now, publishedByClerkUserId: req.staff!.clerkUserId,
    }).where(and(
      eq(siteContentTable.key, "platform"),
      eq(siteContentTable.draftUpdatedAt, expectedDraft),
      eq(siteContentTable.publishedAt, expectedPublished),
    )).returning();
    if (!updated) return { kind: "conflict" as const };
    const hash = platformContentHash(candidate.data);
    const [revision] = await tx.insert(siteContentRevisionsTable).values({
      contentKey: "platform", event: "unpublished_product", snapshot: candidate.data,
      contentHash: hash, createdByClerkUserId: req.staff!.clerkUserId,
    }).returning({ id: siteContentRevisionsTable.id });
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId, action: "platform_content.product_unpublished",
      entityType: "site_content", entityId: "platform",
      metadata: { slug: slug.data, contentHash: hash, revisionId: revision!.id, publishedAt: now.toISOString() },
    });
    return { kind: "unpublished" as const, row: updated };
  });
  if (result.kind === "conflict") {
    res.status(409).json({ error: "The saved draft or published catalogue changed. Reload before unpublishing this product." });
  } else if (result.kind === "invalid") {
    res.status(400).json({ error: result.error, issues: result.issues });
  } else {
    res.json(result.row);
  }
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

function journalBodyProductSlugs(body: string): string[] {
  return [...body.matchAll(/\[[^\]\n]+\]\(\/product\/([a-z0-9]+(?:-[a-z0-9]+)*)\)/g)]
    .map((match) => match[1]!);
}

async function validatePublishedJournalProducts(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  body: string,
  relatedProductSlugs: string[] | null | undefined,
  status: string,
): Promise<string | null> {
  if (status !== "published") return null;
  const slugs = [...new Set([...(relatedProductSlugs ?? []), ...journalBodyProductSlugs(body)])];
  if (!slugs.length) return null;
  const [platform] = await tx.select({ published: siteContentTable.published })
    .from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
  const published = PlatformContentSchema.safeParse(platform?.published);
  if (!published.success) return "The published catalogue is unavailable. Product links cannot be checked.";
  const available = new Set(published.data.products.map((product) => product.slug));
  const missing = slugs.filter((slug) => !available.has(slug));
  return missing.length ? `Published Journal posts can only link to published products. Remove these missing product links: ${missing.join(", ")}.` : null;
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
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
      const relationError = await validateRelatedArticles(
        tx,
        parsed.data.slug,
        parsed.data.relatedArticleSlugs,
        parsed.data.status,
      );
      if (relationError) return { kind: "relation_error" as const, message: relationError };
      const productError = await validatePublishedJournalProducts(
        tx, parsed.data.body, parsed.data.relatedProductSlugs, parsed.data.status,
      );
      if (productError) return { kind: "relation_error" as const, message: productError };
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
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLATFORM_CONTENT_MEDIA_LOCK}))`);
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
      const productError = await validatePublishedJournalProducts(
        tx,
        parsed.data.body ?? current.body,
        parsed.data.relatedProductSlugs === undefined ? current.relatedProductSlugs : parsed.data.relatedProductSlugs,
        nextStatus,
      );
      if (productError) return { kind: "relation_error" as const, message: productError };
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
