import type { StaffAnalyticsMetrics } from "@workspace/api-client-react";

export type AnalyticsMetricsResponse = StaffAnalyticsMetrics;

export interface AnalyticsFilters {
  from: string;
  to: string;
  source?: string;
  path?: string;
  event?: string;
  country?: string;
  device?: "desktop" | "tablet" | "mobile" | "unknown";
  browser?: "chrome" | "safari" | "firefox" | "edge" | "opera" | "samsung internet" | "unknown";
}