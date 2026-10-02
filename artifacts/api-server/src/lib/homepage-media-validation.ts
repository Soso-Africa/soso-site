import { resolveHomepageProductBinding, type PlatformContent } from "./platform-content";
import { validateManagedImageAsset, type ProductMediaInspector } from "./product-media-validation";

export type HomepageMerchandisingMediaValidationIssue = { path: (string | number)[]; message: string };

/** Checks product-backed homepage references against the supplied published snapshot. */
export function validateHomepageProductBindings(
  content: PlatformContent,
  options: { requireCoreBindings?: boolean } = {},
): HomepageMerchandisingMediaValidationIssue[] {
  const issues: HomepageMerchandisingMediaValidationIssue[] = [];
  const checkBinding = (
    productSlug: string | undefined,
    imageSources: string[],
    path: (string | number)[],
    label: string,
  ): void => {
    if (!productSlug) return;
    const binding = resolveHomepageProductBinding(content, productSlug);
    if (!binding) {
      issues.push({
        path: [...path, "productSlug"],
        message: `${label} must reference a currently published, approved, available product with approved imagery`,
      });
      return;
    }
    const approvedSources = new Set(binding.imageUrls);
    imageSources.forEach((source, index) => {
      if (!approvedSources.has(source)) {
        issues.push({
          path: imageSources.length === 1
            ? [...path, "imageUrl"]
            : [...path, index === 0 ? "imageUrl" : "imageUrls", ...(index === 0 ? [] : [index - 1])],
          message: `${label} imagery must come from the selected product's approved image sources`,
        });
      }
    });
  };

  content.homepage.categories.items.forEach((item, index) => {
    const path = ["homepage", "categories", "items", index];
    if (options.requireCoreBindings && !item.productSlug) {
      issues.push({ path: [...path, "productSlug"], message: "Every homepage category panel must be bound to a published product before this scoped publish" });
    }
    if (item.productSlug) {
      const images = [item.imageUrl, ...(item.imageUrls ?? []), ...(item.mobileImageUrls ?? [])];
      const binding = resolveHomepageProductBinding(content, item.productSlug);
      if (!binding) {
        issues.push({
          path: [...path, "productSlug"],
          message: "Homepage category must reference a currently published, approved, available product with approved imagery",
        });
      } else {
        const product = content.products.find((entry) => entry.slug === item.productSlug);
        const collectionSlug = item.href.replace(/^\/collections\//, "");
        const collection = content.collections.find((entry) => entry.slug === collectionSlug);
        if (!product || !collection || product.department !== collection.department || product.category !== collection.category) {
          issues.push({
            path: [...path, "productSlug"],
            message: "Homepage category product must belong to its canonical collection grouping",
          });
        }
        const approvedSources = new Set(binding.imageUrls);
        images.forEach((source, imageIndex) => {
          if (!approvedSources.has(source)) {
            const fieldPath = imageIndex === 0
              ? [...path, "imageUrl"]
              : imageIndex <= (item.imageUrls?.length ?? 0)
                ? [...path, "imageUrls", imageIndex - 1]
                : [...path, "mobileImageUrls", imageIndex - (item.imageUrls?.length ?? 0) - 1];
            issues.push({ path: fieldPath, message: "Homepage category imagery must come from its selected product's approved image sources" });
          }
        });
      }
    }
  });
  content.homepage.occasions.items.forEach((item, index) => {
    const path = ["homepage", "occasions", "items", index];
    if (options.requireCoreBindings && !item.productSlug) {
      issues.push({ path: [...path, "productSlug"], message: "Every homepage occasion panel must be bound to a published product before this scoped publish" });
    }
    checkBinding(item.productSlug, [item.imageUrl], path, "Homepage occasion");
  });

  const homepage = content.homepage;
  checkBinding(homepage.newArrival.productSlug, [], ["homepage", "newArrival"], "Homepage new arrival");
  checkBinding(
    homepage.newArrival.editorial.productSlug,
    [homepage.newArrival.editorial.imageUrl],
    ["homepage", "newArrival", "editorial"],
    "New-arrival editorial",
  );
  checkBinding(homepage.fit.productSlug, [homepage.fit.imageUrl], ["homepage", "fit"], "Homepage fit panel");
  checkBinding(homepage.story.productSlug, [homepage.story.imageUrl], ["homepage", "story"], "Homepage story panel");
  return issues;
}

/** Validates the non-hero homepage images selected by staff, once per durable path. */
export async function validateHomepageMerchandisingMediaAssets(
  content: PlatformContent,
  inspect?: ProductMediaInspector,
): Promise<HomepageMerchandisingMediaValidationIssue[]> {
  const assets: Array<{ source: string; path: (string | number)[] }> = [
    ...content.homepage.categories.items.map((item, index) => ({ source: item.imageUrl, path: ["homepage", "categories", "items", index, "imageUrl"] })),
    ...content.homepage.categories.items.flatMap((item, index) =>
      (item.imageUrls ?? []).map((source, imageIndex) => ({
        source,
        path: ["homepage", "categories", "items", index, "imageUrls", imageIndex],
      }))),
    ...content.homepage.categories.items.flatMap((item, index) =>
      (item.mobileImageUrls ?? []).map((source, imageIndex) => ({
        source,
        path: ["homepage", "categories", "items", index, "mobileImageUrls", imageIndex],
      }))),
    { source: content.homepage.newArrival.editorial.imageUrl, path: ["homepage", "newArrival", "editorial", "imageUrl"] },
    ...content.homepage.occasions.items.map((item, index) => ({ source: item.imageUrl, path: ["homepage", "occasions", "items", index, "imageUrl"] })),
    { source: content.homepage.fit.imageUrl, path: ["homepage", "fit", "imageUrl"] },
    ...(content.homepage.story.productSlug
      ? [{ source: content.homepage.story.imageUrl, path: ["homepage", "story", "imageUrl"] as (string | number)[] }]
      : []),
  ];
  const uniqueAssets = new Map<string, Array<(string | number)[]>>();
  assets.forEach((asset) => {
    const paths = uniqueAssets.get(asset.source);
    if (paths) paths.push(asset.path);
    else uniqueAssets.set(asset.source, [asset.path]);
  });
  const results = await Promise.all([...uniqueAssets.entries()].map(async ([source, paths]) => {
    const issue = await validateManagedImageAsset(source, inspect);
    return issue
      ? paths.map((path) => ({ path, message: `Homepage image ${issue.slice(0, 1).toLowerCase()}${issue.slice(1)}` }))
      : [];
  }));
  return results.flat();
}