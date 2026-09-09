import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fetchWithOpsUtmAccess } from "@/lib/internalApiClient";
import type {
  OpsUtmFilters,
  OpsUtmGranularity,
  OpsUtmPeriod,
  OpsUtmSourceDetail,
  OpsUtmSourcePage,
} from "@/lib/ops/utm";

const appendExcludedEmails = (
  params: URLSearchParams,
  excludedEmails: string[]
) => {
  for (const email of excludedEmails) {
    params.append("excludedEmail", email);
  }
};

export function useOpsUtmSources(args: {
  enabled: boolean;
  excludedEmails: string[];
  query: string;
}) {
  return useInfiniteQuery({
    enabled: args.enabled,
    initialPageParam: 0,
    getNextPageParam: (lastPage: OpsUtmSourcePage) =>
      lastPage.nextOffset ?? undefined,
    queryKey: ["ops-utm-sources", args.query, args.excludedEmails],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: "30",
        offset: String(pageParam),
      });
      if (args.query) params.set("query", args.query);
      appendExcludedEmails(params, args.excludedEmails);
      return fetchWithOpsUtmAccess<OpsUtmSourcePage>(
        `/api/internal/ops/utm?${params.toString()}`
      );
    },
    staleTime: 30_000,
  });
}

export function useOpsUtmSourceDetail(args: {
  enabled: boolean;
  excludedEmails: string[];
  filters: OpsUtmFilters;
  granularity: OpsUtmGranularity;
  period: OpsUtmPeriod;
  source: string | null;
}) {
  return useQuery({
    enabled: args.enabled && Boolean(args.source),
    queryKey: [
      "ops-utm-detail",
      args.source,
      args.period,
      args.granularity,
      args.filters,
      args.excludedEmails,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        granularity: args.granularity,
        period: args.period,
        source: args.source ?? "",
      });
      for (const [key, value] of Object.entries(args.filters)) {
        if (value) params.set(key, value);
      }
      appendExcludedEmails(params, args.excludedEmails);
      return fetchWithOpsUtmAccess<OpsUtmSourceDetail>(
        `/api/internal/ops/utm?${params.toString()}`
      );
    },
    staleTime: 30_000,
  });
}
