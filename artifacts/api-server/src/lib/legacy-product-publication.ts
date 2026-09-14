import legacyProductInventoryJson from "../../../../docs/soso-legacy-product-inventory.json";
import type { PlatformContent } from "./platform-content";

type LegacyInventoryImage = {
  sourceUrl: string;
  mirrorPath: string | null;
  sha256: string | null;
  mirrorStatus: string;
};

type LegacyInventoryProduct = {
  legacyId: number;
  slug: string;
  sourceUrl: string;
  approvalStatus: string;
  browseStatus: string;
  checkoutStatus: string;
  sourceImages: LegacyInventoryImage[];
  justiceSure: {
    productId: string | null;
    variantIdsByOption: Record<string, string>;
    verifiedPriceMinor: string | number | null;
    verifiedCurrency: string | null;
    verifiedAvailability: boolean | null;
    endToEndVerifiedAt: string | null;
  };
};

export type LegacyProductInventory = {
  products: LegacyInventoryProduct[];
};

export type LegacyProductPublicationIssue = {
  productSlug: string;
  message: string;
};

const legacyProductInventory = legacyProductInventoryJson as unknown as LegacyProductInventory;
const verifiedMirrorPath = /^\/api\/storage\/objects\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/;
const sha256 = /^[a-f0-9]{64}$/;

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return `${url.origin.toLocaleLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

function isLegacySourceUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLocaleLowerCase();
    return hostname === "shopsoso.co" || hostname === "www.shopsoso.co";
  } catch {
    return false;
  }
}

function sameRecord(
  product: PlatformContent["products"][number],
  record: LegacyInventoryProduct,
): boolean {
  if (product.legacyMigration) {
    return product.legacyMigration.sourceProductId === record.legacyId
      && normalizeUrl(product.legacyMigration.sourceUrl) === normalizeUrl(record.sourceUrl);
  }
  if (product.slug === record.slug) return true;
  const sources = new Set(
    product.images
      .map((image) => normalizeUrl(image.provenance.sourceUrl ?? ""))
      .filter((source): source is string => Boolean(source)),
  );
  return record.sourceImages.some((image) => sources.has(normalizeUrl(image.sourceUrl) ?? ""));
}

function checkoutVerificationIssues(
  product: PlatformContent["products"][number],
  record: LegacyInventoryProduct,
): string[] {
  const issues: string[] = [];
  const review = record.justiceSure;
  const verifiedPriceMinor = Number(review.verifiedPriceMinor);
  const verifiedAt = review.endToEndVerifiedAt ? Date.parse(review.endToEndVerifiedAt) : Number.NaN;
  if (!review.productId || product.commerceProductId !== review.productId) {
    issues.push("must use the reviewed JusticeSure product ID");
  }
  if (
    !review.verifiedCurrency
    || !/^[A-Z]{3}$/.test(review.verifiedCurrency)
    || !Number.isSafeInteger(verifiedPriceMinor)
    || verifiedPriceMinor <= 0
    || product.price * 100 !== verifiedPriceMinor
  ) {
    issues.push("must use the reviewed JusticeSure price and currency");
  }
  if (review.verifiedAvailability !== true || !Number.isFinite(verifiedAt)) {
    issues.push("must have verified availability and an end-to-end verification timestamp");
  }
  const candidateVariants = Object.entries(product.commerceVariantIds ?? {})
    .sort(([left], [right]) => left.localeCompare(right));
  const reviewedVariants = Object.entries(review.variantIdsByOption)
    .sort(([left], [right]) => left.localeCompare(right));
  if (!product.commerceVariantIds || JSON.stringify(candidateVariants) !== JSON.stringify(reviewedVariants)) {
    issues.push("must use the reviewed JusticeSure size and option variant IDs");
  }
  return issues;
}

export function validateLegacyProductPublication(
  content: PlatformContent,
  inventory: LegacyProductInventory = legacyProductInventory,
): LegacyProductPublicationIssue[] {
  const recordsById = new Map(inventory.products.map((record) => [record.legacyId, record]));
  const recordsBySlug = new Map(inventory.products.map((record) => [record.slug, record]));
  const recordsBySourceImage = new Map(
    inventory.products.flatMap((record) => record.sourceImages.map((image) => [
      normalizeUrl(image.sourceUrl),
      record,
    ] as const)),
  );
  const issues: LegacyProductPublicationIssue[] = [];

  for (const product of content.products) {
    const sourceUrls = product.images
      .map((image) => image.provenance.sourceUrl)
      .filter((source): source is string => Boolean(source));
    const record = (
      (product.legacyMigration
        ? recordsById.get(product.legacyMigration.sourceProductId)
        : undefined)
      ?? recordsBySlug.get(product.slug)
      ?? sourceUrls.map((source) => recordsBySourceImage.get(normalizeUrl(source))).find(Boolean)
    );
    const looksLegacy = Boolean(product.legacyMigration) || Boolean(record);
    if (!looksLegacy) continue;
    if (!record || !sameRecord(product, record)) {
      issues.push({
        productSlug: product.slug,
        message: "Legacy source identity does not match the reviewed migration inventory",
      });
      continue;
    }
    if (record.approvalStatus !== "approved") {
      issues.push({
        productSlug: product.slug,
        message: "Business approval is required before this legacy product can be published",
      });
      continue;
    }

    const invalidMirror = record.sourceImages.find((image) => (
      image.mirrorStatus !== "verified"
      || !verifiedMirrorPath.test(image.mirrorPath ?? "")
      || !sha256.test(image.sha256 ?? "")
    ));
    if (invalidMirror) {
      issues.push({
        productSlug: product.slug,
        message: "Every approved legacy image requires a verified SOSO-owned mirror and SHA-256 digest",
      });
      continue;
    }
    const unprojectedMirror = record.sourceImages.find((sourceImage) => {
      const normalizedSource = normalizeUrl(sourceImage.sourceUrl);
      return !product.images.some((image) => (
        normalizeUrl(image.provenance.sourceUrl ?? "") === normalizedSource
        && image.src === sourceImage.mirrorPath
      ));
    });
    if (unprojectedMirror || isLegacySourceUrl(product.img)) {
      issues.push({
        productSlug: product.slug,
        message: "Published legacy product images must use their reviewed SOSO-owned mirrors",
      });
      continue;
    }

    if (record.checkoutStatus === "disabled-unmapped") {
      if (record.browseStatus !== "browse-only") {
        issues.push({
          productSlug: product.slug,
          message: "Explicit browse-only approval is required before publication",
        });
      }
      if (
        product.fulfilmentState !== "unavailable"
        || product.commerceProductId
        || product.commerceVariantIds
      ) {
        issues.push({
          productSlug: product.slug,
          message: "Browse-only legacy products must remain unavailable and without commerce mappings",
        });
      }
      continue;
    }

    if (record.checkoutStatus !== "enabled-verified") {
      issues.push({
        productSlug: product.slug,
        message: "Legacy checkout status has not passed an approved review state",
      });
      continue;
    }
    for (const message of checkoutVerificationIssues(product, record)) {
      issues.push({ productSlug: product.slug, message });
    }
  }

  return issues;
}