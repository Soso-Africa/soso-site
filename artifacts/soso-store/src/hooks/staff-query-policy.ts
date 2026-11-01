/**
 * Staff lists are loaded on demand, not on a timer, focus or reconnect.
 * Explicit refetch/invalidation still works. Never apply this to payment,
 * authentication or server-side save/publication validation.
 */
export const staffManualRefreshQuery = {
  staleTime: Infinity,
  refetchInterval: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
  retry: false,
} as const;
