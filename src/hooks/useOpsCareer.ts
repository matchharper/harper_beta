import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  CareerTalentListResponse,
  CareerTalentDetailResponse,
  CareerTalentMailHistoryResponse,
  CareerTalentProfileIngestResponse,
  CareerTalentRecommendationsResponse,
} from "@/lib/opsCareerServer";

type SendCareerTalentMailResponse = {
  ok: true;
  historyId: string;
  recipientEmail: string;
  recipientName: string | null;
};

type UpdateCareerRecommendationStageResponse = {
  ok: true;
  recommendationId: string;
  processedStage: string | null;
};

export const opsCareerListKey = ["ops-career-list"] as const;
export const opsCareerDetailKey = (userId?: string | null) =>
  ["ops-career-detail", userId] as const;
export const opsCareerMailHistoryKey = (userId?: string | null) =>
  ["ops-career-mail-history", userId] as const;
export const opsCareerRecommendationsKey = (userId?: string | null) =>
  ["ops-career-recommendations", userId] as const;

export function useOpsCareerTalents(limit = 40, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...opsCareerListKey, limit],
    queryFn: ({ pageParam }) =>
      fetchWithInternalAuth<CareerTalentListResponse>(
        `/api/internal/career/list?limit=${limit}&offset=${pageParam}`
      ),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled,
    staleTime: 30_000,
  });
}

export function useOpsCareerDetail(userId?: string | null, enabled = true) {
  return useQuery({
    queryKey: opsCareerDetailKey(userId),
    queryFn: () =>
      fetchWithInternalAuth<CareerTalentDetailResponse>(
        `/api/internal/career/detail?userId=${userId}`
      ),
    enabled: enabled && typeof userId === "string" && userId.length > 0,
    staleTime: 15_000,
  });
}

export function useOpsCareerMailHistory(
  userId?: string | null,
  limit = 10,
  enabled = true
) {
  return useInfiniteQuery({
    queryKey: [...opsCareerMailHistoryKey(userId), limit],
    queryFn: ({ pageParam }) =>
      fetchWithInternalAuth<CareerTalentMailHistoryResponse>(
        `/api/internal/career/mail?userId=${encodeURIComponent(
          userId ?? ""
        )}&limit=${limit}&offset=${pageParam}`
      ),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled: enabled && typeof userId === "string" && userId.length > 0,
    staleTime: 10_000,
  });
}

export function useOpsCareerRecommendations(
  userId?: string | null,
  limit = 20,
  enabled = true
) {
  return useInfiniteQuery({
    queryKey: [...opsCareerRecommendationsKey(userId), limit],
    queryFn: ({ pageParam }) =>
      fetchWithInternalAuth<CareerTalentRecommendationsResponse>(
        `/api/internal/career/recommendations?userId=${encodeURIComponent(
          userId ?? ""
        )}&limit=${limit}&offset=${pageParam}`
      ),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled: enabled && typeof userId === "string" && userId.length > 0,
    staleTime: 10_000,
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

export function useIngestCareerProfile(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchWithInternalAuth<CareerTalentProfileIngestResponse>(
        "/api/internal/career/ingest-profile",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsCareerDetailKey(userId) });
      queryClient.invalidateQueries({ queryKey: opsCareerListKey });
    },
  });
}

export function useSendCareerTalentMail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      content: string;
      fromEmail: string;
      subject: string;
      userId: string;
    }) =>
      fetchWithInternalAuth<SendCareerTalentMailResponse>(
        "/api/internal/career/mail",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: opsCareerMailHistoryKey(variables.userId),
      });
    },
  });
}

export function useUpdateOpsCareerRecommendationStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      processedStage: string | null;
      recommendationId: string;
      userId: string;
    }) =>
      fetchWithInternalAuth<UpdateCareerRecommendationStageResponse>(
        "/api/internal/career/recommendations",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            processedStage: args.processedStage,
            recommendationId: args.recommendationId,
          }),
        }
      ),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: opsCareerRecommendationsKey(variables.userId),
      });
    },
  });
}
