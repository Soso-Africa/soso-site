import React, { useEffect, useState, useCallback } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { Reveal } from "@/components/Reveal";
import { useCart } from "@/context/CartContext";
import { naira } from "@/lib/utils";
import { Seo } from "@/components/Seo";
import { StylistEnquiryDialog } from "@/components/StylistEnquiryDialog";
import { editorialOrigin, trackStorefrontEvent } from "@/components/ConsentManager";
import { catalogApproved } from "@/lib/seo";
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";
import { ProductCard } from "@/components/ProductCard";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, ChevronDown, ZoomIn, ZoomOut } from "lucide-react";
import * as Accordion from "@radix-ui/react-accordion";
import { isMappedPurchaseChoice, mappedPurchaseChoices, visibleStandardSizes } from "@/lib/purchasing";
import { WhatsAppIcon } from "@/components/Icons";
import { MaterialTurnStage } from "@/components/MaterialTurnStage";

function FallbackGallery({
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
                      opacity: 0.72,
                      WebkitMaskImage: `url(${g.maskSrc})`,
                      WebkitMaskSize: 'cover',
                      WebkitMaskPosition: 'center',
                      maskImage: `url(${g.maskSrc})`,
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
            style={{ outline: i === img ? `2px solid hsl(var(--foreground))` : "1px solid hsl(var(--border))", outlineOffset: 2 }}
            aria-label={`${productCopy.viewProductLabel}: ${g.label}`}
            aria-current={i === img}
          >
            {g.type === 'mask' ? (
              <div className="aspect-[3/4] relative w-full bg-muted">
                <img src={g.baseSrc} alt={g.label} className="absolute inset-0 w-full h-full object-cover" />
                <div
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{
                    backgroundColor: g.hex,
                    opacity: 0.72,
                    WebkitMaskImage: `url(${g.maskSrc})`,
                    WebkitMaskSize: 'cover',
                    WebkitMaskPosition: 'center',
                    maskImage: `url(${g.maskSrc})`,
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

export default function ProductDetail() {
  const [, params] = useRoute("/product/:slug");
  const [, setLocation] = useLocation();
  const { addItem } = useCart();

  const platform = usePlatformContent();
  const platformContent = platform.data?.content;
  const product = platformContent?.products.find((item) => item.slug === params?.slug);

  const [selectedColourId, setSelectedColourId] = useState<string | "custom">(() => product?.colourOptions?.[0]?.id || "custom");
  const [customColour, setCustomColour] = useState("");
  const [size, setSize] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [fitAssistantSubmitted, setFitAssistantSubmitted] = useState(false);
  const [stylistOpen, setStylistOpen] = useState(false);
  const [img, setImg] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [returnToResults] = useState(() => {
    try {
      const stored = window.sessionStorage.getItem("soso-return-to");
      return stored?.startsWith("/shop") ? stored : "/shop";
    } catch {
      return "/shop";
    }
  });

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setZoomed(false);
    setImg(emblaApi.selectedScrollSnap());
  }, [emblaApi, setImg]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (emblaApi) emblaApi.scrollTo(img);
  }, [img, emblaApi]);

  useEffect(() => {
    // Reset state on route change
    setSize(null);
    setImg(0);
    setZoomed(false);
    setLoaded(false);
    setCustomColour("");
    if (product?.colourOptions?.[0]) setSelectedColourId(product.colourOptions[0].id);

    if (!product && platform.data) {
      setLocation("/shop");
      return;
    }

    const t = setTimeout(() => setLoaded(true), 60);
    return () => clearTimeout(t);
  }, [product, platform.data, setLocation]);

  useEffect(() => {
    if (product) trackStorefrontEvent("product_view", {
      productSlug: product.slug,
      commerceProductId: product.commerceProductId,
      itemIds: [product.commerceProductId ?? product.slug],
      value: product.price,
      currency: "NGN",
      quantity: 1,
      itemCount: 1,
      articleSlug: editorialOrigin(),
    });
  }, [product]);

  const selectedColour = product?.colourOptions?.find(c => c.id === selectedColourId);
  const visualizer = product?.colourVisualizer;
  // Published content validates these assets server-side. Retain this narrow
  // client guard so incomplete/stale content can never mount an unmasked tint.
  const hasValidMaskVisualizer = Boolean(
    visualizer?.baseImageSrc
    && /^\/(?:images\/soso\/|api\/storage\/objects\/uploads\/)[^?#]*\.(?:jpe?g|png|webp)$/i.test(visualizer.baseImageSrc)
    && visualizer.garmentMaskSrc
    && /^\/(?:images\/soso\/|api\/storage\/objects\/uploads\/)[^?#]*\.png$/i.test(visualizer.garmentMaskSrc),
  );
  const isOriginalColourSelection = selectedColourId === "as-shown";
  const hasDynamicPreview = selectedColourId !== "custom" && selectedColour
    && (isOriginalColourSelection || selectedColour.previewImageSrc || hasValidMaskVisualizer);

  useEffect(() => {
    if (hasDynamicPreview) setImg(0);
  }, [selectedColourId, hasDynamicPreview]);

  if (!product) {
    return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platform.data?.content.site.platformState} />;
  }

  type GalleryItem =
    | { type: 'static' | 'image'; src: string; label: string; provenance: any }
    | { type: 'mask'; baseSrc: string; maskSrc: string; hex: string; label: string; provenance: any };

  const galleryItems: GalleryItem[] = [];
  if (selectedColour && selectedColourId !== "custom" && !isOriginalColourSelection) {
    if (selectedColour.previewImageSrc) {
      galleryItems.push({
        type: 'static',
        src: selectedColour.previewImageSrc,
        label: `${product.name} in ${selectedColour.label}`,
        provenance: null
      });
    } else if (hasValidMaskVisualizer && visualizer) {
      galleryItems.push({
        type: 'mask',
        baseSrc: visualizer.baseImageSrc,
        maskSrc: visualizer.garmentMaskSrc,
        hex: selectedColour.hex,
        label: `${product.name} in ${selectedColour.label}`,
        provenance: null
      });
    }
  }

  const baseGallery: GalleryItem[] = product.images?.length
    ? product.images.map((image) => ({ type: 'image', src: image.src, label: image.alt, provenance: image.provenance }))
    : [{ type: 'image', src: product.img, label: `${product.name} ${platformContent!.productCopy.detailImageAltSuffix}`, provenance: null }];

  const gallery: GalleryItem[] = [...galleryItems, ...baseGallery];

  const productCopy = platformContent!.productCopy;
  const supportCopy = platformContent!.supportCopy;
  const sizeGuide = platformContent!.sizeGuide;

  const purchaseChoices = mappedPurchaseChoices(product);
  const standardSizes = visibleStandardSizes(product);
  const customIsMappable = purchaseChoices.includes("Custom");
  const hasMappedChoices = purchaseChoices.length > 0;

  const needSize = size === null;
  const needCustomColour = selectedColourId === "custom" && !customColour.trim();
  const isPurchasable = isMappedPurchaseChoice(product, size);
  const isUnavailable = product.fulfilmentState === "unavailable";

  const handleAddToCart = () => {
    if (needSize || needCustomColour || isUnavailable || !isPurchasable || !size) return;
    const variantId = product.commerceVariantIds?.[size];

    if (selectedColourId === "custom" && !customColour.trim()) return;

    const colourId = selectedColourId === "custom" ? "custom" : selectedColour?.id;
    const colourLabel = selectedColourId === "custom" ? "Custom" : selectedColour?.label;
    const colourHex = selectedColourId === "custom" ? "#000000" : selectedColour?.hex;

    if (!variantId || !colourId || !colourLabel || !colourHex) return;

    addItem({
      slug: product.slug,
      name: product.name,
      img: product.img,
      price: product.price,
      size: size,
      selectedColourId: colourId,
      selectedColourLabel: colourLabel,
      selectedColourHex: colourHex,
      ...(selectedColourId === "custom" ? { customColour: customColour.trim() } : {}),
      commerceProductId: product.commerceProductId,
      commerceVariantId: variantId,
    });
    trackStorefrontEvent("cta_clicked", { ctaLabel: "add_to_bag", productSlug: product.slug, articleSlug: editorialOrigin() });
  };

  // Details
  const productSpecificDetails: { title: string; body: string }[] = [];
  if (product.composition) productSpecificDetails.push({ title: productCopy.compositionLabel, body: product.composition });
  if (product.care) productSpecificDetails.push({ title: productCopy.careLabel, body: product.care });
  const detailsToUse = productSpecificDetails.length > 0 ? productSpecificDetails : productCopy.details;

  // Assurances
  const productSpecificAssurances: { title: string; body: string }[] = [];
  if (product.delivery) productSpecificAssurances.push({ title: productCopy.deliveryLabel, body: product.delivery });
  if (product.returns) productSpecificAssurances.push({ title: productCopy.returnsLabel, body: product.returns });
  const assurancesToUse = productSpecificAssurances.length > 0 ? productSpecificAssurances : productCopy.assurances;

  // Only configured related pieces
  const relatedSlugs = product.relatedProductSlugs ?? [];
  const look = relatedSlugs.length > 0
    ? platformContent!.products.filter((item) => relatedSlugs.includes(item.slug)).slice(0, 4)
    : [];

  return (
    <div className="flex flex-col bg-background text-foreground">
      <Seo
        title={`${product.name} | ${productCopy.seoTitleSuffix}`}
        description={`${product.description} ${productCopy.seoDescriptionSuffix}`}
        path={`/product/${product.slug}`}
        product={product}
        noIndex={!catalogApproved}
        breadcrumbs={[
          { name: productCopy.shopBreadcrumbLabel, path: "/shop" },
          { name: product.category, path: `/shop?category=${encodeURIComponent(product.category)}` },
          { name: product.name, path: `/product/${product.slug}` },
        ]}
      />
      {/* ————— HERO / BUY BLOCK ————— */}
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 grid md:grid-cols-2 gap-10 md:gap-16 pt-8 md:pt-14 pb-16">
        {/* Breadcrumbs (Mobile & Desktop) */}
        <div className="md:col-span-2">
          <nav aria-label={productCopy.breadcrumbAriaLabel} className="text-[10px] uppercase tracking-widest text-secondary">
            <ol className="flex items-center gap-2 flex-wrap">
              <li><Link href="/" className="hover:text-primary">{productCopy.homeBreadcrumbLabel}</Link></li>
              <li>/</li>
              <li><Link href={returnToResults} className="hover:text-primary">{productCopy.shopBreadcrumbLabel}</Link></li>
              <li>/</li>
              <li><Link href={`/shop?category=${encodeURIComponent(product.category)}`} className="hover:text-foreground">{product.category}</Link></li>
              <li>/</li>
              <li className="text-foreground font-medium" aria-current="page">{product.name}</li>
            </ol>
          </nav>
          <Link
            href={returnToResults}
            className="mt-3 inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-foreground font-medium hover:underline"
            data-testid="link-return-to-results"
          >
            <ChevronLeft size={14} /> {productCopy.returnToResultsLabel}
          </Link>
        </div>

        {/* Gallery / Stage */}
        <div
          style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? "none" : "translateY(24px)",
            transition: "opacity 1s cubic-bezier(.16,1,.3,1), transform 1s cubic-bezier(.16,1,.3,1)",
          }}
        >
          {product.materialTurnSets && product.materialTurnSets.length > 0 && !hasDynamicPreview ? (
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
        </div>

        {/* Buy panel */}
        <div
          className="h-max"
          style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? "none" : "translateY(24px)",
            transition: "opacity 1s cubic-bezier(.16,1,.3,1) .15s, transform 1s cubic-bezier(.16,1,.3,1) .15s",
          }}
        >
          <p className="text-[11px] tracking-[0.3em] uppercase mb-3 text-secondary">{product.category} · {productCopy.categorySuffix}</p>
          <h1 className="soso-display text-5xl md:text-6xl font-normal leading-[1.02] text-foreground">{product.name}</h1>
          <p className="soso-display text-lg mt-2 opacity-70 italic text-foreground">{product.note}</p>

          {/* Availability / Price */}
          <div className="flex flex-col gap-2 mt-5 text-foreground">
            <div className="flex items-center gap-4">
              <span className="text-2xl font-medium tracking-wide">{naira(product.price)}</span>
              {product.fulfilmentState === "ready_now" && (
                <span className="text-[10px] uppercase tracking-widest text-green-600/90 font-bold border border-green-600/20 px-2 py-1" data-testid="status-ready-now">{productCopy.readyNowLabel}</span>
              )}
            </div>
            {product.fulfilmentState === "unavailable" ? (
                <p className="text-red-500 font-medium text-sm mt-1" data-testid="text-unavailable">{product.unavailableMessage || productCopy.unavailableLabel}</p>
            ) : (
                <div className="text-sm opacity-80" data-testid="text-dispatch">
                  <p><span className="font-semibold">{productCopy.dispatchLabel}:</span> {product.dispatchMessage}</p>
                  <p className="mt-1 text-xs opacity-70">{productCopy.dispatchNotDeliveryMessage}</p>
                </div>
            )}
          </div>

          <p className="mt-6 text-[15px] leading-relaxed opacity-85 max-w-md text-foreground">
            {product.description}
          </p>
          <dl className="mt-6 grid grid-cols-3 gap-px border border-border bg-border text-sm">
            {[
              [productCopy.colourLabel, product.colour],
              [productCopy.fabricLabel, product.fabric],
              [productCopy.fitLabel, product.fit],
            ].map(([label, value]) => <div key={label} className="bg-background p-3">
              <dt className="text-[10px] uppercase tracking-wider opacity-55">{label}</dt>
              <dd className="mt-1 font-medium">{value}</dd>
            </div>)}
          </dl>

          {/* Colour / Sizing / Purchase Options */}
          {product.fulfilmentState !== "unavailable" && (
            <div className="mt-8 space-y-8">
              {!hasMappedChoices && (
                <p role="status" className="border border-black/10 p-4 text-sm opacity-75" data-testid="status-product-unmapped">
                  {productCopy.productUnmappedPurchaseMessage}
                </p>
              )}

              {/* Colour Picker */}
              {(product.colourOptions?.length > 0 || product.allowCustomColour) && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] tracking-[0.2em] uppercase font-medium text-foreground">{productCopy.colourLabel}</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {product.colourOptions?.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedColourId(c.id)}
                        className={`group relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${selectedColourId === c.id ? 'border-foreground' : 'border-transparent hover:border-border'}`}
                        aria-label={`Select colour ${c.label}`}
                      >
                        <span className="w-8 h-8 rounded-full border border-black/10" style={{ backgroundColor: c.hex }} />
                      </button>
                    ))}
                    {product.allowCustomColour && (
                      <button
                        type="button"
                        onClick={() => setSelectedColourId("custom")}
                        className={`group relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${selectedColourId === "custom" ? 'border-foreground' : 'border-transparent hover:border-border'}`}
                        aria-label="Custom Colour"
                      >
                        <span className="w-8 h-8 rounded-full border border-border flex items-center justify-center bg-muted text-muted-foreground group-hover:bg-foreground group-hover:text-background transition-colors">
                          +
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Selected Colour Details */}
                  <div className="mt-4">
                    {selectedColourId === "custom" ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium">{productCopy.customLabel} {productCopy.colourLabel}</p>
                        <input
                          type="text"
                          value={customColour}
                          onChange={(e) => setCustomColour(e.target.value.slice(0, 50))}
                          placeholder="e.g. Emerald Green, Navy Blue..."
                          className="w-full bg-transparent border border-border px-4 py-3 outline-none focus:border-foreground text-sm"
                          maxLength={50}
                        />
                        <p className="text-[11px] opacity-60">Subject to atelier confirmation. We will contact you to confirm fabric availability.</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium">
                          {selectedColour?.label}
                        </p>
                        {!hasDynamicPreview && (
                          <p className="text-[11px] opacity-60 text-amber-600/90 mt-1">
                            A preview is currently unavailable for {selectedColour?.label}. The garment will be crafted in this colour.
                          </p>
                        )}
                        {hasDynamicPreview && !selectedColour?.previewImageSrc && (
                          <p className="text-[11px] opacity-60 mt-1">
                            This preview is an illustration of {selectedColour?.label}. Actual garment colour may vary slightly by fabric.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {standardSizes.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] tracking-[0.2em] uppercase font-medium text-foreground">{productCopy.sizeSelectorLabel}</span>
                    <button onClick={() => { setGuideOpen(true); trackStorefrontEvent("size_guide_opened", { productSlug: product.slug }); }} className="text-[12px] underline underline-offset-4 hover:opacity-70 text-foreground">
                      {productCopy.sizePrompt}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {standardSizes.map((s) => {
                      const isReadyNow = product.readyNowSizes?.includes(s);
                      return (
                        <button
                          type="button"
                          key={s}
                          onClick={() => {
                            setSize(s);
                            trackStorefrontEvent("size_selected", { productSlug: product.slug, selectedSize: s });
                          }}
                          className="px-5 py-2.5 text-sm tracking-wide transition-all duration-300 relative border border-border"
                          aria-pressed={size === s}
                           aria-label={`${s} — ${isReadyNow ? productCopy.readyNowLabel : productCopy.madeImmediatelyLabel}`}
                          style={
                            size === s
                              ? { background: "hsl(var(--foreground))", color: "hsl(var(--background))" }
                              : { background: "transparent", color: "hsl(var(--foreground))" }
                          }
                          data-testid={`button-size-${s}`}
                        >
                          {s}
                          <span className={`ml-2 text-[9px] uppercase tracking-wider ${isReadyNow ? "text-green-600" : "opacity-60"}`}>
                            {isReadyNow ? productCopy.readyNowLabel : productCopy.madeImmediatelyLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[12px] mt-2 opacity-60">
                    {productCopy.standardSizeHelp}
                  </p>
                  {size && size !== "Custom" && <p role="status" className="mt-2 text-xs font-medium" data-testid="status-selected-standard-fulfilment">
                    {product.readyNowSizes.includes(size) ? productCopy.readyNowLabel : productCopy.madeImmediatelyLabel}
                    {" · "}{product.dispatchMessage}
                  </p>}
                </div>
              )}
              {!product.standardEligible && <p className="border border-black/10 p-4 text-sm opacity-65">{productCopy.standardUnavailableMessage}</p>}

              {product.customEligible && customIsMappable && (
                <div className="pt-5 border-t border-border">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] tracking-[0.2em] uppercase font-medium">{productCopy.customLabel}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSize("Custom");
                      trackStorefrontEvent("size_selected", { productSlug: product.slug, selectedSize: "Custom" });
                    }}
                    className="w-full px-5 py-3.5 text-sm tracking-wide transition-all duration-300 border text-left flex justify-between items-center border-border"
                    aria-pressed={size === "Custom"}
                    style={
                      size === "Custom"
                        ? { background: "hsl(var(--foreground))", color: "hsl(var(--background))" }
                        : { background: "transparent", color: "hsl(var(--foreground))" }
                    }
                    data-testid="button-size-custom"
                  >
                    <span>{productCopy.customSizingLabel}</span>
                    {size === "Custom" && <span className="text-[10px] uppercase tracking-widest">{productCopy.selectedLabel}</span>}
                  </button>
                  <p className="text-[12px] mt-2 opacity-60">
                    {productCopy.customSizeHelp}
                  </p>
                  {size === "Custom" && <p role="status" className="mt-2 text-xs font-medium" data-testid="status-selected-custom-fulfilment">
                    {productCopy.madeToOrderLabel} · {product.dispatchMessage}
                  </p>}
                </div>
              )}
              {!product.customEligible && <p className="border border-black/10 p-4 text-sm opacity-65">{productCopy.customUnavailableMessage}</p>}
            </div>
          )}

          {/* CTAs */}
          <div className="mt-8 space-y-3">
            <button
              onClick={handleAddToCart}
              disabled={needSize || needCustomColour || isUnavailable || !isPurchasable}
              className={`w-full py-4 text-[13px] tracking-[0.25em] uppercase font-bold transition-all duration-300 border ${!needSize && !needCustomColour && !isUnavailable && isPurchasable ? "hover:opacity-90 border-foreground bg-foreground text-background" : "cursor-not-allowed opacity-50 border-border bg-muted text-muted-foreground"}`}
              data-testid="button-add-to-cart"
            >
              {isUnavailable
                ? productCopy.unavailableLabel
                : needSize
                  ? productCopy.sizeRequiredLabel
                  : needCustomColour
                    ? "Enter Custom Colour"
                    : !isPurchasable
                      ? productCopy.unavailableInSizeLabel
                      : `${productCopy.addToBagLabel.replace(/bag/i, 'Cart')}${productCopy.addToBagPriceSeparator}${naira(product.price)}`}
            </button>
            <button
              type="button"
              onClick={() => { setStylistOpen(true); trackStorefrontEvent("cta_clicked", { ctaLabel: "ask_stylist", productSlug: product.slug, articleSlug: editorialOrigin() }); }}
              className="w-full block text-center py-4 text-[13px] tracking-[0.2em] uppercase transition-colors duration-300 border border-border text-foreground hover:bg-muted"
            >
              {supportCopy.productCtaLabel}
            </button>
            <p className="text-center text-[12px] opacity-60 mt-2">
              {supportCopy.productHelp}
            </p>
          </div>

          {/* Trust strip */}
          <div className="grid grid-cols-3 gap-px mt-8 bg-border">
            {productCopy.trustItems.map((item) => (
              <div key={item.title} className="p-4 text-center bg-background">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-[11px] opacity-60 mt-1 leading-snug">{item.body}</p>
              </div>
            ))}
          </div>

          {/* Details & Assurances Accordion */}
          <div className="mt-8 border-t border-border">
            <Accordion.Root type="multiple" className="w-full">
              <Accordion.Item value="details" className="border-b border-border">
                <Accordion.Header>
                  <Accordion.Trigger className="w-full flex items-center justify-between py-5 text-[12px] tracking-[0.2em] uppercase font-semibold hover:text-primary transition-colors group">
                      <span>
                        <span className="block text-[10px] font-normal text-secondary/70">{productCopy.detailsEyebrow}</span>
                        {productCopy.compositionCareHeading}
                      </span>
                    <ChevronDown size={16} className="transition-transform duration-300 group-data-[state=open]:rotate-180" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <div className="pb-5 space-y-4 text-sm opacity-85">
                     <p className="font-semibold">{productCopy.detailsHeading}</p>
                     {detailsToUse.map((item) => <p key={`${item.title}-${item.body}`}><span className="font-semibold">{item.title}</span> {item.body}</p>)}
                  </div>
                </Accordion.Content>
              </Accordion.Item>

              <Accordion.Item value="delivery" className="border-b border-border">
                <Accordion.Header>
                  <Accordion.Trigger className="w-full flex items-center justify-between py-5 text-[12px] tracking-[0.2em] uppercase font-semibold hover:text-primary transition-colors group">
                      <span>
                        <span className="block text-[10px] font-normal text-secondary/70">{productCopy.assurancesEyebrow}</span>
                        {productCopy.deliveryReturnsHeading}
                      </span>
                    <ChevronDown size={16} className="transition-transform duration-300 group-data-[state=open]:rotate-180" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <div className="pb-5 space-y-4 text-sm opacity-85">
                     <p className="font-semibold">{productCopy.assurancesHeading}</p>
                    {assurancesToUse.map((item) => (
                      <div key={item.title}>
                        <p className="font-semibold text-primary">{item.title}</p>
                        <p className="mt-1">{item.body}</p>
                      </div>
                    ))}
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            </Accordion.Root>
          </div>
        </div>
      </div>

      {/* Marquee */}
      <div className="overflow-hidden py-4 border-y border-border bg-background text-foreground">
        <div className="flex whitespace-nowrap soso-marquee" style={{ width: "max-content" }}>
          {[0, 1].map((k) => (
            <span key={k} className="soso-display text-lg tracking-wide">
              {Array(4)
                .fill(productCopy.marqueeText)
                .map((t, i) => (
                  <span key={i} className="mx-8">
                    <span className="mr-8" style={{ color: "hsl(var(--primary))" }}>{productCopy.marqueeSymbol}</span>
                    {t}
                  </span>
                ))}
            </span>
          ))}
        </div>
      </div>

      {/* ————— COMPLETE THE LOOK ————— */}
      {look.length > 0 && (
        <section className="max-w-[1440px] mx-auto px-6 md:px-12 py-24">
          <Reveal>
            <h2 className="soso-display text-4xl font-normal mb-10">{productCopy.relatedHeading}</h2>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {look.map((p, i) => (
              <Reveal key={p.name} delay={i * 90}>
                <ProductCard product={p} testIdPrefix="related" ctaLabel={productCopy.quickShopTitle} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* Sticky mobile buy bar */}
      <div
        className="fixed bottom-0 left-0 right-0 md:hidden flex items-center gap-3 px-4 py-3 z-40 bg-background/95 backdrop-blur-md border-t border-border"
      >
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-widest text-secondary">{product.name}</p>
          <p className="text-sm text-foreground font-medium">{naira(product.price)}</p>
        </div>
        <button
          onClick={handleAddToCart}
          disabled={needSize || needCustomColour || isUnavailable || !isPurchasable}
          className={`px-6 py-3 text-[12px] tracking-[0.2em] uppercase font-bold transition-all border ${needSize || needCustomColour || isUnavailable || !isPurchasable ? "opacity-50 cursor-not-allowed border-border bg-muted text-muted-foreground" : "border-foreground bg-foreground text-background"}`}
          data-testid="button-mobile-add-to-cart"
        >
          {isUnavailable ? productCopy.unavailableLabel : needSize ? productCopy.mobileSizeRequiredLabel : needCustomColour ? "Colour Required" : !isPurchasable ? productCopy.unavailableInSizeLabel : productCopy.addToBagLabel.replace(/bag/i, 'Cart')}
        </button>
      </div>

      {/* Size guide modal */}
      {guideOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setGuideOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="size-guide-title" className="max-w-lg w-full p-8 relative bg-background border border-border" onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-4 right-5 text-2xl opacity-60 hover:opacity-100 text-foreground" onClick={() => setGuideOpen(false)} aria-label={productCopy.sizeGuideCloseLabel}>
              ×
            </button>
            <h3 id="size-guide-title" className="soso-display text-3xl font-normal text-foreground">{sizeGuide.title}</h3>
            <p className="text-sm opacity-70 mt-2 text-foreground">{sizeGuide.intro}</p>
            <table className="w-full mt-6 text-sm text-foreground">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest opacity-60">
                  {sizeGuide.columns.map((column, index) => <th key={column} className={index === 0 ? "py-2" : undefined}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {sizeGuide.rows.map((row) => (
                  <tr key={row.size} className="border-t border-border">
                    {[row.size, ...row.values].map((c, i) => (
                      <td key={i} className={`py-2.5 ${i === 0 ? "font-semibold" : "opacity-75"}`}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <form
              className="mt-6 border p-4 text-sm bg-muted/30 border-border text-foreground"
              onSubmit={(event) => {
                event.preventDefault();
                setFitAssistantSubmitted(true);
              }}
            >
               <h4 className="font-semibold">{productCopy.fitAssistant.title}</h4>
              <p className="mt-1 text-[12px] leading-relaxed opacity-75">
                 {productCopy.fitAssistant.intro}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-[11px] uppercase tracking-wider">
                   {productCopy.fitAssistant.heightLabel}
                  <input required name="height" inputMode="decimal" maxLength={30} className="mt-1.5 w-full border border-[#cfc4ac] bg-[#F7F3EB] px-3 py-2 text-sm normal-case tracking-normal outline-none focus:border-[#0f6b43]" />
                </label>
                <label className="text-[11px] uppercase tracking-wider">
                   {productCopy.fitAssistant.weightLabel}
                  <input required name="weight" inputMode="decimal" maxLength={30} className="mt-1.5 w-full border border-[#cfc4ac] bg-[#F7F3EB] px-3 py-2 text-sm normal-case tracking-normal outline-none focus:border-[#0f6b43]" />
                </label>
                <label className="text-[11px] uppercase tracking-wider">
                   {productCopy.fitAssistant.chestLabel}
                  <input required name="chest" inputMode="decimal" maxLength={30} className="mt-1.5 w-full border border-[#cfc4ac] bg-[#F7F3EB] px-3 py-2 text-sm normal-case tracking-normal outline-none focus:border-[#0f6b43]" />
                </label>
                <label className="text-[11px] uppercase tracking-wider">
                   {productCopy.fitAssistant.preferredFitLabel}
                  <select required name="preferredFit" defaultValue="" className="mt-1.5 w-full border border-[#cfc4ac] bg-[#F7F3EB] px-3 py-2 text-sm normal-case tracking-normal outline-none focus:border-[#0f6b43]">
                     <option value="" disabled>{productCopy.fitAssistant.preferredFitPlaceholder}</option>
                     {productCopy.fitAssistant.preferredFitOptions.map((option) => (
                       <option key={option.value} value={option.value}>{option.label}</option>
                     ))}
                  </select>
                </label>
              </div>
              <label className="mt-3 block text-[11px] uppercase tracking-wider">
                 {productCopy.fitAssistant.occasionLabel}
                 <input required name="occasion" maxLength={120} placeholder={productCopy.fitAssistant.occasionPlaceholder} className="mt-1.5 w-full border border-[#cfc4ac] bg-[#F7F3EB] px-3 py-2 text-sm normal-case tracking-normal outline-none placeholder:opacity-55 focus:border-[#0f6b43]" />
              </label>
              <button type="submit" className="mt-4 border border-[#0f6b43] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0f6b43]">
                 {productCopy.fitAssistant.submitLabel}
              </button>
              {fitAssistantSubmitted && (
                <p role="status" className="mt-3 text-[12px] leading-relaxed">
                   {productCopy.fitAssistant.submittedMessage}
                </p>
              )}
            </form>
            <div className="mt-4 p-4 text-sm" style={{ background: "#EFE8DA" }}>
               {sizeGuide.customHelp}
             </div>
            <button
              type="button"
              onClick={() => {
                setGuideOpen(false);
                setStylistOpen(true);
              }}
              className="w-full mt-5 py-3.5 text-[12px] tracking-[0.2em] uppercase flex items-center justify-center gap-2"
              style={{ background: "#128C56", color: "#fff" }}
            >
               <WhatsAppIcon size={16} /> {supportCopy.fitCtaLabel}
            </button>
          </div>
        </div>
      )}
       <StylistEnquiryDialog
         isOpen={stylistOpen}
         onClose={() => setStylistOpen(false)}
         productSlug={product.slug}
         productName={product.name}
       />
    </div>
  );
}
