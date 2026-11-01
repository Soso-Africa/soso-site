import { useGetStaffAnalyticsMetrics } from "@workspace/api-client-react";
import type { AnalyticsFilters } from "./types";
import { staffManualRefreshQuery } from "@/hooks/staff-query-policy";

export function useStaffAnalyticsMetrics(filters: AnalyticsFilters, options?: { refetchInterval?: number }) {
  return useGetStaffAnalyticsMetrics(filters, {
    query: {
      ...staffManualRefreshQuery,
      queryKey: ["staff-analytics-metrics", filters],
      refetchInterval: options?.refetchInterval ?? false,
    },
  });
}
