import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useGetStaffCloudinaryUsage, type CloudinaryUsageMetric, type CloudinaryUsageView } from "@workspace/api-client-react";

function date(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Unavailable";
}
function amount(value: number | null, bytes: boolean) {
  if (value === null) return "Unavailable";
  return bytes
    ? `${(value / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 3 })} GB (${value.toLocaleString()} bytes)`
    : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}
export function quotaWarning(percent: number | null) {
  return percent === null ? null : percent >= 100 ? "Quota reached or exceeded"
    : percent >= 90 ? "Critical: near quota" : percent >= 80 ? "Warning: usage is rising" : null;
}

export function CloudinaryUsageReport({ view, requestFailed = false, now = Date.now() }: {
  view: CloudinaryUsageView; requestFailed?: boolean; now?: number;
}) {
  const snapshot = view.snapshot;
  const stale = snapshot && (requestFailed || view.status === "stale"
    || now - Date.parse(snapshot.fetchedAt) >= 30 * 60_000
    || !snapshot.providerUpdatedAt || now - Date.parse(snapshot.providerUpdatedAt) >= 48 * 60 * 60_000);
  const metrics: Array<[string, CloudinaryUsageMetric, boolean]> = snapshot ? [
    ["Credits", snapshot.credits, false],
    ["Storage", snapshot.storage, true],
    ["Bandwidth", snapshot.bandwidth, true],
    ["Transformations", snapshot.transformations, false],
  ] : [];
  return <>
    <p role="status" className="mt-5 border border-border bg-muted/20 p-3 text-sm">
      {!snapshot ? "Usage unavailable — no successful report is available." : stale
        ? "Stale usage — these are the last reported figures, not live usage."
        : "Latest available Cloudinary report — provider figures update periodically, not in real time."}
      {view.message && <span className="mt-1 block">{view.message}</span>}
    </p>
    {snapshot && <>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Plan reported by Cloudinary</dt><dd>{snapshot.plan ?? "Unavailable"}</dd></div>
        <div><dt className="text-muted-foreground">Reporting window: rolling 30 days</dt><dd>{snapshot.windowStart && snapshot.windowEnd ? `${snapshot.windowStart} to ${snapshot.windowEnd} (UTC)` : "Exact dates unavailable"}</dd></div>
        <div><dt className="text-muted-foreground">Provider last updated</dt><dd>{date(snapshot.providerUpdatedAt)}</dd></div>
        <div><dt className="text-muted-foreground">Report requested for</dt><dd>{date(snapshot.dateRequested)}</dd></div>
        <div><dt className="text-muted-foreground">Last successful fetch</dt><dd>{date(snapshot.fetchedAt)}</dd></div>
      </dl>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {metrics.map(([label, metric, bytes]) => {
          const warning = quotaWarning(metric.usedPercent);
          return <section key={label} className={`border p-4 ${warning ? "border-amber-500/60 bg-amber-50/50" : "border-border"}`}>
            <h3 className="text-sm font-semibold">{label}</h3>
            <p className="mt-2 text-lg">{amount(metric.usage, bytes)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Reported limit: {amount(metric.limit, bytes)}</p>
            <p className="mt-1 text-xs">{metric.usedPercent === null ? "Quota percentage unavailable" : `${metric.usedPercent.toLocaleString(undefined, { maximumFractionDigits: 2 })}% used`}</p>
            {warning && <p role="alert" className="mt-2 text-sm font-semibold text-amber-900">{warning}{stale ? " (last reported)" : ""}</p>}
          </section>;
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Storage is the stored asset footprint; bandwidth and transformations reflect the rolling usage window. Credits and individual allowances are shown only when returned by Cloudinary; they are not separate amounts to add together.</p>
      <p className="mt-3 text-xs text-muted-foreground">Admin requests remaining at fetch: {snapshot.adminRemaining ?? "Unavailable"} / {snapshot.adminLimit ?? "Unavailable"}. Admin limit reset: {date(snapshot.adminResetAt)}.</p>
    </>}
    <p className="mt-4 text-xs text-muted-foreground">Next provider refresh allowed: {date(view.nextRefreshAt)}. Staff share a 15-minute minimum refresh interval, including failed requests. Refresh never bypasses that limit; provider rate limits can extend it.</p>
    <div className="mt-5 border-t border-border pt-4 text-sm">
      <h3 className="font-semibold">Traffic sources are not measured separately</h3>
      <p className="mt-2 text-muted-foreground">These totals cover the configured Cloudinary product environment, not only SOSO shopper downloads. Server-side approval and publication inspections fetch media and can consume delivery bandwidth. Staff previews, development checks, shopper visits and other consumers can also contribute. This report does not measure their individual shares.</p>
      <p className="mt-2 text-muted-foreground">SOSO warnings start at 80%, become critical at 90%, and flag quota reached at 100%. Cloudinary uses soft limits: exceeding 100% does not prove immediate restriction, but sustained overuse on fixed plans can lead to restrictions. Review heavy media and repeated inspections without skipping approval checks. This view does not delete assets or buy a plan.</p>
    </div>
  </>;
}

export function CloudinaryUsagePanel({ staffId, role }: { staffId: string; role: string }) {
  const [now, setNow] = useState(Date.now);
  const query = useGetStaffCloudinaryUsage({ query: {
    queryKey: ["staff-cloudinary-usage", staffId, role],
    staleTime: 15 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  } });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);
  const refreshBlocked = query.isFetching || Boolean(query.data && now < Date.parse(query.data.nextRefreshAt));
  return <section className="mt-6 max-w-4xl border border-border bg-background p-5 sm:p-7" aria-labelledby="cloudinary-usage-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Media service</p>
        <h2 id="cloudinary-usage-heading" className="mt-1 text-2xl soso-display">Cloudinary usage</h2>
        <p className="mt-2 text-sm text-muted-foreground">Read-only usage and early quota warnings for editorial Staff.</p>
      </div>
      <button type="button" onClick={() => void query.refetch()} disabled={refreshBlocked} className="inline-flex min-h-10 items-center gap-2 border border-border px-3 text-xs font-semibold uppercase tracking-wider disabled:opacity-50">
        <RefreshCw size={14} className={query.isFetching ? "animate-spin" : ""} /> {query.isFetching ? "Loading" : "Refresh usage"}
      </button>
    </div>
    {query.isError && <p role="alert" className="mt-5 border border-destructive/40 p-3 text-sm text-destructive">Usage could not be loaded. {query.data ? "Any figures below are stale." : "No usage figures are available."} Try again later.</p>}
    {query.isLoading && !query.data && <p role="status" className="mt-5 text-sm">Loading Cloudinary usage…</p>}
    {query.data && <CloudinaryUsageReport view={query.data} requestFailed={query.isError} now={now} />}
  </section>;
}
