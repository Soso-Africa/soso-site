export const RESPONSIVE_PHOTO_WIDTHS = [480, 768, 1280, 1600] as const;

/** Delivery-only resizing: no cropping, recolouring, masking or upscaling. */
export function responsivePhotoDelivery(url: string, width: number): string {
  if (!(RESPONSIVE_PHOTO_WIDTHS as readonly number[]).includes(width)) return url;
  const parsed = new URL(url);
  if (parsed.hostname !== "res.cloudinary.com" || !parsed.pathname.includes("/image/upload/")
    || parsed.pathname.includes("/s--") || !/\.(?:jpe?g|png)$/i.test(parsed.pathname)) return url;
  parsed.pathname = parsed.pathname.replace("/image/upload/", `/image/upload/c_limit,w_${width},q_auto:good,f_auto/`);
  return parsed.toString();
}
