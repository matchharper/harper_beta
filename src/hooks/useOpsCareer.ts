import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function useAddChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { key: string; label: string; promptHint?: string }) =>
      fetchWithInternalAuth("/api/internal/career/add-checklist-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-career-detail"] });
    },
  });
}

export function useUpdateInsights(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Record<string, string>) =>
      fetchWithInternalAuth("/api/internal/career/update-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, updates }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsCareerDetailKey(userId) });
    },
  });
}

export function useDeleteChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      fetchWithInternalAuth("/api/internal/career/delete-checklist-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-career-detail"] });
    },
  });
}

export function useRefreshInsights(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchWithInternalAuth("/api/internal/career/refresh-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsCareerDetailKey(userId) });
    },
  });
}
