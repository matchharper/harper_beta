import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { isOrgQueryAccessError } from "@/lib/org/queryError";
import type {
  HiringBriefHistoryItem,
  HiringBriefHistoryRead,
} from "@/lib/org/hiringBriefHistory";

export const matchingHistoryKey = (workspaceId: string, roleId: string) =>
  ["org", "matching-criteria-history", workspaceId, roleId] as const;

export function isMatchingHistorySummaryPending(status: string) {
  return ["pending", "processing", "retry"].includes(status);
}

export function useOrgMatchingHistory(
  workspaceId: string,
  roleId: string,
  enabled: boolean
) {
  return useInfiniteQuery({
    queryKey: [...matchingHistoryKey(workspaceId, roleId), "list"],
    enabled,
    initialPageParam: 0,
    staleTime: 0,
    getNextPageParam: (page: HiringBriefHistoryRead) =>
      page.nextOffset ?? undefined,
    queryFn: ({ pageParam }) =>
      fetchWithInternalAuth<HiringBriefHistoryRead>(
        `/api/org/role/matching-history?${new URLSearchParams({ workspaceId, roleId, offset: String(pageParam), limit: "20" })}`
      ),
    refetchInterval: (query) =>
      enabled &&
      !isOrgQueryAccessError(query.state.error) &&
      query.state.data?.pages.some((page) =>
        page.items.some((item) =>
          isMatchingHistorySummaryPending(item.summaryStatus)
        )
      )
        ? 2_500
        : false,
  });
}

export function useOrgMatchingHistoryDetail(
  workspaceId: string,
  roleId: string,
  historyId: string | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: [...matchingHistoryKey(workspaceId, roleId), "detail", historyId],
    enabled: enabled && Boolean(historyId),
    queryFn: () =>
      fetchWithInternalAuth<HiringBriefHistoryItem | null>(
        `/api/org/role/matching-history?${new URLSearchParams({ workspaceId, roleId, historyId: historyId! })}`
      ),
    refetchInterval: (query) =>
      enabled &&
      !isOrgQueryAccessError(query.state.error) &&
      query.state.data &&
      isMatchingHistorySummaryPending(query.state.data.summaryStatus)
        ? 2_500
        : false,
  });
}
