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
    { source: content.homepage.newArrival.editorial.imageUrl, path: ["homepage", "newArrival", "editorial", "imageUrl"] },
    ...content.homepage.occasions.items.map((item, index) => ({ source: item.imageUrl, path: ["homepage", "occasions", "items", index, "imageUrl"] })),
    { source: content.homepage.fit.imageUrl, path: ["homepage", "fit", "imageUrl"] },
  ];
  const uniqueAssets = new Map<string, (string | number)[]>();
  assets.forEach((asset) => {
    if (!uniqueAssets.has(asset.source)) uniqueAssets.set(asset.source, asset.path);
  });
  const results = await Promise.all([...uniqueAssets.entries()].map(async ([source, path]) => {
    const issue = await validateManagedImageAsset(source, inspect);
    return issue ? [{ path, message: `Homepage image ${issue.slice(0, 1).toLowerCase()}${issue.slice(1)}` }] : [];
  }));
  return results.flat();
}