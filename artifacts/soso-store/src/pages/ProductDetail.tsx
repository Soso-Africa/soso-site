import React, { useEffect, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { products } from "@/data/products";
import { Reveal } from "@/components/Reveal";
import { WhatsAppIcon } from "@/components/Icons";
import { useCart } from "@/context/CartContext";
import { naira } from "@/lib/utils";
import { Seo } from "@/components/Seo";
import { StylistEnquiryDialog } from "@/components/StylistEnquiryDialog";
import { trackStorefrontEvent } from "@/components/ConsentManager";
import { catalogApproved } from "@/lib/seo";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:slug");
  const [, setLocation] = useLocation();
  const { addItem } = useCart();
  
  const product = products.find((p) => p.slug === params?.slug);
  
  const [size, setSize] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [stylistOpen, setStylistOpen] = useState(false);
  const [img, setImg] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Reset state on route change
    setSize(null);
    setImg(0);
    setLoaded(false);
    
    if (!product) {
      setLocation("/shop");
      return;
    }
    
    const t = setTimeout(() => setLoaded(true), 60);
    return () => clearTimeout(t);
  }, [product, setLocation]);

  useEffect(() => {
    if (product) trackStorefrontEvent("product_view", { productSlug: product.slug });
  }, [product]);

  if (!product) return null;

  const gallery = [{ src: product.img, label: product.name }];

  const needSize = size === null;

  const handleAddToCart = () => {
    if (needSize) return;
    addItem({
      slug: product.slug,
      name: product.name,
      img: product.img,
      price: product.price,
      size: size
    });
    trackStorefrontEvent("add_to_bag", { productSlug: product.slug, selectedSize: size ?? undefined });
    trackStorefrontEvent("cta_clicked", { ctaLabel: "add_to_bag", productSlug: product.slug });
  };

  // 4 random products for Complete the look
  const look = products.filter(p => p.slug !== product.slug).slice(0, 4);

  return (
    <div style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }} className="flex flex-col">
      <Seo
        title={`${product.name} | SOSO Africa`}
        description={`${product.description} View current price and speak to a SOSO stylist for fit assistance.`}
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
            <img src={gallery[img].src} alt={product.name} className="w-full aspect-[2/3] object-cover" />
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
        </div>

        {/* Buy panel */}
        <div
          style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? "none" : "translateY(24px)",
            transition: "opacity 1s cubic-bezier(.16,1,.3,1) .15s, transform 1s cubic-bezier(.16,1,.3,1) .15s",
          }}
        >
          <p className="text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: "hsl(var(--primary))" }}>{product.category} · Made in Abuja</p>
          <h1 className="soso-display text-5xl md:text-6xl font-light leading-[1.02]">{product.name}</h1>
          <p className="soso-display text-lg mt-2 opacity-70 italic">{product.note}</p>

          <div className="flex items-center gap-4 mt-5">
            <span className="text-2xl font-medium tracking-wide">{naira(product.price)}</span>
            <span className="text-sm opacity-80">Made to order · atelier confirms after payment</span>
          </div>

          <p className="mt-6 text-[15px] leading-relaxed opacity-85 max-w-md">
            {product.description}
          </p>

          {/* Size */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] tracking-[0.2em] uppercase font-medium">Select size</span>
              <button onClick={() => { setGuideOpen(true); trackStorefrontEvent("size_guide_opened", { productSlug: product.slug }); }} className="text-[12px] underline underline-offset-4 hover:opacity-70" style={{ color: "hsl(var(--primary))" }}>
                Size guide & fit help
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => {
                    setSize(s);
                    trackStorefrontEvent("size_selected", { productSlug: product.slug, selectedSize: s });
                  }}
                  className="px-5 py-2.5 text-sm tracking-wide transition-all duration-300"
                  aria-pressed={size === s}
                  style={
                    size === s
                      ? { background: "hsl(var(--background))", color: "hsl(var(--foreground))", border: `1px solid hsl(var(--background))` }
                      : { background: "transparent", color: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }
                  }
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[12px] mt-2 opacity-60">
              {size === "Custom"
                ? "After payment, the atelier will follow up to discuss measurements and making details."
                : "Between sizes? Use the size guide or ask a stylist before you add to bag."}
            </p>
          </div>

          {/* CTAs */}
          <div className="mt-7 space-y-3">
            <button
              onClick={handleAddToCart}
              className={`w-full py-4 text-[13px] tracking-[0.25em] uppercase font-bold transition-all duration-300 ${!needSize ? "hover:-translate-y-px" : "cursor-not-allowed"}`}
              style={{
                background: needSize ? "#2a2723" : "hsl(var(--primary))",
                color: needSize ? "#F7F3EB" : "hsl(var(--primary-foreground))",
              }}
            >
              {needSize ? "Select a size to continue" : `Add to bag — ${naira(product.price)}`}
            </button>
            <button
              type="button"
              onClick={() => { setStylistOpen(true); trackStorefrontEvent("cta_clicked", { ctaLabel: "ask_stylist", productSlug: product.slug }); }}
              className="w-full block text-center py-4 text-[13px] tracking-[0.2em] uppercase flex items-center justify-center gap-2 transition-colors duration-300 hover:bg-[#0f3d2e] hover:text-white"
              style={{ border: "1px solid #128C56", color: "#0f6b43" }}
            >
              <WhatsAppIcon size={16} /> Ask about this piece
            </button>
            <p className="text-center text-[12px] opacity-60 mt-2">
              Have a question before you pay? Speak to a stylist for fit or bespoke guidance.
            </p>
          </div>

          {/* Trust strip */}
          <div className="grid grid-cols-3 gap-px mt-8" style={{ background: "#d8cfba" }}>
            {[
              ["Fit support", "Size guide and stylist help"],
              ["Made to order", "Atelier confirms making details after payment"],
              ["Order support", "Questions answered by a SOSO stylist"],
            ].map(([a, b]) => (
              <div key={a} className="p-4 text-center" style={{ background: "#EFE8DA" }}>
                <p className="text-sm font-semibold">{a}</p>
                <p className="text-[11px] opacity-60 mt-1 leading-snug">{b}</p>
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
                .fill("The Architect of the Modern Man")
                .map((t, i) => (
                  <span key={i} className="mx-8">
                    <span className="mr-8" style={{ color: "hsl(var(--primary))" }}>✦</span>
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
            <img src={product.img} alt={`${product.name} detail`} className="w-full aspect-[4/5] object-cover" loading="lazy" />
          </div>
        </Reveal>
        <div>
          <Reveal>
            <p className="text-[11px] tracking-[0.3em] uppercase mb-4" style={{ color: "hsl(var(--primary))" }}>Before you order</p>
            <h2 className="soso-display text-4xl md:text-5xl font-light leading-tight">A considered purchase starts with clear details.</h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-8 space-y-6 text-[15px] leading-relaxed opacity-85 max-w-md">
              <p>
                <span className="font-semibold">Product details.</span> The listed piece, price and size are ready to order. Ask a stylist if you need help before paying.
              </p>
              <p>
                <span className="font-semibold">Fit.</span> Use the size guide as a starting point, then message a stylist if you would like a second opinion or a custom fit.
              </p>
              <p>
                <span className="font-semibold">The making.</span> After payment, the atelier confirms the making details and follows up before production begins.
              </p>
            </div>
          </Reveal>
           <Reveal delay={220}>
             <button type="button" onClick={() => setStylistOpen(true)} className="inline-flex mt-8 text-sm text-[hsl(var(--primary))] underline underline-offset-4">Ask a stylist about this piece</button>
          </Reveal>
        </div>
      </section>

      {/* ————— DELIVERY & RETURNS ————— */}
      <section style={{ background: "hsl(var(--background))", color: "hsl(var(--foreground))" }} className="py-20">
        <div className="max-w-[1280px] mx-auto px-6 md:px-12">
          <Reveal>
            <p className="text-[11px] tracking-[0.3em] uppercase mb-4" style={{ color: "hsl(var(--primary))" }}>No surprises</p>
            <h2 className="soso-display text-4xl md:text-5xl font-light text-white">Buying premium online should feel safe. Here it is, in writing.</h2>
          </Reveal>
          <div className="grid md:grid-cols-4 gap-px mt-12" style={{ background: "#2c2820" }}>
             {[
                ["Made to order", "SOSO can make the piece you choose. After payment, the atelier confirms the requested direction and production timing."],
               ["Sizing", "The size guide is available above, with direct stylist support if you prefer to confirm measurements before ordering."],
                ["Delivery & returns", "Delivery options and made-to-order returns guidance are confirmed in the purchase-support information."],
                ["Order support", "A SOSO stylist can answer product, fitting and order questions if you need help before paying."],
             ].map(([t, b], i) => (
              <Reveal key={t} delay={i * 100}>
                <div className="p-8 h-full" style={{ background: "#181613" }}>
                  <p className="soso-display text-xl mb-3" style={{ color: "hsl(var(--primary))" }}>{t}</p>
                  <p className="text-sm leading-relaxed opacity-75">{b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ————— COMPLETE THE LOOK ————— */}
      <section className="max-w-[1280px] mx-auto px-6 md:px-12 pb-24">
        <Reveal>
          <h2 className="soso-display text-4xl font-light mb-10">Complete the wardrobe</h2>
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {look.map((p, i) => (
            <Reveal key={p.name} delay={i * 90}>
              <Link href={`/product/${p.slug}`} className="cursor-pointer group block">
                <div className="overflow-hidden imgzoom" style={{ background: "hsl(var(--background))" }}>
                  <img src={p.img} alt={p.name} className="w-full aspect-[3/4] object-cover" />
                </div>
                <p className="soso-display mt-3 text-lg group-hover:underline underline-offset-4 group-hover:text-[hsl(var(--primary))] transition-colors">{p.name}</p>
                <p className="text-sm opacity-70">{naira(p.price)}</p>
              </Link>
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
          className="px-6 py-3 text-[12px] tracking-[0.2em] uppercase font-bold transition-all" 
          style={{ background: needSize ? "#2a2723" : "hsl(var(--primary))", color: needSize ? "#fff" : "hsl(var(--primary-foreground))" }}
        >
          {needSize ? "Choose size" : "Add to bag"}
        </button>
      </div>

      {/* Size guide modal */}
      {guideOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: "rgba(18,17,16,.7)" }} onClick={() => setGuideOpen(false)}>
          <div className="max-w-lg w-full p-8 relative" style={{ background: "#F7F3EB" }} onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-4 right-5 text-2xl opacity-60 hover:opacity-100" onClick={() => setGuideOpen(false)} aria-label="Close">
              ×
            </button>
            <h3 className="soso-display text-3xl font-light">Fit guide</h3>
            <p className="text-sm opacity-70 mt-2">Measurements in inches. Cut for a regal, relaxed drape.</p>
            <table className="w-full mt-6 text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest opacity-60">
                  <th className="py-2">Size</th>
                  <th>Chest</th>
                  <th>Length</th>
                  <th>Sleeve</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["S", "38–40", "44", "24.5"],
                  ["M", "41–43", "45", "25"],
                  ["L", "44–46", "46", "25.5"],
                  ["XL", "47–49", "47", "26"],
                  ["XXL", "50–52", "48", "26.5"],
                ].map((row) => (
                  <tr key={row[0]} style={{ borderTop: "1px solid #ddd3bd" }}>
                    {row.map((c, i) => (
                      <td key={i} className={`py-2.5 ${i === 0 ? "font-semibold" : "opacity-75"}`}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-6 p-4 text-sm" style={{ background: "#EFE8DA" }}>
               Not sure? Ask a stylist for fit guidance, or choose <span className="font-semibold">Custom</span> when you need made-to-measure direction.
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
              <WhatsAppIcon size={16} /> Ask a stylist about fit
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
