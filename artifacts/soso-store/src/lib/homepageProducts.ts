import type { CatalogProduct } from "@/data/platformContent";

type ProductMedia = Pick<CatalogProduct, "slug" | "name" | "img" | "images">;
export type ResolvedProductMedia = { slug: string; name: string; pdpHref: string; primary: string; primaryAlt: string; frames: string[]; alt: string };

export function productFrames(product: ProductMedia): { src: string; alt: string }[] {
  const seen = new Set<string>();
  const all = [{ src: product.img, alt: product.images.find((i) => i.src === product.img)?.alt ?? product.name }, ...product.images.map((i) => ({ src: i.src, alt: i.alt }))];
  return all.filter((f) => f.src && !seen.has(f.src) && seen.add(f.src));
}

/** Resolve a live product to its media. Unknown slug -> null (never a legacy fallback). */
export function resolveProductMedia(slug: string | undefined, products: ProductMedia[], selected?: string[], max = 4): ResolvedProductMedia | null {
  if (!slug) return null;
  const product = products.find((p) => p.slug === slug);
  if (!product) return null;
  const frames = productFrames(product);
  if (!frames.length) return null;
  const picked = (selected ?? []).filter((src, i, a) => a.indexOf(src) === i && frames.some((f) => f.src === src)).slice(0, max);
  const chosen = picked.length ? picked : [frames[0]!.src];
  const primary = chosen[0]!;
  const primaryAlt = frames.find((f) => f.src === primary)?.alt || product.name;
  return { slug, name: product.name, pdpHref: `/product/${product.slug}`, primary, primaryAlt, frames: chosen, alt: primaryAlt };
}

/** Mobile frames may be any image of the same product (max 4); never another product's. */
export function resolveMobileFrames(slug: string | undefined, products: ProductMedia[], selected?: string[], max = 4): string[] {
  const product = products.find((p) => p.slug === slug);
  if (!product) return [];
  const all = productFrames(product).map((f) => f.src);
  return (selected ?? []).filter((src, i, a) => a.indexOf(src) === i && all.includes(src)).slice(0, max);
}
