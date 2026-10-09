import React, { FormEvent, useEffect, useState } from "react";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { mailApi } from "@/lib/staff-mail-api";

export function NewsletterSignup() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    mailApi<{ available?: boolean; enabled?: boolean }>("/newsletter/status")
      .then((r) => { if (live) setAvailable(Boolean(r.available ?? r.enabled)); })
      .catch(() => { if (live) setAvailable(false); });
    return () => { live = false; };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!available || !consent || busy) return;
    setBusy(true); setError("");
    try {
      await mailApi("/newsletter/subscribe", { email: email.trim(), consent: true, website });
      setDone(true); setEmail(""); setConsent(false);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "We could not sign you up just now. Please try again later.");
    } finally { setBusy(false); }
  };

  return <section aria-labelledby="newsletter-heading" className="mb-10 max-w-md">
    <h3 id="newsletter-heading" className="mb-3 text-[11px] font-bold uppercase tracking-[0.25em] text-foreground">Newsletter</h3>
    <p className="mb-3 text-[13px] text-secondary">New collections, SOSO news and offers.</p>
    {!available ? <div className="space-y-3">
      <p role="status" className="text-[13px] text-secondary">
        {available === null ? "Checking signup availability…" : "Signups aren’t open yet. Please check back soon."}
      </p>
      <button type="button" disabled className="inline-flex min-h-11 items-center gap-2 border border-foreground px-5 text-[11px] font-bold uppercase tracking-[0.2em] opacity-50">
        Subscribe
      </button>
    </div> : done ? <p role="status" className="border border-border p-3 text-[13px] text-secondary">Check your inbox for a confirmation request. If eligible, you can confirm there before receiving newsletters. If it does not arrive, contact SOSO to resend your pending confirmation.</p> :
      <form onSubmit={(e) => void submit(e)} noValidate={false} className="space-y-3">
        <label className="block text-[13px] text-secondary">Email address
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={error ? "newsletter-error" : undefined} className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm text-foreground" />
        </label>
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
        </div>
        <label className="flex items-start gap-2 text-[13px] text-secondary">
          <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
          <span>Email me SOSO news, collections and offers. I can unsubscribe at any time.</span>
        </label>
        <p className="text-[12px] text-secondary">See our <Link href="/privacy" className="underline underline-offset-4">privacy policy</Link>. This is separate from any account or order.</p>
        {error && <p id="newsletter-error" role="alert" className="text-[13px] text-destructive">{error}</p>}
        <button type="submit" disabled={busy || !consent} className="inline-flex min-h-11 items-center gap-2 border border-foreground px-5 text-[11px] font-bold uppercase tracking-[0.2em] disabled:opacity-50">
          {busy && <Loader2 size={14} className="animate-spin" />}Subscribe
        </button>
      </form>}
  </section>;
}
