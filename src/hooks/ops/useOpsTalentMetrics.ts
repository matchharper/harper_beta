import { useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsTalentMetricInterval,
  OpsTalentMetricsResponseBySection,
  OpsTalentMetricsSection,
} from "@/lib/ops/talentMetrics";

type Filters = {
  excludedEmails: string[];
  from: string;
  interval: OpsTalentMetricInterval;
  to: string;
};

function useOpsTalentMetricsSection<TSection extends OpsTalentMetricsSection>(
  section: TSection,
  enabled: boolean,
  filters: Filters
) {
  return useQuery({
    queryKey: [
      "ops-talent-metrics",
      section,
      filters.from,
      filters.to,
      filters.interval,
      ...filters.excludedEmails,
    ],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        from: filters.from,
        interval: filters.interval,
        section,
        to: filters.to,
      });
      for (const value of filters.excludedEmails) {
        params.append("excludedEmail", value);
      }
      return fetchWithInternalAuth<OpsTalentMetricsResponseBySection[TSection]>(
        `/api/internal/ops/metrics?${params.toString()}`,
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

export function useOpsTalentMetrics(enabled: boolean, filters: Filters) {
  const conversion = useOpsTalentMetricsSection("conversion", enabled, filters);
  const engagement = useOpsTalentMetricsSection("engagement", enabled, filters);
  const retention = useOpsTalentMetricsSection("retention", enabled, filters);

  return { conversion, engagement, retention };
}
