import { useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OpsEmailActionMetricsResponse } from "@/lib/ops/emailActionMetrics";

/** Loads apart from the rest of /ops/update-metrics and asks the server for fresh numbers each time. */
export function useOpsEmailActionMetrics(
  enabled: boolean,
  filters: { days: number; excludedEmails: string[] }
) {
  const params = new URLSearchParams({ days: String(filters.days) });
  for (const value of filters.excludedEmails) params.append("excludedEmail", value);
  return useQuery({
    queryKey: ["ops-email-action-metrics", filters.days, ...filters.excludedEmails],
    queryFn: ({ signal }) =>
      fetchWithInternalAuth<OpsEmailActionMetricsResponse>(
        `/api/internal/ops/update-metrics/email-actions?${params.toString()}`,
        { signal }
      ),
    enabled,
    placeholderData: (previousData) => previousData,
    // A heavy aggregate: it reruns on opening, a range change or the refresh button, not on every window focus.
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 0,
  });
}
