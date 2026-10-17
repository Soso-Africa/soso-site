const WIDTHS = [480, 768, 1280, 1600] as const;

export type StaffPhotoRendition = {
  width: typeof WIDTHS[number];
  blob: Blob;
  contentType: "image/jpeg" | "image/png";
};

/** Staff-device work only: no photo encoding or large upload proxy on Vercel. */
export async function createStaffPhotoRenditions(file: File): Promise<StaffPhotoRendition[]> {
  const contentType = file.type;
  if (contentType !== "image/jpeg" && contentType !== "image/png") throw new Error("Only JPEG and PNG photos need responsive copies.");
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let release: () => void;
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    source = bitmap; width = bitmap.width; height = bitmap.height; release = () => bitmap.close();
  } else {
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The source photo could not be decoded."));
        image.src = url;
      });
    } catch (error) { URL.revokeObjectURL(url); throw error; }
    source = image; width = image.naturalWidth; height = image.naturalHeight;
    release = () => URL.revokeObjectURL(url);
  }
  try {
    if (!width || !height || width * height > 64_000_000) throw new Error("Choose a photo with no more than 64 megapixels.");
    const results: StaffPhotoRendition[] = [];
    for (const target of WIDTHS) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(target, width);
      canvas.height = Math.max(1, Math.round(height * canvas.width / width));
      const context = canvas.getContext("2d", { alpha: contentType === "image/png" });
      if (!context) throw new Error("This browser cannot prepare responsive photos.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Responsive photo encoding failed.")), contentType, 0.9);
      });
      if (blob.type !== contentType || !blob.size || blob.size > 12 * 1024 * 1024) {
        throw new Error("A responsive copy has an unsupported format or exceeds 12 MB.");
      }
      results.push({ width: target, blob, contentType });
      canvas.width = canvas.height = 1;
    }
    if (results.reduce((sum, r) => sum + r.blob.size, 0) > 24 * 1024 * 1024) {
      throw new Error("The responsive copies exceed the 24 MB combined budget. Choose a smaller source photo.");
    }
    return results;
  } finally { release(); }
}
