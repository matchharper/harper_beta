import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  CareerTalentListResponse,
  CareerTalentDetailResponse,
} from "@/lib/opsCareerServer";

export const opsCareerListKey = ["ops-career-list"] as const;
export const opsCareerDetailKey = (userId?: string | null) =>
  ["ops-career-detail", userId] as const;

export function useOpsCareerTalents(limit = 40) {
  return useInfiniteQuery({
    queryKey: [...opsCareerListKey, limit],
    queryFn: ({ pageParam }) =>
      fetchWithInternalAuth<CareerTalentListResponse>(
        `/api/internal/career/list?limit=${limit}&offset=${pageParam}`
      ),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    staleTime: 30_000,
  });
}

export function useOpsCareerDetail(userId?: string | null) {
  return useQuery({
    queryKey: opsCareerDetailKey(userId),
    queryFn: () =>
      fetchWithInternalAuth<CareerTalentDetailResponse>(
        `/api/internal/career/detail?userId=${userId}`
      ),
    enabled: typeof userId === "string" && userId.length > 0,
    staleTime: 15_000,
  });
}
