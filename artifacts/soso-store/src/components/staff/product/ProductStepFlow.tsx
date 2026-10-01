import { Loader2 } from "lucide-react";
import type { PublicationState } from "./product-state";

export type StepId = "images" | "details" | "fulfilment" | "mapping" | "review" | "save" | "publish";
export type StepState = "done" | "next" | "blocked" | "todo";
export type ProductStep = { id: StepId; label: string; state: StepState; detail: string };

export type StepInputs = {
  imageCount: number;
  imageIssues: number;
  detailIssues: number;
  fulfilmentIssues: number;
  hasName: boolean;
  priceOk: boolean;
  eligibleChoices: number;
  standardSizesOk: boolean;
  mappedChoices: number;
  hasProductMapping: boolean;
  confirmedCurrent: boolean;
  analysisStatus?: "confident" | "needs_review" | "blocked";
  /** True only when the editor product equals the product in the saved server draft. */
  savedSinceEdit: boolean;
  publicationState?: PublicationState;
};

/** Pure readiness derivation. Never reports live; live state is owned by publication controls. */
export function computeProductSteps(i: StepInputs): ProductStep[] {
  const raw: { id: StepId; label: string; done: boolean; detail: string }[] = [
    { id: "images", label: "Images", done: i.imageCount > 0 && i.imageIssues === 0, detail: i.imageCount === 0 ? "Upload or approve at least one image" : i.imageIssues > 0 ? `${i.imageIssues} image issue${i.imageIssues === 1 ? "" : "s"}: primary photo, alt text or provenance` : "Primary photo approved with alt text and provenance" },
    { id: "details", label: "Details and price", done: i.hasName && i.priceOk && i.detailIssues === 0, detail: i.detailIssues > 0 ? `${i.detailIssues} detail issue${i.detailIssues === 1 ? "" : "s"} to fix` : "Name, price and copy valid" },
    { id: "fulfilment", label: "Fulfilment and sizes", done: i.eligibleChoices > 0 && i.standardSizesOk && i.fulfilmentIssues === 0, detail: i.eligibleChoices === 0 ? "Enable standard or custom eligibility" : i.fulfilmentIssues > 0 ? `${i.fulfilmentIssues} fulfilment or size issue${i.fulfilmentIssues === 1 ? "" : "s"} to fix` : i.standardSizesOk ? `${i.eligibleChoices} eligible choice${i.eligibleChoices === 1 ? "" : "s"}` : "Pick at least one standard size" },
    { id: "mapping", label: "JusticeSure selection", done: i.hasProductMapping && i.eligibleChoices > 0 && i.mappedChoices >= i.eligibleChoices, detail: !i.hasProductMapping ? "Select a JusticeSure product" : `${i.mappedChoices} of ${i.eligibleChoices} choices selected (selected is not confirmed)` },
    { id: "review", label: "Review and confirm", done: i.confirmedCurrent, detail: i.confirmedCurrent ? "Confirmed against current analysis" : i.analysisStatus === "blocked" ? "Analysis blocked: see issues" : i.analysisStatus === "needs_review" ? "Needs manual review" : i.analysisStatus === "confident" ? "Ready for explicit confirmation" : "Run Review Mapping" },
    { id: "save", label: "Save draft", done: i.savedSinceEdit, detail: i.savedSinceEdit ? "Saved, no edits since" : "Unsaved or not yet saved" },
  ];
  const steps: ProductStep[] = [];
  let nextFound = false;
  for (const r of raw) {
    if (r.done) steps.push({ id: r.id, label: r.label, state: "done", detail: r.detail });
    else if (!nextFound) { nextFound = true; steps.push({ id: r.id, label: r.label, state: "next", detail: r.detail }); }
    else steps.push({ id: r.id, label: r.label, state: "todo", detail: r.detail });
  }
  const allDone = !nextFound;
  const live = i.publicationState === "live_current";
  steps.push({
    id: "publish", label: "Publish",
    state: live ? "done" : allDone ? "next" : "blocked",
    detail: live ? "Live version matches the saved draft"
      : allDone ? (i.publicationState === "live_old_version" ? "Saved draft is ready; an older version is still live. Publish to update it" : "Saved draft is ready. Publish from the publication controls")
      : "Blocked until the 6 pre-publish steps are done",
  });
  return steps;
}

export function jumpToStep(slug: string, id: StepId) {
  const el = document.getElementById(`step-${slug}-${id}`);
  el?.scrollIntoView({ block: "start", behavior: "smooth" });
  el?.focus({ preventScroll: true });
}

const tone: Record<StepState, string> = {
  done: "border-emerald-300 bg-emerald-50 text-emerald-800",
  next: "border-primary bg-primary/10 text-primary",
  blocked: "border-border bg-muted/30 text-muted-foreground",
  todo: "border-border bg-background text-foreground",
};

export function ProductStepNav({ slug, steps }: { slug: string; steps: ProductStep[] }) {
  const next = steps.find((s) => s.state === "next");
  return (
    <nav aria-label="Product setup steps" className="space-y-3 border border-border bg-background p-3" data-testid={`step-nav-${slug}`}>
      <p role="status" className="text-xs">
        <strong>{steps.slice(0, 6).filter((s) => s.state === "done").length} of 6 pre-publish steps ready; step 7, Publish, is {steps[6]?.state === "done" ? "complete (live)" : steps[6]?.state === "next" ? "ready" : "blocked"}.</strong>{" "}
        {next ? <>Next: {next.label}. {next.detail}.</> : "Nothing left before publishing."}
      </p>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, n) => (
          <li key={s.id}>
            <button type="button" onClick={() => jumpToStep(slug, s.id)} aria-current={s.state === "next" ? "step" : undefined}
              data-testid={`step-${slug}-${s.id}-button`}
              className={`min-h-11 w-full border px-2 py-1.5 text-left text-[10px] ${tone[s.state]}`}>
              <span className="block font-semibold uppercase tracking-wider">{n + 1}. {s.label}</span>
              <span className="block normal-case">{s.state === "done" ? "Done" : s.state === "next" ? "Next action" : s.state === "blocked" ? "Blocked" : "To do"}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function ReviewMappingAction({
  slug, onReview, loading, error, disabledReason,
}: { slug: string; onReview: () => void; loading: boolean; error: string; disabledReason: string }) {
  return (
    <div className="space-y-2" data-testid={`review-mapping-${slug}`}>
      <button type="button" onClick={onReview} disabled={loading || Boolean(disabledReason)}
        aria-describedby={`review-mapping-note-${slug}`}
        data-testid={`button-review-mapping-${slug}`}
        className="inline-flex min-h-11 items-center gap-2 border border-primary bg-background px-3 text-[10px] font-semibold uppercase tracking-wider text-primary hover:bg-primary/10 disabled:opacity-50">
        {loading && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
        {loading ? "Reviewing mapping…" : error ? "Retry Review Mapping" : "Review Mapping"}
      </button>
      <p id={`review-mapping-note-${slug}`} className="text-[10px] text-muted-foreground">
        {disabledReason || "Asks the server to analyse only this product. Your unsaved edits and other products are untouched."}
      </p>
      {error && <p role="alert" className="border border-destructive/30 bg-destructive/10 p-2 text-[10px] text-destructive">{error} Selections are kept; confirmation stays blocked until a review succeeds.</p>}
    </div>
  );
}
