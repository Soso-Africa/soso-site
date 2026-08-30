import React, { useState } from "react";
import type { AnalyticsMetricsResponse } from "./types";
import { CategoryBarChart, DonutChart, DownloadableChart } from "./Charts";
import { Users, MousePointerClick, Globe, ArrowRight, Eye, Activity, ShoppingBag } from "lucide-react";

function EmptyTable({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-border bg-muted/5">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function BreakdownChart({
  storageKey,
  data,
  nameKey,
  metrics,
}: {
  storageKey: string;
  data: Array<Record<string, unknown>>;
  nameKey: string;
  metrics: Array<{ key: string; label: string }>;
}) {
  const [chartType, setChartType] = useState<"bar" | "donut">(() =>
    localStorage.getItem(`${storageKey}-type`) === "donut" ? "donut" : "bar",
  );
  const [metric, setMetric] = useState(() => {
    const saved = localStorage.getItem(`${storageKey}-metric`);
    return metrics.some((option) => option.key === saved) ? saved! : metrics[0].key;
  });
  const metricLabel = metrics.find((option) => option.key === metric)?.label ?? metrics[0].label;
  const updateType = (next: "bar" | "donut") => {
    setChartType(next);
    localStorage.setItem(`${storageKey}-type`, next);
  };
  const updateMetric = (next: string) => {
    setMetric(next);
    localStorage.setItem(`${storageKey}-metric`, next);
  };
  return (
    <div className="mb-5 border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 print:hidden">
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Measure
          <select value={metric} onChange={(event) => updateMetric(event.target.value)} className="h-8 border border-border bg-background px-2 text-xs normal-case tracking-normal text-foreground">
            {metrics.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <div className="flex border border-border bg-muted/20 p-0.5" aria-label="Chart type">
          {(["bar", "donut"] as const).map((type) => (
            <button key={type} type="button" onClick={() => updateType(type)} className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${chartType === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {type}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">
        <DownloadableChart filename={`${storageKey}-${metric}-${chartType}`}>
          {chartType === "bar"
            ? <CategoryBarChart data={data} nameKey={nameKey} valueKey={metric} valueName={metricLabel} />
            : <DonutChart data={data} nameKey={nameKey} valueKey={metric} />}
        </DownloadableChart>
      </div>
    </div>
  );
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

export function PagesTab({ data }: { data: AnalyticsMetricsResponse["pages"] }) {
  if (!data || data.length === 0) return <EmptyTable message="No page data available for this period." />;
  return (
    <>
      <BreakdownChart storageKey="soso-analytics-pages" data={data} nameKey="path" metrics={[{ key: "views", label: "Views" }, { key: "visitors", label: "Visitors" }, { key: "sessions", label: "Sessions" }]} />
      <div className="border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase tracking-wider bg-muted/30 text-muted-foreground border-b border-border">
          <tr>
            <th className="px-4 py-3 font-medium">Page Path</th>
            <th className="px-4 py-3 font-medium text-right">Views</th>
            <th className="px-4 py-3 font-medium text-right">Visitors</th>
            <th className="px-4 py-3 font-medium text-right">Sessions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-muted/10 transition-colors">
              <td className="px-4 py-3 font-medium text-foreground max-w-[250px] truncate" title={row.path}>{row.path}</td>
              <td className="px-4 py-3 text-right">{row.views.toLocaleString()}</td>
              <td className="px-4 py-3 text-right">{row.visitors.toLocaleString()}</td>
              <td className="px-4 py-3 text-right">{row.sessions.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

export function SourcesTab({ data }: { data: AnalyticsMetricsResponse["sources"] }) {
  if (!data || data.length === 0) return <EmptyTable message="No source data available for this period." />;
  const chartData = data.map((row) => ({ ...row, label: `${row.source} · ${row.medium}` }));
  return (
    <>
      <BreakdownChart storageKey="soso-analytics-sources" data={chartData} nameKey="label" metrics={[{ key: "visitors", label: "Visitors" }, { key: "sessions", label: "Sessions" }, { key: "events", label: "Events" }]} />
      <div className="border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase tracking-wider bg-muted/30 text-muted-foreground border-b border-border">
          <tr>
            <th className="px-4 py-3 font-medium">Source / Medium / Campaign</th>
            <th className="px-4 py-3 font-medium text-right">Events</th>
            <th className="px-4 py-3 font-medium text-right">Visitors</th>
            <th className="px-4 py-3 font-medium text-right">Sessions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-muted/10 transition-colors">
              <td className="px-4 py-3 font-medium text-foreground">
                {row.source || "(direct)"} · {row.medium}
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{row.campaign}</span>
              </td>
              <td className="px-4 py-3 text-right">{row.events.toLocaleString()}</td>
              <td className="px-4 py-3 text-right">{row.visitors.toLocaleString()}</td>
              <td className="px-4 py-3 text-right">{row.sessions.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

export function GeographyTab({ data }: { data: AnalyticsMetricsResponse["geography"] }) {
  if (!data || data.length === 0) return <EmptyTable message="No geography data available for this period." />;
  return (
    <>
      <BreakdownChart storageKey="soso-analytics-geography" data={data} nameKey="country" metrics={[{ key: "visitors", label: "Visitors" }, { key: "events", label: "Events" }]} />
      <div className="border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase tracking-wider bg-muted/30 text-muted-foreground border-b border-border">
          <tr>
            <th className="px-4 py-3 font-medium">Country</th>
            <th className="px-4 py-3 font-medium text-right">Visitors</th>
            <th className="px-4 py-3 font-medium text-right">Events</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-muted/10 transition-colors">
              <td className="px-4 py-3 font-medium flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                {row.country || "Unknown"}
              </td>
              <td className="px-4 py-3 text-right">{row.visitors.toLocaleString()}</td>
              <td className="px-4 py-3 text-right">{row.events.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

export function ConversionsTab({ data }: { data: AnalyticsMetricsResponse["conversions"] }) {
  if (!data || data.length === 0) return <EmptyTable message="No conversion data available." />;

  const verifiedOrders = data.find(c => c.key === "verified_orders");
  const funnelStages = data.filter((conversion) => conversion.kind === "consented_event");

  const maxCount = Math.max(...funnelStages.map(s => s.count), 1);

  return (
    <div className="space-y-6">
      {verifiedOrders && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 border border-border bg-card flex flex-col justify-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-2"><ShoppingBag className="w-4 h-4"/> {verifiedOrders.definition || "Verified Orders"}</p>
            <p className="text-3xl font-bold soso-display text-primary">{verifiedOrders.count.toLocaleString()}</p>
          </div>
          {verifiedOrders.revenueByCurrency && verifiedOrders.revenueByCurrency.length > 0 && (
            <div className="p-5 border border-border bg-card flex flex-col justify-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-2"><Activity className="w-4 h-4"/> Gross revenue by currency</p>
              <div className="space-y-1">
                {verifiedOrders.revenueByCurrency.map((row) => (
                  <p key={row.currency} className="text-2xl font-bold soso-display text-primary">
                    {formatMoney(row.revenue, row.currency)}
                    <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">{row.orders.toLocaleString()} orders</span>
                  </p>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Based on verified orders. Excludes cancelled/refunded.</p>
            </div>
          )}
        </div>
      )}

      {funnelStages.length > 0 && (
        <div className="p-5 border border-border bg-card">
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-6">Event Funnel</h3>
          <div className="space-y-4">
            {funnelStages.map((stage, i) => {
              const width = Math.max((stage.count / maxCount) * 100, 2);
              return (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-48 shrink-0 text-sm font-medium flex items-center justify-between">
                    <span title={stage.definition}>{stage.key}</span>
                    <span className="text-muted-foreground">{stage.count.toLocaleString()}</span>
                  </div>
                  <div className="flex-1 h-8 bg-muted/20 relative rounded-sm overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full bg-primary/20 border-r-2 border-primary transition-all duration-1000"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  {i < funnelStages.length - 1 && funnelStages[i+1] && (
                    <div className="w-24 shrink-0 text-right text-xs text-muted-foreground font-medium">
                      {stage.count > 0 ? Math.round((funnelStages[i+1].count / stage.count) * 100) : 0}% transition
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function EventsTab({ data }: { data: AnalyticsMetricsResponse["events"] }) {
  if (!data || data.length === 0) return <EmptyTable message="No event data available for this period." />;
  return (
    <>
      <BreakdownChart storageKey="soso-analytics-events" data={data} nameKey="eventName" metrics={[{ key: "events", label: "Events" }, { key: "visitors", label: "Visitors" }, { key: "sessions", label: "Sessions" }]} />
      <div className="border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase tracking-wider bg-muted/30 text-muted-foreground border-b border-border">
          <tr>
            <th className="px-4 py-3 font-medium">Event Name</th>
            <th className="px-4 py-3 font-medium text-right">Events</th>
            <th className="px-4 py-3 font-medium text-right">Visitors</th>
            <th className="px-4 py-3 font-medium text-right">Sessions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-muted/10 transition-colors">
              <td className="px-4 py-3 font-medium text-foreground flex items-center gap-2">
                <MousePointerClick className="w-4 h-4 text-muted-foreground" />
                {row.eventName}
              </td>
              <td className="px-4 py-3 text-right">{row.events.toLocaleString()}</td>
              <td className="px-4 py-3 text-right">{row.visitors.toLocaleString()}</td>
              <td className="px-4 py-3 text-right">{row.sessions.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

export function RealtimeTab({ data }: { data: AnalyticsMetricsResponse["realtime"] }) {
  if (!data) return <EmptyTable message="Realtime data currently unavailable." />;
  const asOf = new Date(data.asOf);
  const asOfLabel = Number.isNaN(asOf.getTime()) ? "Unavailable" : asOf.toLocaleTimeString();
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 border border-border bg-card relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/10 rounded-bl-full flex items-start justify-end p-3">
             <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
          </div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Active Now</p>
          <p className="text-4xl font-bold soso-display">{data.activeNow}</p>
          <p className="text-xs text-muted-foreground mt-2">consented sessions in the last {data.windowMinutes} minutes</p>
        </div>
        <div className="p-5 border border-border bg-card">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Recent Events</p>
          <p className="text-4xl font-bold soso-display">{data.events}</p>
          <p className="text-xs text-muted-foreground mt-2">events fired in the last {data.windowMinutes} minutes</p>
        </div>
      </div>

      <div className="border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/5">
          <h3 className="text-sm font-semibold uppercase tracking-wider">Top Pages (Live)</h3>
        </div>
        {data.topPages && data.topPages.length > 0 ? (
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase tracking-wider bg-muted/30 text-muted-foreground border-b border-border hidden">
              <tr>
                <th className="px-4 py-2 font-medium">Path</th>
                <th className="px-4 py-2 font-medium text-right">Page Views</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.topPages.map((row, i) => (
                <tr key={i} className="hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground flex items-center gap-2">
                    <span className="text-muted-foreground text-xs w-4">{i + 1}.</span>
                    {row.path}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted/50 text-xs font-medium border border-border">
                      <Users className="w-3 h-3 text-muted-foreground" />
                      {row.views}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">No active pages in the current window.</div>
        )}
      </div>
      <p className="text-xs text-muted-foreground text-right">As of: {asOfLabel}</p>
    </div>
  );
}
