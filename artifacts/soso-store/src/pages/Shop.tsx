import React, { useState } from "react";
import { Link } from "wouter";
import { products } from "@/data/products";
import { Reveal } from "@/components/Reveal";
import { naira } from "@/lib/utils";
import { Seo } from "@/components/Seo";

const FILTERS = ["All", "Kaftans", "Agbadas", "Dashikis", "Two-Piece", "Shirts"];

export default function Shop() {
  const [activeFilter, setActiveFilter] = useState("All");

  const filteredProducts = activeFilter === "All" 
    ? products 
    : products.filter(p => p.category === activeFilter);

  return (
    <div className="flex flex-col pt-10">
      <Seo
        title="Shop premium menswear | SOSO Africa"
        description="Browse SOSO Africa kaftans, agbadas, dashikis, two-piece sets and shirts. Confirm fit and bespoke production details before payment."
        path="/shop"
      />
      <div className="max-w-7xl mx-auto w-full px-6 lg:px-12 flex-1">
        <Reveal>
          <div className="text-center mb-16">
            <h1 className="soso-display text-4xl md:text-5xl font-light text-white">The Collection</h1>
            <p className="mt-4 text-[14px]" style={{ color: "hsl(var(--secondary))" }}>Hand-finished in our Abuja atelier. Built for presence.</p>
          </div>
        </Reveal>

        {/* Filter Bar */}
        <Reveal delay={100}>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 mb-16">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-5 py-2 text-[11px] tracking-[0.2em] uppercase transition-all duration-300 ${
                  activeFilter === f 
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold"
                    : "bg-transparent text-[hsl(var(--secondary))] border border-[rgba(246,241,231,0.2)] hover:border-[hsl(var(--primary))]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </Reveal>

        {/* Product Grid */}
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
                      View Details
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
