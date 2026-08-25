import React, { useState } from "react";
import { Link } from "wouter";
import { naira } from "@/lib/utils";
import type { CatalogProduct } from "@/data/platformContent";
import { Drawer } from "vaul";
import { useCart } from "@/context/CartContext";
import { usePlatformContent } from "@/data/platformContent";
import { trackStorefrontEvent, editorialOrigin } from "@/components/ConsentManager";
import { X } from "lucide-react";
import { isMappedPurchaseChoice, mappedPurchaseChoices } from "@/lib/purchasing";

interface ProductCardProps {
  product: CatalogProduct;
  ctaLabel?: string;
  onClickCta?: (e: React.MouseEvent) => void;
  testIdPrefix?: string;
}

export function ProductCard({ product, ctaLabel, onClickCta, testIdPrefix = "product" }: ProductCardProps) {
  const isUnavailable = product.fulfilmentState === "unavailable";
  const primaryImage = product.images?.[0];
  const secondaryImage = product.images?.[1];
  const [quickShopOpen, setQuickShopOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const { addItem } = useCart();
  const { data } = usePlatformContent();
  const productCopy = data?.content.productCopy;

  const purchaseChoices = mappedPurchaseChoices(product);
  const validStandardSizes = purchaseChoices.filter((choice) => choice !== "Custom");
  const customIsMappable = purchaseChoices.includes("Custom");
  const hasMappedChoices = purchaseChoices.length > 0;

  const rememberCatalogueReturn = () => {
    if (window.location.pathname === "/shop") {
      window.sessionStorage.setItem("soso-return-to", `${window.location.pathname}${window.location.search}`);
    }
  };

  const handleQuickAdd = () => {
    if (!isMappedPurchaseChoice(product, selectedSize)) return;
    const commerceVariantId = product.commerceVariantIds?.[selectedSize];
    if (!commerceVariantId || !product.commerceProductId) return;

    addItem({
      slug: product.slug,
      name: product.name,
      img: product.img,
      price: product.price,
      size: selectedSize,
      commerceProductId: product.commerceProductId,
      commerceVariantId: commerceVariantId,
    });
    setQuickShopOpen(false);
    setSelectedSize(null);
    trackStorefrontEvent("cta_clicked", { ctaLabel: "quick_add_to_bag", productSlug: product.slug, articleSlug: editorialOrigin() });
  };

  return (
    <>
      <article className="soso-card group">
        <div className="relative overflow-hidden aspect-[3/4] bg-[#1a1712]">
          <Link
            href={`/product/${product.slug}`}
            onClick={rememberCatalogueReturn}
            className="block h-full"
            aria-label={`View ${product.name}`}
            data-testid={`link-${testIdPrefix}-${product.slug}`}
          >
            <img
              src={primaryImage?.src ?? product.img}
              alt={primaryImage?.alt ?? product.name}
              width={900}
              height={1200}
              className={`w-full h-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-105 ${isUnavailable ? "opacity-60 grayscale" : ""} ${secondaryImage ? "group-hover:opacity-0 group-focus-within:opacity-0" : ""}`}
              loading="lazy"
            />
            {secondaryImage && (
              <img
                src={secondaryImage.src}
                alt={secondaryImage.alt}
                width={900}
                height={1200}
                className={`absolute inset-0 w-full h-full object-cover object-top transition-all duration-700 ease-out opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-hover:scale-105 ${isUnavailable ? "grayscale" : ""}`}
                loading="lazy"
              />
            )}

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
          </Link>

          {!isUnavailable && ctaLabel && (
            <div className="soso-cta-row absolute inset-x-4 bottom-4 flex gap-2 z-10">
              <button
                type="button"
                className="soso-btn-gold flex-1 flex items-center justify-center text-[11px] tracking-[0.15em] uppercase py-3 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={(event) => {
                  if (onClickCta) onClickCta(event);
                  else setQuickShopOpen(true);
                }}
                data-testid={`button-cta-${product.slug}`}
              >
                {ctaLabel}
              </button>
            </div>
          )}
        </div>

        <Link
          href={`/product/${product.slug}`}
          onClick={rememberCatalogueReturn}
          className="mt-5 flex items-start justify-between gap-4"
          data-testid={`link-${testIdPrefix}-details-${product.slug}`}
        >
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
        </Link>
      </article>

    <Drawer.Root open={quickShopOpen} onOpenChange={setQuickShopOpen}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[110] flex max-h-[88vh] flex-col border-t border-primary/20 bg-background">
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <Drawer.Title className="text-sm font-semibold uppercase tracking-widest text-primary">Quick Shop</Drawer.Title>
            <Drawer.Close className="p-2 text-secondary" aria-label="Close quick shop"><X className="h-5 w-5" /></Drawer.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex gap-4 mb-6">
              <img src={product.img} alt={product.name} className="w-20 aspect-[3/4] object-cover bg-[#1a1712]" />
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-primary mb-1">{product.category}</p>
                <h3 className="soso-display text-xl text-white">{product.name}</h3>
                <p className="text-sm text-secondary mt-1">{naira(product.price)}</p>
              </div>
            </div>

            {product.standardEligible && validStandardSizes.length > 0 && (
              <div className="mb-6">
                <span className="text-[11px] tracking-[0.2em] uppercase text-secondary/70 mb-3 block">{productCopy?.sizeSelectorLabel || "Select Size"}</span>
                <div className="flex flex-wrap gap-2">
                  {validStandardSizes.map((s) => {
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSelectedSize(s)}
                        className={`px-4 py-3 text-xs tracking-wide transition-colors border ${selectedSize === s ? "border-primary bg-primary text-primary-foreground" : "border-white/20 text-white hover:border-primary/50"}`}
                        aria-pressed={selectedSize === s}
                        data-testid={`button-quickshop-size-${s}`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {product.customEligible && customIsMappable && (
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => setSelectedSize("Custom")}
                  className={`w-full px-4 py-4 text-xs tracking-wide transition-colors border flex justify-between items-center ${selectedSize === "Custom" ? "border-primary bg-primary text-primary-foreground" : "border-white/20 text-white hover:border-primary/50"}`}
                  data-testid="button-quickshop-size-custom"
                >
                  <span>Custom atelier sizing</span>
                  {selectedSize === "Custom" && <span className="text-[10px] uppercase tracking-widest">Selected</span>}
                </button>
              </div>
            )}

            {selectedSize && (
              <p className="text-xs text-secondary mb-6 text-center">
                {selectedSize === "Custom" ? productCopy?.madeImmediatelyLabel || "Made immediately" : (product.readyNowSizes?.includes(selectedSize) ? productCopy?.readyNowLabel || "Ready Now" : productCopy?.madeImmediatelyLabel || "Made immediately")}
                {" · "} {product.dispatchMessage}
              </p>
            )}
            {!hasMappedChoices && !isUnavailable && (
              <p role="status" className="mb-6 border border-white/10 p-4 text-center text-xs text-secondary" data-testid="status-quickshop-unmapped">
                Online purchase options are not mapped for this piece yet. View the full details for fit and stylist support.
              </p>
            )}

            <button
              onClick={handleQuickAdd}
              disabled={!isMappedPurchaseChoice(product, selectedSize)}
              className={`w-full py-4 text-[13px] tracking-[0.2em] uppercase font-bold transition-all ${!isMappedPurchaseChoice(product, selectedSize) ? "bg-white/5 text-white/50 cursor-not-allowed" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
              data-testid="button-quick-add-to-cart"
            >
              {isUnavailable
                ? (productCopy?.unavailableLabel || "Unavailable")
                : !hasMappedChoices
                  ? "Online purchase unavailable"
                  : !selectedSize
                    ? (productCopy?.sizeRequiredLabel || "Select a size")
                    : !isMappedPurchaseChoice(product, selectedSize)
                      ? "Unavailable in size"
                      : (productCopy?.addToBagLabel || "Add to Bag")}
            </button>
            <Link
              href={`/product/${product.slug}`}
              onClick={() => {
                setQuickShopOpen(false);
                rememberCatalogueReturn();
              }}
              className="block text-center mt-4 text-[11px] uppercase tracking-widest text-secondary hover:text-primary hover:underline underline-offset-4"
              data-testid={`link-quickshop-details-${product.slug}`}
            >
              View full details
            </Link>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
    </>
  );
}