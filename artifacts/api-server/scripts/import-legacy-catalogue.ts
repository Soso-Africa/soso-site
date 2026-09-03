import { createHash } from "node:crypto";
import {
  auditLogsTable,
  db,
  siteContentRevisionsTable,
  siteContentTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  PlatformContentSchema,
  platformContentHash,
  type PlatformContent,
} from "../src/lib/platform-content";
import { inspectProductMedia, validateProductMediaAssets } from "../src/lib/product-media-validation";
import {
  legacyStorage,
  mapWithConcurrency,
  uploadLegacyImage,
  type MediaInspection,
} from "./legacy-catalogue-media";
import {
  decodeHtml,
  fetchLegacyProducts,
  includesTerm,
  legacyTerms,
  productColours,
  productFabric,
  productPlacement,
  productPrice,
  productSizes,
  safeSlug,
  sourceImages,
  SOURCE_SITE,
} from "./legacy-catalogue-source";

const IMPORT_UNAVAILABLE_MESSAGE = "This piece is awaiting SOSO review before online purchase.";
const IMPORT_DISPATCH_MESSAGE = "Dispatch timing requires Staff confirmation.";

function ensureReviewCollections(content: PlatformContent): void {
  const additions: PlatformContent["collections"] = [
    {
      slug: "men-ready-to-wear",
      label: "Men's Ready-to-Wear",
      category: "Men's Ready-to-Wear",
      department: "men",
      h1: "Men's Ready-to-Wear",
      intro: "Current SOSO menswear awaiting final catalogue classification and purchase approval.",
      seo: {
        title: "Men's Ready-to-Wear | SOSO Africa",
        description: "Explore current SOSO Africa menswear prepared for Staff review.",
      },
    },
    {
      slug: "accessories",
      label: "Accessories",
      category: "Accessories",
      department: "accessories",
      h1: "Accessories",
      intro: "SOSO finishing pieces awaiting final catalogue and purchase approval.",
      seo: {
        title: "Accessories | SOSO Africa",
        description: "Explore SOSO Africa accessories prepared for Staff review.",
      },
    },
  ];
  const existing = new Set(content.collections.map((collection) => collection.slug));
  content.collections.push(...additions.filter((collection) => !existing.has(collection.slug)));
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const products = await fetchLegacyProducts();
  if (products.length !== 143) {
    throw new Error(`Expected the approved 143 public products, but the source currently returns ${products.length}`);
  }

  const [row] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
  if (!row) throw new Error("Platform content is unavailable");
  if (!row.updatedByClerkUserId) throw new Error("The Staff draft needs an existing Staff editor before import");
  const originalDraftUpdatedAt = row.draftUpdatedAt;
  const content = PlatformContentSchema.parse(structuredClone(row.draft));
  ensureReviewCollections(content);

  const sourceAssets = products.flatMap((product) =>
    sourceImages(product).map((image, imageIndex) => ({ product, image, imageIndex })),
  );
  console.log(`Preparing ${products.length} products and ${sourceAssets.length} governed images`);

  const mediaCache = new Map<string, MediaInspection>();
  const uploadedAssets = dryRun
    ? sourceAssets.map(({ product, image, imageIndex }) => {
        const typeFromUrl = image.src.match(/\.(png|webp|gif)(?:[?#]|$)/i)?.[1]?.toLowerCase() ?? "jpg";
        const digest = createHash("sha256").update(image.src).digest("hex").slice(0, 12);
        return {
          objectPath: `/api/storage/objects/uploads/legacy-catalogue/${product.id}/${imageIndex + 1}-${digest}.${typeFromUrl}`,
          inspection: null,
        };
      })
    : await (async () => {
        await legacyStorage.createMediaUpload("legacy-import-prerequisite.jpg", "image/jpeg");
        let completed = 0;
        return mapWithConcurrency(sourceAssets, 5, async ({ product, image, imageIndex }) => {
          const result = await uploadLegacyImage(product, image, imageIndex);
          completed += 1;
          if (completed % 20 === 0 || completed === sourceAssets.length) {
            console.log(`Verified ${completed}/${sourceAssets.length} images`);
          }
          return result;
        });
      })();

  const pathsByProduct = new Map<number, string[]>();
  uploadedAssets.forEach((asset, index) => {
    const productId = sourceAssets[index]!.product.id;
    const paths = pathsByProduct.get(productId) ?? [];
    paths.push(asset.objectPath);
    pathsByProduct.set(productId, paths);
    if (asset.inspection) mediaCache.set(asset.objectPath, asset.inspection);
  });

  const imported = products.map((product, productIndex): PlatformContent["products"][number] => {
    const sourceProductImages = sourceImages(product);
    const managedPaths = pathsByProduct.get(product.id);
    if (!managedPaths || managedPaths.length !== sourceProductImages.length) {
      throw new Error(`Managed image count does not match for ${product.slug}`);
    }
    const placement = productPlacement(product);
    const colourOptions = productColours(product);
    const description = decodeHtml(product.description || product.short_description || "")
      || `${decodeHtml(product.name)} from the current SOSO catalogue.`;
    const terms = [...new Set([decodeHtml(product.name), ...legacyTerms(product), placement.category])];
    return {
      slug: safeSlug(product.slug),
      name: decodeHtml(product.name),
      img: managedPaths[0]!,
      images: managedPaths.map((src, imageIndex) => ({
        src,
        alt: decodeHtml(sourceProductImages[imageIndex]?.alt ?? "")
          || `${decodeHtml(product.name)} — product image ${imageIndex + 1}`,
        provenance: {
          source: "SOSO legacy WooCommerce catalogue",
          rights: "SOSO merchant-owned catalogue asset; pending Staff approval",
          sourceUrl: sourceProductImages[imageIndex]!.src,
        },
      })),
      materialTurnSets: [],
      price: productPrice(product),
      tag: placement.category,
      note: "Imported from the current shopsoso.co catalogue for Staff review.",
      category: placement.category,
      department: placement.department,
      description,
      sizes: productSizes(product),
      colour: colourOptions[0]!.label,
      colourOptions,
      allowCustomColour: false,
      fabric: productFabric(product),
      fit: "To be confirmed",
      searchableTerms: terms,
      merchandising: {
        isNew: includesTerm(legacyTerms(product), "ss26/27"),
        sortPriority: 50_000 - productIndex,
      },
      standardEligible: false,
      customEligible: false,
      standardSizes: [],
      readyNowSizes: [],
      fulfilmentState: "unavailable",
      dispatchMessage: IMPORT_DISPATCH_MESSAGE,
      unavailableMessage: IMPORT_UNAVAILABLE_MESSAGE,
      featured: false,
    };
  });

  const importedBySlug = new Map(imported.map((product) => [product.slug, product]));
  const importedByName = new Map(imported.map((product) => [product.name.toLocaleLowerCase(), product]));
  let refreshed = 0;
  const preserved = content.products.map((existing) => {
    const current = importedBySlug.get(existing.slug)
      ?? importedByName.get(existing.name.toLocaleLowerCase());
    if (!current) return existing;
    refreshed += 1;
    importedBySlug.delete(current.slug);
    importedByName.delete(current.name.toLocaleLowerCase());
    return {
      ...existing,
      img: current.img,
      images: current.images,
      searchableTerms: [...new Set([...existing.searchableTerms, ...current.searchableTerms])],
    };
  });
  const added = [...importedBySlug.values()];
  content.products = [...preserved, ...added];

  const parsed = PlatformContentSchema.safeParse(content);
  if (!parsed.success) {
    console.error(JSON.stringify(parsed.error.issues.slice(0, 30), null, 2));
    throw new Error(`Imported draft failed schema validation with ${parsed.error.issues.length} issues`);
  }

  if (!dryRun) {
    const mediaIssues = await validateProductMediaAssets(
      parsed.data,
      async (path) => mediaCache.get(path) ?? inspectProductMedia(path),
    );
    if (mediaIssues.length > 0) {
      console.error(JSON.stringify(mediaIssues.slice(0, 30), null, 2));
      throw new Error(`Imported draft failed media validation with ${mediaIssues.length} issues`);
    }
  }

  const summary = {
    sourceProducts: products.length,
    sourceImages: sourceAssets.length,
    productsAdded: added.length,
    productsRefreshed: refreshed,
    draftProducts: parsed.data.products.length,
    checkoutEnabledForImportedProducts: imported.filter(
      (product) => product.fulfilmentState !== "unavailable" || Boolean(product.commerceProductId),
    ).length,
  };
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, ...summary }, null, 2));
    return;
  }

  const hash = platformContentHash(parsed.data);
  const saved = await db.transaction(async (tx) => {
    const now = new Date();
    const [updated] = await tx.update(siteContentTable).set({
      draft: parsed.data,
      draftUpdatedAt: now,
      updatedByClerkUserId: row.updatedByClerkUserId,
    }).where(and(
      eq(siteContentTable.key, "platform"),
      eq(siteContentTable.draftUpdatedAt, originalDraftUpdatedAt),
    )).returning({ key: siteContentTable.key, draftUpdatedAt: siteContentTable.draftUpdatedAt });
    if (!updated) return null;
    const [revision] = await tx.insert(siteContentRevisionsTable).values({
      contentKey: "platform",
      event: "draft_saved",
      snapshot: parsed.data,
      contentHash: hash,
      createdByClerkUserId: row.updatedByClerkUserId!,
    }).returning({ id: siteContentRevisionsTable.id });
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: row.updatedByClerkUserId!,
      action: "platform_content.legacy_catalogue_imported",
      entityType: "site_content",
      entityId: "platform",
      metadata: { ...summary, revisionId: revision!.id, source: SOURCE_SITE },
    });
    return updated;
  });
  if (!saved) throw new Error("The Staff draft changed during import; no catalogue changes were saved");
  console.log(JSON.stringify({ dryRun: false, ...summary, draftUpdatedAt: saved.draftUpdatedAt }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});