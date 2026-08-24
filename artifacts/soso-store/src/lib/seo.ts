const rawSiteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || "").trim();

function normalizeSiteUrl(value: string) {
  if (!value) return "";

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    if (url.username || url.password || url.search || url.hash) return "";
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".replit.dev")) {
      return "";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export const siteUrl = normalizeSiteUrl(rawSiteUrl);
export const indexingEnabled = siteUrl.length > 0 && import.meta.env.VITE_SOSO_INDEXING_ENABLED === "true";
export const catalogApproved = indexingEnabled && import.meta.env.VITE_SOSO_CATALOG_APPROVED === "true";
export const policiesApproved = indexingEnabled && import.meta.env.VITE_SOSO_POLICIES_APPROVED === "true";
export const journalApproved = indexingEnabled && import.meta.env.VITE_SOSO_JOURNAL_APPROVED === "true";

export function absoluteUrl(path: string) {
  if (!siteUrl) return "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl}${normalizedPath}`;
}

export function socialImageUrl() {
  const configuredPath = (import.meta.env.VITE_SOSO_SOCIAL_IMAGE_PATH || "").trim();
  return configuredPath ? absoluteUrl(configuredPath) : "";
}