import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import type { CatalogProduct } from "../../../data/platformContent";
import type { SaveResult } from "./product-state";

type Mode = { kind: "idle" } | { kind: "confirm"; publish: boolean } | { kind: "busy"; publish: boolean } | { kind: "done"; ok: boolean; message: string; publish: boolean };

export type ApprovalSummaryRow = { choice: string; price?: number; status: "empty" | "ok" | "wrong" | "missing_remote" };

const ngn = (n?: number) => (typeof n === "number" ? `NGN ${n.toLocaleString()}` : "No price");

/** In-context, explicit confirmation before the parent orchestrator saves (and optionally publishes) one product. */
export function ApprovalPanel({
  product, rows, correctCount, onApprove, onBusyChange,
}: {
  product: CatalogProduct;
  rows: ApprovalSummaryRow[];
  correctCount: number;
  onApprove?: (product: CatalogProduct, publish: boolean) => Promise<SaveResult>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const busyRef = useRef(onBusyChange);
  busyRef.current = onBusyChange;
  const slugRef = useRef(product.slug);
  useEffect(() => { if (slugRef.current !== product.slug) { slugRef.current = product.slug; setMode({ kind: "idle" }); } }, [product.slug]);
  useEffect(() => { busyRef.current(mode.kind === "busy"); }, [mode.kind]);

  const total = rows.length;
  const sizesReady = total > 0 && correctCount === total;
  const wrong = rows.filter((r) => r.status === "wrong").length;
  const slug = product.slug;

  const run = async (publish: boolean) => {
    if (!onApprove || mode.kind === "busy") return;
    const snapshot = product;
    setMode({ kind: "busy", publish });
    try {
      const result = await onApprove(snapshot, publish);
      if (slugRef.current === snapshot.slug) setMode({ kind: "done", ok: result.ok, message: result.message, publish });
    } catch (error) {
      if (slugRef.current === snapshot.slug) setMode({ kind: "done", ok: false, publish, message: error instanceof Error && error.message ? error.message : "Something went wrong. Your edits are kept; please try again." });
    }
  };

  return (
    <section id={`step-${slug}-approve`} tabIndex={-1} className="border border-primary/40 bg-background p-4 space-y-3" data-testid={`approval-panel-${slug}`} aria-busy={mode.kind === "busy"}>
      <div className="flex items-start gap-2">
        <ShieldCheck size={16} className="mt-0.5 text-primary" aria-hidden="true" />
        <div>
          <h5 className="text-[10px] font-semibold uppercase tracking-wider text-primary">Check and approve</h5>
          <p className="mt-1 text-xs text-muted-foreground">One button checks the sizes with JusticeSure, saves this product, and (if you choose) puts only this product on the shop.</p>
        </div>
      </div>

      {!onApprove && <p className="text-xs text-muted-foreground" data-testid={`approval-unavailable-${slug}`}>Approval is not available in this view. Use the save button below.</p>}

      {!sizesReady && total > 0 && (
        <p role="status" className="border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" data-testid={`approval-size-warning-${slug}`}>
          {correctCount} of {total} sizes are linked to the right JusticeSure option{wrong > 0 ? `; ${wrong} ${wrong === 1 ? "is" : "are"} the wrong size` : ""}. The check will stop if a size is wrong or missing. You can still save a draft.
        </p>
      )}

      {onApprove && mode.kind === "idle" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode({ kind: "confirm", publish: true })} data-testid={`button-approve-publish-${slug}`}
            className="inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            Approve and put on shop
          </button>
          <button type="button" onClick={() => setMode({ kind: "confirm", publish: false })} data-testid={`button-approve-draft-${slug}`}
            className="inline-flex min-h-11 items-center gap-2 border border-primary px-4 text-xs font-semibold text-primary hover:bg-primary/10">
            Check and save draft
          </button>
        </div>
      )}

      {(mode.kind === "confirm" || mode.kind === "busy") && (
        <div className="space-y-3 border border-border bg-muted/20 p-3" data-testid={`approval-confirm-${slug}`} role="group" aria-label="Confirm approval">
          <p className="text-sm font-semibold text-primary" data-testid={`approval-confirm-name-${slug}`}>{product.name || "Unnamed product"}</p>
          <p className="text-xs">Base price: <strong>{ngn(Number(product.price) || undefined)}</strong></p>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            {rows.map((r) => (
              <li key={r.choice} className={`flex justify-between gap-2 border px-2 py-1 ${r.status === "ok" ? "border-emerald-300" : "border-amber-300 bg-amber-50"}`} data-testid={`approval-row-${slug}-${r.choice}`}>
                <span className="font-semibold">{r.choice}</span>
                <span>{ngn(r.price)}{r.status === "ok" ? "" : r.status === "wrong" ? " · wrong size" : r.status === "empty" ? " · not linked" : " · not found"}</span>
              </li>
            ))}
            {rows.length === 0 && <li className="text-muted-foreground">No sizes are switched on.</li>}
          </ul>
          <p className="text-xs text-muted-foreground">
            {mode.publish
              ? "What happens: JusticeSure is checked again, this product is saved and approved, then only this product goes live. Other products and settings are not touched. Only owners and admins can approve; if you are an editor it will be saved but not approved."
              : "What happens: JusticeSure is checked again and this product is saved as a draft. Nothing goes live."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={mode.kind === "busy"} onClick={() => run(mode.publish)} data-testid={`button-approve-confirm-${slug}`}
              className="inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-60">
              {mode.kind === "busy" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
              {mode.kind === "busy" ? (mode.publish ? "Checking and publishing…" : "Checking and saving…") : mode.publish ? "Yes, approve and publish" : "Yes, save draft"}
            </button>
            <button type="button" disabled={mode.kind === "busy"} onClick={() => setMode({ kind: "idle" })} data-testid={`button-approve-cancel-${slug}`}
              className="inline-flex min-h-11 items-center border border-border px-4 text-xs font-semibold disabled:opacity-60">
              Go back
            </button>
          </div>
        </div>
      )}

      {mode.kind === "done" && (
        <div role={mode.ok ? "status" : "alert"} data-testid={`approval-result-${slug}`}
          className={`flex items-start gap-2 border p-3 text-xs ${mode.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
          {mode.ok ? <CheckCircle2 size={14} className="mt-0.5" aria-hidden="true" /> : <AlertCircle size={14} className="mt-0.5" aria-hidden="true" />}
          <div className="space-y-2">
            <p>{mode.message || (mode.ok ? (mode.publish ? "Approved. This product is now live." : "Checked and saved as a draft.") : "It did not finish.")}</p>
            {!mode.ok && <p>Your edits are kept. Fix the problem above, then try again.</p>}
            <button type="button" onClick={() => setMode({ kind: "idle" })} data-testid={`button-approve-again-${slug}`} className="underline font-semibold">
              {mode.ok ? "Done" : "Try again"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
