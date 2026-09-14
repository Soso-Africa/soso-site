import type { PlatformContent } from "./platform-content";

export type AccessoryProductPublicationIssue = {
  productSlug: string;
  message: string;
};

const placeholderSignal = /coming soon|placeholder|planned soso accessor|to be confirmed/i;

export function validateAccessoryProductPublication(
  content: PlatformContent,
): AccessoryProductPublicationIssue[] {
  const issues: AccessoryProductPublicationIssue[] = [];

  for (const product of content.products) {
    if (product.department !== "accessories") continue;

    if (product.releaseState === "placeholder") {
      if (
        product.fulfilmentState !== "unavailable"
        || product.commerceProductId
        || product.commerceVariantIds
      ) {
        issues.push({
          productSlug: product.slug,
          message: "Accessory placeholders must remain unavailable and without commerce mappings",
        });
      }
      continue;
    }

    const eligibleChoices = [
      ...(product.standardEligible ? product.standardSizes : []),
      ...(product.customEligible ? ["Custom"] : []),
    ];
    const hasPlaceholderMedia = product.images.some((image) => (
      placeholderSignal.test(image.src)
      || placeholderSignal.test(image.provenance.source)
      || placeholderSignal.test(image.provenance.rights)
    ));
    const placeholderCopy = [
      product.slug,
      product.tag,
      product.note,
      product.description,
      product.colour,
      product.fabric,
      product.fit,
      product.merchandising.label ?? "",
      ...product.searchableTerms,
    ].some((value) => placeholderSignal.test(value));

    if (hasPlaceholderMedia) {
      issues.push({ productSlug: product.slug, message: "Approved accessories must replace all placeholder artwork with governed product photography" });
    }
    if (placeholderCopy || product.unavailableMessage) {
      issues.push({ productSlug: product.slug, message: "Approved accessories must remove placeholder and coming-soon copy" });
    }
    if (product.fulfilmentState === "unavailable") {
      issues.push({ productSlug: product.slug, message: "Approved accessories require an available fulfilment state" });
    }
    if (!product.commerceProductId) {
      issues.push({ productSlug: product.slug, message: "Approved accessories require a JusticeSure product mapping" });
    }
    if (eligibleChoices.length === 0 || eligibleChoices.some((choice) => !product.commerceVariantIds?.[choice])) {
      issues.push({ productSlug: product.slug, message: "Approved accessories require a JusticeSure variant mapping for every eligible purchase choice" });
    }
    if (product.fulfilmentState === "ready_now" && product.readyNowSizes.length === 0) {
      issues.push({ productSlug: product.slug, message: "Ready-now accessories require approved stock for at least one Standard size" });
    }
  }

  return issues;
}