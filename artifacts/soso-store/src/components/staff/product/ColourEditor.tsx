import React, { useRef, useState } from "react";
import { ArrowUp, ArrowDown, Plus, Trash2, ImageUp, Loader2 } from "lucide-react";
import type { CatalogProduct } from "../../../data/platformContent";
import { StaffImagePreview } from "./StaffImagePreview";

/** Colour choices are fulfilment options. Photos are never synthesized or tinted. */
export function ColourEditor({ product, onChange, onUploadMedia }: {
  product: CatalogProduct;
  onChange: (product: CatalogProduct) => void;
  onUploadMedia: (file: File) => Promise<string>;
}) {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const productRef = useRef(product);
  productRef.current = product;
  const colours = product.colourOptions || [];
  const update = (items: typeof colours) => onChange({ ...productRef.current, colourOptions: items });
  const change = (id: string, data: Partial<(typeof colours)[number]>) =>
    update(productRef.current.colourOptions.map((colour) => colour.id === id ? { ...colour, ...data } : colour));
  const move = (index: number, direction: number) => {
    const items = [...colours];
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    update(items);
  };

  return <div className="space-y-4">
    <h5 className="border-b border-border pb-2 text-[10px] font-semibold uppercase tracking-wider text-primary">
      Colour Options & Original Photos
    </h5>
    <p className="text-xs leading-5 text-muted-foreground">
      Colours are order choices only. Use an original photograph for each colour when available.
      Photos are never automatically recoloured or masked.
    </p>
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={product.allowCustomColour ?? false}
        onChange={(event) => onChange({ ...productRef.current, allowCustomColour: event.target.checked })}
        data-testid={`input-product-allow-custom-colour-${product.slug}`}
        className="h-4 w-4 accent-primary" />
      <span className="text-xs">Allow Custom Colour</span>
    </label>
    <p className="text-xs text-muted-foreground">Custom colour requests still require atelier confirmation.</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {colours.map((colour, index) => <div key={colour.id} className="flex flex-col gap-4 border border-border p-4 sm:flex-row">
      <div className="flex flex-1 flex-col gap-3">
        <label className="text-xs">Colour Label
          <input className="staff-input mt-1 text-xs" value={colour.label}
            onChange={(event) => change(colour.id, { label: event.target.value })} />
        </label>
        <label className="text-xs">Swatch Hex Value
          <div className="mt-1 flex items-center gap-2">
            <input type="color" value={colour.hex || "#000000"} className="h-10 w-10 border border-border"
              aria-label={`Swatch colour for ${colour.label || "colour option"}`}
              onChange={(event) => change(colour.id, { hex: event.target.value })} />
            <input className="staff-input w-28 text-xs" value={colour.hex || "#000000"}
              onChange={(event) => change(colour.id, { hex: event.target.value })} />
          </div>
        </label>
        <label className="text-xs">Original Colour Photograph (Optional)
          <input className="staff-input mt-1 text-xs" value={colour.previewImageSrc || ""}
            data-testid={`input-colour-photo-${product.slug}-${colour.id}`}
            onChange={(event) => change(colour.id, { previewImageSrc: event.target.value || undefined })} />
        </label>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-xs text-primary">
          {uploadingId === colour.id ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
          Upload {colour.label || "this colour"} photo
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
            disabled={uploadingId !== null}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const slug = product.slug;
              setUploadingId(colour.id);
              setError("");
              try {
                const path = await onUploadMedia(file);
                if (productRef.current.slug === slug) change(colour.id, { previewImageSrc: path });
              } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
              finally { setUploadingId(null); }
            }} />
        </label>
        {colour.previewImageSrc && <StaffImagePreview src={colour.previewImageSrc}
          alt={`${colour.label || "Colour option"} original product photograph`}
          label="Original colour photograph" testId={`preview-colour-image-${product.slug}-${index}`} />}
         {colour.previewImageSrc && <button type="button" disabled={uploadingId === colour.id}
           onClick={() => change(colour.id, { previewImageSrc: undefined })}
           className="min-h-10 self-start text-xs text-destructive underline"
           data-testid={`button-remove-colour-photo-${product.slug}-${colour.id}`}>
           Remove {colour.label || "this colour"} photo
         </button>}
      </div>
      <div className="flex gap-2 sm:flex-col">
        <button type="button" aria-label={`Move ${colour.label || "colour"} up`} disabled={index === 0}
          onClick={() => move(index, -1)} className="border border-border p-3 disabled:opacity-30"><ArrowUp size={16} /></button>
        <button type="button" aria-label={`Move ${colour.label || "colour"} down`} disabled={index === colours.length - 1}
          onClick={() => move(index, 1)} className="border border-border p-3 disabled:opacity-30"><ArrowDown size={16} /></button>
        <button type="button" aria-label={`Remove ${colour.label || "colour"}`} disabled={colours.length <= 1 || uploadingId === colour.id}
          onClick={() => update(colours.filter((item) => item.id !== colour.id))}
          className="border border-destructive/30 p-3 text-destructive disabled:opacity-30"><Trash2 size={16} /></button>
      </div>
    </div>)}
    <button type="button" disabled={colours.length >= 16} className="inline-flex min-h-10 items-center gap-2 border border-border px-4 text-xs"
      onClick={() => update([...colours, { id: `colour-${crypto.randomUUID()}`, label: "", hex: "#000000" }])}>
      <Plus size={15} /> Add Colour Option
    </button>
  </div>;
}
