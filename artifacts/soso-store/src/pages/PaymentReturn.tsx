import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { Seo } from "@/components/Seo";
import { clearCheckoutOperation, pendingPaymentAttempt } from "@/lib/commerce";
import { naira } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";

type PaymentStatus = {
  orderNumber?: string;
  status?: "payment_pending" | "paid" | "cancelled" | "refunded" | "fulfilled";
  paymentStatus?: string;
  totalKobo?: number;
  currency?: string;
};

export default function PaymentReturn() {
  const { items } = useCart();
  const attemptId = useMemo(
    () => new URLSearchParams(window.location.search).get("attempt") ?? pendingPaymentAttempt(),
    [],
  );
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState("");
  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;

  useEffect(() => {
    if (!platform.data) return;
    if (!attemptId) {
      setError(platform.data.content.pages.paymentReturn.missingAttemptMessage);
      return;
    }
    let cancelled = false;
    let pollCount = 0;
    const check = async () => {
      try {
        const response = await fetch(`/api/payment/status/${encodeURIComponent(attemptId)}`, { credentials: "include" });
        const body = await response.json().catch(() => ({})) as PaymentStatus & { error?: string };
        if (!response.ok) throw new Error(body.error ?? platform.data.content.pages.paymentReturn.statusUnavailableMessage);
        if (cancelled) return;
        setStatus(body);
        if (body.status === "paid" || body.status === "fulfilled" || body.status === "cancelled" || body.status === "refunded") {
          clearCheckoutOperation();
          return;
        }
        if (pollCount++ < 5) window.setTimeout(check, 2_500);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : platform.data.content.pages.paymentReturn.statusUnavailableMessage);
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [attemptId, platform.data]);

  const paid = status?.status === "paid" || status?.status === "fulfilled";
  const cancelled = status?.status === "cancelled" || status?.status === "refunded";
  if (!platform.data) return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platformStateCopy} />;
  const copy = platform.data.content.pages.paymentReturn;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 md:py-24">
      <Seo title={copy.seo.title} description={copy.seo.description} path="/checkout/return" noIndex />
      <p className="text-xs uppercase tracking-[0.25em] text-[hsl(var(--primary))]">{copy.eyebrow}</p>
      <section className="mt-5 border border-[rgba(184,145,47,.28)] p-7 md:p-10">
        {paid ? <CheckCircle2 className="text-[hsl(var(--primary))]" size={32} /> : cancelled ? <ShieldAlert className="text-[hsl(var(--primary))]" size={32} /> : <Clock3 className="text-[hsl(var(--primary))]" size={32} />}
        <h1 className="mt-5 soso-display text-3xl text-white md:text-4xl">
           {paid ? copy.paidTitle : cancelled ? copy.cancelledTitle : copy.pendingTitle}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[hsl(var(--secondary))]">
          {paid
             ? copy.paidBody
            : cancelled
              ? copy.cancelledBody : copy.pendingBody}
        </p>
        {status?.orderNumber && <p className="mt-5 text-sm text-white">{copy.orderReferenceLabel} <span className="font-semibold">{status.orderNumber}</span></p>}
        {typeof status?.totalKobo === "number" && <p className="mt-2 text-sm text-[hsl(var(--secondary))]">{copy.authoritativeTotalLabel} {naira(status.totalKobo / 100)}</p>}
        {error && <p role="alert" className="mt-5 border border-[rgba(184,145,47,.55)] bg-[rgba(184,145,47,.1)] p-4 text-sm leading-relaxed text-white">{error} {copy.errorSuffix}</p>}
        {!paid && !cancelled && !error && <p className="mt-5 text-xs uppercase tracking-[0.18em] text-[hsl(var(--primary))]">{copy.pendingNotice}</p>}
        {!paid && (cancelled || error) && (
          <div className="mt-6 border-t border-[rgba(246,241,231,.18)] pt-5">
            <p className="text-sm leading-relaxed text-[hsl(var(--secondary))]">
               {copy.retryHelp}
            </p>
            {items.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm">
                {items.map((item) => (
                  <li key={`${item.slug}-${item.size}`}>
                    <Link href={`/product/${item.slug}`} className="text-[hsl(var(--primary))] underline underline-offset-4">
                       {copy.reviewLabel} {item.name} — {copy.sizeLabel} {item.size}
                    </Link>
                     <span className="text-[hsl(var(--secondary))]"> · {copy.quantityLabel} {item.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          {!paid && (cancelled || error) ? (
            <Link href={copy.returnBagCta.href} className="soso-btn-gold px-5 py-3 text-xs font-bold uppercase tracking-[.18em]" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>{copy.returnBagCta.label}</Link>
          ) : (
            <Link href={copy.continueCta.href} className="soso-btn-gold px-5 py-3 text-xs font-bold uppercase tracking-[.18em]" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>{copy.continueCta.label}</Link>
          )}
          {!paid && <Link href={(cancelled || error ? copy.retryCta : copy.returnCheckoutCta).href} className="border border-[rgba(246,241,231,.3)] px-5 py-3 text-xs font-bold uppercase tracking-[.18em] text-white">{(cancelled || error ? copy.retryCta : copy.returnCheckoutCta).label}</Link>}
        </div>
      </section>
    </main>
  );
}