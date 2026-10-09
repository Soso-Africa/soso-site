import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { mailApi } from "@/lib/staff-mail-api";

export default function NewsletterLink() {
  const kind: "confirm" | "unsubscribe" = window.location.pathname.endsWith("/unsubscribe") ? "unsubscribe" : "confirm";
  // Token is held in memory only; never persisted or sent anywhere on load.
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token") ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const add = (name: string, content: string) => {
      const m = document.createElement("meta"); m.name = name; m.content = content; document.head.appendChild(m); return m;
    };
    const metas = [add("robots", "noindex, nofollow"), add("referrer", "no-referrer")];
    return () => metas.forEach((m) => m.remove());
  }, []);

  const submit = async () => {
    if (busy || !token) return;
    setBusy(true); setError("");
    try {
      await mailApi(`/newsletter/${kind}`, { token });
      setDone(true);
      window.history.replaceState(null, "", window.location.pathname);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "This link could not be used. It may have expired or already been used.");
    } finally { setBusy(false); }
  };

  const confirm = kind === "confirm";
  return <main className="mx-auto flex min-h-[70dvh] max-w-lg flex-col justify-center px-6 py-16">
    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">SOSO newsletter</p>
    <h1 className="mt-2 text-3xl soso-display">{confirm ? "Confirm your subscription" : "Unsubscribe from SOSO news"}</h1>
    {done ? <p role="status" className="mt-6 border border-border p-4 text-sm">{confirm ? "Your subscription is confirmed. Thank you." : "You have been unsubscribed and will receive no further newsletters."}</p> : !token ? <p role="alert" className="mt-6 border border-destructive/30 p-4 text-sm text-destructive">This link is missing its token. Please use the full link from your email.</p> : <>
      <p className="mt-4 text-sm text-muted-foreground">{confirm ? "Press the button to confirm that you want to receive SOSO news, collections and offers." : "Press the button to stop receiving SOSO newsletters."}</p>
      {error && <p role="alert" className="mt-4 border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      <button type="button" onClick={() => void submit()} disabled={busy} className="mt-6 inline-flex min-h-11 items-center gap-2 self-start bg-primary px-6 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50">
        {busy && <Loader2 size={14} className="animate-spin" />}{confirm ? "Confirm subscription" : "Unsubscribe"}
      </button>
    </>}
  </main>;
}
