import React, { FormEvent, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, LockKeyhole, MessageCircle } from "lucide-react";
import { Seo } from "@/components/Seo";
import { useCart } from "@/context/CartContext";
import { commerceGateway, CommerceConfigurationError } from "@/lib/commerce";
import { naira } from "@/lib/utils";

type CheckoutState = "ready" | "checking" | "needs-confirmation";

export default function Checkout() {
  const { items, cartTotal } = useCart();
  const [state, setState] = useState<CheckoutState>("ready");
  const [message, setMessage] = useState("");

  const startCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState("checking");
    setMessage("");
    const form = new FormData(event.currentTarget);

    try {
      const checks = await commerceGateway.confirmProduction(items);
      if (checks.some((check) => !check.canMake)) {
        setState("needs-confirmation");
        setMessage(
          checks.find((check) => !check.canMake)?.reason ??
            "We need to confirm the making details before taking payment.",
        );
        return;
      }
      await commerceGateway.createOrder({
        customer: {
          name: String(form.get("name") || ""),
          email: String(form.get("email") || ""),
          phone: String(form.get("phone") || ""),
          deliveryNote: String(form.get("deliveryNote") || ""),
        },
        items,
      });
    } catch (error) {
      setState("needs-confirmation");
      setMessage(
        error instanceof CommerceConfigurationError
          ? error.message
          : "We could not confirm your order. Please try again or speak with a SOSO stylist.",
      );
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-12 py-12 md:py-18">
      <Seo
        title="Secure checkout | SOSO Africa"
        description="Review your SOSO Africa bag and confirm the bespoke production details before payment."
        path="/checkout"
      />
      <Link href="/shop" className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[hsl(var(--primary))]">
        <ChevronLeft size={15} /> Continue shopping
      </Link>
      <div className="grid lg:grid-cols-[1fr_0.8fr] gap-10 lg:gap-16 mt-10">
        <section>
          <p className="text-[11px] tracking-[0.3em] uppercase text-[hsl(var(--primary))]">Checkout</p>
          <h1 className="soso-display font-light text-4xl md:text-5xl text-white mt-3">Confirm your order</h1>
          <p className="mt-4 text-sm leading-relaxed text-[hsl(var(--secondary))] max-w-xl">
            SOSO makes each order to the client’s chosen direction. Before payment, the atelier confirms the selected size, fabric or finish direction, and the production timing.
          </p>

          {items.length === 0 ? (
            <div className="mt-10 border border-[rgba(184,145,47,0.28)] p-7">
              <p className="soso-display text-2xl">Your bag is empty.</p>
              <Link href="/shop" className="inline-block mt-5 text-sm text-[hsl(var(--primary))] underline underline-offset-4">Explore the collection</Link>
            </div>
          ) : (
            <form className="mt-10 space-y-5" onSubmit={startCheckout}>
              <div className="grid sm:grid-cols-2 gap-5">
                <label className="text-sm">
                  Full name
                  <input required name="name" autoComplete="name" className="mt-2 w-full bg-transparent border border-[rgba(246,241,231,.25)] px-4 py-3.5 outline-none focus:border-[hsl(var(--primary))]" />
                </label>
                <label className="text-sm">
                  Phone number
                  <input required name="phone" autoComplete="tel" inputMode="tel" className="mt-2 w-full bg-transparent border border-[rgba(246,241,231,.25)] px-4 py-3.5 outline-none focus:border-[hsl(var(--primary))]" />
                </label>
              </div>
              <label className="text-sm block">
                Email
                <input required type="email" name="email" autoComplete="email" className="mt-2 w-full bg-transparent border border-[rgba(246,241,231,.25)] px-4 py-3.5 outline-none focus:border-[hsl(var(--primary))]" />
              </label>
              <label className="text-sm block">
                Delivery notes <span className="opacity-60">(optional)</span>
                <textarea name="deliveryNote" rows={3} className="mt-2 w-full bg-transparent border border-[rgba(246,241,231,.25)] px-4 py-3.5 outline-none focus:border-[hsl(var(--primary))]" />
              </label>

              {state === "needs-confirmation" && (
                <div role="alert" className="border border-[rgba(184,145,47,.55)] bg-[rgba(184,145,47,.1)] p-4 text-sm leading-relaxed">
                  {message}
                </div>
              )}

              <button disabled={state === "checking"} className="w-full soso-btn-gold py-4 text-[13px] uppercase tracking-[.2em] font-bold disabled:opacity-70" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
                <LockKeyhole size={16} className="inline mr-2" />
                {state === "checking" ? "Confirming making details…" : "Confirm making details"}
              </button>
              <p className="flex items-center justify-center gap-2 text-xs text-[hsl(var(--secondary))]"><LockKeyhole size={14} /> Payment is requested only after the atelier confirms the making details.</p>
            </form>
          )}
        </section>

        {items.length > 0 && (
          <aside className="h-fit border border-[rgba(184,145,47,.28)] p-6 md:p-8">
            <h2 className="soso-display text-2xl text-white">Your bag</h2>
            <div className="mt-6 space-y-5">
              {items.map((item) => (
                <div key={`${item.slug}-${item.size}`} className="flex gap-4">
                  <img src={item.img} alt={item.name} width="72" height="96" className="w-[72px] h-24 object-cover" />
                  <div className="flex-1">
                    <p className="soso-display text-lg text-white">{item.name}</p>
                    <p className="text-xs uppercase tracking-wider text-[hsl(var(--secondary))] mt-1">Size {item.size} · Qty {item.quantity}</p>
                  </div>
                  <p className="text-sm text-[hsl(var(--primary))]">{naira(item.price * item.quantity)}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-[rgba(246,241,231,.18)] mt-7 pt-5 text-lg">
              <span>Subtotal</span><strong>{naira(cartTotal)}</strong>
            </div>
            <a href="/#whatsapp" className="mt-7 w-full flex items-center justify-center gap-2 border border-[#2db36f] py-3.5 text-xs uppercase tracking-[.16em] text-[#77dca6]">
              <MessageCircle size={16} /> Order with a stylist
            </a>
          </aside>
        )}
      </div>
    </div>
  );
}