/** Preserve the original src/logical asset; browsers choose a smaller delivery variant. */
export function responsiveProductPhoto(src: string, sizes = "(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw") {
  const widths = [480, 768, 1280, 1600];
  if (!/\.(?:jpe?g|png)$/i.test(src)) return {};
  let candidates: string[];
  if (src.includes("/api/storage/objects/uploads/")) {
    candidates = widths.map((width) => `${src}?w=${width} ${width}w`);
  } else {
    // Existing transformed/signed URLs must not gain another transformation.
    // Keep animation and video formats untouched, just like the API delivery.
    const delivery = src.match(/^(https:\/\/res\.cloudinary\.com\/[\w-]+\/image\/upload\/)(.+)$/i);
    if (!delivery || delivery[2].split("/").some((part) => part.includes(",") || part.startsWith("s--"))) return {};
    candidates = widths.map((width) => `${delivery[1]}c_limit,w_${width},q_auto:good,f_auto/${delivery[2]} ${width}w`);
  }
  return {
    srcSet: candidates.join(", "),
    sizes,
    decoding: "async" as const,
  };
}
