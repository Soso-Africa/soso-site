export type GarmentMaskDraft = {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  transparentPercent: number;
  opaquePercent: number;
  baseImageSrc: string;
};

function loadImage(source: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : null;
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("The image could not be opened for mask preparation."));
    };
    image.src = objectUrl ?? (source as string);
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The mask PNG could not be created.")), "image/png");
  });
}

export type GarmentMaskBrushMode = "erase" | "restore";
export type GarmentMaskBrushStroke = {
  mode: GarmentMaskBrushMode;
  radius: number;
  points: Array<{ x: number; y: number }>;
};

export async function draftFromCanvas(canvas: HTMLCanvasElement, baseImageSrc: string): Promise<GarmentMaskDraft> {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Mask preparation is not supported by this browser.");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  let transparent = 0;
  let opaque = 0;
  for (let index = 3; index < pixels.data.length; index += 4) {
    if (pixels.data[index] === 0) transparent += 1;
    if (pixels.data[index] === 255) opaque += 1;
  }
  const total = canvas.width * canvas.height;
  if (transparent / total < 0.01 || opaque / total < 0.01) {
    throw new Error("The draft needs meaningful transparent background and opaque garment coverage.");
  }
  const blob = await canvasBlob(canvas);
  return {
    blob,
    previewUrl: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
    transparentPercent: Math.round((transparent / total) * 100),
    opaquePercent: Math.round((opaque / total) * 100),
    baseImageSrc,
  };
}

export async function redrawGarmentMask(
  original: Blob,
  baseImageSrc: string,
  strokes: GarmentMaskBrushStroke[],
): Promise<GarmentMaskDraft> {
  const image = await loadImage(original);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Mask refinement is not supported by this browser.");
  context.drawImage(image, 0, 0);

  for (const stroke of strokes) {
    const first = stroke.points[0];
    if (!first) continue;
    context.save();
    context.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
    context.strokeStyle = "#ffffff";
    context.fillStyle = "#ffffff";
    context.lineWidth = stroke.radius * 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
    context.beginPath();
    context.arc(first.x, first.y, stroke.radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  return draftFromCanvas(canvas, baseImageSrc);
}

export async function prepareGarmentMask(source: string, tolerance: number): Promise<GarmentMaskDraft> {
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Mask preparation is not supported by this browser.");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const samples = [
    0,
    (canvas.width - 1) * 4,
    (canvas.width * (canvas.height - 1)) * 4,
    ((canvas.width * canvas.height) - 1) * 4,
  ];
  const background = [0, 1, 2].map((channel) => (
    samples.reduce((sum, index) => sum + pixels.data[index + channel], 0) / samples.length
  ));
  const feather = 24;
  for (let index = 0; index < pixels.data.length; index += 4) {
    const distance = Math.sqrt(
      ((pixels.data[index] - background[0]!) ** 2)
      + ((pixels.data[index + 1] - background[1]!) ** 2)
      + ((pixels.data[index + 2] - background[2]!) ** 2),
    );
    const alpha = distance <= tolerance ? 0 : distance >= tolerance + feather
      ? 255
      : Math.round(((distance - tolerance) / feather) * 255);
    pixels.data[index] = 255;
    pixels.data[index + 1] = 255;
    pixels.data[index + 2] = 255;
    pixels.data[index + 3] = alpha;
  }
  context.putImageData(pixels, 0, 0);
  return draftFromCanvas(canvas, source);
}

export async function reviewUploadedMask(file: File, baseImageSrc: string): Promise<GarmentMaskDraft> {
  if (file.type !== "image/png") throw new Error("Choose a PNG mask.");
  if (!baseImageSrc) throw new Error("Choose a base image before reviewing a mask.");
  const [image, baseImage] = await Promise.all([loadImage(file), loadImage(baseImageSrc)]);
  if (image.naturalWidth !== baseImage.naturalWidth || image.naturalHeight !== baseImage.naturalHeight) {
    throw new Error("The mask dimensions must exactly match the selected base image.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Mask review is not supported by this browser.");
  context.drawImage(image, 0, 0);
  return draftFromCanvas(canvas, baseImageSrc);
}