const PRIVATE_SURFACE_PATH =
  /^\/(?:api|staff|sign-in|sign-up)(?:\/|$)|^\/journal\/preview(?:\/|$)/i;

/**
 * This is intentionally a deny-list rather than an allow-list: storefront
 * routes can be launched without requiring a corresponding analytics release.
 * Keep the expression compatible with both JavaScript and PostgreSQL regexes,
 * since ingestion and staff quality reporting use the same policy.
 */
export const INVALID_STOREFRONT_PATH_PATTERN =
  String.raw`(^$)|(^[^/])|(^//)|(^/(api|staff|sign-in|sign-up)(/|$))|(^/journal/preview(/|$))|[?#\s\x00-\x1f\x7f\\]|^.{201,}$`;

const INVALID_STOREFRONT_PATH = new RegExp(INVALID_STOREFRONT_PATH_PATTERN, "i");

/** Private namespaces that must never be treated as storefront surfaces. */
export function isPrivateStorefrontPath(path: string): boolean {
  return PRIVATE_SURFACE_PATH.test(path);
}

/**
 * Analytics receives pathname values, not full URLs. Keep this policy
 * forward-compatible so a newly launched public page cannot lose measurement
 * merely because the API has not been updated with another route literal.
 */
export function isTrackableStorefrontPath(path: string): boolean {
  return typeof path === "string" && !INVALID_STOREFRONT_PATH.test(path);
}
