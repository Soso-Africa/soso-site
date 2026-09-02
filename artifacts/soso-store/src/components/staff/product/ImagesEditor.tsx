import { ArrowUp, ArrowDown, Plus, Trash2, Star, ImageUp, Loader2 } from "lucide-react";
import type { CatalogProduct } from "../../../data/platformContent";
import { useState } from "react";

type ProductImage = NonNullable<CatalogProduct["images"]>[0];

export function ImagesEditor({ product, onChange, onUploadMedia }: { product: CatalogProduct; onChange: (product: CatalogProduct) => void; onUploadMedia: (file: File) => Promise<string> }) {
  const images = product.images || [];
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const updateImages = (newImages: CatalogProduct["images"]) => {
    onChange({ ...product, images: newImages });
  };

  const moveImage = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === images.length - 1) return;
    const newIndex = direction === "up" ? index - 1 : index + 1;
    const items = [...images];
    const temp = items[index];
    items[index] = items[newIndex];
    items[newIndex] = temp;
    updateImages(items);
  };

  const updateImage = (index: number, data: Partial<ProductImage>) => {
    const items = [...images];
    const previousSrc = items[index].src;
    items[index] = { ...items[index], ...data };
    if (data.src !== undefined && product.img === previousSrc) {
      onChange({ ...product, images: items, img: data.src });
      return;
    }
    updateImages(items);
  };

  const removeImage = (index: number) => {
    if (images.length <= 1) {
      alert("Product must have at least one image.");
      return;
    }
    const removedSrc = images[index].src;
    const items = [...images];
    items.splice(index, 1);
    
    if (product.img === removedSrc && items.length > 0) {
      onChange({ ...product, images: items, img: items[0].src });
    } else {
      updateImages(items);
    }
  };

  const addImage = () => {
    updateImages([...images, { 
      src: "", 
      alt: "", 
      provenance: { source: "", rights: "" } 
    }]);
  };

  const setPrimary = (src: string) => {
    if (!src) return;
    onChange({ ...product, img: src });
  };

  return (
    <div className="space-y-4">
      <h5 className="text-[10px] font-semibold uppercase tracking-wider text-primary border-b border-border pb-2">Approved Images</h5>
      
      <div className="space-y-4">
        {images.map((img, index) => {
          const isPrimary = product.img === img.src && !!img.src;
          return (
            <div key={index} className={`flex flex-col gap-4 border p-4 bg-background sm:flex-row ${isPrimary ? "border-primary/60" : "border-border"}`} data-testid={`product-image-${product.slug}-${index}`}>
              <div className="flex flex-1 flex-col gap-3">
                <div className="flex items-end gap-3">
                  <label className="block flex-1">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Source Path (src)</span>
                    <input
                      type="text"
                      value={img.src || ""}
                      onChange={(e) => updateImage(index, { src: e.target.value })}
                      className="staff-input text-xs font-mono"
                      placeholder="e.g. /images/products/..."
                      data-testid={`input-image-src-${product.slug}-${index}`}
                    />
                  </label>
                  <label className={`flex h-[2.75rem] cursor-pointer items-center justify-center gap-2 border border-border px-3 text-[10px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-muted ${uploadingIndex === index ? "opacity-50 pointer-events-none" : ""}`}>
                    {uploadingIndex === index ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
                    {uploadingIndex === index ? "Uploading" : "Upload"}
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadingIndex !== null}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        setUploadingIndex(index);
                        onUploadMedia(file).then((path) => {
                           updateImage(index, { src: path });
                        }).catch((error) => {
                           alert(error instanceof Error ? error.message : "Image upload failed.");
                        }).finally(() => {
                           setUploadingIndex(null);
                        });
                      }}
                    />
                  </label>
                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={() => setPrimary(img.src)}
                      disabled={isPrimary || !img.src}
                      className={`flex h-[2.75rem] items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-wider border ${isPrimary ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30"}`}
                      data-testid={`button-image-primary-${product.slug}-${index}`}
                    >
                      <Star size={14} className={isPrimary ? "fill-current" : ""} />
                      {isPrimary ? "Primary" : "Set Primary"}
                    </button>
                  </div>
                </div>
                
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Alt Text</span>
                  <input
                    type="text"
                    value={img.alt || ""}
                    onChange={(e) => updateImage(index, { alt: e.target.value })}
                    className="staff-input text-xs"
                    data-testid={`input-image-alt-${product.slug}-${index}`}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3 mt-1">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Provenance: Source</span>
                    <input
                      type="text"
                      value={img.provenance?.source || ""}
                      onChange={(e) => updateImage(index, { provenance: { ...img.provenance, source: e.target.value } })}
                      className="staff-input text-xs"
                      data-testid={`input-image-prov-source-${product.slug}-${index}`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Provenance: Rights</span>
                    <input
                      type="text"
                      value={img.provenance?.rights || ""}
                      onChange={(e) => updateImage(index, { provenance: { ...img.provenance, rights: e.target.value } })}
                      className="staff-input text-xs"
                      data-testid={`input-image-prov-rights-${product.slug}-${index}`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Provenance: Credit (Optional)</span>
                    <input
                      type="text"
                      value={img.provenance?.credit || ""}
                      onChange={(e) => updateImage(index, { provenance: { ...img.provenance, credit: e.target.value || undefined } })}
                      className="staff-input text-xs"
                      data-testid={`input-image-prov-credit-${product.slug}-${index}`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Provenance: Source URL (Optional)</span>
                    <input
                      type="text"
                      value={img.provenance?.sourceUrl || ""}
                      onChange={(e) => updateImage(index, { provenance: { ...img.provenance, sourceUrl: e.target.value || undefined } })}
                      className="staff-input text-xs font-mono"
                      data-testid={`input-image-prov-url-${product.slug}-${index}`}
                    />
                  </label>
                </div>
              </div>
              
              <div className="flex flex-row sm:flex-col gap-2 pt-5 sm:pt-0">
                <button
                  type="button"
                  onClick={() => moveImage(index, "up")}
                  disabled={index === 0}
                  className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted-foreground"
                  title="Move Up"
                  data-testid={`button-image-up-${product.slug}-${index}`}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(index, "down")}
                  disabled={index === images.length - 1}
                  className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted-foreground"
                  title="Move Down"
                  data-testid={`button-image-down-${product.slug}-${index}`}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  disabled={images.length <= 1}
                  className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-30"
                  title="Remove"
                  data-testid={`button-image-remove-${product.slug}-${index}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
        
        <button
          type="button"
          onClick={addImage}
          className="inline-flex min-h-10 items-center gap-2 border border-border px-4 text-xs font-semibold uppercase tracking-wider hover:border-primary hover:text-primary"
          data-testid={`button-image-add-${product.slug}`}
        >
          <Plus size={15} /> Add Image
        </button>
      </div>
    </div>
  );
}
