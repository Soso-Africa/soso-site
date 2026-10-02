import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type Activation = {
  enabled: boolean;
  effectiveEnabled: boolean;
  runtimeReady: boolean;
  canActivate: boolean;
  blockers: string[];
  updatedAt: string | null;
  provider?: string;
  fulfillmentOptions?: string[];
};

export function CommerceActivationPanel({ role }: { role: string }) {
  const [activation, setActivation] = useState<Activation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canManage = role === "owner" || role === "administrator";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/staff/commerce/activation", { credentials: "include" });
      const result = await response.json() as Activation & { error?: string };
      if (!response.ok) throw new Error(result.error || "Commerce activation status could not be loaded.");
      setActivation(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Commerce activation status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = async (enabled: boolean) => {
    if (!activation || !canManage || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/staff/commerce/activation", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, expectedUpdatedAt: activation.updatedAt }),
      });
      const result = await response.json() as Activation & { error?: string };
      if (!response.ok) throw new Error(result.error || "Commerce activation could not be updated.");
      setActivation(result);
      setNotice(`Online checkout ${result.enabled ? "enabled" : "paused"} successfully.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Commerce activation could not be updated.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-6 max-w-3xl border border-border bg-background p-5 sm:p-7" aria-labelledby="commerce-activation-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Commerce controls</p>
          <h2 id="commerce-activation-heading" className="mt-1 text-2xl soso-display">Online checkout activation</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Explicitly enable or pause online purchases. This does not publish catalogue drafts or charge customers; shoppers review the final price and choose a payment method at checkout.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || saving} className="inline-flex min-h-10 items-center gap-2 border border-border px-3 text-xs font-semibold uppercase tracking-wider disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
        </button>
      </div>

      {error && <p role="alert" className="mt-5 border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-5 border border-primary/25 bg-primary/5 p-3 text-sm">{notice}</p>}
      {loading && !activation ? <p role="status" className="mt-5 text-sm text-muted-foreground">Loading live commerce readiness…</p> : activation && (
        <div className="mt-6 space-y-4">
          <div className={`flex items-start gap-3 border p-4 ${activation.effectiveEnabled ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
            {activation.effectiveEnabled ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} className="mt-0.5 shrink-0" />}
            <div>
              <p className="text-sm font-semibold">{activation.effectiveEnabled ? "Online checkout is live" : "Online checkout is paused"}</p>
              <p className="mt-1 text-xs">Configured: {activation.enabled ? "On" : "Off"} · Production runtime: {activation.runtimeReady ? "Ready" : "Not ready"}</p>
              {activation.provider && <p className="mt-1 text-xs">Payment provider: {activation.provider}</p>}
              {activation.fulfillmentOptions?.length ? <p className="mt-1 text-xs">Available fulfilment: {activation.fulfillmentOptions.join(", ")}</p> : null}
            </div>
          </div>

          {activation.blockers.length > 0 && <div className="border border-amber-300 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider">Readiness blockers</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{activation.blockers.map((blocker, index) => <li key={`${index}-${blocker}`}>{blocker}</li>)}</ul>
          </div>}

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Checkout switch</p>
              <p className="mt-1 text-xs text-muted-foreground">{activation.updatedAt ? `Last changed ${new Date(activation.updatedAt).toLocaleString()}` : "No activation changes recorded yet."}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={activation.enabled}
              aria-label="Enable online checkout"
              disabled={!canManage || (!activation.enabled && !activation.canActivate) || saving}
              onClick={() => void update(!activation.enabled)}
              className={`inline-flex min-h-11 items-center justify-center gap-2 border px-5 text-xs font-semibold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50 ${activation.enabled ? "border-foreground bg-foreground text-background" : "border-border hover:border-primary"}`}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              {saving ? "Saving…" : activation.enabled ? "Pause checkout" : "Enable checkout"}
            </button>
          </div>
          {!canManage && <p className="text-xs text-muted-foreground">Read-only: only an Owner or Administrator may change the live checkout switch.</p>}
          {canManage && !activation.enabled && !activation.canActivate && <p className="text-xs text-muted-foreground">Activation is unavailable until the production readiness blockers above are resolved.</p>}
        </div>
      )}
    </section>
  );
}