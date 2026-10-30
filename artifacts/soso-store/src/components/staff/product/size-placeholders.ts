/** Imported guidance is not a merchant-approved size or commerce choice. */
export function isSizePlaceholder(size: string): boolean {
  return /^(to confirm|to be confirmed|tbc|tbd|unknown|pending)$/i.test(size.trim().replace(/[\s_-]+/g, " "));
}
