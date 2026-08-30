import React, { useMemo, useRef } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart
} from "recharts";
import { ArrowUpIcon, ArrowDownIcon, ImageDown } from "lucide-react";
import { format } from "date-fns";

export const CHART_COLORS = {
  darkGreen: "#1a362d",
  gold: "#d4b45a",
  earth: "#4a3b2c",
  lightGold: "#e8d596",
  charcoal: "#2a2a2a",
  positive: "#009118",
  negative: "#A60808",
};

export const CHART_COLOR_LIST = [
  CHART_COLORS.darkGreen,
  CHART_COLORS.gold,
  CHART_COLORS.earth,
  CHART_COLORS.charcoal,
  CHART_COLORS.lightGold,
];

export function DownloadableChart({
  filename,
  children,
}: {
  filename: string;
  children: React.ReactNode;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const download = () => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const source = `<?xml version="1.0" encoding="UTF-8"?>${new XMLSerializer().serializeToString(clone)}`;
    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="min-w-0">
      <div className="mb-2 flex justify-end print:hidden">
        <button type="button" onClick={download} className="inline-flex h-8 items-center gap-1.5 border border-border bg-card px-2.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted" title="Download chart as an SVG image">
          <ImageDown size={13} /> Image
        </button>
      </div>
      <div ref={chartRef}>{children}</div>
    </div>
  );
}

export function KPICard({
  title,
  value,
  change,
  trend,
  valueColor = CHART_COLORS.darkGreen
}: {
  title: string;
  value: string | number;
  change: string | number;
  trend?: "up" | "down" | "neutral";
  valueColor?: string;
}) {
  const isPositive = trend === "up";
  const isNegative = trend === "down";

  return (
    <div className="flex flex-col p-4 border border-border bg-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-bold soso-display" style={{ color: valueColor }}>{value}</p>
      {trend && trend !== "neutral" && (
        <div className="flex items-center gap-1 mt-2">
          {isPositive ? (
            <ArrowUpIcon className="w-3.5 h-3.5" style={{ color: CHART_COLORS.positive }} />
          ) : (
            <ArrowDownIcon className="w-3.5 h-3.5" style={{ color: CHART_COLORS.negative }} />
          )}
          <span className="text-xs font-medium" style={{ color: isPositive ? CHART_COLORS.positive : CHART_COLORS.negative }}>
            {change}
          </span>
          <span className="text-xs text-muted-foreground">vs last period</span>
        </div>
      )}
      {!trend && change && (
        <div className="mt-2 text-xs text-muted-foreground">{change}</div>
      )}
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    color: string;
    name: string;
    value: number | string;
  }>;
  label?: string;
}

export function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white border border-border shadow-md rounded-sm p-3 text-[13px] text-foreground min-w-[150px]">
      <div className="font-semibold mb-2 pb-1 border-b border-muted flex items-center gap-2">
        {label}
      </div>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 mt-1">
          {entry.color && entry.color !== "#ffffff" && (
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          )}
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium">{typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}</span>
        </div>
      ))}
    </div>
  );
}

interface CustomLegendProps {
  payload?: Array<{
    color: string;
    value: string;
  }>;
}

export function CustomLegend({ payload }: CustomLegendProps) {
  if (!payload || payload.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[12px] mt-4">
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground uppercase tracking-wider">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function parseLocalDate(dateStr: string): Date {
  if (dateStr.includes("T")) return new Date(dateStr);
  const parts = dateStr.split("-");
  if (parts.length >= 3) {
    const [y, m, d] = parts.map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}

export function formatDate(dateStr: string, fmt = "MMM d"): string {
  if (!dateStr) return "";
  try {
    return format(parseLocalDate(dateStr), fmt);
  } catch {
    return dateStr;
  }
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

interface TimeSeriesProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: Array<{ key: string; name: string; color: string }>;
  type: "area" | "line" | "bar";
  isDark?: boolean;
}

export function TimeSeriesChart({ data, xKey, series, type, isDark = false }: TimeSeriesProps) {
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "#e5e5e5";
  const tickColor = isDark ? "#98999C" : "#71717a";

  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm border border-dashed border-border bg-muted/5">No data available for the selected period.</div>;
  }

  const renderChart = () => {
    switch (type) {
      case "area":
        return (
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`gradient-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey={xKey} tickFormatter={(d) => formatDate(d)} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} tickMargin={10} minTickGap={30} />
            <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} />
            <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)', stroke: 'none' }} />
            <Legend content={<CustomLegend />} />
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} fill={`url(#gradient-${s.key})`} stroke={s.color} fillOpacity={1} strokeWidth={2} activeDot={{ r: 4, fill: s.color, stroke: '#ffffff', strokeWidth: 2 }} isAnimationActive={false} />
            ))}
          </AreaChart>
        );
      case "bar":
        return (
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey={xKey} tickFormatter={(d) => formatDate(d)} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} tickMargin={10} minTickGap={30} />
            <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} />
            <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
            <Legend content={<CustomLegend />} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} fillOpacity={0.9} activeBar={{ fillOpacity: 1 }} isAnimationActive={false} radius={[2, 2, 0, 0]} maxBarSize={50} />
            ))}
          </BarChart>
        );
      case "line":
      default:
        return (
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey={xKey} tickFormatter={(d) => formatDate(d)} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} tickMargin={10} minTickGap={30} />
            <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} />
            <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ stroke: tickColor, strokeDasharray: '3 3' }} />
            <Legend content={<CustomLegend />} />
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: s.color, stroke: '#ffffff', strokeWidth: 2 }} isAnimationActive={false} />
            ))}
          </LineChart>
        );
    }
  };

  return (
    <ResponsiveContainer width="100%" height={350} debounce={0}>
      {renderChart()}
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, nameKey, valueKey }: { data: Array<Record<string, unknown>>; nameKey: string; valueKey: string }) {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm border border-dashed border-border bg-muted/5">No data available.</div>;
  }

  // Sort and group
  const sorted = [...data].sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0));
  const top = sorted.slice(0, 5);
  const other = sorted.slice(5).reduce((sum, item) => sum + Number(item[valueKey] || 0), 0);
  const displayData = other > 0 ? [...top, { [nameKey]: "Other", [valueKey]: other }] : top;

  const total = displayData.reduce((sum, item) => sum + Number(item[valueKey] || 0), 0);

  return (
    <ResponsiveContainer width="100%" height={280} debounce={0}>
      <PieChart>
        <Pie
          data={displayData}
          dataKey={valueKey}
          nameKey={nameKey}
          cx="50%"
          cy="45%"
          innerRadius={70}
          outerRadius={100}
          cornerRadius={0}
          paddingAngle={1}
          isAnimationActive={false}
          stroke="none"
        >
          {displayData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={CHART_COLOR_LIST[index % CHART_COLOR_LIST.length]} />
          ))}
        </Pie>
        <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" className="text-xl font-bold soso-display fill-foreground">
          {formatCompact(total)}
        </text>
        <text x="50%" y="45%" dy={20} textAnchor="middle" dominantBaseline="middle" className="text-xs uppercase tracking-wider fill-muted-foreground">
          Total
        </text>
        <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
        <Legend content={<CustomLegend />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CategoryBarChart({
  data,
  nameKey,
  valueKey,
  valueName,
}: {
  data: Array<Record<string, unknown>>;
  nameKey: string;
  valueKey: string;
  valueName: string;
}) {
  if (!data.length) {
    return <div className="flex h-[280px] items-center justify-center border border-dashed border-border bg-muted/5 text-sm text-muted-foreground">No data available.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={280} debounce={0}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
        <XAxis dataKey={nameKey} tick={{ fontSize: 11, fill: "#71717a" }} stroke="#71717a" />
        <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fill: "#71717a" }} stroke="#71717a" />
        <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Bar dataKey={valueKey} name={valueName} fill={CHART_COLORS.darkGreen} isAnimationActive={false} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
