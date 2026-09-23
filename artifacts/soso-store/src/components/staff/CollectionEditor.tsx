import React, { useState } from "react";
import { ArrowDown, ArrowUp, ImageUp, Loader2, Plus, Trash2 } from "lucide-react";
import type { PlatformCollection } from "../../data/platformContent";
import { PlatformCopyFields } from "./PlatformCopyFields";

export async function uploadCollectionCover(
  collection: PlatformCollection,
  file: File,
  onUploadMedia: (file: File) => Promise<string>,
): Promise<PlatformCollection> {
  const src = await onUploadMedia(file);
  return {
    ...collection,
    cover: collection.cover
      ? { ...collection.cover, src }
      : { src, alt: "", provenance: { source: "", rights: "" } },
  };
}

export function removeCollectionCover(collection: PlatformCollection): PlatformCollection {
  return {
    ...collection,
    showCover: false,
    cover: undefined,
  };
}

export function CollectionEditor({
  collections,
  onChange,
  onUploadMedia,
}: {
  collections: PlatformCollection[];
  onChange: (collections: PlatformCollection[]) => void;
  onUploadMedia: (file: File) => Promise<string>;
}) {
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const update = (index: number, collection: PlatformCollection) => {
    const next = [...collections];
    next[index] = collection;
    onChange(next);
  };
  const move = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= collections.length) return;
    const next = [...collections];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    onChange(next);
  };
  const addCollection = () => {
    const suffix = Date.now().toString(36);
    onChange([...collections, {
      slug: `new-collection-${suffix}`,
      label: "New collection",
      category: "New collection",
      department: "men",
      h1: "New collection",
      intro: "",
      showCover: false,
      seo: { title: "New collection | SOSO Africa", description: "Discover this SOSO Africa collection." },
    }]);
  };

  return <div className="space-y-4">
    {collections.map((collection, index) => (
      <details key={collection.slug || index} className="border border-border bg-background p-4">
        <summary className="cursor-pointer text-sm font-semibold">{collection.label || `Collection ${index + 1}`}</summary>
        <div className="mt-3 flex flex-wrap justify-end gap-1">
          <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="flex h-8 w-8 items-center justify-center border border-border disabled:opacity-30" aria-label={`Move ${collection.label} up`}>
            <ArrowUp size={13} />
          </button>
          <button type="button" disabled={index === collections.length - 1} onClick={() => move(index, 1)} className="flex h-8 w-8 items-center justify-center border border-border disabled:opacity-30" aria-label={`Move ${collection.label} down`}>
            <ArrowDown size={13} />
          </button>
          <button
            type="button"
            disabled={collections.length <= 1}
            onClick={() => onChange(collections.filter((_, itemIndex) => itemIndex !== index))}
            className="inline-flex h-8 items-center gap-1 border border-destructive/30 px-2 text-[10px] font-semibold uppercase tracking-wider text-destructive disabled:opacity-30"
          >
            <Trash2 size={12} /> Remove collection
          </button>
        </div>
        <div className="mt-4">
          <PlatformCopyFields
            value={{
              slug: collection.slug,
              label: collection.label,
              category: collection.category,
              department: collection.department,
              h1: collection.h1,
              intro: collection.intro,
              seo: collection.seo,
            }}
            path={["collections", String(index + 1)]}
            onChange={(value) => update(index, { ...collection, ...(value as Omit<PlatformCollection, "showCover" | "cover" | "mobileCover" | "mobileCropPosition">) })}
          />
        </div>
        <div className="mt-4 border border-border bg-muted/10 p-4">
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={collection.showCover}
              onChange={(event) => update(index, { ...collection, showCover: event.target.checked })}
              data-testid={`collection-cover-visible-${collection.slug}`}
            />
            Show a cover image on this collection page
          </label>
          <p className="mt-1 text-xs text-muted-foreground">A visible cover requires an approved image, descriptive alt text, and provenance.</p>

          {collection.cover ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_1.2fr]">
              <div>
                <div className="aspect-[16/7] overflow-hidden bg-muted">
                  <img src={collection.cover.src} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="mt-2 flex gap-2">
                  <label className={`inline-flex min-h-9 cursor-pointer items-center gap-2 border border-border px-3 text-[10px] font-semibold uppercase tracking-wider text-primary ${uploadingTarget !== null ? "pointer-events-none opacity-50" : ""}`}>
                    {uploadingTarget === `${index}:desktop` ? <Loader2 size={13} className="animate-spin" /> : <ImageUp size={13} />}
                    Replace
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadingTarget !== null}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.currentTarget.value = "";
                        if (!file) return;
                        setUploadingTarget(`${index}:desktop`);
                        void uploadCollectionCover(collection, file, onUploadMedia)
                          .then((nextCollection) => update(index, nextCollection))
                          .catch((error: unknown) => alert(error instanceof Error ? error.message : "Image upload failed."))
                          .finally(() => setUploadingTarget(null));
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => update(index, removeCollectionCover(collection))}
                    className="inline-flex min-h-9 items-center gap-2 border border-destructive/30 px-3 text-[10px] font-semibold uppercase tracking-wider text-destructive"
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                </div>
              </div>
              <PlatformCopyFields
                value={collection.cover}
                path={["collections", String(index + 1), "cover"]}
                onChange={(cover) => update(index, { ...collection, cover: cover as PlatformCollection["cover"] })}
              />
            </div>
          ) : (
            <label className={`mt-4 inline-flex min-h-10 cursor-pointer items-center gap-2 border border-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary ${uploadingTarget !== null ? "pointer-events-none opacity-50" : ""}`}>
              {uploadingTarget === `${index}:desktop` ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
              {uploadingTarget === `${index}:desktop` ? "Uploading…" : "Upload cover image"}
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadingTarget !== null}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  setUploadingTarget(`${index}:desktop`);
                  void uploadCollectionCover(collection, file, onUploadMedia)
                    .then((nextCollection) => update(index, nextCollection))
                    .catch((error: unknown) => alert(error instanceof Error ? error.message : "Image upload failed."))
                    .finally(() => setUploadingTarget(null));
                }}
              />
            </label>
          )}
          {collection.cover && (
            <div className="mt-5 border-t border-border pt-5">
              <p className="text-xs font-semibold">Phone art direction</p>
              <p className="mt-1 text-xs text-muted-foreground">Choose how the desktop cover is framed on phones, or upload a separate phone cover.</p>
              <label className="mt-4 block max-w-xs text-xs font-medium">
                Phone crop position
                <select
                  value={collection.mobileCropPosition ?? "center center"}
                  onChange={(event) => update(index, {
                    ...collection,
                    mobileCropPosition: event.target.value as NonNullable<PlatformCollection["mobileCropPosition"]>,
                  })}
                  className="mt-2 min-h-10 w-full border border-border bg-background px-3"
                  data-testid={`collection-mobile-crop-${collection.slug}`}
                >
                  <option value="left top">Top left</option>
                  <option value="center top">Top center</option>
                  <option value="right top">Top right</option>
                  <option value="left center">Center left</option>
                  <option value="center center">Center</option>
                  <option value="right center">Center right</option>
                  <option value="left bottom">Bottom left</option>
                  <option value="center bottom">Bottom center</option>
                  <option value="right bottom">Bottom right</option>
                </select>
              </label>
              {collection.mobileCover ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(160px,0.5fr)_1.5fr]">
                  <div>
                    <div className="aspect-[4/5] overflow-hidden bg-muted">
                      <img
                        src={collection.mobileCover.src}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{ objectPosition: collection.mobileCropPosition ?? "center center" }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <label className={`inline-flex min-h-9 cursor-pointer items-center gap-2 border border-border px-3 text-[10px] font-semibold uppercase tracking-wider text-primary ${uploadingTarget !== null ? "pointer-events-none opacity-50" : ""}`}>
                        {uploadingTarget === `${index}:mobile` ? <Loader2 size={13} className="animate-spin" /> : <ImageUp size={13} />}
                        Replace phone cover
                        <input
                          type="file"
                          className="sr-only"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={uploadingTarget !== null}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.currentTarget.value = "";
                            if (!file) return;
                            setUploadingTarget(`${index}:mobile`);
                            void onUploadMedia(file)
                              .then((src) => update(index, { ...collection, mobileCover: { ...collection.mobileCover!, src } }))
                              .catch((error: unknown) => alert(error instanceof Error ? error.message : "Image upload failed."))
                              .finally(() => setUploadingTarget(null));
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => update(index, { ...collection, mobileCover: undefined })}
                        className="inline-flex min-h-9 items-center gap-2 border border-destructive/30 px-3 text-[10px] font-semibold uppercase tracking-wider text-destructive"
                      >
                        <Trash2 size={13} /> Remove phone cover
                      </button>
                    </div>
                  </div>
                  <PlatformCopyFields
                    value={collection.mobileCover}
                    path={["collections", String(index + 1), "mobileCover"]}
                    onChange={(mobileCover) => update(index, { ...collection, mobileCover: mobileCover as PlatformCollection["mobileCover"] })}
                  />
                </div>
              ) : (
                <label className={`mt-4 inline-flex min-h-10 cursor-pointer items-center gap-2 border border-border px-4 text-xs font-semibold uppercase tracking-wider text-primary ${uploadingTarget !== null ? "pointer-events-none opacity-50" : ""}`}>
                  {uploadingTarget === `${index}:mobile` ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
                  {uploadingTarget === `${index}:mobile` ? "Uploading…" : "Upload phone cover"}
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingTarget !== null}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.currentTarget.value = "";
                      if (!file) return;
                      setUploadingTarget(`${index}:mobile`);
                      void onUploadMedia(file)
                        .then((src) => update(index, {
                          ...collection,
                          mobileCover: { src, alt: "", provenance: { source: "", rights: "" } },
                        }))
                        .catch((error: unknown) => alert(error instanceof Error ? error.message : "Image upload failed."))
                        .finally(() => setUploadingTarget(null));
                    }}
                  />
                </label>
              )}
            </div>
          )}
        </div>
      </details>
    ))}
    <button
      type="button"
      onClick={addCollection}
      className="inline-flex min-h-9 items-center gap-2 border border-border px-3 text-[10px] font-semibold uppercase tracking-wider hover:border-primary hover:text-primary"
    >
      <Plus size={13} /> Add collection
    </button>
  </div>;
}