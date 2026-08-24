import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { Seo } from "@/components/Seo";
import { clearCheckoutOperation, pendingPaymentAttempt } from "@/lib/commerce";
import { naira } from "@/lib/utils";

type PaymentStatus = {
  orderNumber?: string;
  status?: "payment_pending" | "paid" | "cancelled" | "refunded" | "fulfilled";
  paymentStatus?: string;
  totalKobo?: number;
  currency?: string;
};

export default function PaymentReturn() {
  const attemptId = useMemo(
    () => new URLSearchParams(window.location.search).get("attempt") ?? pendingPaymentAttempt(),
    [],
  );
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!attemptId) {
      setError("This payment return link is incomplete. No payment result can be confirmed here.");
      return;
    }
    let cancelled = false;
    let pollCount = 0;
    const check = async () => {
      try {
        const response = await fetch(`/api/payment/status/${encodeURIComponent(attemptId)}`, { credentials: "include" });
        const body = await response.json().catch(() => ({})) as PaymentStatus & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Payment status is unavailable.");
        if (cancelled) return;
        setStatus(body);
        if (body.status === "paid" || body.status === "fulfilled" || body.status === "cancelled" || body.status === "refunded") {
          clearCheckoutOperation();
          return;
        }
        if (pollCount++ < 5) window.setTimeout(check, 2_500);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Payment status is unavailable.");
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [attemptId]);

  const paid = status?.status === "paid" || status?.status === "fulfilled";
  const cancelled = status?.status === "cancelled" || status?.status === "refunded";

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 md:py-24">
      <Seo title="Payment status | SOSO Africa" description="Secure payment status for your SOSO Africa order." path="/checkout/return" noIndex />
      <p className="text-xs uppercase tracking-[0.25em] text-[hsl(var(--primary))]">Secure order update</p>
      <section className="mt-5 border border-[rgba(184,145,47,.28)] p-7 md:p-10">
        {paid ? <CheckCircle2 className="text-[hsl(var(--primary))]" size={32} /> : cancelled ? <ShieldAlert className="text-[hsl(var(--primary))]" size={32} /> : <Clock3 className="text-[hsl(var(--primary))]" size={32} />}
        <h1 className="mt-5 soso-display text-3xl text-white md:text-4xl">
          {paid ? "Payment confirmed" : cancelled ? "Payment was not completed" : "Checking payment status"}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[hsl(var(--secondary))]">
          {paid
            ? "JusticeSure has confirmed your payment. The SOSO atelier will follow up with the next making details."
            : cancelled
              ? "JusticeSure has not confirmed a payable order. You can return to your bag and try again when ready."
              : "A return from a payment provider is not confirmation by itself. We are waiting for JusticeSure’s verified order status."}
        </p>
        {status?.orderNumber && <p className="mt-5 text-sm text-white">Order reference: <span className="font-semibold">{status.orderNumber}</span></p>}
        {typeof status?.totalKobo === "number" && <p className="mt-2 text-sm text-[hsl(var(--secondary))]">Authoritative total: {naira(status.totalKobo / 100)}</p>}
        {error && <p role="alert" className="mt-5 border border-[rgba(184,145,47,.55)] bg-[rgba(184,145,47,.1)] p-4 text-sm leading-relaxed text-white">{error} No payment is confirmed by this page.</p>}
        {!paid && !cancelled && !error && <p className="mt-5 text-xs uppercase tracking-[0.18em] text-[hsl(var(--primary))]">Please keep this page open while we check.</p>}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/shop" className="soso-btn-gold px-5 py-3 text-xs font-bold uppercase tracking-[.18em]" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>Continue shopping</Link>
          <Link href="/checkout" className="border border-[rgba(246,241,231,.3)] px-5 py-3 text-xs font-bold uppercase tracking-[.18em] text-white">Return to checkout</Link>
        </div>
      </section>
    </main>
  );
}