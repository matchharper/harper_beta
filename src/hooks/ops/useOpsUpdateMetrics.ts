import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOpsMetricSnapshotQuery } from "@/hooks/ops/useOpsMetricSnapshotQuery";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OpsUpdateMetricsResponse } from "@/lib/ops/updateMetrics";

export function useOpsUpdateMetrics(
  enabled: boolean,
  filters: { excludedEmails: string[]; from: string; to: string }
) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  for (const value of filters.excludedEmails) {
    params.append("excludedEmail", value);
  }
  return useOpsMetricSnapshotQuery<OpsUpdateMetricsResponse>({
    enabled: enabled && Boolean(filters.from && filters.to),
    params,
    path: "/api/internal/ops/update-metrics",
    queryKey: ["ops-update-metrics", "v2", filters.from, filters.to, ...filters.excludedEmails],
  });
}

type TrackingResponse = { states: Array<{ endedAt: string | null; key: string }> };

const TRACKING_PATH = "/api/internal/ops/update-metrics/tracking";
const TRACKING_KEY = ["ops-update-metrics-tracking"];

/** Which tracked changes were ended, and a way to end or resume one. */
export function useOpsTrackedChanges(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    enabled,
    queryFn: ({ signal }) => fetchWithInternalAuth<TrackingResponse>(TRACKING_PATH, { signal }),
    queryKey: TRACKING_KEY,
    retry: false,
    staleTime: 60 * 1000,
  });
  const mutation = useMutation({
    mutationFn: (input: { ended: boolean; key: string }) =>
      fetchWithInternalAuth<TrackingResponse>(TRACKING_PATH, {
        body: JSON.stringify(input),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    onSuccess: (data) => queryClient.setQueryData(TRACKING_KEY, data),
  });
  const ended = new Set(
    (query.data?.states ?? []).filter((state) => state.endedAt).map((state) => state.key)
  );
  return { ended, mutation, query };
}
