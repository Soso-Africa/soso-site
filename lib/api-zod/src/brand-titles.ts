export const SOSO_DEFAULT_BROWSER_TITLE = "SOSO Africa | Premium African Fashion";

/** Update only the former default; preserve merchant-written page titles. */
export function normalizeStorefrontTitle(title: string): string {
  return /^SOSO Africa \| Premium Nigerian (?:Menswear|Fashion)$/.test(title)
    ? SOSO_DEFAULT_BROWSER_TITLE : title;
}
