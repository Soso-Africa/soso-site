const SOURCE_API = "https://shopsoso.co/wp-json/wc/store/v1/products";

export const SOURCE_SITE = "https://shopsoso.co";

export type LegacyTerm = { name?: string; slug?: string };
export type LegacyAttribute = { name?: string; terms?: LegacyTerm[] };
export type LegacyImage = { id?: number; src?: string; name?: string; alt?: string };
export type LegacyProduct = {
  id: number;
  name: string;
  slug: string;
  permalink?: string;
  short_description?: string;
  description?: string;
  prices?: { price?: string; currency_code?: string; currency_minor_unit?: number };
  images?: LegacyImage[];
  categories?: LegacyTerm[];
  tags?: LegacyTerm[];
  attributes?: LegacyAttribute[];
};

export function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    copy: "©",
    gt: ">",
    hellip: "…",
    laquo: "“",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    nbsp: " ",
    ndash: "–",
    quot: "\"",
    raquo: "”",
    rdquo: "”",
    reg: "®",
    rsquo: "’",
  };
  const stripContainer = (input: string, tagName: string) => input.replace(
    new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi"),
    " ",
  );
  return stripContainer(stripContainer(value, "script"), "style")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

export function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function legacyTerms(product: LegacyProduct): string[] {
  return [...(product.categories ?? []), ...(product.tags ?? [])]
    .map((term) => decodeHtml(term.name ?? ""))
    .filter(Boolean);
}

export function includesTerm(terms: string[], ...needles: string[]): boolean {
  const normalized = terms.map((term) => term.toLowerCase());
  return needles.some((needle) => normalized.some((term) => term.includes(needle)));
}

export function productPlacement(product: LegacyProduct): {
  department: "men" | "women" | "accessories";
  category: string;
} {
  const terms = legacyTerms(product);
  if (includesTerm(terms, "cufflink", "accessories")) {
    return { department: "accessories", category: "Accessories" };
  }
  if (includesTerm(terms, "women")) {
    return { department: "women", category: "Women's Ready-to-Wear" };
  }
  if (includesTerm(terms, "agbada")) return { department: "men", category: "Agbadas" };
  if (includesTerm(terms, "danshiki", "dashiki")) return { department: "men", category: "Dashikis" };
  if (includesTerm(terms, "shirt")) return { department: "men", category: "Shirts" };
  if (includesTerm(terms, "two-piece")) return { department: "men", category: "Two-Piece" };
  if (includesTerm(terms, "kaftan")) return { department: "men", category: "Kaftans" };
  return { department: "men", category: "Men's Ready-to-Wear" };
}

const colours = [
  ["Black", "#151515", ["black", "noir", "onyx", "obsidian", "ebony"]],
  ["White", "#F4F1E8", ["white", "ivory", "alabaster", "cream"]],
  ["Blue", "#315A78", ["blue", "navy", "azure", "cobalt", "cyan", "sapphire"]],
  ["Brown", "#74513B", ["brown", "cacao", "mahogany", "tobacco", "tabac"]],
  ["Green", "#4E6651", ["green", "olive", "sage", "moss", "jade"]],
  ["Red", "#8F3030", ["red", "vermeil"]],
  ["Pink", "#C88493", ["pink", "rose"]],
  ["Grey", "#777777", ["grey", "gray", "slate", "graphite", "silver"]],
  ["Gold", "#B18A3D", ["gold"]],
  ["Purple", "#69527D", ["purple", "violet"]],
  ["Orange", "#C46D31", ["orange"]],
  ["Yellow", "#D5B447", ["yellow", "citron"]],
] as const;

export function productColours(product: LegacyProduct): { id: string; label: string; hex: string }[] {
  const source = `${product.name} ${legacyTerms(product).join(" ")}`.toLowerCase();
  const matched = colours
    .filter(([, , aliases]) => aliases.some((alias) => source.includes(alias)))
    .map(([label, hex]) => ({ id: safeSlug(label), label, hex }));
  return matched.length > 0
    ? matched.slice(0, 16)
    : [{ id: "as-photographed", label: "As photographed", hex: "#78716C" }];
}

export function productSizes(product: LegacyProduct): string[] {
  const sizeAttribute = (product.attributes ?? []).find(
    (attribute) => attribute.name?.toLowerCase() === "size",
  );
  const sizes = (sizeAttribute?.terms ?? [])
    .map((term) => decodeHtml(term.name ?? ""))
    .filter(Boolean);
  return [...new Set(sizes.length > 0 ? sizes : ["Size review required"])];
}

export function productFabric(product: LegacyProduct): string {
  const source = decodeHtml(`${product.short_description ?? ""} ${product.description ?? ""}`).toLowerCase();
  if (source.includes("linen")) return "Linen";
  if (source.includes("wool")) return "Wool";
  if (source.includes("silk")) return "Silk";
  if (source.includes("cotton")) return "Cotton";
  if (source.includes("velvet")) return "Velvet";
  return "To be confirmed";
}

export function productPrice(product: LegacyProduct): number {
  if (product.prices?.currency_code !== "NGN") {
    throw new Error(`Unsupported source currency for ${product.slug}: ${product.prices?.currency_code ?? "missing"}`);
  }
  const minorUnit = product.prices.currency_minor_unit ?? 2;
  const price = Number(product.prices.price) / (10 ** minorUnit);
  if (!Number.isSafeInteger(price) || price <= 0) throw new Error(`Invalid source price for ${product.slug}`);
  return price;
}

export function sourceImages(product: LegacyProduct): Array<LegacyImage & { src: string }> {
  const deduplicated = new Map<string, LegacyImage>();
  for (const image of product.images ?? []) {
    if (image.src && !deduplicated.has(image.src)) deduplicated.set(image.src, image);
  }
  if (deduplicated.size === 0) throw new Error(`No source images found for ${product.slug}`);
  return [...deduplicated.values()] as Array<LegacyImage & { src: string }>;
}

export async function fetchLegacyProducts(): Promise<LegacyProduct[]> {
  const first = await fetch(`${SOURCE_API}?per_page=100&page=1&orderby=date&order=desc`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!first.ok) throw new Error(`Legacy catalogue request failed (${first.status})`);
  const firstPage = await first.json() as LegacyProduct[];
  const totalPages = Number(first.headers.get("x-wp-totalpages") ?? "1");
  const remaining = await Promise.all(
    Array.from({ length: Math.max(0, totalPages - 1) }, async (_value, index) => {
      const page = index + 2;
      const response = await fetch(`${SOURCE_API}?per_page=100&page=${page}&orderby=date&order=desc`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Legacy catalogue page ${page} failed (${response.status})`);
      return response.json() as Promise<LegacyProduct[]>;
    }),
  );
  const products = [...firstPage, ...remaining.flat()];
  const unique = new Map(products.map((product) => [product.id, product]));
  if (unique.size !== products.length) throw new Error("Legacy catalogue returned duplicate product IDs");
  return [...unique.values()];
}

export function extensionForType(contentType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const extension = extensions[contentType];
  if (!extension) throw new Error(`Unsupported source image type: ${contentType}`);
  return extension;
}