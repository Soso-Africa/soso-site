import { ArrowUp, ArrowDown, Plus, Trash2, ImageUp, Loader2 } from "lucide-react";
import type { CatalogProduct } from "../../../data/platformContent";
import { useState } from "react";

type ProductImage = NonNullable<CatalogProduct["images"]>[0];
type MaterialTurnSet = NonNullable<CatalogProduct["materialTurnSets"]>[0];

export function MaterialTurnSetsEditor({ product, onChange, onUploadMedia }: { product: CatalogProduct; onChange: (product: CatalogProduct) => void; onUploadMedia: (file: File) => Promise<string> }) {
  const sets = product.materialTurnSets || [];
  const [uploadingState, setUploadingState] = useState<{ index: number; view: "front" | "back" } | null>(null);

  const updateSets = (newSets: MaterialTurnSet[]) => {
    onChange({ ...product, materialTurnSets: newSets });
  };

  const addSet = () => {
    if (sets.length >= 8) {
      alert("Maximum 8 material turn sets allowed.");
      return;
    }
    const emptyImage = { src: "", alt: "", provenance: { source: "", rights: "" } };
    const id = `set-${Math.random().toString(36).slice(2, 9)}`;
    updateSets([...sets, { id, label: "", front: { ...emptyImage }, back: { ...emptyImage } }]);
  };

  const removeSet = (index: number) => {
    const items = [...sets];
    items.splice(index, 1);
    updateSets(items);
  };

  const moveSet = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === sets.length - 1) return;
    const newIndex = direction === "up" ? index - 1 : index + 1;
    const items = [...sets];
    const temp = items[index];
    items[index] = items[newIndex];
    items[newIndex] = temp;
    updateSets(items);
  };

  const updateSet = (index: number, data: Partial<MaterialTurnSet>) => {
    const items = [...sets];
    items[index] = { ...items[index], ...data };
    updateSets(items);
  };

  const updateSetImage = (index: number, view: "front" | "back", data: Partial<ProductImage>) => {
    const items = [...sets];
    items[index] = {
      ...items[index],
      [view]: { ...items[index][view], ...data }
    };
    updateSets(items);
  };

  const renderImageEditor = (index: number, view: "front" | "back", img: ProductImage) => {
    const isUploading = uploadingState?.index === index && uploadingState?.view === view;
    return (
      <div className="flex flex-col gap-3 border border-border/50 p-3 bg-muted/5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">{view} View</span>
        </div>
        
        <div className="flex items-end gap-3">
          <label className="block flex-1">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Source Path</span>
            <input
              type="text"
              value={img.src || ""}
              onChange={(e) => updateSetImage(index, view, { src: e.target.value })}
              className="staff-input text-xs font-mono"
              placeholder="e.g. /images/materials/..."
              data-testid={`input-material-${view}-src-${product.slug}-${index}`}
            />
          </label>
          <label className={`flex h-[2.75rem] cursor-pointer items-center justify-center gap-2 border border-border px-3 text-[10px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-muted ${isUploading ? "opacity-50 pointer-events-none" : ""}`}>
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
            {isUploading ? "Uploading" : "Upload"}
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp"
              disabled={isUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setUploadingState({ index, view });
                onUploadMedia(file).then((path) => {
                   updateSetImage(index, view, { src: path });
                }).catch((error) => {
                   alert(error instanceof Error ? error.message : "Image upload failed.");
                }).finally(() => {
                   setUploadingState(null);
                });
              }}
            />
          </label>
        </div>
        
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Alt Text</span>
          <input
            type="text"
            value={img.alt || ""}
            onChange={(e) => updateSetImage(index, view, { alt: e.target.value })}
            className="staff-input text-xs"
            data-testid={`input-material-${view}-alt-${product.slug}-${index}`}
          />
        </label>
        
        <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3 mt-1">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Provenance: Source</span>
            <input
              type="text"
              value={img.provenance?.source || ""}
              onChange={(e) => updateSetImage(index, view, { provenance: { ...img.provenance, source: e.target.value } })}
              className="staff-input text-xs"
              data-testid={`input-material-${view}-prov-source-${product.slug}-${index}`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Provenance: Rights</span>
            <input
              type="text"
              value={img.provenance?.rights || ""}
              onChange={(e) => updateSetImage(index, view, { provenance: { ...img.provenance, rights: e.target.value } })}
              className="staff-input text-xs"
              data-testid={`input-material-${view}-prov-rights-${product.slug}-${index}`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Credit (Opt)</span>
            <input
              type="text"
              value={img.provenance?.credit || ""}
              onChange={(e) => updateSetImage(index, view, { provenance: { ...img.provenance, credit: e.target.value || undefined } })}
              className="staff-input text-xs"
              data-testid={`input-material-${view}-prov-credit-${product.slug}-${index}`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Source URL (Opt)</span>
            <input
              type="text"
              value={img.provenance?.sourceUrl || ""}
              onChange={(e) => updateSetImage(index, view, { provenance: { ...img.provenance, sourceUrl: e.target.value || undefined } })}
              className="staff-input text-xs font-mono"
              data-testid={`input-material-${view}-prov-url-${product.slug}-${index}`}
            />
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h5 className="text-[10px] font-semibold uppercase tracking-wider text-primary">Material Turn Sets (Front & Back)</h5>
        <span className="text-[10px] text-muted-foreground">{sets.length} / 8</span>
      </div>
      
      {sets.length === 0 && (
        <p className="text-xs text-muted-foreground italic bg-muted/20 p-4 border border-border/50">
          No material turn sets defined. The standard flat gallery will be used.
        </p>
      )}
      
      <div className="space-y-6">
        {sets.map((set, index) => (
          <div key={set.id} className="flex flex-col gap-4 border border-border p-4 bg-background" data-testid={`material-set-${product.slug}-${index}`}>
            <div className="flex items-end gap-4 border-b border-border/50 pb-4">
              <label className="block flex-1">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Material Label</span>
                <input
                  type="text"
                  value={set.label || ""}
                  onChange={(e) => updateSet(index, { label: e.target.value })}
                  className="staff-input text-xs"
                  placeholder="e.g. Heavy Cotton, Silk..."
                  data-testid={`input-material-label-${product.slug}-${index}`}
                />
              </label>
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => moveSet(index, "up")}
                  disabled={index === 0}
                  className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30"
                  title="Move Up"
                  data-testid={`button-material-up-${product.slug}-${index}`}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => moveSet(index, "down")}
                  disabled={index === sets.length - 1}
                  className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30"
                  title="Move Down"
                  data-testid={`button-material-down-${product.slug}-${index}`}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => removeSet(index)}
                  className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10"
                  title="Remove"
                  data-testid={`button-material-remove-${product.slug}-${index}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-4">
              {renderImageEditor(index, "front", set.front)}
              {renderImageEditor(index, "back", set.back)}
            </div>
          </div>
        ))}
        
        {sets.length < 8 && (
          <button
            type="button"
            onClick={addSet}
            className="inline-flex min-h-10 items-center gap-2 border border-border px-4 text-xs font-semibold uppercase tracking-wider hover:border-primary hover:text-primary"
            data-testid={`button-material-add-${product.slug}`}
          >
            <Plus size={15} /> Add Turn Set
          </button>
        )}
      </div>
    </div>
  );
}
