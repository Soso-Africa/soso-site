import { useGetStaffAnalyticsMetrics } from "@workspace/api-client-react";
import type { AnalyticsFilters } from "./types";

export function useStaffAnalyticsMetrics(filters: AnalyticsFilters, options?: { refetchInterval?: number }) {
  return useGetStaffAnalyticsMetrics(filters, {
    query: {
      queryKey: ["staff-analytics-metrics", filters],
      refetchInterval: options?.refetchInterval,
    },
  });
}
