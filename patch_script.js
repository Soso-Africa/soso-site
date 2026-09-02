const fs = require('fs');

const path = 'artifacts/soso-store/src/pages/ProductDetail.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace the fallback gallery inline implementation with FallbackGallery component and extraction
const newFallbackDecl = `function FallbackGallery({
  gallery,
  product,
  productCopy,
  emblaRef,
  scrollPrev,
  scrollNext,
  zoomed,
  img,
  setZoomed,
  setImg,
  trackStorefrontEvent
}: any) {
  return (
    <>
      <div className="soso-gallery relative overflow-hidden group bg-background" ref={emblaRef}>
        <div className="flex touch-pan-y">
          {gallery.map((g: any, i: number) => (
            <div key={i} className="flex-[0_0_100%] min-w-0 relative overflow-hidden">
              {g.type === 'mask' ? (
                <div
                  className="w-full aspect-[2/3] transition-transform duration-500 relative"
                  style={{ transform: zoomed && i === img ? "scale(1.8)" : "scale(1)", backgroundColor: 'hsl(var(--muted))' }}
                  aria-label={g.label}
                >
                  <img src={g.baseSrc} alt={g.label} className="absolute inset-0 w-full h-full object-cover" />
                  <div
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                      backgroundColor: g.hex,
                      mixBlendMode: 'multiply',
                      WebkitMaskImage: \`url(\${g.maskSrc})\`,
                      WebkitMaskSize: 'cover',
                      WebkitMaskPosition: 'center',
                      maskImage: \`url(\${g.maskSrc})\`,
                      maskSize: 'cover',
                      maskPosition: 'center'
                    }}
                  />
                </div>
              ) : (
                <img
                  src={g.src}
                  alt={g.label}
                  className="w-full aspect-[2/3] object-cover transition-transform duration-500"
                  style={{ transform: zoomed && i === img ? "scale(1.8)" : "scale(1)" }}
                />
              )}
            </div>
          ))}
        </div>

        {gallery.length > 1 && (
          <>
            <button
              onClick={scrollPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-background/80 text-foreground backdrop-blur-sm opacity-100 transition-opacity disabled:opacity-40"
              aria-label={productCopy.previousImageLabel}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={scrollNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-background/80 text-foreground backdrop-blur-sm opacity-100 transition-opacity disabled:opacity-40"
              aria-label={productCopy.nextImageLabel}
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        <div className="absolute top-4 left-4 text-[10px] tracking-[0.25em] uppercase px-3 py-1.5" style={{ background: "rgba(255,255,255,.9)", color: "hsl(var(--foreground))", backdropFilter: "blur(4px)", border: "1px solid hsl(var(--border))" }}>
          {product.tag}
        </div>
        <button
          type="button"
          onClick={() => setZoomed((value: boolean) => !value)}
          className="absolute bottom-4 right-4 flex min-h-10 min-w-10 items-center justify-center bg-white/90 text-foreground backdrop-blur-sm border border-border"
          aria-label={zoomed ? productCopy.zoomOutImageLabel : productCopy.zoomInImageLabel}
          aria-pressed={zoomed}
          data-testid="button-gallery-zoom"
        >
          {zoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
        </button>
      </div>
      <div className="flex gap-3 mt-3 overflow-x-auto pb-2 snap-x">
        {gallery.map((g: any, i: number) => (
          <button
            key={i}
            onClick={() => { setImg(i); if (i !== img) trackStorefrontEvent("product_image_viewed", { productSlug: product.slug, imageIndex: i }); }}
            className="w-20 shrink-0 snap-start overflow-hidden relative"
            style={{ outline: i === img ? \`2px solid hsl(var(--foreground))\` : "1px solid hsl(var(--border))", outlineOffset: 2 }}
            aria-label={\`\${productCopy.viewProductLabel}: \${g.label}\`}
            aria-current={i === img}
          >
            {g.type === 'mask' ? (
              <div className="aspect-[3/4] relative w-full bg-muted">
                <img src={g.baseSrc} alt={g.label} className="absolute inset-0 w-full h-full object-cover" />
                <div
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{
                    backgroundColor: g.hex,
                    mixBlendMode: 'multiply',
                    WebkitMaskImage: \`url(\${g.maskSrc})\`,
                    WebkitMaskSize: 'cover',
                    WebkitMaskPosition: 'center',
                    maskImage: \`url(\${g.maskSrc})\`,
                    maskSize: 'cover',
                    maskPosition: 'center'
                  }}
                />
              </div>
            ) : (
              <img src={g.src} alt={g.label} className="aspect-[3/4] object-cover w-full" />
            )}
          </button>
        ))}
      </div>
      {(gallery[img]?.provenance?.credit || gallery[img]?.provenance?.source) && <p className="mt-3 text-[10px] uppercase tracking-wider opacity-55">
        {productCopy.imageCreditLabel}: {gallery[img].provenance.credit || gallery[img].provenance.source}
      </p>}
    </>
  );
}

export default function ProductDetail() {`;

content = content.replace('export default function ProductDetail() {', newFallbackDecl);

const usageRegex = /\{\/\* Gallery \*\/\}\s*<div\s*style=\{\{\s*opacity: loaded \? 1 : 0,\s*transform: loaded \? "none" : "translateY\(24px\)",\s*transition: "opacity 1s cubic-bezier\(\.16,1,\.3,1\), transform 1s cubic-bezier\(\.16,1,\.3,1\)",\s*\}\}\s*>\s*<div className="soso-gallery[\s\S]*?\{productCopy\.imageCreditLabel\}: \{gallery\[img\]\.provenance\.credit \|\| gallery\[img\]\.provenance\.source\}\n\s*<\/p>\}\s*<\/div>/;

const newUsage = `{/* Gallery / Stage */}
        <div
          style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? "none" : "translateY(24px)",
            transition: "opacity 1s cubic-bezier(.16,1,.3,1), transform 1s cubic-bezier(.16,1,.3,1)",
          }}
        >
          {product.materialTurnSets && product.materialTurnSets.length > 0 && selectedColourId === "custom" ? (
             <MaterialTurnStage
               sets={product.materialTurnSets}
               productCopy={productCopy}
             />
          ) : (
            <FallbackGallery
              gallery={gallery}
              product={product}
              productCopy={productCopy}
              emblaRef={emblaRef}
              scrollPrev={scrollPrev}
              scrollNext={scrollNext}
              zoomed={zoomed}
              img={img}
              setZoomed={setZoomed}
              setImg={setImg}
              trackStorefrontEvent={trackStorefrontEvent}
            />
          )}
        </div>`;

content = content.replace(usageRegex, newUsage);

// Add MaterialTurnStage import if missing
if (!content.includes('MaterialTurnStage')) {
  content = content.replace('import { WhatsAppIcon } from "@/components/Icons";', 'import { WhatsAppIcon } from "@/components/Icons";\nimport { MaterialTurnStage } from "@/components/MaterialTurnStage";');
}

// Ensure right col sticky on buy panel
content = content.replace('{/* Buy panel */}\n        <div\n          style={{', '{/* Buy panel */}\n        <div\n          className="md:sticky md:top-24 h-max"\n          style={{');

fs.writeFileSync(path, content);
