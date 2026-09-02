import { ArrowUp, ArrowDown, Plus, Trash2, ImageUp, Loader2, WandSparkles, Check, X, Undo2, RotateCcw, Eraser, Paintbrush } from "lucide-react";
import type { CatalogProduct } from "../../../data/platformContent";
import { useEffect, useRef, useState } from "react";
import {
  prepareGarmentMask,
  redrawGarmentMask,
  reviewUploadedMask,
  type GarmentMaskBrushMode,
  type GarmentMaskBrushStroke,
  type GarmentMaskDraft,
} from "./garment-mask";

export function ColourEditor({
  product,
  onChange,
  onUploadMedia,
}: {
  product: CatalogProduct;
  onChange: (product: CatalogProduct) => void;
  onUploadMedia: (file: File) => Promise<string>;
}) {
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [maskDraft, setMaskDraft] = useState<GarmentMaskDraft | null>(null);
  const [maskTolerance, setMaskTolerance] = useState(42);
  const [brushMode, setBrushMode] = useState<GarmentMaskBrushMode>("erase");
  const [brushSize, setBrushSize] = useState(24);
  const [maskStrokes, setMaskStrokes] = useState<GarmentMaskBrushStroke[]>([]);
  const [maskRefinementPending, setMaskRefinementPending] = useState(false);
  const [maskEditInvalid, setMaskEditInvalid] = useState(false);
  const [maskError, setMaskError] = useState("");
  const productRef = useRef(product);
  const preparationSequence = useRef(0);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalMaskBlobRef = useRef<Blob | null>(null);
  const activeStrokeRef = useRef<GarmentMaskBrushStroke | null>(null);
  const maskStrokesRef = useRef<GarmentMaskBrushStroke[]>([]);
  const maskRefinementPendingRef = useRef(false);
  const maskEditSequence = useRef(0);
  const canvasHydrationSequence = useRef(0);
  const skipNextCanvasHydrationRef = useRef(false);

  const colourOptions = product.colourOptions || [];
  const colourVisualizer = product.colourVisualizer;
  productRef.current = product;

  useEffect(() => () => {
    if (maskDraft) URL.revokeObjectURL(maskDraft.previewUrl);
  }, [maskDraft]);

  const replaceMaskDraft = (draft: GarmentMaskDraft | null) => {
    maskEditSequence.current += 1;
    canvasHydrationSequence.current += 1;
    originalMaskBlobRef.current = draft?.blob ?? null;
    maskStrokesRef.current = [];
    maskRefinementPendingRef.current = draft !== null;
    setMaskStrokes([]);
    setMaskRefinementPending(draft !== null);
    setMaskEditInvalid(false);
    setMaskDraft((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return draft;
    });
  };

  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !maskDraft) return;
    if (skipNextCanvasHydrationRef.current) {
      skipNextCanvasHydrationRef.current = false;
      return;
    }
    const sequence = ++canvasHydrationSequence.current;
    maskRefinementPendingRef.current = true;
    setMaskRefinementPending(true);
    const image = new Image();
    image.onload = () => {
      if (sequence !== canvasHydrationSequence.current) return;
      canvas.width = maskDraft.width;
      canvas.height = maskDraft.height;
      canvas.getContext("2d", { willReadFrequently: true })?.drawImage(image, 0, 0);
      maskRefinementPendingRef.current = false;
      setMaskRefinementPending(false);
    };
    image.onerror = () => {
      if (sequence !== canvasHydrationSequence.current) return;
      setMaskEditInvalid(true);
      setMaskError("The local mask preview could not be drawn safely.");
      maskRefinementPendingRef.current = false;
      setMaskRefinementPending(false);
    };
    image.src = maskDraft.previewUrl;
    return () => {
      canvasHydrationSequence.current += 1;
      image.onload = null;
      image.onerror = null;
      image.src = "";
    };
  }, [maskDraft]);

  const paintDraftOnCanvas = (draft: GarmentMaskDraft, sequence: number) => new Promise<void>((resolve, reject) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) {
      reject(new Error("The local mask preview is unavailable."));
      return;
    }
    const hydrationSequence = ++canvasHydrationSequence.current;
    const image = new Image();
    image.onload = () => {
      if (sequence !== maskEditSequence.current || hydrationSequence !== canvasHydrationSequence.current) {
        resolve();
        return;
      }
      canvas.width = draft.width;
      canvas.height = draft.height;
      canvas.getContext("2d", { willReadFrequently: true })?.drawImage(image, 0, 0);
      resolve();
    };
    image.onerror = () => reject(new Error("The local mask preview could not be drawn safely."));
    image.src = draft.previewUrl;
  });

  const pointOnMask = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  };

  const drawStrokeSegment = (canvas: HTMLCanvasElement, stroke: GarmentMaskBrushStroke) => {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const current = stroke.points.at(-1);
    if (!context || !current) return;
    const previous = stroke.points.at(-2) ?? current;
    context.save();
    context.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
    context.strokeStyle = "#ffffff";
    context.fillStyle = "#ffffff";
    context.lineWidth = stroke.radius * 2;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(current.x, current.y);
    context.stroke();
    context.beginPath();
    context.arc(current.x, current.y, stroke.radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  const commitCanvasDraft = async (strokes: GarmentMaskBrushStroke[]) => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !maskDraft) return;
    const sequence = ++maskEditSequence.current;
    maskRefinementPendingRef.current = true;
    setMaskRefinementPending(true);
    setMaskError("");
    try {
      const original = originalMaskBlobRef.current;
      if (!original) throw new Error("The original local mask draft is unavailable.");
      const next = await redrawGarmentMask(original, maskDraft.baseImageSrc, strokes);
      if (sequence !== maskEditSequence.current) {
        URL.revokeObjectURL(next.previewUrl);
        return;
      }
      skipNextCanvasHydrationRef.current = true;
      setMaskDraft((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return next;
      });
      maskStrokesRef.current = strokes;
      setMaskStrokes(strokes);
      setMaskEditInvalid(false);
    } catch (error) {
      if (sequence !== maskEditSequence.current) return;
      setMaskEditInvalid(true);
      setMaskError(error instanceof Error ? error.message : "The refined mask is not safe to approve.");
      const original = originalMaskBlobRef.current;
      if (original) {
        const restored = await redrawGarmentMask(original, maskDraft.baseImageSrc, maskStrokesRef.current);
        if (sequence !== maskEditSequence.current) {
          URL.revokeObjectURL(restored.previewUrl);
          return;
        }
        await paintDraftOnCanvas(restored, sequence);
        skipNextCanvasHydrationRef.current = true;
        setMaskDraft((current) => {
          if (current) URL.revokeObjectURL(current.previewUrl);
          return restored;
        });
        setMaskEditInvalid(false);
      }
    } finally {
      if (sequence === maskEditSequence.current) {
        maskRefinementPendingRef.current = false;
        setMaskRefinementPending(false);
      }
    }
  };

  const rebuildMask = async (strokes: GarmentMaskBrushStroke[]) => {
    const original = originalMaskBlobRef.current;
    if (!original || !maskDraft) return;
    const sequence = ++maskEditSequence.current;
    maskRefinementPendingRef.current = true;
    setMaskRefinementPending(true);
    setMaskError("");
    try {
      const next = await redrawGarmentMask(original, maskDraft.baseImageSrc, strokes);
      if (sequence !== maskEditSequence.current) {
        URL.revokeObjectURL(next.previewUrl);
        return;
      }
      await paintDraftOnCanvas(next, sequence);
      skipNextCanvasHydrationRef.current = true;
      setMaskDraft((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return next;
      });
      maskStrokesRef.current = strokes;
      setMaskStrokes(strokes);
      setMaskEditInvalid(false);
    } catch (error) {
      if (sequence !== maskEditSequence.current) return;
      setMaskEditInvalid(true);
      setMaskError(error instanceof Error ? error.message : "The refined mask is not safe to approve.");
    } finally {
      if (sequence === maskEditSequence.current) {
        maskRefinementPendingRef.current = false;
        setMaskRefinementPending(false);
      }
    }
  };

  const createDraft = async () => {
    const baseImageSrc = colourVisualizer?.baseImageSrc;
    if (!baseImageSrc) return;
    const sequence = ++preparationSequence.current;
    setUploadingField("prepare-mask");
    setMaskError("");
    try {
      const draft = await prepareGarmentMask(baseImageSrc, maskTolerance);
      if (sequence !== preparationSequence.current || productRef.current.colourVisualizer?.baseImageSrc !== baseImageSrc) {
        URL.revokeObjectURL(draft.previewUrl);
        return;
      }
      replaceMaskDraft(draft);
    } catch (error) {
      setMaskError(error instanceof Error ? error.message : "The mask draft could not be prepared.");
    } finally {
      setUploadingField(null);
    }
  };

  const approveDraft = async () => {
    if (!maskDraft || maskRefinementPendingRef.current) return;
    const approvedDraft = maskDraft;
    setUploadingField("approve-mask");
    setMaskError("");
    try {
      const path = await onUploadMedia(new File([approvedDraft.blob], `${product.slug}-garment-mask.png`, { type: "image/png" }));
      const latestProduct = productRef.current;
      if (latestProduct.colourVisualizer?.baseImageSrc !== approvedDraft.baseImageSrc) {
        throw new Error("The base image changed during approval. Review a new mask before using it.");
      }
      onChange({
        ...latestProduct,
        colourVisualizer: { baseImageSrc: approvedDraft.baseImageSrc, garmentMaskSrc: path },
      });
      replaceMaskDraft(null);
    } catch (error) {
      setMaskError(error instanceof Error ? error.message : "The approved mask could not be uploaded.");
    } finally {
      setUploadingField(null);
    }
  };

  const updateColours = (newColours: typeof colourOptions) => {
    onChange({ ...product, colourOptions: newColours });
  };

  const handleUpload = async (file: File, callback: (path: string) => void, fieldName: string) => {
    setUploadingField(fieldName);
    try {
      const path = await onUploadMedia(file);
      callback(path);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingField(null);
    }
  };

  const moveColour = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === colourOptions.length - 1) return;
    const newIndex = direction === "up" ? index - 1 : index + 1;
    const items = [...colourOptions];
    const temp = items[index];
    items[index] = items[newIndex];
    items[newIndex] = temp;
    updateColours(items);
  };

  const addColour = () => {
    updateColours([
      ...colourOptions,
      {
        id: Math.random().toString(36).substring(2, 9),
        label: "",
        hex: "#000000",
      },
    ]);
  };

  const removeColour = (index: number) => {
    const items = [...colourOptions];
    items.splice(index, 1);
    updateColours(items);
  };

  const updateColour = (index: number, data: Partial<typeof colourOptions[0]>) => {
    const items = [...colourOptions];
    items[index] = { ...items[index], ...data };
    updateColours(items);
  };

  return (
    <div className="space-y-4">
      <h5 className="text-[10px] font-semibold uppercase tracking-wider text-primary border-b border-border pb-2">
        Colour Options & Visualizer
      </h5>

      <div className="border border-border bg-background p-4 space-y-4">
        <label className="flex items-center gap-2 cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={product.allowCustomColour ?? false}
            onChange={(e) => onChange({ ...product, allowCustomColour: e.target.checked })}
            className="h-4 w-4 rounded-sm border-border bg-background text-primary accent-primary"
            data-testid={`input-product-allow-custom-colour-${product.slug}`}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Allow Custom Colour</span>
        </label>
        <p className="text-[10px] text-muted-foreground italic">
          When enabled, shoppers can type a custom colour request which requires atelier confirmation.
        </p>
      </div>

      <div className="space-y-4">
        {colourOptions.map((colour, index) => (
          <div key={colour.id} className="flex flex-col gap-4 border border-border p-4 bg-background sm:flex-row">
            <div className="flex flex-1 flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Colour Label
                  </span>
                  <input
                    type="text"
                    value={colour.label}
                    onChange={(e) => updateColour(index, { label: e.target.value })}
                    className="staff-input text-xs"
                    placeholder="e.g. Emerald Green"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Hex Value
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={colour.hex || "#000000"}
                      onChange={(e) => updateColour(index, { hex: e.target.value })}
                      className="h-10 w-10 border border-border cursor-pointer p-1 bg-transparent"
                    />
                    <input
                      type="text"
                      value={colour.hex || "#000000"}
                      onChange={(e) => updateColour(index, { hex: e.target.value })}
                      className="staff-input text-xs font-mono w-24"
                    />
                  </div>
                </label>
              </div>

              <div className="flex items-end gap-3 mt-1">
                <label className="block flex-1">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Colour-Specific Preview Image (Optional)
                  </span>
                  <input
                    type="text"
                    value={colour.previewImageSrc || ""}
                    onChange={(e) => updateColour(index, { previewImageSrc: e.target.value || undefined })}
                    className="staff-input text-xs font-mono"
                    placeholder="e.g. /images/products/green-front.jpg"
                  />
                </label>
                <label
                  className={`flex h-[2.75rem] cursor-pointer items-center justify-center gap-2 border border-border px-3 text-[10px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-muted ${
                    uploadingField === `colour-preview-${index}` ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  {uploadingField === `colour-preview-${index}` ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
                  Upload
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingField !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) handleUpload(file, (path) => updateColour(index, { previewImageSrc: path }), `colour-preview-${index}`);
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-row sm:flex-col gap-2 pt-5 sm:pt-0">
              <button
                type="button"
                onClick={() => moveColour(index, "up")}
                disabled={index === 0}
                className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30"
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                onClick={() => moveColour(index, "down")}
                disabled={index === colourOptions.length - 1}
                className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30"
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                onClick={() => removeColour(index)}
                className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addColour}
          className="inline-flex min-h-10 items-center gap-2 border border-border px-4 text-xs font-semibold uppercase tracking-wider hover:border-primary hover:text-primary"
        >
          <Plus size={15} /> Add Colour Option
        </button>
      </div>

      <div className="border border-border bg-background p-4 mt-6">
        <h6 className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-3">Mask Visualizer</h6>
        <p className="text-[10px] text-muted-foreground mb-4">
          Provide a base image and a transparent mask of the garment to tint the photo on the fly. Used as a fallback if a colour-specific preview image is not set.
        </p>
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <label className="block flex-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Base Image Src</span>
              <input
                type="text"
                disabled={uploadingField !== null}
                value={colourVisualizer?.baseImageSrc || ""}
                onChange={(e) => {
                  preparationSequence.current += 1;
                  replaceMaskDraft(null);
                  onChange({
                    ...product,
                    colourVisualizer: {
                      baseImageSrc: e.target.value,
                      garmentMaskSrc: "",
                    },
                  })
                }}
                className="staff-input text-xs font-mono"
                 data-testid={`input-mask-base-${product.slug}`}
              />
            </label>
            <label
              className={`flex h-[2.75rem] cursor-pointer items-center justify-center gap-2 border border-border px-3 text-[10px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-muted ${
                uploadingField === "base-image" ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {uploadingField === "base-image" ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
              Upload
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadingField !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) {
                    handleUpload(
                      file,
                      (path) => {
                        preparationSequence.current += 1;
                        replaceMaskDraft(null);
                        onChange({
                          ...product,
                          colourVisualizer: { baseImageSrc: path, garmentMaskSrc: "" },
                        });
                      },
                      "base-image"
                    );
                  }
                }}
              />
            </label>
          </div>

          <div className="border border-border bg-muted/20 p-4 space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Staff-assisted mask preparation</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Prepare a transparent draft from the base photo, inspect it on the checkerboard, then approve it. Drafts never reach shoppers automatically.
              </p>
            </div>
            <label className="block">
              <span className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Background tolerance <span>{maskTolerance}</span>
              </span>
              <input type="range" min="5" max="140" value={maskTolerance} onChange={(event) => setMaskTolerance(Number(event.target.value))} className="w-full accent-primary" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void createDraft()} disabled={!colourVisualizer?.baseImageSrc || uploadingField !== null} className="inline-flex min-h-10 items-center gap-2 border border-primary px-4 text-[10px] font-semibold uppercase tracking-wider text-primary disabled:opacity-40" data-testid={`button-mask-prepare-${product.slug}`}>
                {uploadingField === "prepare-mask" ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />}
                {maskDraft ? "Regenerate draft" : "Prepare draft"}
              </button>
            <label
                className={`inline-flex min-h-10 cursor-pointer items-center gap-2 border border-border px-4 text-[10px] font-semibold uppercase tracking-wider hover:border-primary ${uploadingField !== null ? "pointer-events-none opacity-40" : ""}`}
            >
                <ImageUp size={14} /> Review existing PNG
              <input
                type="file"
                className="sr-only"
                accept="image/png"
                disabled={uploadingField !== null}
                 data-testid={`input-mask-review-${product.slug}`}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                  if (file) {
                      setMaskError("");
                      const baseImageSrc = colourVisualizer?.baseImageSrc || "";
                      const sequence = ++preparationSequence.current;
                      void reviewUploadedMask(file, baseImageSrc).then((draft) => {
                        if (sequence !== preparationSequence.current || productRef.current.colourVisualizer?.baseImageSrc !== baseImageSrc) {
                          URL.revokeObjectURL(draft.previewUrl);
                          return;
                        }
                        replaceMaskDraft(draft);
                      }).catch((error: unknown) => {
                        setMaskError(error instanceof Error ? error.message : "The PNG could not be reviewed.");
                      });
                  }
                }}
              />
            </label>
            </div>
            {maskError && <p role="alert" className="text-xs text-destructive" data-testid={`mask-error-${product.slug}`}>{maskError}</p>}
            {maskDraft && <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_1fr]" data-testid={`mask-draft-${product.slug}`}>
               <div className="border border-border p-2" style={{ backgroundImage: "linear-gradient(45deg,#ddd 25%,transparent 25%),linear-gradient(-45deg,#ddd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd 75%),linear-gradient(-45deg,transparent 75%,#ddd 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,0 8px,8px -8px,-8px 0" }}>
                 <canvas
                   ref={maskCanvasRef}
                   aria-label="Editable draft garment mask"
                   className="block h-auto w-full cursor-crosshair touch-none"
                   onPointerDown={(event) => {
                     if (maskRefinementPendingRef.current || uploadingField !== null) return;
                     event.currentTarget.setPointerCapture(event.pointerId);
                     const stroke = { mode: brushMode, radius: brushSize, points: [pointOnMask(event)] };
                     activeStrokeRef.current = stroke;
                     drawStrokeSegment(event.currentTarget, stroke);
                   }}
                   onPointerMove={(event) => {
                     const stroke = activeStrokeRef.current;
                     if (!stroke || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                     stroke.points.push(pointOnMask(event));
                     drawStrokeSegment(event.currentTarget, stroke);
                   }}
                   onPointerUp={(event) => {
                     const stroke = activeStrokeRef.current;
                     if (!stroke) return;
                     activeStrokeRef.current = null;
                     event.currentTarget.releasePointerCapture(event.pointerId);
                     void commitCanvasDraft([...maskStrokesRef.current, stroke]);
                   }}
                   onPointerCancel={() => {
                     activeStrokeRef.current = null;
                     void rebuildMask(maskStrokesRef.current);
                   }}
                 />
              </div>
              <div className="space-y-3 text-xs">
                <p><strong>{maskDraft.width} × {maskDraft.height}px</strong><br /><span className="text-muted-foreground">{maskDraft.transparentPercent}% transparent · {maskDraft.opaquePercent}% opaque</span></p>
                <p className="text-muted-foreground">Approve only when the garment is solid white, the surrounding photo is transparent, and the edges follow the garment.</p>
                 <div className="space-y-2 border-y border-border py-3">
                   <div className="flex flex-wrap gap-2">
                     <button type="button" disabled={maskRefinementPending || uploadingField !== null} aria-pressed={brushMode === "erase"} onClick={() => setBrushMode("erase")} className={`inline-flex min-h-9 items-center gap-2 border px-3 text-[10px] font-semibold uppercase tracking-wider disabled:opacity-40 ${brushMode === "erase" ? "border-primary text-primary" : "border-border"}`}>
                       <Eraser size={13} /> Erase
                     </button>
                     <button type="button" disabled={maskRefinementPending || uploadingField !== null} aria-pressed={brushMode === "restore"} onClick={() => setBrushMode("restore")} className={`inline-flex min-h-9 items-center gap-2 border px-3 text-[10px] font-semibold uppercase tracking-wider disabled:opacity-40 ${brushMode === "restore" ? "border-primary text-primary" : "border-border"}`}>
                       <Paintbrush size={13} /> Restore
                     </button>
                   </div>
                   <label className="block">
                     <span className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Brush size <span>{brushSize}px</span></span>
                     <input type="range" min="3" max="100" disabled={maskRefinementPending || uploadingField !== null} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="w-full accent-primary disabled:opacity-40" />
                   </label>
                   <div className="flex flex-wrap gap-2">
                     <button type="button" onClick={() => void rebuildMask(maskStrokesRef.current.slice(0, -1))} disabled={maskStrokes.length === 0 || maskRefinementPending || uploadingField !== null} className="inline-flex min-h-9 items-center gap-2 border border-border px-3 text-[10px] font-semibold uppercase tracking-wider disabled:opacity-40">
                       <Undo2 size={13} /> Undo
                     </button>
                     <button type="button" onClick={() => void rebuildMask([])} disabled={maskStrokes.length === 0 || maskRefinementPending || uploadingField !== null} className="inline-flex min-h-9 items-center gap-2 border border-border px-3 text-[10px] font-semibold uppercase tracking-wider disabled:opacity-40">
                       <RotateCcw size={13} /> Reset
                     </button>
                   </div>
                   <p className="text-[10px] text-muted-foreground">Edits stay in this local draft until you explicitly approve and upload it.</p>
                   {maskRefinementPending && <p role="status" className="text-[10px] font-semibold uppercase tracking-wider text-primary">Saving local refinement…</p>}
                 </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void approveDraft()} disabled={uploadingField !== null || maskRefinementPending || maskEditInvalid} className="inline-flex min-h-10 items-center gap-2 bg-primary px-4 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-40" data-testid={`button-mask-approve-${product.slug}`}>
                    {uploadingField === "approve-mask" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve & use mask
                  </button>
                  <button type="button" onClick={() => replaceMaskDraft(null)} disabled={uploadingField !== null} className="inline-flex min-h-10 items-center gap-2 border border-border px-4 text-[10px] font-semibold uppercase tracking-wider" data-testid={`button-mask-discard-${product.slug}`}>
                    <X size={14} /> Discard draft
                  </button>
                </div>
              </div>
            </div>}
            <div className="border-t border-border pt-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Approved garment mask</span>
              <code className="mt-1 block overflow-x-auto text-[10px]" data-testid={`mask-approved-path-${product.slug}`}>{colourVisualizer?.garmentMaskSrc || "None — live recolouring remains off"}</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
