import React, { useEffect } from "react";
import { useCart } from "@/context/CartContext";
import { naira } from "@/lib/utils";
import { Link } from "wouter";
import { WhatsAppIcon } from "@/components/Icons";

export function CartDrawer() {
  const { isDrawerOpen, closeDrawer, items, removeItem, updateQuantity, cartTotal } = useCart();

  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDrawerOpen]);

  if (!isDrawerOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={closeDrawer}
        aria-hidden="true"
      />
      <div 
        className="fixed inset-y-0 right-0 z-[101] w-full max-w-[400px] flex flex-col shadow-2xl animate-in slide-in-from-right-full duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ backgroundColor: "hsl(var(--background))", borderLeft: "1px solid hsl(var(--border))" }}
      >
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: "hsl(var(--border))" }}>
          <h2 className="soso-display text-2xl font-light">Your Bag</h2>
          <button 
            onClick={closeDrawer}
            className="text-3xl opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Close cart"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60 space-y-4">
              <p className="soso-display text-xl">Your bag is empty.</p>
              <button 
                onClick={closeDrawer}
                className="text-[11px] tracking-[0.2em] uppercase"
                style={{ color: "hsl(var(--primary))" }}
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div key={`${item.slug}-${item.size}`} className="flex gap-4">
                <Link href={`/product/${item.slug}`} onClick={closeDrawer}>
                  <img 
                    src={item.img} 
                    alt={item.name} 
                    className="w-24 aspect-[3/4] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: "#1a1712" }}
                  />
                </Link>
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-start">
                    <div>
                      <Link href={`/product/${item.slug}`} onClick={closeDrawer} className="soso-display text-lg hover:underline underline-offset-4">
                        {item.name}
                      </Link>
                      <p className="text-[12px] opacity-70 mt-1 uppercase tracking-widest">Size: {item.size}</p>
                    </div>
                    <button 
                      onClick={() => removeItem(item.slug, item.size)}
                      className="text-xs opacity-50 hover:opacity-100 underline underline-offset-2"
                    >
                      Remove
                    </button>
                  </div>
                  
                  <div className="mt-auto flex items-center justify-between">
                    <div className="flex items-center border" style={{ borderColor: "hsl(var(--border))" }}>
                      <button 
                        onClick={() => updateQuantity(item.slug, item.size, item.quantity - 1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-white/5 transition-colors"
                      >
                        &minus;
                      </button>
                      <span className="w-8 text-center text-sm">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.slug, item.size, item.quantity + 1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-white/5 transition-colors"
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
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 border-t bg-black/20" style={{ borderColor: "hsl(var(--border))" }}>
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm uppercase tracking-widest opacity-80">Subtotal</span>
              <span className="text-xl font-medium">{naira(cartTotal)}</span>
            </div>
            <p className="text-[11px] opacity-60 mb-6 tracking-wide">
              Shipping and taxes calculated at checkout.
            </p>
            <button 
              className="w-full soso-btn-gold py-4 text-[13px] tracking-[0.2em] uppercase font-bold flex items-center justify-center gap-2"
              style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            >
              Proceed to Checkout
            </button>
            <button 
              className="w-full mt-3 py-4 text-[13px] tracking-[0.2em] uppercase font-semibold flex items-center justify-center gap-2 soso-btn-ghost"
              style={{ border: "1px solid rgba(246,241,231,0.3)" }}
            >
              <WhatsAppIcon size={16} /> Checkout on WhatsApp
            </button>
          </div>
        )}
      </div>
    </>
  );
}
