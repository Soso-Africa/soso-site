import { experimentRegistry, type ExperimentDefinition } from "@/lib/experiments";

function statusLabel(experiment: ExperimentDefinition) {
  return experiment.enabled && experiment.status === "enabled" ? "Enabled" : "Disabled";
}

export function ExperimentLog() {
  return (
    <section className="mt-12 border-t border-border pt-10" aria-labelledby="experiment-log-heading">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Owner &amp; analyst operational view</p>
        <h2 id="experiment-log-heading" className="mt-2 text-3xl soso-display">Experiment log</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Read-only local configuration. It does not load marketing providers, alter analytics collection, or activate storefront treatments.
        </p>
      </div>

      <div className="mt-6 space-y-5">
        {experimentRegistry.map((experiment) => (
          <article key={experiment.id} className="border border-border bg-card">
            <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg soso-display">{experiment.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{experiment.hypothesis}</p>
              </div>
              <span className="w-fit border border-border bg-muted/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{statusLabel(experiment)}</span>
            </header>

            <div className="grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              <div className="p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Variants and allocation</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {experiment.variants.map((variant) => <li key={variant.id}><span className="font-medium">{variant.label}</span> <span className="text-muted-foreground">· {Math.round(variant.allocation * 100)}%</span></li>)}
                </ul>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Reporting segments</p>
                <p className="mt-2 text-sm text-muted-foreground">{experiment.reportingSegments.join(" and ")}</p>
              </div>
              <div className="p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Stopping rule</p>
                <p className="mt-2 text-sm leading-relaxed">{experiment.stoppingRule.decision}</p>
                <p className="mt-2 text-sm text-muted-foreground">At least {experiment.stoppingRule.minimumConsentedParticipants} consented participants; {experiment.stoppingRule.minimumRuntimeDays}–{experiment.stoppingRule.maximumRuntimeDays} days.</p>
              </div>
            </div>

            <div className="grid gap-5 border-t border-border p-4 lg:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Pause guardrails</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {experiment.guardrails.map((guardrail) => <li key={guardrail.metric}>{guardrail.metric.replaceAll("_", " ")}: {guardrail.trigger} <span className="text-foreground">Pause and review.</span></li>)}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Required before activation</p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  {experiment.activationRequirements.map((requirement) => <li key={requirement}>{requirement}</li>)}
                </ul>
              </div>
            </div>

            <p className="border-t border-border p-4 text-xs leading-relaxed text-muted-foreground">{experiment.measurementNote}</p>
          </article>
        ))}
      </div>
    </section>
  );
}