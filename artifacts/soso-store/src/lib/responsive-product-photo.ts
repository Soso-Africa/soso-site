/** Preserve the original src/logical asset; browsers choose a smaller delivery variant. */
export function responsiveProductPhoto(src: string, sizes = "(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw") {
  if (!src.includes("/api/storage/objects/uploads/") || !/\.(?:jpe?g|png)$/i.test(src)) return {};
  return {
    srcSet: [480, 768, 1280, 1600].map((width) => `${src}?w=${width} ${width}w`).join(", "),
    sizes,
    decoding: "async" as const,
  };
}
