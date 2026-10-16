import { getGetShopperProductionQueryKey, useGetShopperProduction, type ShopperProductionJob } from "@workspace/api-client-react";
import { ErrorNote, Section, Skeleton, errorStatus, formatDate, humanize } from "./shared";

function JobCard({ job, stages, index }: { job: ShopperProductionJob; stages: string[]; index: number }) {
  const current = job.currentStage ? stages.indexOf(job.currentStage) : -1;
  return (
    <li className="border border-border p-5" data-testid={`card-production-${job.id ?? index}`}>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground">{job.garmentName || (job.number ? `Piece ${job.number}` : "Atelier piece")}</p>
          {job.dueDate && <p className="mt-1 text-[12px] text-secondary">Expected {formatDate(job.dueDate)}</p>}
          {job.completedAt && <p className="mt-1 text-[12px] text-secondary">Completed {formatDate(job.completedAt)}</p>}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-secondary">{humanize(job.currentStage || job.status)}</span>
      </div>
      {stages.length > 0 && (
        <ol className="mt-5 flex gap-1" aria-label="Production stages">
          {stages.map((stage, i) => (
            <li key={stage} className="flex-1" title={humanize(stage)}>
              <span className={`block h-1 ${current >= 0 && i <= current ? "bg-primary" : "bg-muted"}`} />
              <span className="mt-2 hidden text-[9px] uppercase tracking-[0.15em] text-secondary md:block">{humanize(stage)}</span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export function ProductionSection() {
  const query = useGetShopperProduction({ query: { retry: false, queryKey: getGetShopperProductionQueryKey() } });
  if (query.isError && errorStatus(query.error) === 403) {
    return (
      <Section title="Atelier progress" eyebrow="Production" testId="section-production">
        <p className="text-[13px] text-secondary" data-testid="status-production-unavailable">Atelier progress is not available at the moment. This does not affect your orders.</p>
      </Section>
    );
  }
  if (query.data && !query.data.enabled) return null;
  const items = query.data ? [...query.data.jobs, ...query.data.orders] : [];
  return (
    <Section title="Atelier progress" eyebrow="Production" testId="section-production">
      {query.isLoading && <Skeleton rows={2} />}
      {query.isError && <ErrorNote error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && items.length === 0 && <p className="text-[13px] text-secondary">No pieces are in the atelier for you right now.</p>}
      {items.length > 0 && <ul className="grid gap-3">{items.map((job, i) => <JobCard key={job.id ?? i} job={job} stages={query.data?.stages ?? []} index={i} />)}</ul>}
    </Section>
  );
}
