import { useEffect, useRef, useState } from "react";
import { useCart } from "@/context/CartContext";
import { naira } from "@/lib/utils";
import { Link } from "wouter";
import { usePlatformContent } from "@/data/platformContent";
import { mappedPurchaseChoices } from "@/lib/purchasing";
import { StylistEnquiryDialog } from "@/components/StylistEnquiryDialog";

export function CartDrawer() {
  const { isDrawerOpen, closeDrawer, items, removeItem, updateQuantity, updateSize, cartTotal } = useCart();
  const { data } = usePlatformContent();
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [stylistOpen, setStylistOpen] = useState(false);

  useEffect(() => {
    if (isDrawerOpen) {
      previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      document.body.style.overflow = 'hidden';
      const focusTimer = window.setTimeout(() => {
        drawerRef.current?.querySelector<HTMLElement>("[data-cart-initial-focus]")?.focus();
      }, 0);

      return () => {
        window.clearTimeout(focusTimer);
        document.body.style.overflow = '';
        previouslyFocusedRef.current?.focus();
      };
    } else {
      document.body.style.overflow = '';
      return undefined;
    }
  }, [isDrawerOpen]);

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if ((!isDrawerOpen && !stylistOpen) || !data) return null;
  const copy = data.content.site.cart;

  return (
    <>
      {isDrawerOpen && (
        <>
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={closeDrawer}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeDrawer();
          } else {
            trapFocus(event);
          }
        }}
        className="fixed inset-y-0 right-0 z-[101] w-full max-w-[400px] flex flex-col shadow-2xl animate-in slide-in-from-right-full duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] bg-background text-foreground border-l border-border"
      >
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 id="cart-drawer-title" className="soso-display text-2xl font-normal">{copy.title.replace(/bag/i, 'Cart')}</h2>
          <button
            onClick={closeDrawer}
            data-cart-initial-focus
            className="text-3xl opacity-60 hover:opacity-100 transition-opacity"
            aria-label={copy.closeLabel}
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60 space-y-4">
               <p className="soso-display text-xl">{copy.emptyMessage.replace(/bag/i, 'cart')}</p>
              <button
                onClick={closeDrawer}
                className="text-[11px] tracking-[0.2em] uppercase"
                style={{ color: "hsl(var(--primary))" }}
              >
                 {copy.continueShoppingLabel}
              </button>
            </div>
          ) : (
            items.map((item) => {
              const product = data.content.products.find(p => p.slug === item.slug);
              const mappedSizes = product ? mappedPurchaseChoices(product) : [];
              const sizes = mappedSizes.includes(item.size)
                ? mappedSizes
                : [item.size, ...mappedSizes];

              return (
              <div key={`${item.slug}-${item.size}-${item.selectedColourId}-${item.customColour ?? ""}`} className="flex gap-4">
                <Link href={`/product/${item.slug}`} onClick={closeDrawer}>
                  <img
                    src={item.img}
                    alt={item.name}
                    className="w-24 aspect-[3/4] cursor-pointer bg-muted object-cover transition-opacity hover:opacity-90"
                     width={96}
                     height={128}
                     loading="lazy"
                     decoding="async"
                  />
                </Link>
                       <div className="flex items-center gap-2 mt-1">
                         <span className="w-3 h-3 rounded-full border border-black/10 inline-block" style={{ backgroundColor: item.customColour ? 'transparent' : item.selectedColourHex }} />
                         <p className="text-[12px] opacity-70">{item.customColour ?? item.selectedColourLabel ?? "Custom colour"}</p>
                       </div>
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-start">
                    <div>
                      <Link href={`/product/${item.slug}`} onClick={closeDrawer} className="soso-display text-lg hover:underline underline-offset-4">
                        {item.name}
                      </Link>
                       <div className="flex items-center gap-2 mt-1">
                         <span className="text-[12px] opacity-70 uppercase tracking-widest">{copy.sizeLabel}</span>
                          <select
                           value={item.size}
                           onChange={(e) => {
                             const newSize = e.target.value;
                             const variantId = product?.commerceVariantIds?.[newSize];
                              if (!variantId || !mappedSizes.includes(newSize)) return;
                             updateSize(item.slug, item.size, newSize, variantId, item.selectedColourId, item.customColour);
                           }}
                           className="bg-transparent text-[12px] opacity-70 uppercase tracking-widest outline-none cursor-pointer hover:text-primary border-b border-transparent hover:border-primary pb-0.5"
                            aria-label={copy.changeSizeLabel}
                           data-testid={`select-cart-size-${item.slug}`}
                         >
                            {sizes.map((size) => (
                              <option
                                key={size}
                                value={size}
                                disabled={!mappedSizes.includes(size)}
                                className="bg-background text-foreground"
                              >
                                {size}{mappedSizes.includes(size) ? "" : ` — ${copy.unavailableSizeSuffix}`}
                              </option>
                           ))}
                         </select>
                       </div>
                       {product?.fulfilmentState === "ready_now" && product.readyNowSizes?.includes(item.size) ? (
                           <p className="text-[9px] uppercase tracking-wider text-green-500 mt-1">{copy.readyNowLabel}</p>
                       ) : product?.fulfilmentState === "made_immediately" || item.size === "Custom" || (product?.standardEligible && product.standardSizes?.includes(item.size)) ? (
                           <p className="text-[9px] uppercase tracking-wider text-primary/80 mt-1">{copy.madeImmediatelyLabel}</p>
                       ) : null}
                        {product && (
                          <p className="mt-1 text-[10px] leading-relaxed text-secondary/70" data-testid={`text-cart-dispatch-${item.slug}`}>
                            {product.dispatchMessage}
                          </p>
                        )}
                    </div>
                    <button
                      onClick={() => removeItem(item.slug, item.size, item.selectedColourId, item.customColour)}
                      className="text-xs opacity-50 hover:opacity-100 underline underline-offset-2"
                    >
                       {copy.removeLabel}
                    </button>
                  </div>

                  <div className="mt-auto flex items-center justify-between">
                    <div className="flex items-center border" style={{ borderColor: "hsl(var(--border))" }}>
                      <button
                        onClick={() => updateQuantity(item.slug, item.size, item.selectedColourId, item.quantity - 1, item.customColour)}
                        className="flex h-8 w-8 items-center justify-center transition-colors hover:bg-muted"
                         aria-label={copy.decreaseQuantityLabel}
                      >
                        &minus;
                      </button>
                       <span className="w-8 text-center text-sm" aria-label={copy.quantityLabel}>{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.slug, item.size, item.selectedColourId, item.quantity + 1, item.customColour)}
                        className="flex h-8 w-8 items-center justify-center transition-colors hover:bg-muted"
                         aria-label={copy.increaseQuantityLabel}
                      >
                        +
                      </button>
                    </div>
                    <span className="text-[14px] font-medium tracking-wide">
                      {naira(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              </div>
            )})
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 border-t border-border bg-muted/20">
            <div className="flex items-center justify-between mb-6">
               <span className="text-sm uppercase tracking-widest opacity-80">{copy.subtotalLabel}</span>
              <span className="text-xl font-medium">{naira(cartTotal)}</span>
            </div>
            <p className="text-[11px] opacity-60 mb-6 tracking-wide">
               {copy.helpText}
            </p>
            <Link
               href={copy.checkoutCta.href}
              onClick={closeDrawer}
              className="w-full py-4 text-[13px] tracking-[0.2em] uppercase font-bold flex items-center justify-center gap-2 bg-foreground text-background hover:opacity-90 transition-opacity"
            >
               {copy.checkoutCta.label}
            </Link>
            <button
              onClick={() => {
                closeDrawer();
                setStylistOpen(true);
              }}
              className="w-full mt-3 py-4 text-[13px] tracking-[0.2em] uppercase font-semibold flex items-center justify-center gap-2 border border-border text-foreground hover:bg-muted transition-colors"
            >
               {copy.stylistCta.label}
            </button>
          </div>
        )}
      </div>
        </>
      )}
      <StylistEnquiryDialog isOpen={stylistOpen} onClose={() => setStylistOpen(false)} />
    </>
  );
}
