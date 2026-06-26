import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsDebugOpportunityRunOutcome,
  OpsDebugOpportunityRunsResponse,
  OpsDebugOpportunityRunStatus,
} from "@/lib/ops/debugOpportunityRunServer";

export type OpsDebugOpportunityRunFilters = {
  createdFrom?: string;
  createdTo?: string;
  outcome?: OpsDebugOpportunityRunOutcome;
  query?: string;
  status?: OpsDebugOpportunityRunStatus;
};

export type OpsDebugOpportunityRunsInfiniteData =
  InfiniteData<OpsDebugOpportunityRunsResponse>;

export const opsDebugOpportunityRunsKey = (
  limit: number,
  filters: OpsDebugOpportunityRunFilters
) =>
  [
    "ops-debug-opportunity-runs",
    limit,
    filters.createdFrom ?? "",
    filters.createdTo ?? "",
    filters.outcome ?? "all",
    filters.query ?? "",
    filters.status ?? "all",
  ] as const;

export function useOpsDebugOpportunityRuns(
  limit = 20,
  enabled = true,
  filters: OpsDebugOpportunityRunFilters = {}
) {
  const normalizedFilters = {
    createdFrom: filters.createdFrom?.trim() ?? "",
    createdTo: filters.createdTo?.trim() ?? "",
    outcome: filters.outcome ?? "all",
    query: filters.query?.trim() ?? "",
    status: filters.status ?? "all",
  };

  return useInfiniteQuery({
    queryKey: opsDebugOpportunityRunsKey(limit, normalizedFilters),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(limit),
        outcome: normalizedFilters.outcome,
        offset: String(pageParam),
        status: normalizedFilters.status,
      });
      if (normalizedFilters.createdFrom) {
        params.set("createdFrom", normalizedFilters.createdFrom);
      }
      if (normalizedFilters.createdTo) {
        params.set("createdTo", normalizedFilters.createdTo);
      }
      if (normalizedFilters.query) {
        params.set("query", normalizedFilters.query);
      }

      return fetchWithInternalAuth<OpsDebugOpportunityRunsResponse>(
        `/api/internal/debug/opportunity-runs?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled,
    staleTime: 10_000,
  });
}
