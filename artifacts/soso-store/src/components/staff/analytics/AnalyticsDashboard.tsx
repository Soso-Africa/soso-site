import React, { useState, useRef, useEffect } from "react";
import { useStaffAnalyticsMetrics } from "./queries";
import type { AnalyticsFilters } from "./types";
import {
  RefreshCw, ChevronDown, Printer, Download, Monitor, Smartphone, Tablet, Filter, X
} from "lucide-react";
import { KPICard, TimeSeriesChart, DonutChart, CategoryBarChart, DownloadableChart, CHART_COLORS, formatCompact } from "./Charts";
import {
  PagesTab, SourcesTab, GeographyTab, ConversionsTab, EventsTab, RealtimeTab
} from "./Tabs";
// CSVLink replacement
function CSVLink({ data, filename, className, children, title }: any) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!data || !data.length) return;
    const keys = Object.keys(data[0]);
    const csv = [
      keys.join(","),
      ...data.map((row: any) => keys.map((key) => formatCsvCell(row[key])).join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  return (
    <a href="#" onClick={handleClick} className={className} title={title}>
      {children}
    </a>
  );
}

import { format } from "date-fns";
import { getStaffExport } from "@workspace/api-client-react";
import { formatCsvCell, formatDelta, formatDuration, formatPercent, formatTrend } from "./formatters";

const INTERVAL_OPTIONS = [
  { label: "Every 5 min", ms: 5 * 60 * 1000 },
  { label: "Every 15 min", ms: 15 * 60 * 1000 },
  { label: "Every 1 hour", ms: 60 * 60 * 1000 },
  { label: "Every 24 hours", ms: 24 * 60 * 60 * 1000 },
];

export function AnalyticsDashboard({ range, role }: { range: { from: string; to: string }; role: string }) {
  const [filters, setFilters] = useState<AnalyticsFilters>({
    from: range.from,
    to: range.to,
  });

  // Sync range updates from parent
  useEffect(() => {
    setFilters((prev) => ({ ...prev, from: range.from, to: range.to }));
  }, [range.from, range.to]);

  const [refetchInterval, setRefetchInterval] = useState<number | undefined>(undefined);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<"Overview" | "Pages" | "Sources" | "Geography" | "Conversions" | "Events" | "Realtime">("Overview");
  const [chartType, setChartType] = useState<"area" | "line" | "bar">(() => {
    const saved = localStorage.getItem("soso_analytics_chart_type");
    return saved === "line" || saved === "bar" ? saved : "area";
  });
  const [trendMetric, setTrendMetric] = useState<"pageViews" | "visitors" | "sessions" | "events">(() => {
    const saved = localStorage.getItem("soso_analytics_trend_metric");
    return saved === "visitors" || saved === "sessions" || saved === "events" ? saved : "pageViews";
  });
  const [deviceChartType, setDeviceChartType] = useState<"donut" | "bar">(() =>
    localStorage.getItem("soso_analytics_device_chart_type") === "bar" ? "bar" : "donut",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data, isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useStaffAnalyticsMetrics(filters, { refetchInterval });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChartTypeChange = (type: "area" | "line" | "bar") => {
    setChartType(type);
    localStorage.setItem("soso_analytics_chart_type", type);
  };
  const handleTrendMetricChange = (metric: typeof trendMetric) => {
    setTrendMetric(metric);
    localStorage.setItem("soso_analytics_trend_metric", metric);
  };
  const handleDeviceChartTypeChange = (type: typeof deviceChartType) => {
    setDeviceChartType(type);
    localStorage.setItem("soso_analytics_device_chart_type", type);
  };

  const [isSpinning, setIsSpinning] = useState(false);
  useEffect(() => {
    if (isFetching) {
      setIsSpinning(true);
      return undefined;
    } else {
      const t = setTimeout(() => setIsSpinning(false), 600);
      return () => clearTimeout(t);
    }
  }, [isFetching]);

  const lastRefreshed = dataUpdatedAt
    ? (() => {
        const d = new Date(dataUpdatedAt);
        return `${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()} on ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      })()
    : null;

  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");

  const downloadReport = async (report: "operations_summary" | "analytics_summary" | "campaign_aggregate" | "content_seo_aggregate") => {
    setExporting(true);
    setNotice("");
    try {
      const result = await getStaffExport({ report, from: range.from, to: range.to });
      const csv = [result.columns.join(","), ...result.rows.map((row: any) => result.columns.map((column: any) => JSON.stringify(row[column] ?? "")).join(","))].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(`${result.filename} downloaded. ${result.privacyNote}`);
    } catch (error: any) {
      setNotice(error instanceof Error ? error.message : "The controlled export could not be generated.");
    } finally {
      setExporting(false);
    }
  };

  const tabs = ["Overview", "Pages", "Sources", "Geography", "Conversions", "Events", "Realtime"] as const;

  const getActiveTabData = () => {
    if (!data) return null;
    switch (activeTab) {
      case "Overview": return data.dailyTimeSeries;
      case "Pages": return data.pages;
      case "Sources": return data.sources;
      case "Geography": return data.geography;
      case "Conversions": return data.conversions;
      case "Events": return data.events;
      case "Realtime": return data.realtime?.topPages;
      default: return null;
    }
  };

  const activeData = getActiveTabData();

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6 overflow-x-hidden font-sans">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="flex flex-wrap items-center gap-3 text-2xl font-bold soso-display">
            Analytics Dashboard
            {data?.realtime?.activeNow !== undefined && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-[10px] font-semibold text-green-700 tracking-wider uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {data.realtime.activeNow} active now
              </span>
            )}
          </h2>
          {lastRefreshed && <p className="text-xs text-muted-foreground mt-1">Last refresh: {lastRefreshed}</p>}
        </div>

        <div className="flex w-full min-w-0 flex-col items-stretch gap-3 print:hidden sm:w-auto sm:items-end">
          <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1 sm:w-auto">
            <button type="button" disabled={exporting} onClick={() => void downloadReport("analytics_summary")} className="inline-flex h-8 items-center gap-1.5 border border-border bg-card hover:bg-muted transition-colors px-2.5 text-[10px] font-semibold uppercase tracking-wider disabled:opacity-50"><Download size={13} /> Analytics</button>
            <button type="button" disabled={exporting} onClick={() => void downloadReport("campaign_aggregate")} className="inline-flex h-8 items-center gap-1.5 border border-border bg-card hover:bg-muted transition-colors px-2.5 text-[10px] font-semibold uppercase tracking-wider disabled:opacity-50"><Download size={13} /> Campaign</button>
            <button type="button" disabled={exporting} onClick={() => void downloadReport("content_seo_aggregate")} className="inline-flex h-8 items-center gap-1.5 border border-border bg-card hover:bg-muted transition-colors px-2.5 text-[10px] font-semibold uppercase tracking-wider disabled:opacity-50"><Download size={13} /> SEO</button>
            {role === "owner" && <button type="button" disabled={exporting} onClick={() => void downloadReport("operations_summary")} className="inline-flex h-8 items-center gap-1.5 bg-primary text-primary-foreground hover:opacity-90 transition-colors px-2.5 text-[10px] font-semibold uppercase tracking-wider disabled:opacity-50"><Download size={13} /> Operations</button>}
          </div>

          <div className="flex max-w-full items-center gap-3 overflow-x-auto pb-1 sm:w-auto">
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`flex items-center justify-center h-8 px-3 gap-1.5 rounded border transition-colors text-xs font-medium ${filtersOpen ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:bg-muted text-foreground"}`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {Object.keys(filters).length > 2 && (
                <span className="ml-1 w-4 h-4 flex items-center justify-center rounded-full bg-foreground text-background text-[9px]">
                  {Object.keys(filters).length - 2}
                </span>
              )}
            </button>

            {activeData && activeData.length > 0 && (
              <CSVLink data={activeData} filename={`soso-analytics-${activeTab.toLowerCase()}.csv`} className="flex items-center justify-center h-8 px-3 gap-1.5 rounded border border-border bg-card hover:bg-muted transition-colors text-xs font-medium" title={`Export ${activeTab} as CSV`}>
                <Download className="w-3.5 h-3.5 text-muted-foreground" />
                Export
              </CSVLink>
            )}

            <button
              onClick={() => window.print()}
              disabled={isLoading}
              className="flex items-center justify-center w-8 h-8 rounded border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50"
              aria-label="Export as PDF"
              title="Export as PDF"
            >
              <Printer className="w-4 h-4 text-muted-foreground" />
            </button>

            <div className="relative" ref={dropdownRef}>
              <div className="flex items-center rounded border border-border bg-card h-8 text-xs">
                <button onClick={() => void refetch()} disabled={isLoading || isFetching} className="flex items-center gap-1.5 px-3 h-full hover:bg-muted transition-colors disabled:opacity-50 font-medium">
                  <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <div className="w-px h-5 bg-border shrink-0" />
                <button onClick={() => setDropdownOpen((o) => !o)} className="flex items-center justify-center px-2 h-full hover:bg-muted transition-colors">
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border shadow-lg rounded z-50 py-1 text-sm">
                  <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border mb-1">
                    Auto-Refresh
                  </div>
                  <button
                    className={`w-full text-left px-3 py-1.5 hover:bg-muted/50 transition-colors ${refetchInterval === undefined ? "font-medium text-primary" : ""}`}
                    onClick={() => { setRefetchInterval(undefined); setDropdownOpen(false); }}
                  >
                    Off
                  </button>
                  {INTERVAL_OPTIONS.map(opt => (
                    <button
                      key={opt.label}
                      className={`w-full text-left px-3 py-1.5 hover:bg-muted/50 transition-colors ${refetchInterval === opt.ms ? "font-medium text-primary" : ""}`}
                      onClick={() => { setRefetchInterval(opt.ms); setDropdownOpen(false); }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {notice && <p role="status" className="border border-primary/25 bg-primary/5 p-3 text-sm text-foreground">{notice}</p>}

      {filtersOpen && (
        <div className="p-4 border border-border bg-muted/10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm animate-in slide-in-from-top-2">
          {["source", "path", "event", "country", "device", "browser"].map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label htmlFor={`filter-${key}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{key}</label>
              <input
                id={`filter-${key}`}
                type="text"
                placeholder={`Any ${key}`}
                className="staff-input !min-h-8 !py-1 text-xs"
                value={(filters as any)[key] || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilters(prev => {
                    const next = { ...prev };
                    if (val) (next as any)[key] = val;
                    else delete (next as any)[key];
                    return next;
                  });
                }}
              />
            </div>
          ))}
          <div className="col-span-full flex justify-end">
            <button
              onClick={() => {
                setFilters({ from: range.from, to: range.to });
              }}
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

      <div className="flex border-b border-border overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold uppercase tracking-wider whitespace-nowrap transition-colors border-b-2 ${
              activeTab === t
                ? "border-primary text-foreground bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border border-dashed border-border">
          <RefreshCw className="w-6 h-6 animate-spin mb-4 text-primary" />
          <p className="text-sm uppercase tracking-widest font-semibold">Compiling metrics…</p>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center h-64 text-destructive border border-dashed border-destructive bg-destructive/5 rounded-md">
          <p className="text-sm font-semibold mb-2">Error loading analytics data</p>
          <p className="text-xs">{error instanceof Error ? error.message : "Unknown error occurred"}</p>
          <button type="button" onClick={() => void refetch()} className="mt-4 px-4 py-2 bg-primary text-primary-foreground text-xs uppercase tracking-wider font-semibold rounded hover:opacity-90">Retry</button>
        </div>
      ) : data ? (
        <div className="animate-in fade-in duration-500">
          {activeTab === "Overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
                <KPICard title="Visitors" value={formatCompact(data.summary.visitors.current)} change={formatDelta(data.summary.visitors.delta)} trend={formatTrend(data.summary.visitors.delta)} />
                <KPICard title="Page Views" value={formatCompact(data.summary.pageViews.current)} change={formatDelta(data.summary.pageViews.delta)} trend={formatTrend(data.summary.pageViews.delta)} />
                <KPICard title="Sessions" value={formatCompact(data.summary.sessions.current)} change={formatDelta(data.summary.sessions.delta)} trend={formatTrend(data.summary.sessions.delta)} />
                <KPICard title="Avg Duration" value={formatDuration(data.engagement.averageEngagedSeconds)} change="" trend="neutral" />
                <KPICard title="Bounce Rate" value={formatPercent(data.engagement.bounceRate)} change="" trend="neutral" />
                <KPICard title="Events" value={formatCompact(data.summary.events.current)} change={formatDelta(data.summary.events.delta)} trend={formatTrend(data.summary.events.delta)} />
                <KPICard title="Active Now" value={formatCompact(data.realtime.activeNow)} change={`Last ${data.realtime.windowMinutes} min`} trend="neutral" />
              </div>

              <div className="grid gap-3 border border-border bg-muted/10 p-4 text-xs leading-relaxed text-muted-foreground md:grid-cols-2">
                <p><span className="font-semibold uppercase tracking-wider text-foreground">Signal freshness · </span>{data.freshness.latestEventAt && !Number.isNaN(new Date(data.freshness.latestEventAt).getTime()) ? `Latest consented event ${format(new Date(data.freshness.latestEventAt), "d MMM, HH:mm")}. ` : "No valid consented event timestamp in this range. "}{data.freshness.activeDays} of {data.freshness.periodDays} days contain signal.</p>
                <p><span className="font-semibold uppercase tracking-wider text-foreground">Consent coverage · </span>{data.privacyNote}</p>
                <p><span className="font-semibold uppercase tracking-wider text-foreground">Duration & bounce · </span>{data.engagement.definition}</p>
                <p><span className="font-semibold uppercase tracking-wider text-foreground">Commerce · </span>{data.semantics.commerce}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 border border-border bg-card">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wider">Metrics Over Time</h3>
                    <div className="flex items-center gap-3 print:hidden">
                      <label htmlFor="analytics-trend-metric" className="sr-only">Metric shown in trend chart</label>
                      <select
                        id="analytics-trend-metric"
                        value={trendMetric}
                        onChange={(event) => handleTrendMetricChange(event.target.value as typeof trendMetric)}
                        className="h-8 border border-border bg-background px-2 text-xs text-foreground"
                      >
                        <option value="pageViews">Page views</option>
                        <option value="visitors">Visitors</option>
                        <option value="sessions">Sessions</option>
                        <option value="events">Events</option>
                      </select>
                      <div className="flex bg-muted/20 border border-border rounded p-0.5">
                        <button onClick={() => handleChartTypeChange("area")} className={`px-2 py-1 text-xs font-semibold uppercase tracking-wider rounded-sm ${chartType === "area" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Area</button>
                        <button onClick={() => handleChartTypeChange("line")} className={`px-2 py-1 text-xs font-semibold uppercase tracking-wider rounded-sm ${chartType === "line" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Line</button>
                        <button onClick={() => handleChartTypeChange("bar")} className={`px-2 py-1 text-xs font-semibold uppercase tracking-wider rounded-sm ${chartType === "bar" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Bar</button>
                      </div>
                      {data.dailyTimeSeries && data.dailyTimeSeries.length > 0 && (
                        <CSVLink data={data.dailyTimeSeries} filename="daily-metrics.csv" className="flex items-center justify-center w-7 h-7 rounded border border-border hover:bg-muted transition-colors" title="Export Chart Data">
                          <Download className="w-3.5 h-3.5 text-muted-foreground" />
                        </CSVLink>
                      )}
                    </div>
                  </div>
                  <div className="p-4">
                     <DownloadableChart filename={`soso-analytics-${trendMetric}-${chartType}`}>
                       <TimeSeriesChart
                         data={data.dailyTimeSeries}
                         xKey="date"
                         type={chartType}
                         series={[
                           {
                             key: trendMetric,
                             name: trendMetric === "pageViews" ? "Page Views" : trendMetric[0].toUpperCase() + trendMetric.slice(1),
                             color: CHART_COLORS.darkGreen,
                           },
                         ]}
                       />
                     </DownloadableChart>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="border border-border bg-card">
                    <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wider">Devices</h3>
                      <div className="flex border border-border bg-muted/20 p-0.5 print:hidden" aria-label="Device chart type">
                        {(["donut", "bar"] as const).map((type) => (
                          <button key={type} type="button" onClick={() => handleDeviceChartTypeChange(type)} className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${deviceChartType === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="p-4">
                      <DownloadableChart filename={`soso-analytics-devices-${deviceChartType}`}>
                        {deviceChartType === "donut"
                          ? <DonutChart data={data.devices} nameKey="deviceType" valueKey="visitors" />
                          : <CategoryBarChart data={data.devices} nameKey="deviceType" valueKey="visitors" valueName="Visitors" />}
                      </DownloadableChart>
                      <div className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5"><Monitor className="w-3.5 h-3.5"/> Desktop</div>
                        <div className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5"/> Mobile</div>
                        <div className="flex items-center gap-1.5"><Tablet className="w-3.5 h-3.5"/> Tablet</div>
                      </div>
                    </div>
                  </div>

                  <div className="border border-border bg-card">
                    <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wider">Browsers</h3>
                      {data.browsers && data.browsers.length > 0 && (
                        <CSVLink data={data.browsers} filename="browsers.csv" className="flex items-center justify-center w-6 h-6 rounded border border-border hover:bg-muted transition-colors print:hidden" title="Export Browsers">
                          <Download className="w-3 h-3 text-muted-foreground" />
                        </CSVLink>
                      )}
                    </div>
                    <div className="p-0">
                       <table className="w-full text-xs text-left">
                         <tbody className="divide-y divide-border">
                           {data.browsers.slice(0, 4).map((b, i) => (
                             <tr key={i} className="hover:bg-muted/5 transition-colors">
                               <td className="px-4 py-2 font-medium">{b.browser}</td>
                               <td className="px-4 py-2 text-right">{b.visitors.toLocaleString()}</td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "Pages" && <PagesTab data={data.pages} />}
          {activeTab === "Sources" && <SourcesTab data={data.sources} />}
          {activeTab === "Geography" && <GeographyTab data={data.geography} />}
          {activeTab === "Conversions" && <ConversionsTab data={data.conversions} />}
          {activeTab === "Events" && <EventsTab data={data.events} />}
          {activeTab === "Realtime" && <RealtimeTab data={data.realtime} />}
        </div>
      ) : (
        <div className="flex items-center justify-center h-64 text-red-500 border border-dashed border-red-500/20 bg-red-500/5">
          Failed to load analytics data.
        </div>
      )}
    </div>
  );
}
