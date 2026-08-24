const PRIVATE_SURFACE_PATH = /^\/(?:api|staff|sign-in|sign-up)(?:\/|$)|^\/journal\/preview(?:\/|$)/i;

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
  return Boolean(
    path
      && path.length <= 200
      && path.startsWith("/")
      && !path.startsWith("//")
      && !/[?#\s\\\u0000-\u001f\u007f]/.test(path)
      && !isPrivateStorefrontPath(path),
  );
}