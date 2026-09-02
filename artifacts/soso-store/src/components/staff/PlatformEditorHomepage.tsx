import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, AlertCircle, ImageUp, Star, Trash2 } from "lucide-react";
import type { CatalogProduct, PlatformContent } from "../../data/platformContent";

type Homepage = PlatformContent["homepage"];

const inputClass = "staff-input mt-1";
const labelClass = "block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className={labelClass}>{label}<input className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function MoveButtons({ index, length, move }: { index: number; length: number; move: (from: number, to: number) => void }) {
  return <div className="flex gap-1">
    <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(index, index - 1)} className="border border-border p-2 disabled:opacity-30"><ArrowUp size={14} /></button>
    <button type="button" aria-label="Move down" disabled={index === length - 1} onClick={() => move(index, index + 1)} className="border border-border p-2 disabled:opacity-30"><ArrowDown size={14} /></button>
  </div>;
}

export function PlatformEditorHomepage({
  data,
  products,
  allowedTargets,
  onChange,
  onUploadMedia,
}: {
  data: Homepage;
  products: Pick<CatalogProduct, "slug" | "name">[];
  allowedTargets: string[];
  onChange: (data: Homepage) => void;
  onUploadMedia: (file: File) => Promise<string>;
}) {
  const [uploadingCategory, setUploadingCategory] = useState<number | null>(null);
  const [mediaStatus, setMediaStatus] = useState("");
  const update = <K extends keyof Homepage>(key: K, value: Homepage[K]) => onChange({ ...data, [key]: value });
  const move = <T,>(items: T[], from: number, to: number, commit: (next: T[]) => void) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    commit(next);
  };
  const issues = useMemo(() => {
    const result: string[] = [];
    const productSlugs = new Set(products.map((product) => product.slug));
    if (data.categories.items.length !== 5) result.push("Categories must contain exactly 5 ordered tiles.");
    if (new Set(data.categories.items.map((item) => item.href)).size !== data.categories.items.length) result.push("Category links must be unique.");
    if (!productSlugs.has(data.newArrival.productSlug)) result.push("Choose a published product for New arrival.");
    if (data.featured.productSlugs.length !== 4) result.push("Featured must contain exactly 4 products.");
    if (!data.featured.legacySparseCompatibility && new Set(data.featured.productSlugs).size !== data.featured.productSlugs.length) result.push("Featured products must be unique.");
    if (data.featured.productSlugs.some((slug) => !productSlugs.has(slug))) result.push("Featured contains an unknown product.");
    if (data.occasions.items.length !== 2) result.push("Occasions must contain exactly 2 panels.");
    const imagePaths = [
      data.hero.imageUrl, data.hero.mobileImageUrl, data.fit.imageUrl, data.newArrival.editorial.imageUrl,
      ...data.categories.items.flatMap((item) => [item.imageUrl, ...(item.imageUrls || [])]), ...data.occasions.items.map((item) => item.imageUrl),
    ];
    if (imagePaths.some((path) => !/^\/(?!\/).+\.(?:jpe?g|png|webp|gif)$/i.test(path))) result.push("Homepage images must use local JPEG, PNG, WebP, or GIF paths.");
    if ([data.hero.imageUrl, data.hero.mobileImageUrl].some((path) => !/^\/(?!\/).+\.(?:jpe?g|png|webp)$/i.test(path))) result.push("Hero poster images must be local static JPEG, PNG, or WebP paths.");
    if (data.hero.mediaMode === "video" && (![data.hero.videoUrl, data.hero.mobileVideoUrl].every((path) => /^\/(?!\/).+\.(?:mp4|webm)$/i.test(path ?? "")))) result.push("Video heroes require local MP4 or WebM desktop and mobile paths.");
    if (data.hero.mediaMode === "image" && (data.hero.videoUrl || data.hero.mobileVideoUrl)) result.push("Image heroes cannot include video paths.");
    const links = [
      data.newArrival.link.href, data.newArrival.editorial.link.href, data.featured.link.href,
      ...data.categories.items.map((item) => item.href), ...data.occasions.items.map((item) => item.href),
    ];
    if (links.some((href) => !href.startsWith("https://") && !allowedTargets.includes(href) && !href.startsWith("/shop?"))) result.push("Links must be HTTPS URLs or known storefront product, collection, or content paths.");
    if (data.categories.items.some((item) => !item.imageAlt.trim()) || !data.newArrival.editorial.imageAlt.trim() || data.occasions.items.some((item) => !item.imageAlt.trim())) result.push("Every merchandising image needs descriptive alt text.");
    return result;
  }, [allowedTargets, data, products]);

  return <div className="mt-5 space-y-5" data-testid="homepage-structured-editor">
    <div className={`border p-4 text-sm ${issues.length ? "border-destructive/50 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
      <p className="flex items-center gap-2 font-semibold"><AlertCircle size={15} /> Publication check</p>
      {issues.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p className="mt-2 text-muted-foreground">Homepage merchandising has the required selections, order, links, and image descriptions.</p>}
    </div>

    <details className="border border-border p-4" open>
      <summary className="cursor-pointer font-semibold">SEO and hero</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="SEO title" value={data.seo.title} onChange={(title) => update("seo", { ...data.seo, title })} />
        <Field label="SEO description" value={data.seo.description} onChange={(description) => update("seo", { ...data.seo, description })} />
        {(["eyebrow", "title", "accent", "suffix", "description", "imageUrl", "mobileImageUrl", "imageAlt", "playLabel", "pauseLabel", "stylistCtaLabel"] as const).map((key) => <Field key={key} label={`Hero ${key}`} value={data.hero[key]} onChange={(value) => update("hero", { ...data.hero, [key]: value })} />)}
        <label className={labelClass}>Hero media mode<select className={inputClass} value={data.hero.mediaMode} onChange={(event) => {
          const mediaMode = event.target.value as "image" | "video";
          update("hero", mediaMode === "image" ? { ...data.hero, mediaMode, videoUrl: undefined, mobileVideoUrl: undefined } : { ...data.hero, mediaMode, videoUrl: data.hero.videoUrl ?? "", mobileVideoUrl: data.hero.mobileVideoUrl ?? "" });
        }}><option value="image">Image</option><option value="video">Video</option></select></label>
        {data.hero.mediaMode === "video" && <>
          <Field label="Hero desktop video path" value={data.hero.videoUrl ?? ""} onChange={(videoUrl) => update("hero", { ...data.hero, videoUrl })} />
          <Field label="Hero mobile video path" value={data.hero.mobileVideoUrl ?? ""} onChange={(mobileVideoUrl) => update("hero", { ...data.hero, mobileVideoUrl })} />
        </>}
        <Field label="Hero primary CTA label" value={data.hero.primaryCta.label} onChange={(label) => update("hero", { ...data.hero, primaryCta: { ...data.hero.primaryCta, label } })} />
        <Field label="Hero primary CTA path" value={data.hero.primaryCta.href} onChange={(href) => update("hero", { ...data.hero, primaryCta: { ...data.hero.primaryCta, href } })} />
        <label className={`${labelClass} flex items-center gap-2 pt-5`}><input type="checkbox" checked={data.hero.campaignCta?.enabled ?? false} onChange={(event) => update("hero", {
          ...data.hero,
          campaignCta: { ...(data.hero.campaignCta ?? { label: "", href: "", startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString() }), enabled: event.target.checked },
        })} />Enable scheduled campaign CTA</label>
        {data.hero.campaignCta && <>
          <Field label="Campaign CTA label" value={data.hero.campaignCta.label} onChange={(label) => update("hero", { ...data.hero, campaignCta: { ...data.hero.campaignCta!, label } })} />
          <Field label="Campaign CTA path" value={data.hero.campaignCta.href} onChange={(href) => update("hero", { ...data.hero, campaignCta: { ...data.hero.campaignCta!, href } })} />
          <Field label="Campaign starts (ISO timestamp)" value={data.hero.campaignCta.startsAt} onChange={(startsAt) => update("hero", { ...data.hero, campaignCta: { ...data.hero.campaignCta!, startsAt } })} />
          <Field label="Campaign ends (ISO timestamp)" value={data.hero.campaignCta.endsAt} onChange={(endsAt) => update("hero", { ...data.hero, campaignCta: { ...data.hero.campaignCta!, endsAt } })} />
        </>}
      </div>
      <div className="mt-4"><p className={labelClass}>Hero assurances (ordered)</p>{data.hero.assurances.map((assurance, index) => <div key={index} className="mt-2 flex gap-2"><input className="staff-input" value={assurance} onChange={(event) => { const assurances = [...data.hero.assurances]; assurances[index] = event.target.value; update("hero", { ...data.hero, assurances }); }} /><MoveButtons index={index} length={data.hero.assurances.length} move={(from, to) => move(data.hero.assurances, from, to, (assurances) => update("hero", { ...data.hero, assurances }))} /><button type="button" disabled={data.hero.assurances.length <= 1} onClick={() => update("hero", { ...data.hero, assurances: data.hero.assurances.filter((_, itemIndex) => itemIndex !== index) })} className="border border-border px-3 text-xs disabled:opacity-30">Remove</button></div>)}<button type="button" onClick={() => update("hero", { ...data.hero, assurances: [...data.hero.assurances, ""] })} className="mt-2 border border-border px-3 py-2 text-xs">Add assurance</button></div>
    </details>

    <details className="border border-border p-4">
      <summary className="cursor-pointer font-semibold">Trust strip (ordered)</summary>
      <div className="mt-4 space-y-3">{data.trustItems.map((item, index) => <div key={index} className="grid gap-2 border border-border p-3 sm:grid-cols-[1fr_1fr_auto_auto]"><Field label={`Item ${index + 1} title`} value={item.title} onChange={(title) => { const trustItems = [...data.trustItems]; trustItems[index] = { ...item, title }; update("trustItems", trustItems); }} /><Field label="Body" value={item.body} onChange={(body) => { const trustItems = [...data.trustItems]; trustItems[index] = { ...item, body }; update("trustItems", trustItems); }} /><MoveButtons index={index} length={data.trustItems.length} move={(from, to) => move(data.trustItems, from, to, (trustItems) => update("trustItems", trustItems))} /><button type="button" disabled={data.trustItems.length <= 1} onClick={() => update("trustItems", data.trustItems.filter((_, itemIndex) => itemIndex !== index))} className="border border-border px-3 text-xs disabled:opacity-30">Remove</button></div>)}</div>
      <button type="button" onClick={() => update("trustItems", [...data.trustItems, { title: "", body: "" }])} className="mt-3 border border-border px-3 py-2 text-xs">Add trust item</button>
    </details>

    <section className="border border-border p-4">
      <h3 className="font-semibold">Categories · exactly 5</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Visible heading" value={data.categories.heading} onChange={(heading) => update("categories", { ...data.categories, heading })} />
        <Field label="Accessible section label" value={data.categories.accessibleLabel} onChange={(accessibleLabel) => update("categories", { ...data.categories, accessibleLabel })} />
        <Field label="Tile CTA label" value={data.categories.ctaLabel} onChange={(ctaLabel) => update("categories", { ...data.categories, ctaLabel })} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {data.categories.items.map((item, index) => {
          const images = item.imageUrls?.length ? item.imageUrls : [item.imageUrl];
          const commitImages = (nextImages: string[]) => {
            if (!nextImages.length) return;
            const items = [...data.categories.items];
            const fallback = nextImages.includes(item.imageUrl) ? item.imageUrl : nextImages[0]!;
            items[index] = {
              ...item,
              imageUrl: fallback,
              imageUrls: nextImages,
              imageMode: nextImages.length >= 2 ? "crossfade" : "static",
            };
            update("categories", { ...data.categories, items });
          };
          return <div key={`${index}-${item.title}`} className="border border-border bg-muted/10 p-3" data-testid={`homepage-category-${index}`} data-merchandising-value={item.title}>
          <div className="mb-3 flex items-center justify-between"><strong className="text-xs">Position {index + 1}</strong><MoveButtons index={index} length={data.categories.items.length} move={(from, to) => move(data.categories.items, from, to, (items) => update("categories", { ...data.categories, items }))} /></div>
          <div className="mb-4 border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">Rotating category photos</p>
                <p className="mt-1 text-xs text-muted-foreground">{images.length >= 2 ? `${images.length} photos · Crossfade active` : "Add a second photo to activate Crossfade."}</p>
              </div>
              <label className={`inline-flex min-h-9 cursor-pointer items-center gap-2 border border-primary px-3 text-[10px] font-semibold uppercase tracking-wider text-primary ${images.length >= 4 ? "pointer-events-none opacity-40" : ""}`}>
                <ImageUp size={13} /> {uploadingCategory === index ? "Uploading…" : "Upload photo"}
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadingCategory !== null || images.length >= 4}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (!file) return;
                    setUploadingCategory(index);
                    setMediaStatus("");
                    void onUploadMedia(file)
                      .then((path) => {
                        if (images.includes(path)) {
                          setMediaStatus("That photo is already in this category.");
                          return;
                        }
                        commitImages([...images, path]);
                        setMediaStatus(`${item.title}: photo uploaded and added to the rotation.`);
                      })
                      .catch((error: unknown) => setMediaStatus(error instanceof Error ? error.message : "Photo upload failed."))
                      .finally(() => setUploadingCategory(null));
                  }}
                />
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {images.map((path, imageIndex) => <div key={`${path}-${imageIndex}`} className="border border-border bg-muted/10 p-2">
                <div className="aspect-[3/4] overflow-hidden bg-muted">
                  <img src={path} alt="" className="h-full w-full object-cover" />
                </div>
                <p className="mt-2 truncate text-[10px] text-muted-foreground" title={path}>{path}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    disabled={item.imageUrl === path}
                    onClick={() => {
                      const items = [...data.categories.items];
                      items[index] = { ...item, imageUrl: path };
                      update("categories", { ...data.categories, items });
                    }}
                    className="inline-flex min-h-8 items-center gap-1 border border-border px-2 text-[9px] font-semibold uppercase disabled:border-primary disabled:text-primary"
                  >
                    <Star size={11} /> {item.imageUrl === path ? "Fallback" : "Set fallback"}
                  </button>
                  <MoveButtons index={imageIndex} length={images.length} move={(from, to) => move(images, from, to, commitImages)} />
                  <button
                    type="button"
                    aria-label={`Remove photo ${imageIndex + 1} from ${item.title}`}
                    disabled={images.length === 1}
                    onClick={() => commitImages(images.filter((_, candidateIndex) => candidateIndex !== imageIndex))}
                    className="inline-flex min-h-8 items-center gap-1 border border-border px-2 text-[9px] font-semibold uppercase disabled:opacity-30"
                  >
                    <Trash2 size={11} /> Remove
                  </button>
                </div>
              </div>)}
            </div>
            {mediaStatus && <p className="mt-3 text-xs text-muted-foreground" role="status">{mediaStatus}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["eyebrow", "title", "description", "imageUrl", "imageAlt", "href", "desktopCropPosition", "mobileCropPosition"] as const).map((key) => <Field key={key} label={key} value={item[key] ?? ""} onChange={(value) => {
              const items = [...data.categories.items]; items[index] = { ...item, [key]: value }; update("categories", { ...data.categories, items });
            }} />)}
            <label className={labelClass}>Mobile Image URLs (comma separated)
              <input className={inputClass} value={item.mobileImageUrls?.join(", ") || ""} onChange={(event) => {
                const items = [...data.categories.items];
                items[index] = { ...item, mobileImageUrls: event.target.value ? event.target.value.split(",").map((value) => value.trim()).filter(Boolean) : [] };
                update("categories", { ...data.categories, items });
              }} />
            </label>
            <label className={labelClass}>Image behaviour<select className={inputClass} value={item.imageMode ?? "static"} onChange={(event) => {
              const items = [...data.categories.items]; items[index] = { ...item, imageMode: event.target.value as "static" | "crossfade" }; update("categories", { ...data.categories, items });
            }}><option value="static">Static</option><option value="crossfade">Crossfade</option></select></label>
            <label className={labelClass}>Rotation timing (milliseconds)<input type="number" min="3000" max="15000" className={inputClass} value={item.rotationMs ?? 5000} onChange={(event) => {
              const items = [...data.categories.items]; items[index] = { ...item, rotationMs: Number(event.target.value) }; update("categories", { ...data.categories, items });
            }} /></label>
            <label className={`${labelClass} flex items-center gap-2 pt-5`}><input type="checkbox" checked={item.active !== false} onChange={(event) => {
              const items = [...data.categories.items]; items[index] = { ...item, active: event.target.checked }; update("categories", { ...data.categories, items });
            }} />Active on homepage</label>
          </div>
        </div>;
        })}
      </div>
    </section>

    <section className="border border-border p-4">
      <h3 className="font-semibold">New arrival · exact product and editorial</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Eyebrow" value={data.newArrival.eyebrow} onChange={(eyebrow) => update("newArrival", { ...data.newArrival, eyebrow })} />
        <Field label="Heading" value={data.newArrival.title} onChange={(title) => update("newArrival", { ...data.newArrival, title })} />
        <label className={labelClass}>Exact product<select data-testid="homepage-new-arrival-product" className={inputClass} value={data.newArrival.productSlug} onChange={(event) => update("newArrival", { ...data.newArrival, productSlug: event.target.value })}>{products.map((product) => <option key={product.slug} value={product.slug}>{product.name} · {product.slug}</option>)}</select></label>
        <Field label="Section link label" value={data.newArrival.link.label} onChange={(label) => update("newArrival", { ...data.newArrival, link: { ...data.newArrival.link, label } })} />
        <Field label="Section link path" value={data.newArrival.link.href} onChange={(href) => update("newArrival", { ...data.newArrival, link: { ...data.newArrival.link, href } })} />
        {(["imageUrl", "imageAlt", "eyebrow", "title", "body"] as const).map((key) => <Field key={key} label={`Editorial ${key}`} value={data.newArrival.editorial[key]} onChange={(value) => update("newArrival", { ...data.newArrival, editorial: { ...data.newArrival.editorial, [key]: value } })} />)}
        <Field label="Editorial link label" value={data.newArrival.editorial.link.label} onChange={(label) => update("newArrival", { ...data.newArrival, editorial: { ...data.newArrival.editorial, link: { ...data.newArrival.editorial.link, label } } })} />
        <Field label="Editorial link path" value={data.newArrival.editorial.link.href} onChange={(href) => update("newArrival", { ...data.newArrival, editorial: { ...data.newArrival.editorial, link: { ...data.newArrival.editorial.link, href } } })} />
      </div>
    </section>

    <section className="border border-border p-4">
      <h3 className="font-semibold">Featured · exactly 4</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Eyebrow" value={data.featured.eyebrow} onChange={(eyebrow) => update("featured", { ...data.featured, eyebrow })} />
        <Field label="Heading" value={data.featured.title} onChange={(title) => update("featured", { ...data.featured, title })} />
        <Field label="Link label" value={data.featured.link.label} onChange={(label) => update("featured", { ...data.featured, link: { ...data.featured.link, label } })} />
        <Field label="Link path" value={data.featured.link.href} onChange={(href) => update("featured", { ...data.featured, link: { ...data.featured.link, href } })} />
      </div>
      <div className="mt-3 space-y-2">{data.featured.productSlugs.map((slug, index) => <div key={`${index}-${slug}`} className="flex items-end gap-2" data-testid={`homepage-featured-${index}`} data-merchandising-value={slug}>
        <label className={`${labelClass} flex-1`}>Position {index + 1}<select className={inputClass} value={slug} onChange={(event) => { const productSlugs = [...data.featured.productSlugs]; productSlugs[index] = event.target.value; update("featured", { ...data.featured, productSlugs }); }}>{products.map((product) => <option key={product.slug} value={product.slug}>{product.name} · {product.slug}</option>)}</select></label>
        <MoveButtons index={index} length={data.featured.productSlugs.length} move={(from, to) => move(data.featured.productSlugs, from, to, (productSlugs) => update("featured", { ...data.featured, productSlugs }))} />
      </div>)}</div>
    </section>

    <section className="border border-border p-4">
      <h3 className="font-semibold">Occasions · exactly 2</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Eyebrow" value={data.occasions.eyebrow} onChange={(eyebrow) => update("occasions", { ...data.occasions, eyebrow })} /><Field label="Heading" value={data.occasions.title} onChange={(title) => update("occasions", { ...data.occasions, title })} /></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{data.occasions.items.map((item, index) => <div key={`${index}-${item.title}`} className="border border-border p-3" data-testid={`homepage-occasion-${index}`} data-merchandising-value={item.title}>
        <div className="mb-3 flex items-center justify-between"><strong className="text-xs">Position {index + 1}</strong><MoveButtons index={index} length={data.occasions.items.length} move={(from, to) => move(data.occasions.items, from, to, (items) => update("occasions", { ...data.occasions, items }))} /></div>
        <div className="grid gap-3 sm:grid-cols-2">{(["title", "body", "imageUrl", "imageAlt", "href", "linkLabel"] as const).map((key) => <Field key={key} label={key} value={item[key]} onChange={(value) => { const items = [...data.occasions.items]; items[index] = { ...item, [key]: value }; update("occasions", { ...data.occasions, items }); }} />)}</div>
      </div>)}</div>
    </section>

    <details className="border border-border p-4">
      <summary className="cursor-pointer font-semibold">Fit support (ordered steps)</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{(["eyebrow", "title", "imageUrl", "imageAlt", "ctaLabel"] as const).map((key) => <Field key={key} label={key} value={data.fit[key]} onChange={(value) => update("fit", { ...data.fit, [key]: value })} />)}</div>
      <div className="mt-4 space-y-3">{data.fit.steps.map((item, index) => <div key={index} className="grid gap-2 border border-border p-3 sm:grid-cols-[1fr_1fr_auto_auto]"><Field label={`Step ${index + 1} title`} value={item.title} onChange={(title) => { const steps = [...data.fit.steps]; steps[index] = { ...item, title }; update("fit", { ...data.fit, steps }); }} /><Field label="Body" value={item.body} onChange={(body) => { const steps = [...data.fit.steps]; steps[index] = { ...item, body }; update("fit", { ...data.fit, steps }); }} /><MoveButtons index={index} length={data.fit.steps.length} move={(from, to) => move(data.fit.steps, from, to, (steps) => update("fit", { ...data.fit, steps }))} /><button type="button" disabled={data.fit.steps.length <= 1} onClick={() => update("fit", { ...data.fit, steps: data.fit.steps.filter((_, itemIndex) => itemIndex !== index) })} className="border border-border px-3 text-xs disabled:opacity-30">Remove</button></div>)}</div>
      <button type="button" onClick={() => update("fit", { ...data.fit, steps: [...data.fit.steps, { title: "", body: "" }] })} className="mt-3 border border-border px-3 py-2 text-xs">Add fit step</button>
    </details>

    <details className="border border-border p-4">
      <summary className="cursor-pointer font-semibold">Confidence and marquee</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{(["eyebrow", "title"] as const).map((key) => <Field key={key} label={key} value={data.confidence[key]} onChange={(value) => update("confidence", { ...data.confidence, [key]: value })} />)}</div>
      <div className="mt-4 space-y-3">{data.confidence.items.map((item, index) => <div key={index} className="grid gap-2 border border-border p-3 sm:grid-cols-[1fr_1fr_auto_auto]"><Field label={`Item ${index + 1} title`} value={item.title} onChange={(title) => { const items = [...data.confidence.items]; items[index] = { ...item, title }; update("confidence", { ...data.confidence, items }); }} /><Field label="Body" value={item.body} onChange={(body) => { const items = [...data.confidence.items]; items[index] = { ...item, body }; update("confidence", { ...data.confidence, items }); }} /><MoveButtons index={index} length={data.confidence.items.length} move={(from, to) => move(data.confidence.items, from, to, (items) => update("confidence", { ...data.confidence, items }))} /><button type="button" disabled={data.confidence.items.length <= 1} onClick={() => update("confidence", { ...data.confidence, items: data.confidence.items.filter((_, itemIndex) => itemIndex !== index) })} className="border border-border px-3 text-xs disabled:opacity-30">Remove</button></div>)}</div>
      <button type="button" onClick={() => update("confidence", { ...data.confidence, items: [...data.confidence.items, { title: "", body: "" }] })} className="mt-3 border border-border px-3 py-2 text-xs">Add confidence item</button>
      <div className="mt-4"><p className={labelClass}>Marquee phrases (ordered)</p>{data.confidence.marquee.map((phrase, index) => <div key={index} className="mt-2 flex gap-2"><input className="staff-input" value={phrase} onChange={(event) => { const marquee = [...data.confidence.marquee]; marquee[index] = event.target.value; update("confidence", { ...data.confidence, marquee }); }} /><MoveButtons index={index} length={data.confidence.marquee.length} move={(from, to) => move(data.confidence.marquee, from, to, (marquee) => update("confidence", { ...data.confidence, marquee }))} /><button type="button" disabled={data.confidence.marquee.length <= 1} onClick={() => update("confidence", { ...data.confidence, marquee: data.confidence.marquee.filter((_, itemIndex) => itemIndex !== index) })} className="border border-border px-3 text-xs disabled:opacity-30">Remove</button></div>)}<button type="button" onClick={() => update("confidence", { ...data.confidence, marquee: [...data.confidence.marquee, ""] })} className="mt-2 border border-border px-3 py-2 text-xs">Add marquee phrase</button></div>
    </details>

    <details className="border border-border p-4">
      <summary className="cursor-pointer font-semibold">Final call to action</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{(["eyebrow", "title", "body", "stylistCtaLabel", "note"] as const).map((key) => <Field key={key} label={key} value={data.finalCta[key]} onChange={(value) => update("finalCta", { ...data.finalCta, [key]: value })} />)}<Field label="Primary CTA label" value={data.finalCta.primaryCta.label} onChange={(label) => update("finalCta", { ...data.finalCta, primaryCta: { ...data.finalCta.primaryCta, label } })} /><Field label="Primary CTA path" value={data.finalCta.primaryCta.href} onChange={(href) => update("finalCta", { ...data.finalCta, primaryCta: { ...data.finalCta.primaryCta, href } })} /></div>
    </details>

    <details className="border border-border bg-muted/10 p-4">
      <summary className="cursor-pointer font-semibold">Legacy story compatibility</summary>
      <p className="mt-3 text-sm text-muted-foreground">The homepage now uses New arrival editorial media and copy. Legacy story fields remain in the document for compatibility and are not rendered on the homepage.</p>
    </details>

    <section className="border border-border bg-muted/10 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider">Ordered homepage summary</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm"><li><strong>Hero:</strong> {data.hero.title} · {data.hero.mediaMode}</li><li data-testid="homepage-summary-categories"><strong>Categories:</strong> {data.categories.items.map((item, index) => `${index + 1}. ${item.title}`).join(" · ")}</li><li data-testid="homepage-summary-new-arrival"><strong>New arrival:</strong> {products.find((product) => product.slug === data.newArrival.productSlug)?.name ?? data.newArrival.productSlug}</li><li data-testid="homepage-summary-featured"><strong>Featured:</strong> {data.featured.productSlugs.map((slug, index) => `${index + 1}. ${products.find((product) => product.slug === slug)?.name ?? slug}`).join(" · ")}</li><li data-testid="homepage-summary-occasions"><strong>Occasions:</strong> {data.occasions.items.map((item, index) => `${index + 1}. ${item.title}`).join(" · ")}</li><li><strong>Trust:</strong> {data.trustItems.map((item, index) => `${index + 1}. ${item.title}`).join(" · ")}</li><li><strong>Fit:</strong> {data.fit.steps.map((item, index) => `${index + 1}. ${item.title}`).join(" · ")}</li><li><strong>Confidence:</strong> {data.confidence.items.map((item, index) => `${index + 1}. ${item.title}`).join(" · ")}</li><li><strong>Final CTA:</strong> {data.finalCta.primaryCta.label}</li></ol>
    </section>
  </div>;
}