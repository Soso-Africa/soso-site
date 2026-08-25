import React, { useEffect, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { Reveal } from "@/components/Reveal";
import { WhatsAppIcon } from "@/components/Icons";
import { useCart } from "@/context/CartContext";
import { naira } from "@/lib/utils";
import { Seo } from "@/components/Seo";
import { StylistEnquiryDialog } from "@/components/StylistEnquiryDialog";
import { editorialOrigin, trackStorefrontEvent } from "@/components/ConsentManager";
import { catalogApproved } from "@/lib/seo";
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";
import { ProductCard } from "@/components/ProductCard";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:slug");
  const [, setLocation] = useLocation();
  const { addItem } = useCart();
  
  const platform = usePlatformContent();
  const platformContent = platform.data?.content;
  const product = platformContent?.products.find((item) => item.slug === params?.slug);
  
  const [size, setSize] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [fitAssistantSubmitted, setFitAssistantSubmitted] = useState(false);
  const [stylistOpen, setStylistOpen] = useState(false);
  const [img, setImg] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Reset state on route change
    setSize(null);
    setImg(0);
    setLoaded(false);
    
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

  if (!product) {
    return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platform.data?.content.site.platformState} />;
  }

  const gallery = product.images?.length
    ? product.images.map((image) => ({ src: image.src, label: image.alt, provenance: image.provenance }))
    : [{ src: product.img, label: product.name, provenance: null }];
  const productCopy = platformContent!.productCopy;
  const supportCopy = platformContent!.supportCopy;
  const sizeGuide = platformContent!.sizeGuide;

  const needSize = size === null;

  const handleAddToCart = () => {
    if (needSize || product.fulfilmentState === "unavailable") return;
    addItem({
      slug: product.slug,
      name: product.name,
      img: product.img,
      price: product.price,
      size: size,
      commerceProductId: product.commerceProductId,
      commerceVariantId: product.commerceVariantIds?.[size ?? ""],
    });
    trackStorefrontEvent("cta_clicked", { ctaLabel: "add_to_bag", productSlug: product.slug, articleSlug: editorialOrigin() });
  };

  // 4 random products for Complete the look
  const relatedSlugs = product.relatedProductSlugs ?? [];
  const look = platformContent!.products
    .filter((item) => item.slug !== product.slug && (!relatedSlugs.length || relatedSlugs.includes(item.slug)))
    .slice(0, 4);

  return (
    <div style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }} className="flex flex-col">
      <Seo
        title={`${product.name} | ${productCopy.seoTitleSuffix}`}
        description={`${product.description} ${productCopy.seoDescriptionSuffix}`}
        path={`/product/${product.slug}`}
        product={product}
        noIndex={!catalogApproved}
      />
      {/* ————— HERO / BUY BLOCK ————— */}
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 grid md:grid-cols-2 gap-10 md:gap-16 pt-8 md:pt-14 pb-16">
        {/* Gallery */}
        <div
          style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? "none" : "translateY(24px)",
            transition: "opacity 1s cubic-bezier(.16,1,.3,1), transform 1s cubic-bezier(.16,1,.3,1)",
          }}
        >
          <div className="relative overflow-hidden imgzoom" style={{ background: "hsl(var(--background))" }}>
            <img src={gallery[img].src} alt={gallery[img].label} className="w-full aspect-[2/3] object-cover" />
            <div className="absolute top-4 left-4 text-[10px] tracking-[0.25em] uppercase px-3 py-1.5" style={{ background: "rgba(18,17,16,.75)", color: "hsl(var(--primary))", backdropFilter: "blur(4px)" }}>
              {product.tag}
            </div>
          </div>
          <div className="flex gap-3 mt-3">
            {gallery.map((g, i) => (
              <button
                key={i}
                onClick={() => { setImg(i); if (i !== img) trackStorefrontEvent("product_image_viewed", { productSlug: product.slug, imageIndex: i }); }}
                className="w-20 overflow-hidden"
                style={{ outline: i === img ? `2px solid hsl(var(--primary))` : "1px solid #d8cfba", outlineOffset: 2 }}
                aria-label={g.label}
              >
                <img src={g.src} alt={g.label} className="aspect-[3/4] object-cover w-full" />
              </button>
            ))}
          </div>
          {gallery[img].provenance && <p className="mt-3 text-[10px] uppercase tracking-wider opacity-55">
            Image: {gallery[img].provenance.credit || gallery[img].provenance.source}
          </p>}
        </div>

        {/* Buy panel */}
        <div
          style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? "none" : "translateY(24px)",
            transition: "opacity 1s cubic-bezier(.16,1,.3,1) .15s, transform 1s cubic-bezier(.16,1,.3,1) .15s",
          }}
        >
          <p className="text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: "hsl(var(--primary))" }}>{product.category} · {productCopy.categorySuffix}</p>
          <h1 className="soso-display text-5xl md:text-6xl font-light leading-[1.02]">{product.name}</h1>
          <p className="soso-display text-lg mt-2 opacity-70 italic">{product.note}</p>

          {/* Availability / Price */}
          <div className="flex flex-col gap-2 mt-5">
            <div className="flex items-center gap-4">
              <span className="text-2xl font-medium tracking-wide">{naira(product.price)}</span>
              {product.fulfilmentState === "ready_now" && (
                <span className="text-[10px] uppercase tracking-widest text-green-600/90 font-bold border border-green-600/20 px-2 py-1" data-testid="status-ready-now">Ready Now</span>
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

          <p className="mt-6 text-[15px] leading-relaxed opacity-85 max-w-md">
            {product.description}
          </p>
          <dl className="mt-6 grid grid-cols-3 gap-px border border-[#d8cfba] bg-[#d8cfba] text-sm">
            {[
              [productCopy.colourLabel, product.colour],
              [productCopy.fabricLabel, product.fabric],
              [productCopy.fitLabel, product.fit],
            ].map(([label, value]) => <div key={label} className="bg-[#EFE8DA] p-3">
              <dt className="text-[10px] uppercase tracking-wider opacity-55">{label}</dt>
              <dd className="mt-1 font-medium">{value}</dd>
            </div>)}
          </dl>

          {/* Sizing / Purchase Options */}
          {product.fulfilmentState !== "unavailable" && (
            <div className="mt-8 space-y-8">
              {product.standardEligible && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] tracking-[0.2em] uppercase font-medium">{productCopy.sizeSelectorLabel}</span>
                    <button onClick={() => { setGuideOpen(true); trackStorefrontEvent("size_guide_opened", { productSlug: product.slug }); }} className="text-[12px] underline underline-offset-4 hover:opacity-70" style={{ color: "hsl(var(--primary))" }}>
                      {productCopy.sizePrompt}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {product.standardSizes?.map((s) => {
                      const isReadyNow = product.readyNowSizes?.includes(s);
                      return (
                        <button
                          type="button"
                          key={s}
                          onClick={() => {
                            setSize(s);
                            trackStorefrontEvent("size_selected", { productSlug: product.slug, selectedSize: s });
                          }}
                          className="px-5 py-2.5 text-sm tracking-wide transition-all duration-300 relative"
                          aria-pressed={size === s}
                           aria-label={`${s} — ${isReadyNow ? productCopy.readyNowLabel : productCopy.madeImmediatelyLabel}`}
                          style={
                            size === s
                              ? { background: "hsl(var(--background))", color: "hsl(var(--foreground))", border: `1px solid hsl(var(--background))` }
                              : { background: "transparent", color: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }
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

              {product.customEligible && (
                <div className="pt-5 border-t border-black/10 dark:border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] tracking-[0.2em] uppercase font-medium">Custom</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSize("Custom");
                      trackStorefrontEvent("size_selected", { productSlug: product.slug, selectedSize: "Custom" });
                    }}
                    className="w-full px-5 py-3.5 text-sm tracking-wide transition-all duration-300 border text-left flex justify-between items-center"
                    aria-pressed={size === "Custom"}
                    style={
                      size === "Custom"
                        ? { background: "hsl(var(--background))", color: "hsl(var(--foreground))", border: `1px solid hsl(var(--background))` }
                        : { background: "transparent", color: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }
                    }
                    data-testid="button-size-custom"
                  >
                    <span>Custom atelier sizing</span>
                    {size === "Custom" && <span className="text-[10px] uppercase tracking-widest">Selected</span>}
                  </button>
                  <p className="text-[12px] mt-2 opacity-60">
                    {productCopy.customSizeHelp}
                  </p>
                  {size === "Custom" && <p role="status" className="mt-2 text-xs font-medium" data-testid="status-selected-custom-fulfilment">
                    {productCopy.madeImmediatelyLabel} · {product.dispatchMessage}
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
              disabled={needSize || product.fulfilmentState === "unavailable"}
              className={`w-full py-4 text-[13px] tracking-[0.25em] uppercase font-bold transition-all duration-300 ${!needSize && product.fulfilmentState !== "unavailable" ? "hover:-translate-y-px" : "cursor-not-allowed opacity-50"}`}
              style={{
                background: needSize || product.fulfilmentState === "unavailable" ? "#2a2723" : "hsl(var(--primary))",
                color: needSize || product.fulfilmentState === "unavailable" ? "#F7F3EB" : "hsl(var(--primary-foreground))",
              }}
              data-testid="button-add-to-cart"
            >
              {product.fulfilmentState === "unavailable"
                ? productCopy.unavailableLabel
                : needSize
                  ? productCopy.sizeRequiredLabel
                  : `${productCopy.addToBagLabel} — ${naira(product.price)}`}
            </button>
            <button
              type="button"
              onClick={() => { setStylistOpen(true); trackStorefrontEvent("cta_clicked", { ctaLabel: "ask_stylist", productSlug: product.slug, articleSlug: editorialOrigin() }); }}
              className="w-full block text-center py-4 text-[13px] tracking-[0.2em] uppercase flex items-center justify-center gap-2 transition-colors duration-300 hover:bg-[#0f3d2e] hover:text-white"
              style={{ border: "1px solid #128C56", color: "#0f6b43" }}
            >
              <WhatsAppIcon size={16} /> {supportCopy.productCtaLabel}
            </button>
            <p className="text-center text-[12px] opacity-60 mt-2">
              {supportCopy.productHelp}
            </p>
          </div>

          {/* Trust strip */}
          <div className="grid grid-cols-3 gap-px mt-8" style={{ background: "#d8cfba" }}>
            {productCopy.trustItems.map((item) => (
              <div key={item.title} className="p-4 text-center" style={{ background: "#EFE8DA" }}>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-[11px] opacity-60 mt-1 leading-snug">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Marquee */}
      <div className="overflow-hidden py-4 border-y" style={{ borderColor: "#e0d7c4", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
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

      {/* ————— PRODUCT NOTES ————— */}
      <section className="max-w-[1280px] mx-auto px-6 md:px-12 py-20 grid md:grid-cols-2 gap-12 items-center">
        <Reveal>
          <div className="overflow-hidden imgzoom">
            <img src={product.img} alt={`${product.name} ${productCopy.detailImageAltSuffix}`} className="w-full aspect-[4/5] object-cover" loading="lazy" />
          </div>
        </Reveal>
        <div>
          <Reveal>
            <p className="text-[11px] tracking-[0.3em] uppercase mb-4" style={{ color: "hsl(var(--primary))" }}>{productCopy.detailsEyebrow}</p>
            <h2 className="soso-display text-4xl md:text-5xl font-light leading-tight">{productCopy.detailsHeading}</h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-8 space-y-6 text-[15px] leading-relaxed opacity-85 max-w-md">
              {productCopy.details.map((item) => <p key={item.title}><span className="font-semibold">{item.title}</span> {item.body}</p>)}
            </div>
          </Reveal>
           <Reveal delay={220}>
              <button type="button" onClick={() => setStylistOpen(true)} className="inline-flex mt-8 text-sm text-[hsl(var(--primary))] underline underline-offset-4">{supportCopy.productDetailsCtaLabel}</button>
          </Reveal>
        </div>
      </section>

      {/* ————— DELIVERY & RETURNS ————— */}
      <section style={{ background: "hsl(var(--background))", color: "hsl(var(--foreground))" }} className="py-20">
        <div className="max-w-[1280px] mx-auto px-6 md:px-12">
          <Reveal>
            <p className="text-[11px] tracking-[0.3em] uppercase mb-4" style={{ color: "hsl(var(--primary))" }}>{productCopy.assurancesEyebrow}</p>
            <h2 className="soso-display text-4xl md:text-5xl font-light text-white">{productCopy.assurancesHeading}</h2>
          </Reveal>
          <div className="grid md:grid-cols-4 gap-px mt-12" style={{ background: "#2c2820" }}>
             {productCopy.assurances.map((item, i) => (
               <Reveal key={item.title} delay={i * 100}>
                <div className="p-8 h-full" style={{ background: "#181613" }}>
                   <p className="soso-display text-xl mb-3" style={{ color: "hsl(var(--primary))" }}>{item.title}</p>
                   <p className="text-sm leading-relaxed opacity-75">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ————— COMPLETE THE LOOK ————— */}
      <section className="max-w-[1440px] mx-auto px-6 md:px-12 pb-24">
        <Reveal>
          <h2 className="soso-display text-4xl font-light mb-10">{productCopy.relatedHeading}</h2>
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {look.map((p, i) => (
            <Reveal key={p.name} delay={i * 90}>
              <ProductCard product={p} testIdPrefix="related" />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Sticky mobile buy bar */}
      <div
        className="fixed bottom-0 left-0 right-0 md:hidden flex items-center gap-3 px-4 py-3 z-40"
        style={{ background: "rgba(18,17,16,.96)", backdropFilter: "blur(8px)", borderTop: `1px solid hsl(var(--primary))` }}
      >
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-widest" style={{ color: "hsl(var(--primary))" }}>{product.name}</p>
          <p className="text-sm text-white font-medium">{naira(product.price)}</p>
        </div>
        <button 
          onClick={handleAddToCart}
          disabled={needSize || product.fulfilmentState === "unavailable"}
          className={`px-6 py-3 text-[12px] tracking-[0.2em] uppercase font-bold transition-all ${needSize || product.fulfilmentState === "unavailable" ? "opacity-50 cursor-not-allowed" : ""}`}
          style={{ background: needSize || product.fulfilmentState === "unavailable" ? "#2a2723" : "hsl(var(--primary))", color: needSize || product.fulfilmentState === "unavailable" ? "#fff" : "hsl(var(--primary-foreground))" }}
          data-testid="button-mobile-add-to-cart"
        >
          {product.fulfilmentState === "unavailable" ? productCopy.unavailableLabel : needSize ? productCopy.mobileSizeRequiredLabel : productCopy.addToBagLabel}
        </button>
      </div>

      {/* Size guide modal */}
      {guideOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: "rgba(18,17,16,.7)" }} onClick={() => setGuideOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="size-guide-title" className="max-w-lg w-full p-8 relative" style={{ background: "#F7F3EB" }} onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-4 right-5 text-2xl opacity-60 hover:opacity-100" onClick={() => setGuideOpen(false)} aria-label={productCopy.sizeGuideCloseLabel}>
              ×
            </button>
            <h3 id="size-guide-title" className="soso-display text-3xl font-light">{sizeGuide.title}</h3>
            <p className="text-sm opacity-70 mt-2">{sizeGuide.intro}</p>
            <table className="w-full mt-6 text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest opacity-60">
                  {sizeGuide.columns.map((column, index) => <th key={column} className={index === 0 ? "py-2" : undefined}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {sizeGuide.rows.map((row) => (
                  <tr key={row.size} style={{ borderTop: "1px solid #ddd3bd" }}>
                    {[row.size, ...row.values].map((c, i) => (
                      <td key={i} className={`py-2.5 ${i === 0 ? "font-semibold" : "opacity-75"}`}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <form
              className="mt-6 border p-4 text-sm"
              style={{ background: "#EFE8DA", borderColor: "#ddd3bd" }}
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
