import { useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OpsUpdateMetricsResponse } from "@/lib/ops/updateMetrics";

export function useOpsUpdateMetrics(
  enabled: boolean,
  filters: { deployedOn: string; excludedEmails: string[] }
) {
  return useQuery({
    queryKey: [
      "ops-update-metrics",
      filters.deployedOn,
      ...filters.excludedEmails,
    ],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ deployedOn: filters.deployedOn });
      for (const value of filters.excludedEmails) {
        params.append("excludedEmail", value);
      }
      return fetchWithInternalAuth<OpsUpdateMetricsResponse>(
        `/api/internal/ops/update-metrics?${params.toString()}`,
        { signal }
      );
    },
    enabled,
    gcTime: 15 * 60 * 1_000,
    placeholderData: (previousData) => previousData,
    retry: false,
    staleTime: 2 * 60 * 1_000,
  });
}
