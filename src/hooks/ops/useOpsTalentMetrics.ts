import { useOpsMetricSnapshotQuery } from "@/hooks/ops/useOpsMetricSnapshotQuery";
import type {
  OpsTalentMetricInterval,
  OpsTalentMetricsResponseBySection,
  OpsTalentMetricsSection,
} from "@/lib/ops/talentMetrics";
import type { OpsTalentMetricsOverviewResponse } from "@/lib/ops/talentMetricsOverview";

type Filters = {
  excludedEmails: string[];
  from: string;
  interval: OpsTalentMetricInterval;
  to: string;
};

function filterParams(filters: Filters, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    from: filters.from,
    interval: filters.interval,
    to: filters.to,
    ...extra,
  });
  for (const value of filters.excludedEmails) {
    params.append("excludedEmail", value);
  }
  return params;
}

function useOpsTalentMetricsSection<TSection extends OpsTalentMetricsSection>(
  section: TSection,
  enabled: boolean,
  filters: Filters
) {
  return useOpsMetricSnapshotQuery<OpsTalentMetricsResponseBySection[TSection]>({
    enabled,
    params: filterParams(filters, { section }),
    path: "/api/internal/ops/metrics",
    queryKey: [
      "ops-talent-metrics",
      section,
      filters.from,
      filters.to,
      filters.interval,
      ...filters.excludedEmails,
    ],
  });
}

export function useOpsTalentMetrics(enabled: boolean, filters: Filters) {
  const conversion = useOpsTalentMetricsSection("conversion", enabled, filters);
  const engagement = useOpsTalentMetricsSection("engagement", enabled, filters);
  const retention = useOpsTalentMetricsSection("retention", enabled, filters);

  return { conversion, engagement, retention };
}

export function useOpsTalentMetricsOverview(enabled: boolean, filters: Filters) {
  return useOpsMetricSnapshotQuery<OpsTalentMetricsOverviewResponse>({
    enabled,
    params: filterParams(filters),
    path: "/api/internal/ops/metrics/overview",
    queryKey: [
      "ops-talent-metrics",
      "overview",
      filters.from,
      filters.to,
      filters.interval,
      ...filters.excludedEmails,
    ],
  });
}
