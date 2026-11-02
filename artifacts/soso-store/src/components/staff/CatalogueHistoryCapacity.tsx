import React from "react";
import { useGetStaffCatalogueHistoryCapacity } from "@workspace/api-client-react";
import type { CatalogueHistoryCapacity as CapacityView } from "@workspace/api-client-react";
import { staffManualRefreshQuery } from "../../hooks/staff-query-policy";

const bytes = (value: number) => `${value.toLocaleString("en-GB")} bytes (${(value / 1048576).toFixed(2)} MiB)`;
const date = (value: string) => new Date(value).toLocaleString("en-GB");

export function CatalogueHistoryCapacity({ ownerId }: { ownerId: string }) {
  const report = useGetStaffCatalogueHistoryCapacity({
    query: {
      ...staffManualRefreshQuery,
      queryKey: ["staff-catalogue-history-capacity", ownerId],
      staleTime: 5 * 60_000,
      refetchOnMount: true,
    },
  });
  return <CatalogueHistoryCapacityReport data={report.data} loading={report.isLoading} failed={report.isError} />;
}

export function CatalogueHistoryCapacityReport({ data, loading, failed }: { data?: CapacityView; loading?: boolean; failed?: boolean }) {
  const attention = failed || (data && (data.status !== "available" || data.level !== "normal"));
  const total = data?.sample ? data.sample.revisionBytes + data.sample.auditBytes : null;
  const rate = (value: number | null) => value === null ? "Awaiting two daily measurements"
    : `${value > 0 ? "+" : ""}${bytes(Math.round(value))} / day`;
  return (
    <section aria-label="Catalogue history storage" className={`mt-5 border p-4 ${attention ? "border-amber-600/50 bg-amber-50 text-amber-950" : "border-border bg-muted/20"}`}>
      <h2 className="text-sm font-semibold">
        Catalogue history storage{data?.level === "warning" ? " — approaching budget"
          : data?.level === "urgent" ? " — urgent capacity warning"
          : data?.level === "exceeded" ? " — budget exceeded" : ""}
      </h2>
      {loading && <p className="mt-2 text-sm">Loading the last storage measurement…</p>}
      {failed && <p role="alert" className="mt-2 text-sm">Storage measurements are unavailable. This does not mean usage is within budget.</p>}
      {data && <>
        {data.status !== "available" && <p role="status" className="mt-2 text-sm">{data.status === "stale" ? "Stale measurement. " : "No successful measurement yet. "}{data.message}</p>}
        <p className="mt-2 text-sm">Owner-approved budget: {bytes(data.budgetBytes)}. Warning at {bytes(data.warningBytes)}; urgent at {bytes(data.urgentBytes)}.</p>
        {data.sample && <>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold">Retained revision allocation</dt><dd>{bytes(data.sample.revisionBytes)}</dd><dd>{rate(data.revisionBytesPerDay)}</dd></div>
            <div><dt className="font-semibold">Shared audit evidence allocation</dt><dd>{bytes(data.sample.auditBytes)}</dd><dd>{rate(data.auditBytesPerDay)}</dd></div>
          </dl>
          <p className="mt-3 text-sm font-semibold">Combined: {bytes(total!)} — {(total! / data.budgetBytes * 100).toFixed(1)}% of budget.</p>
          <p className="mt-2 text-xs">Measured {date(data.sample.measuredAt)}.{data.previous && ` Growth compared with ${date(data.previous.measuredAt)}.`}</p>
          {data.daysToBudget !== null && <p className="mt-2 text-sm">At the observed combined growth rate, approximately {Math.ceil(data.daysToBudget)} days to budget. This is a two-point estimate, not a forecast guarantee.</p>}
          {["warning", "urgent", "exceeded"].includes(data.level) && <p role="alert" className="mt-2 text-sm font-semibold">Review database capacity and the next storage budget before further growth. History and mapping evidence remain intact; saves are not blocked and nothing is automatically removed.</p>}
        </>}
        <p className="mt-3 text-xs">Next measurement eligible after {date(data.nextRefreshAt)}, on an owner visit or “Refresh lists &amp; alerts”. No more than once every 24 hours; page refresh cannot force a measurement.</p>
      </>}
      <p className="mt-3 text-xs">Conservative shared-table totals: all site-content revisions and all audit events, including catalogue mapping evidence and unrelated events. Includes table, indexes and TOAST allocation, not catalogue-only payload bytes. This is stored database capacity, not network transfer, media usage or a hosting-plan limit. Current content, other tables, backups and WAL are excluded. Warnings appear here for owners only; no email is sent.</p>
    </section>
  );
}
