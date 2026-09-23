export type SeoExposure = {
  robots: "index, follow" | "noindex, follow";
  canonical: boolean;
  structuredData: boolean;
};

export function seoExposure(indexable: boolean): SeoExposure {
  return indexable
    ? { robots: "index, follow", canonical: true, structuredData: true }
    : { robots: "noindex, follow", canonical: false, structuredData: false };
}