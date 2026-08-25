import React from "react";
import { Link } from "wouter";
import { naira } from "@/lib/utils";
import type { CatalogProduct } from "@/data/platformContent";

interface ProductCardProps {
  product: CatalogProduct;
  ctaLabel?: string;
  onClickCta?: (e: React.MouseEvent) => void;
  testIdPrefix?: string;
}

export function ProductCard({ product, ctaLabel, onClickCta, testIdPrefix = "product" }: ProductCardProps) {
  const isUnavailable = product.fulfilmentState === "unavailable";
  const primaryImage = product.images?.[0];
  
  return (
    <Link 
      href={`/product/${product.slug}`} 
      className="soso-card group block cursor-pointer"
      data-testid={`link-${testIdPrefix}-${product.slug}`}
    >
      <div className="relative overflow-hidden aspect-[3/4] bg-[#1a1712]">
        <img 
          src={primaryImage?.src ?? product.img}
          alt={primaryImage?.alt ?? product.name}
          width={900}
          height={1200}
          className={`w-full h-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-105 ${isUnavailable ? "opacity-60 grayscale" : ""}`}
          loading="lazy" 
        />
        
        {/* Status Badges */}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          {product.merchandising.isNew && (
            <span className="bg-background/90 text-primary text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1.5 backdrop-blur-sm border border-primary/20 shadow-sm" data-testid={`badge-new-${product.slug}`}>
              {product.merchandising.label || "New In"}
            </span>
          )}
          {product.tag && !product.merchandising.isNew && (
            <span className="bg-background/90 text-primary text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 backdrop-blur-sm border border-primary/20" data-testid={`badge-tag-${product.slug}`}>
              {product.tag}
            </span>
          )}
        </div>

        {isUnavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <span className="bg-background px-4 py-2 text-xs uppercase tracking-widest text-secondary font-semibold border border-white/10">
              Unavailable
            </span>
          </div>
        )}
        
        {!isUnavailable && ctaLabel && (
          <div className="soso-cta-row absolute inset-x-4 bottom-4 flex gap-2">
            <div
              className="soso-btn-gold flex-1 flex items-center justify-center text-[11px] tracking-[0.15em] uppercase py-3 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={(e) => {
                if (onClickCta) {
                  e.preventDefault();
                  e.stopPropagation();
                  onClickCta(e);
                }
              }}
              data-testid={`button-cta-${product.slug}`}
            >
               {ctaLabel}
            </div>
          </div>
        )}
      </div>
      
      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary mb-1.5" data-testid={`text-category-${product.slug}`}>{product.category}</p>
          <h3 className="soso-display text-[19px] text-white group-hover:text-primary transition-colors duration-300" data-testid={`text-name-${product.slug}`}>
            {product.name}
          </h3>
          <p className="text-[12px] mt-1 text-secondary" data-testid={`text-note-${product.slug}`}>{product.note}</p>
          <div className="flex gap-2 items-center mt-2">
            {product.fulfilmentState === "ready_now" && (
               <span className="text-[10px] uppercase tracking-wider text-green-500/90 font-medium" data-testid={`status-ready-${product.slug}`}>Ready Now</span>
            )}
            {product.fulfilmentState === "made_immediately" && (
               <span className="text-[10px] uppercase tracking-wider text-primary/80" data-testid={`status-made-${product.slug}`}>Made immediately</span>
            )}
          </div>
          {!isUnavailable && <p className="mt-2 text-[10px] uppercase tracking-wider text-secondary/75" data-testid={`text-dispatch-${product.slug}`}>
            {product.dispatchMessage}
          </p>}
        </div>
        <p className={`text-[15px] font-semibold whitespace-nowrap ${isUnavailable ? "text-secondary opacity-50" : "text-primary"}`} data-testid={`text-price-${product.slug}`}>
          {naira(product.price)}
        </p>
      </div>
    </Link>
  );
}