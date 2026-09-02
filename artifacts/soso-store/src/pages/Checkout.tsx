import React, { FormEvent, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, LockKeyhole, MessageCircle } from "lucide-react";
import { Seo } from "@/components/Seo";
import { useCart } from "@/context/CartContext";
import { commerceGateway, savePaymentAttempt } from "@/lib/commerce";
import { naira } from "@/lib/utils";
import { trackStorefrontEvent } from "@/components/ConsentManager";
import { StylistEnquiryDialog } from "@/components/StylistEnquiryDialog";
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";

type CheckoutState = "ready" | "processing" | "payment-unavailable";

export default function Checkout() {
  const { items, cartTotal, openDrawer } = useCart();
  const [state, setState] = useState<CheckoutState>("ready");
  const [message, setMessage] = useState("");
  const [stylistOpen, setStylistOpen] = useState(false);
  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;
  if (!platform.data) return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platformStateCopy} />;
  const copy = platform.data.content.pages.checkout;

  const handleInvalid = (e: React.InvalidEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    trackStorefrontEvent("checkout_field_error", { fieldName: e.currentTarget.name });
  };

  const startCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState("processing");
    setMessage("");
    const form = new FormData(event.currentTarget);
    trackStorefrontEvent("checkout_started", {
      itemIds: items.map((item) => item.commerceVariantId ?? item.commerceProductId ?? item.slug),
      value: cartTotal,
      currency: "NGN",
      itemCount: items.reduce((count, item) => count + item.quantity, 0),
    });
    trackStorefrontEvent("checkout_form_completed", { itemCount: items.reduce((count, item) => count + item.quantity, 0) });
    trackStorefrontEvent("payment_clicked", { itemCount: items.reduce((count, item) => count + item.quantity, 0) });
    trackStorefrontEvent("cta_clicked", { ctaLabel: "proceed_to_payment" });

    try {
        const result = await commerceGateway.createCheckoutSession({
          customer: {
            name: String(form.get("name") || ""),
            email: String(form.get("email") || ""),
            phone: String(form.get("phone") || ""),
            },
            fulfillment: {
              type: "delivery",
              address: String(form.get("address") || ""),
          },
            notes: String(form.get("deliveryNote") || ""),
          items,
        });
        if (result.checkoutUrl) {
          savePaymentAttempt(result.attemptId);
          window.location.assign(result.checkoutUrl);
          return;
        }
        trackStorefrontEvent("checkout_payment_unavailable");
        setState("payment-unavailable");
        setMessage(copy.paymentUnavailableMessage);
    } catch {
        trackStorefrontEvent("checkout_payment_unavailable");
        setState("payment-unavailable");
        setMessage(copy.paymentUnavailableMessage);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-12 py-12 md:py-18 bg-background text-foreground">
      <Seo
        title={copy.seo.title}
        description={copy.seo.description}
        path="/checkout"
        noIndex
      />
      <Link href={copy.backCta.href} className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-secondary hover:text-foreground">
        <ChevronLeft size={15} /> {copy.backCta.label}
      </Link>
      <div className="grid lg:grid-cols-[1fr_0.8fr] gap-10 lg:gap-16 mt-10">
        <section>
          <p className="text-[11px] tracking-[0.3em] uppercase text-secondary">{copy.eyebrow}</p>
          <h1 className="soso-display font-normal text-4xl md:text-5xl text-foreground mt-3">{copy.title}</h1>
          <p className="mt-4 text-sm leading-relaxed text-secondary max-w-xl">
             {copy.intro}
          </p>

          {items.length === 0 ? (
            <div className="mt-10 border border-border p-7">
               <p className="soso-display text-2xl">{copy.emptyMessage}</p>
               <Link href={copy.emptyCta.href} className="inline-block mt-5 text-sm text-foreground underline underline-offset-4">{copy.emptyCta.label}</Link>
            </div>
          ) : (
            <form className="mt-10 space-y-5" onSubmit={startCheckout}>
              <div className="grid sm:grid-cols-2 gap-5">
                <label className="text-sm">
                  {copy.nameLabel}
                  <input required name="name" autoComplete="name" onInvalid={handleInvalid} className="mt-2 w-full bg-transparent border border-border px-4 py-3.5 outline-none focus:border-foreground" />
                </label>
                <label className="text-sm">
                  {copy.phoneLabel}
                  <input required name="phone" autoComplete="tel" inputMode="tel" onInvalid={handleInvalid} className="mt-2 w-full bg-transparent border border-border px-4 py-3.5 outline-none focus:border-foreground" />
                </label>
              </div>
              <label className="text-sm block">
                  {copy.emailLabel}
                <input required type="email" name="email" autoComplete="email" onInvalid={handleInvalid} className="mt-2 w-full bg-transparent border border-border px-4 py-3.5 outline-none focus:border-foreground" />
              </label>
              <label className="text-sm block">
                 {copy.addressLabel}
                <textarea required name="address" autoComplete="street-address" rows={3} onInvalid={handleInvalid} className="mt-2 w-full bg-transparent border border-border px-4 py-3.5 outline-none focus:border-foreground" />
              </label>
              <label className="text-sm block">
                 {copy.notesLabel} <span className="opacity-60">({copy.optionalLabel})</span>
                <textarea name="deliveryNote" rows={3} className="mt-2 w-full bg-transparent border border-border px-4 py-3.5 outline-none focus:border-foreground" />
              </label>
              <p className="text-xs leading-relaxed text-secondary">{copy.deliveryNote}</p>

              {state === "payment-unavailable" && (
                <div role="alert" className="border border-destructive/20 bg-destructive/10 p-4 text-sm leading-relaxed text-destructive">
                   <p>{message}</p>
                   <div className="mt-4 flex flex-wrap gap-3">
                     <button type="submit" className="border border-destructive/30 px-3 py-2 text-xs font-semibold uppercase tracking-[.14em] text-destructive hover:bg-destructive hover:text-white">
                        {copy.retryLabel}
                     </button>
                      <button type="button" onClick={openDrawer} className="px-3 py-2 text-xs font-semibold uppercase tracking-[.14em] text-foreground underline underline-offset-4">
                        {copy.returnToBagLabel.replace(/bag/i, 'Cart')}
                      </button>
                   </div>
                </div>
              )}
              <button disabled={state === "processing"} className="w-full py-4 text-[13px] uppercase tracking-[.2em] font-bold disabled:opacity-70 bg-foreground text-background transition-colors hover:opacity-90">
                <LockKeyhole size={16} className="inline mr-2" />
                 {state === "processing" ? copy.processingLabel : `${copy.paymentLabel} — ${naira(cartTotal)}`}
              </button>
               <p className="flex items-center justify-center gap-2 text-xs text-secondary"><LockKeyhole size={14} /> {copy.secureNote}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-xs text-secondary">
                 {copy.legalLinks.map((link) => <Link key={link.href} href={link.href} className="underline underline-offset-4 hover:text-foreground">{link.label}</Link>)}
                 <button type="button" onClick={() => setStylistOpen(true)} className="underline underline-offset-4 hover:text-foreground">{copy.stylistLabel}</button>
              </div>
            </form>
          )}
        </section>

        {items.length > 0 && (
          <aside className="h-fit border border-border p-6 md:p-8 bg-muted/20">
             <h2 className="soso-display text-2xl text-foreground">{copy.bagTitle.replace(/bag/i, "Cart")}</h2>
            <div className="mt-6 space-y-5">
              {items.map((item) => (
                <div key={`${item.slug}-${item.size}-${item.selectedColourId}-${item.customColour ?? ""}`} className="flex gap-4">
                  <img src={item.img} alt={item.name} width="72" height="96" className="w-[72px] h-24 object-cover" />
                  <div className="flex-1">
                    <p className="soso-display text-lg text-foreground">{item.name}</p>
                    <p className="text-xs uppercase tracking-wider text-secondary mt-1">{copy.sizeQuantityLabel.replace("{size}", item.size).replace("{quantity}", String(item.quantity))}</p>
                     <div className="flex items-center gap-2 mt-1">
                       <span className="w-3 h-3 rounded-full border border-black/10 inline-block" style={{ backgroundColor: item.customColour ? 'transparent' : item.selectedColourHex }} />
                       <p className="text-xs text-secondary">{item.customColour ?? item.selectedColourLabel ?? "Custom colour"}</p>
                     </div>
                  </div>
                  <p className="text-sm text-foreground">{naira(item.price * item.quantity)}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-border mt-7 pt-5 text-lg text-foreground">
               <span>{copy.subtotalLabel}</span><strong>{naira(cartTotal)}</strong>
            </div>
            <button type="button" onClick={() => setStylistOpen(true)} className="mt-7 w-full flex items-center justify-center gap-2 border border-border py-3.5 text-xs uppercase tracking-[.16em] text-foreground hover:bg-muted transition-colors">
               <MessageCircle size={16} /> {copy.stylistCtaLabel}
            </button>
          </aside>
        )}
      </div>
      <StylistEnquiryDialog isOpen={stylistOpen} onClose={() => setStylistOpen(false)} productName="your order" />
    </div>
  );
}