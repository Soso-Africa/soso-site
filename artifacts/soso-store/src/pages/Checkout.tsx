import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, LockKeyhole, MessageCircle } from "lucide-react";
import { Seo } from "@/components/Seo";
import { useCart } from "@/context/CartContext";
import { clearCheckoutOperation, commerceGateway, CommerceRemoteError, savePaymentAttempt, type CommerceDiscovery, type CommerceQuote } from "@/lib/commerce";
import { naira } from "@/lib/utils";
import { trackStorefrontEvent } from "@/components/ConsentManager";
import { StylistEnquiryDialog } from "@/components/StylistEnquiryDialog";
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";

type CheckoutState = "ready" | "reviewing" | "processing" | "payment-unavailable";

function moneyFromMinor(minor: string, currency: string, minorUnitExponent = 2) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(BigInt(minor)) / (10 ** minorUnitExponent));
  } catch {
    return `${currency} ${minor}`;
  }
}
export default function Checkout() {
  const { items, cartTotal, openDrawer } = useCart();
  const [state, setState] = useState<CheckoutState>("ready");
  const [message, setMessage] = useState("");
  const [discovery, setDiscovery] = useState<CommerceDiscovery | null>(null);
  const [quote, setQuote] = useState<CommerceQuote | null>(null);
  const [provider, setProvider] = useState<CommerceDiscovery["paymentMethods"]["providers"][number]["provider"] | "">("");
  const [method, setMethod] = useState<CommerceDiscovery["paymentMethods"]["providers"][number]["methods"][number] | "">("");
  const [currency, setCurrency] = useState("NGN");
  const [stylistOpen, setStylistOpen] = useState(false);
  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;
  if (!platform.data) return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platformStateCopy} />;
  const copy = platform.data.content.pages.checkout;
  const cartSignature = useMemo(() => JSON.stringify(items.map((item) => [
    item.commerceProductId, item.commerceVariantId, item.quantity, item.selectedColourId, item.selectedColourHex, item.customColour ?? "",
  ])), [items]);
  useEffect(() => {
    setQuote(null);
    setState((current) => current === "reviewing" ? "ready" : current);
  }, [cartSignature]);
  const readyProviders = useMemo(
    () => discovery?.paymentMethods.providers.filter((item) => item.eligible && item.chargeCurrencies.includes(currency)) ?? [],
    [currency, discovery],
  );
  const selectedProvider = readyProviders.find((item) => item.provider === provider);
  useEffect(() => {
    let active = true;
    commerceGateway.discover(undefined, currency).then((data) => {
      if (!active) return;
      setDiscovery(data);
      const selected = data.paymentMethods.providers.find((item) => item.eligible && item.chargeCurrencies.includes(currency));
      setProvider(selected?.provider ?? "");
      setMethod(selected?.methods[0] ?? "");
    }).catch(() => { if (active) setDiscovery(null); });
    return () => { active = false; };
  }, [currency]);

  const handleInvalid = (e: React.InvalidEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    trackStorefrontEvent("checkout_field_error", { fieldName: e.currentTarget.name });
  };
  const invalidateQuote = () => {
    if (quote) {
      setQuote(null);
      setState("ready");
    }
  };

  const startCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (quote && Date.now() >= Date.parse(quote.expiresAt)) {
      clearCheckoutOperation();
      setQuote(null);
      setState("ready");
      setMessage("Your quote has expired. Please create and review a new quote.");
      return;
    }
    if (!provider || !method) {
      setState("payment-unavailable");
      setMessage(copy.paymentUnavailableMessage);
      return;
    }
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
        const request: Parameters<typeof commerceGateway.createQuote>[0] = {
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
          displayCurrency: currency,
          paymentProvider: provider,
          paymentMethod: method,
        };
        if (!quote) {
          const nextQuote = await commerceGateway.createQuote(request);
          setQuote(nextQuote);
          setState("reviewing");
          return;
        }
        const result = await commerceGateway.createCheckoutSession({ ...request, quoteId: quote.id });
        if (result.checkoutUrl) {
          savePaymentAttempt(result.attemptId);
          window.location.assign(result.checkoutUrl);
          return;
        }
        trackStorefrontEvent("checkout_payment_unavailable");
        setState("payment-unavailable");
        setMessage(copy.paymentUnavailableMessage);
    } catch (error) {
        if (error instanceof CommerceRemoteError && (error.status === 410 || error.code === "QUOTE_EXPIRED_REQUOTE_REQUIRED")) {
          clearCheckoutOperation();
          setQuote(null);
          setState("ready");
          setMessage("Your quote expired or changed. Please create and review a new quote.");
          return;
        }
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
            <form className="mt-10 space-y-5" onSubmit={startCheckout} onChange={invalidateQuote}>
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
               <div className="grid sm:grid-cols-2 gap-5">
                 <label className="text-sm">
                   Currency
                   <select value={currency} onChange={(event) => { setCurrency(event.target.value); setQuote(null); }} className="mt-2 w-full bg-transparent border border-border px-4 py-3.5 outline-none focus:border-foreground">
                     {(discovery?.currencies.filter((item) => item.displaySupported) ?? [{ code: "NGN", name: "Nigerian naira" }]).map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}
                   </select>
                 </label>
                 <label className="text-sm">
                   Payment method
                   <select value={provider} onChange={(event) => { const next = readyProviders.find((item) => item.provider === event.target.value); setProvider(event.target.value as typeof provider); setMethod(next?.methods[0] ?? ""); setQuote(null); }} className="mt-2 w-full bg-transparent border border-border px-4 py-3.5 outline-none focus:border-foreground" disabled={!readyProviders.length}>
                     {readyProviders.map((item) => <option key={item.provider} value={item.provider}>{item.provider}</option>)}
                   </select>
                   {selectedProvider && selectedProvider.methods.length > 1 && (
                     <select value={method} onChange={(event) => { setMethod(event.target.value as typeof method); setQuote(null); }} className="mt-2 w-full bg-transparent border border-border px-4 py-3.5 outline-none focus:border-foreground">
                       {selectedProvider.methods.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
                     </select>
                   )}
                 </label>
               </div>
               {quote && (
                 <section aria-live="polite" className="border border-border bg-muted/20 p-5 text-sm">
                   <p className="font-semibold">Review your secure quote</p>
                    <p className="mt-2 text-secondary">Canonical order total ({quote.currency}, minor exponent {quote.currencyMinorUnitExponents?.[quote.currency] ?? 2}): <strong className="text-foreground">{moneyFromMinor(quote.amounts.totalMinor, quote.currency, quote.currencyMinorUnitExponents?.[quote.currency] ?? 2)}</strong></p>
                    <p className="mt-1 text-xs text-secondary">Display currency: {quote.displayCurrency} (exponent {quote.currencyMinorUnitExponents?.[quote.displayCurrency] ?? "—"}); charge currency: {quote.chargeCurrency} (exponent {quote.currencyMinorUnitExponents?.[quote.chargeCurrency] ?? "—"}); settlement currency: {quote.settlementCurrency} (exponent {quote.currencyMinorUnitExponents?.[quote.settlementCurrency] ?? "—"}). This immutable quote expires {new Date(quote.expiresAt).toLocaleString()}.</p>
                 </section>
               )}
               {state === "ready" && message && (
                 <p role="status" className="text-sm text-secondary">{message}</p>
               )}

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
               <button disabled={state === "processing" || !discovery || !readyProviders.length} className="w-full py-4 text-[13px] uppercase tracking-[.2em] font-bold disabled:opacity-70 bg-foreground text-background transition-colors hover:opacity-90">
                <LockKeyhole size={16} className="inline mr-2" />
                  {state === "processing" ? copy.processingLabel : state === "reviewing" ? "Confirm secure quote" : `${copy.paymentLabel} — ${naira(cartTotal)}`}
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
