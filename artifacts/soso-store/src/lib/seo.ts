const rawSiteUrl = (import.meta.env?.VITE_PUBLIC_SITE_URL || "").trim();
const approvedOrigin = "https://shopsoso.co";

export function canonicalSiteOrigin(value: string) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return "";
    if (url.protocol !== "https:") return "";
    if (url.hostname === "shopsoso.co") return approvedOrigin;
    if (url.hostname === "www.shopsoso.co") return approvedOrigin;
  } catch {
    // Invalid or unapproved origins fail closed.
  }
  return "";
}

export const siteUrl = canonicalSiteOrigin(rawSiteUrl);
export const indexingEnabled = siteUrl.length > 0 && import.meta.env?.VITE_SOSO_INDEXING_ENABLED === "true";
export const catalogApproved = indexingEnabled && import.meta.env?.VITE_SOSO_CATALOG_APPROVED === "true";
export const policiesApproved = indexingEnabled && import.meta.env?.VITE_SOSO_POLICIES_APPROVED === "true";
export const journalApproved = indexingEnabled && import.meta.env?.VITE_SOSO_JOURNAL_APPROVED === "true";

export function absoluteUrl(path: string) {
  if (!siteUrl) return "";
  // CMS media may already be hosted on a canonical HTTPS origin.
  try {
    const url = new URL(path);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    // A relative path is resolved against the approved public site origin.
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl}${normalizedPath}`;
}

export function socialImageUrl() {
  const configuredPath = (import.meta.env?.VITE_SOSO_SOCIAL_IMAGE_PATH || "").trim();
  return configuredPath ? absoluteUrl(configuredPath) : "";
}