/** Controlled size aliases. Only these semantic sizes are matched; colours are never evidence. */
const ALIASES: Record<string, string[]> = {
  S: ["s", "small"],
  M: ["m", "medium"],
  L: ["l", "large"],
  XL: ["xl", "extra large"],
  XXL: ["xxl", "2xl"],
  XXXL: ["xxxl", "3xl"],
  Custom: ["custom", "made to measure", "made-to-measure", "bespoke"],
};
const AUTHORITATIVE = ["size", "option", "variant", "measurement", "type"];

function norm(v: string): string {
  return v.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/** Canonical size for a SOSO choice or remote token, or undefined when not a controlled size. */
export function canonicalSize(value: string): string | undefined {
  const n = norm(value);
  for (const [key, list] of Object.entries(ALIASES)) if (list.includes(n)) return key;
  return undefined;
}

function sizesInText(text: string): Set<string> {
  const found = new Set<string>();
  const whole = canonicalSize(text);
  if (whole) found.add(whole);
  return found;
}

export type RemoteVariantLike = { id: string; name: string; label: string; attributes: Record<string, unknown> };

/** Semantic sizes a remote variant represents. Authoritative attributes win; otherwise name/label. */
export function variantSizes(variant: RemoteVariantLike): Set<string> {
  const attrs = Object.entries(variant.attributes ?? {}).filter(([k]) => AUTHORITATIVE.includes(norm(k)));
  if (attrs.length > 0) {
    const out = new Set<string>();
    for (const [, v] of attrs) sizesInText(String(v)).forEach((s) => out.add(s));
    return out;
  }
  const out = sizesInText(variant.name || "");
  sizesInText(variant.label || "").forEach((s) => out.add(s));
  return out;
}

/** True only when the variant unambiguously represents exactly this choice's size. */
export function isCompatibleVariant(choice: string, variant: RemoteVariantLike): boolean {
  // Exact controlled aliases or exact merchant size labels, just like the server.
  const want = canonicalSize(choice) ?? norm(choice);
  if (!want) return false;
  const attrs = Object.entries(variant.attributes ?? {})
    .filter(([key, value]) => AUTHORITATIVE.includes(norm(key)) && (typeof value === "string" || typeof value === "number"))
    .map(([, value]) => String(value));
  return (attrs.length ? attrs : [variant.name, variant.label]).some((value) => (canonicalSize(value) ?? norm(value)) === want);
}

export function compatibleVariants<T extends RemoteVariantLike>(choice: string, variants: T[]): T[] {
  return variants.filter((v) => isCompatibleVariant(choice, v));
}

export type ChoiceMatch = { choice: string; selectedId?: string; status: "empty" | "ok" | "wrong" | "missing_remote" };

export function evaluateChoices(choices: string[], selected: Record<string, string> | undefined, variants: RemoteVariantLike[] | undefined): {
  rows: ChoiceMatch[]; selectedCount: number; correctCount: number;
} {
  const rows: ChoiceMatch[] = choices.map((choice) => {
    const id = selected?.[choice];
    if (!id) return { choice, status: "empty" };
    if (!variants) return { choice, selectedId: id, status: "missing_remote" };
    const v = variants.find((x) => x.id === id);
    if (!v) return { choice, selectedId: id, status: "missing_remote" };
    return { choice, selectedId: id, status: isCompatibleVariant(choice, v) ? "ok" : "wrong" };
  });
  return { rows, selectedCount: rows.filter((r) => r.selectedId).length, correctCount: rows.filter((r) => r.status === "ok").length };
}

export function wrongSizeMessage(choice: string): string {
  const want = canonicalSize(choice);
  const hint = want === "Custom" ? "a Custom / Made to measure option" : want ? `a ${want} option` : `an option for ${choice}`;
  return `Wrong size — choose ${hint}. The saved choice is kept until you pick a new one.`;
}
