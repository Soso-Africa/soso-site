import React, { useState } from "react";
import { Link } from "wouter";
import { Reveal } from "@/components/Reveal";
import { naira } from "@/lib/utils";
import { Seo } from "@/components/Seo";
import { catalogApproved } from "@/lib/seo";
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";

export default function Shop() {
  const [activeFilter, setActiveFilter] = useState("__all");
  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;
  if (!platform.data) return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platformStateCopy} />;
  const { products: sourceProducts } = platform.data.content;
  const copy = platform.data.content.pages.shop;
  const filters = ["__all", ...Array.from(new Set(sourceProducts.map((product) => product.category)))];
  const filteredProducts = activeFilter === "__all"
    ? sourceProducts
    : sourceProducts.filter(p => p.category === activeFilter);

  return (
    <div className="flex flex-col pt-10">
      <Seo
        title={copy.seo.title}
        description={copy.seo.description}
        path="/shop"
        noIndex={!catalogApproved}
      />
      <div className="max-w-7xl mx-auto w-full px-6 lg:px-12 flex-1">
        <Reveal>
          <div className="text-center mb-16">
            <p className="text-[11px] tracking-[0.3em] uppercase text-primary">{copy.eyebrow}</p>
            <h1 className="mt-3 soso-display text-4xl md:text-5xl font-light text-white">{copy.title}</h1>
            <p className="mt-4 text-[14px]" style={{ color: "hsl(var(--secondary))" }}>{copy.intro}</p>
          </div>
        </Reveal>

        {/* Filter Bar */}
        <Reveal delay={100}>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 mb-16">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                aria-pressed={activeFilter === f}
                className={`px-5 py-2 text-[11px] tracking-[0.2em] uppercase transition-all duration-300 ${
                  activeFilter === f 
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold"
                    : "bg-transparent text-[hsl(var(--secondary))] border border-[rgba(246,241,231,0.2)] hover:border-[hsl(var(--primary))]"
                }`}
              >
                {f === "__all" ? copy.allFilterLabel : f}
              </button>
            ))}
          </div>
        </Reveal>

        {/* Product Grid */}
        {filteredProducts.length === 0 && <p role="status" className="mb-8 text-center text-sm text-[hsl(var(--secondary))]">{copy.emptyMessage}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-14 pb-24">
          {filteredProducts.map((p, i) => (
            <Reveal key={p.name} delay={(i % 3) * 120}>
              <Link href={`/product/${p.slug}`} className="soso-card group block cursor-pointer">
                <div className="relative overflow-hidden" style={{ aspectRatio: "3/4", backgroundColor: "#1a1712" }}>
                  <img src={p.img} alt={p.name} className="w-full h-full object-cover object-top" />
                  <span className="absolute top-4 left-4 text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 font-semibold" style={{ backgroundColor: "rgba(16,14,11,0.85)", color: "hsl(var(--primary))", border: `1px solid rgba(184,145,47,0.4)` }}>
                    {p.tag}
                  </span>
                  <div className="soso-cta-row absolute inset-x-4 bottom-4 flex gap-2">
                    <div className="soso-btn-gold flex-1 flex items-center justify-center text-[11px] tracking-[0.15em] uppercase py-3 font-bold" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
                       {copy.productCtaLabel}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="soso-display text-[19px] text-white group-hover:text-[hsl(var(--primary))] transition-colors">{p.name}</h3>
                    <p className="text-[12px] mt-1" style={{ color: "hsl(var(--secondary))" }}>{p.note}</p>
                  </div>
                  <p className="text-[15px] font-semibold whitespace-nowrap" style={{ color: "hsl(var(--primary))" }}>{naira(p.price)}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}
