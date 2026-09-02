import type { PlatformContent } from "./platform-content";
import { validateManagedImageAsset, type ProductMediaInspector } from "./product-media-validation";

export type HomepageMerchandisingMediaValidationIssue = { path: (string | number)[]; message: string };

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