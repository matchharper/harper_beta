import { useOpsMetricSnapshotQuery } from "@/hooks/ops/useOpsMetricSnapshotQuery";
import type { OpsUpdateMetricsResponse } from "@/lib/ops/updateMetrics";

export function useOpsUpdateMetrics(
  enabled: boolean,
  filters: { deployedOn: string; excludedEmails: string[] }
) {
  const params = new URLSearchParams({ deployedOn: filters.deployedOn });
  for (const value of filters.excludedEmails) {
    params.append("excludedEmail", value);
  }
  return useOpsMetricSnapshotQuery<OpsUpdateMetricsResponse>({
    enabled,
    params,
    path: "/api/internal/ops/update-metrics",
    queryKey: ["ops-update-metrics", filters.deployedOn, ...filters.excludedEmails],
  });
}
