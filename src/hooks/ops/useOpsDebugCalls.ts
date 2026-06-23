import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsDebugCallsResponse,
  OpsDebugCallStatus,
} from "@/lib/ops/debugCallServer";

export type OpsDebugCallFilters = {
  kind?: string;
  query?: string;
  startedFrom?: string;
  startedTo?: string;
  status?: OpsDebugCallStatus;
};

export type OpsDebugCallsInfiniteData = InfiniteData<OpsDebugCallsResponse>;

export const opsDebugCallsKey = (limit: number, filters: OpsDebugCallFilters) =>
  [
    "ops-debug-calls",
    limit,
    filters.kind ?? "",
    filters.query ?? "",
    filters.startedFrom ?? "",
    filters.startedTo ?? "",
    filters.status ?? "all",
  ] as const;

export function useOpsDebugCalls(
  limit = 40,
  enabled = true,
  filters: OpsDebugCallFilters = {}
) {
  const normalizedFilters = {
    kind: filters.kind?.trim() ?? "",
    query: filters.query?.trim() ?? "",
    startedFrom: filters.startedFrom?.trim() ?? "",
    startedTo: filters.startedTo?.trim() ?? "",
    status: filters.status ?? "all",
  };

  return useInfiniteQuery({
    queryKey: opsDebugCallsKey(limit, normalizedFilters),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(pageParam),
        status: normalizedFilters.status,
      });
      if (normalizedFilters.kind) {
        params.set("kind", normalizedFilters.kind);
      }
      if (normalizedFilters.query) {
        params.set("query", normalizedFilters.query);
      }
      if (normalizedFilters.startedFrom) {
        params.set("startedFrom", normalizedFilters.startedFrom);
      }
      if (normalizedFilters.startedTo) {
        params.set("startedTo", normalizedFilters.startedTo);
      }

      return fetchWithInternalAuth<OpsDebugCallsResponse>(
        `/api/internal/debug/calls?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled,
    staleTime: 10_000,
  });
}
