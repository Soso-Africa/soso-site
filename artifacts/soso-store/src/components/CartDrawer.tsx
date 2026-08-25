import { useEffect, useRef } from "react";
import { useCart } from "@/context/CartContext";
import { naira } from "@/lib/utils";
import { Link } from "wouter";
import { WhatsAppIcon } from "@/components/Icons";
import { usePlatformContent } from "@/data/platformContent";
import { mappedPurchaseChoices } from "@/lib/purchasing";

export function CartDrawer() {
  const { isDrawerOpen, closeDrawer, items, removeItem, updateQuantity, updateSize, cartTotal } = useCart();
  const { data } = usePlatformContent();
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

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

  if (!isDrawerOpen || !data) return null;
  const copy = data.content.site.cart;

  return (
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
        className="fixed inset-y-0 right-0 z-[101] w-full max-w-[400px] flex flex-col shadow-2xl animate-in slide-in-from-right-full duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ backgroundColor: "hsl(var(--background))", borderLeft: "1px solid hsl(var(--border))" }}
      >
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: "hsl(var(--border))" }}>
          <h2 id="cart-drawer-title" className="soso-display text-2xl font-light">{copy.title}</h2>
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
               <p className="soso-display text-xl">{copy.emptyMessage}</p>
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
              <div key={`${item.slug}-${item.size}`} className="flex gap-4">
                <Link href={`/product/${item.slug}`} onClick={closeDrawer}>
                  <img 
                    src={item.img} 
                    alt={item.name} 
                    className="w-24 aspect-[3/4] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: "#1a1712" }}
                     width={96}
                     height={128}
                     loading="lazy"
                     decoding="async"
                  />
                </Link>
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
                             updateSize(item.slug, item.size, newSize, variantId);
                           }}
                           className="bg-transparent text-[12px] opacity-70 uppercase tracking-widest outline-none cursor-pointer hover:text-primary border-b border-transparent hover:border-primary pb-0.5"
                           aria-label={`Change size for ${item.name}`}
                           data-testid={`select-cart-size-${item.slug}`}
                         >
                            {sizes.map((size) => (
                              <option
                                key={size}
                                value={size}
                                disabled={!mappedSizes.includes(size)}
                                className="bg-background text-foreground"
                              >
                                {size}{mappedSizes.includes(size) ? "" : " — unavailable"}
                              </option>
                           ))}
                         </select>
                       </div>
                       {product?.fulfilmentState === "ready_now" && product.readyNowSizes?.includes(item.size) ? (
                          <p className="text-[9px] uppercase tracking-wider text-green-500 mt-1">Ready Now</p>
                       ) : product?.fulfilmentState === "made_immediately" || item.size === "Custom" || (product?.standardEligible && product.standardSizes?.includes(item.size)) ? (
                          <p className="text-[9px] uppercase tracking-wider text-primary/80 mt-1">Made Immediately</p>
                       ) : null}
                        {product && (
                          <p className="mt-1 text-[10px] leading-relaxed text-secondary/70" data-testid={`text-cart-dispatch-${item.slug}`}>
                            {product.dispatchMessage}
                          </p>
                        )}
                    </div>
                    <button 
                      onClick={() => removeItem(item.slug, item.size)}
                      className="text-xs opacity-50 hover:opacity-100 underline underline-offset-2"
                    >
                       {copy.removeLabel}
                    </button>
                  </div>
                  
                  <div className="mt-auto flex items-center justify-between">
                    <div className="flex items-center border" style={{ borderColor: "hsl(var(--border))" }}>
                      <button 
                        onClick={() => updateQuantity(item.slug, item.size, item.quantity - 1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-white/5 transition-colors"
                        aria-label={`Decrease quantity for ${item.name}`}
                      >
                        &minus;
                      </button>
                      <span className="w-8 text-center text-sm" aria-label={`Quantity for ${item.name}`}>{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.slug, item.size, item.quantity + 1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-white/5 transition-colors"
                        aria-label={`Increase quantity for ${item.name}`}
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
          <div className="p-6 border-t bg-black/20" style={{ borderColor: "hsl(var(--border))" }}>
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
              className="w-full soso-btn-gold py-4 text-[13px] tracking-[0.2em] uppercase font-bold flex items-center justify-center gap-2"
              style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            >
               {copy.checkoutCta.label}
            </Link>
            <a
               href={copy.stylistCta.href}
              onClick={closeDrawer}
              className="w-full mt-3 py-4 text-[13px] tracking-[0.2em] uppercase font-semibold flex items-center justify-center gap-2 soso-btn-ghost"
              style={{ border: "1px solid rgba(246,241,231,0.3)" }}
            >
               <WhatsAppIcon size={16} /> {copy.stylistCta.label}
            </a>
          </div>
        )}
      </div>
    </>
  );
}
