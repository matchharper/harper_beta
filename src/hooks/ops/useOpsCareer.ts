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
  CareerTalentInsightsResponse,
  CareerTalentMailHistoryResponse,
  CareerTalentMessagesResponse,
  CareerTalentOpsProfileMemo,
  CareerTalentProfileResponse,
  CareerTalentProfileIngestSource,
  CareerTalentProfileIngestResponse,
  CareerTalentRecommendationsResponse,
  CareerTalentRecommendationSourceFilter,
  OpsManualInternalRecommendationRolesResponse,
  OpsQueueManualInternalRecommendationResponse,
} from "@/lib/ops/careerServer";
import { queryKeys } from "@/lib/queryKeys";

type SendCareerTalentMailResponse = {
  ok: true;
  historyId: string;
  recipientEmail: string;
  recipientName: string | null;
};

type SaveCareerProfileMemoResponse = {
  ok: true;
  memo: CareerTalentOpsProfileMemo | null;
};

type DeleteCareerProfileMemoResponse = {
  ok: true;
  memoId: string;
};

type OpsCareerTalentListFilters = {
  createdFrom?: string;
  createdTo?: string;
  includeExpandedProfile?: boolean;
  onboardingDoneOnly?: boolean;
  submittedMaterialOnly?: boolean;
};

export const opsCareerListKey = ["ops-career-list"] as const;
export const opsCareerDetailKey = (userId?: string | null) =>
  ["ops-career-detail", userId] as const;
export const opsCareerInsightsKey = (userId?: string | null) =>
  ["ops-career-insights", userId] as const;
export const opsCareerMessagesKey = (userId?: string | null) =>
  ["ops-career-messages", userId] as const;
export const opsCareerProfileKey = (userId?: string | null) =>
  ["ops-career-profile", userId] as const;
export const opsCareerMailHistoryKey = (userId?: string | null) =>
  ["ops-career-mail-history", userId] as const;
export const opsCareerRecommendationsKey = (
  userId?: string | null,
  sourceType: CareerTalentRecommendationSourceFilter = "all"
) => ["ops-career-recommendations", userId, sourceType] as const;
export const opsManualInternalRecommendationRolesKey = (
  query: string,
  limit = 40,
  userId = "",
  includeInactive = false
) =>
  [
    "ops-manual-internal-recommendation-roles",
    query,
    limit,
    userId,
    includeInactive,
  ] as const;

export function useOpsCareerTalents(
  limit = 40,
  enabled = true,
  query = "",
  filters: OpsCareerTalentListFilters = {}
) {
  const normalizedQuery = query.trim();
  const normalizedCreatedFrom = filters.createdFrom?.trim() ?? "";
  const normalizedCreatedTo = filters.createdTo?.trim() ?? "";
  const includeExpandedProfile = Boolean(filters.includeExpandedProfile);
  const onboardingDoneOnly = Boolean(filters.onboardingDoneOnly);
  const submittedMaterialOnly = Boolean(filters.submittedMaterialOnly);
  return useInfiniteQuery({
    queryKey: [
      ...opsCareerListKey,
      limit,
      normalizedQuery,
      normalizedCreatedFrom,
      normalizedCreatedTo,
      includeExpandedProfile,
      onboardingDoneOnly,
      submittedMaterialOnly,
    ],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(pageParam),
      });
      if (normalizedQuery) {
        params.set("query", normalizedQuery);
      }
      if (normalizedCreatedFrom) {
        params.set("createdFrom", normalizedCreatedFrom);
      }
      if (normalizedCreatedTo) {
        params.set("createdTo", normalizedCreatedTo);
      }
      if (includeExpandedProfile) {
        params.set("includeExpandedProfile", "1");
      }
      if (onboardingDoneOnly) {
        params.set("onboardingDoneOnly", "1");
      }
      if (submittedMaterialOnly) {
        params.set("submittedMaterialOnly", "1");
      }
      return fetchWithInternalAuth<CareerTalentListResponse>(
        `/api/internal/career/list?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled,
    staleTime: 30_000,
  });
}

export function useOpsCareerDetail(userId?: string | null, enabled = true) {
  return useQuery({
    queryKey: opsCareerDetailKey(userId),
    queryFn: () => {
      const params = new URLSearchParams({ userId: userId ?? "" });
      return fetchWithInternalAuth<CareerTalentDetailResponse>(
        `/api/internal/career/detail?${params.toString()}`
      );
    },
    enabled: enabled && typeof userId === "string" && userId.length > 0,
    staleTime: 15_000,
  });
}

export function useOpsCareerInsights(userId?: string | null, enabled = true) {
  return useQuery({
    queryKey: opsCareerInsightsKey(userId),
    queryFn: () => {
      const params = new URLSearchParams({ userId: userId ?? "" });
      return fetchWithInternalAuth<CareerTalentInsightsResponse>(
        `/api/internal/career/insights?${params.toString()}`
      );
    },
    enabled: enabled && typeof userId === "string" && userId.length > 0,
    staleTime: 30_000,
  });
}

export function useOpsCareerMessages(userId?: string | null, enabled = true) {
  return useQuery({
    queryKey: opsCareerMessagesKey(userId),
    queryFn: () => {
      const params = new URLSearchParams({ userId: userId ?? "" });
      return fetchWithInternalAuth<CareerTalentMessagesResponse>(
        `/api/internal/career/messages?${params.toString()}`
      );
    },
    enabled: enabled && typeof userId === "string" && userId.length > 0,
    staleTime: 15_000,
  });
}

export function useOpsCareerProfile(userId?: string | null, enabled = true) {
  return useQuery({
    queryKey: opsCareerProfileKey(userId),
    queryFn: () => {
      const params = new URLSearchParams({ userId: userId ?? "" });
      return fetchWithInternalAuth<CareerTalentProfileResponse>(
        `/api/internal/career/profile?${params.toString()}`
      );
    },
    enabled: enabled && typeof userId === "string" && userId.length > 0,
    staleTime: 30_000,
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
  enabled = true,
  sourceType: CareerTalentRecommendationSourceFilter = "all"
) {
  return useInfiniteQuery({
    queryKey: [...opsCareerRecommendationsKey(userId, sourceType), limit],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(pageParam),
        userId: userId ?? "",
      });
      if (sourceType !== "all") {
        params.set("sourceType", sourceType);
      }
      return fetchWithInternalAuth<CareerTalentRecommendationsResponse>(
        `/api/internal/career/recommendations?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled: enabled && typeof userId === "string" && userId.length > 0,
    staleTime: 10_000,
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
      queryClient.invalidateQueries({ queryKey: opsCareerInsightsKey(userId) });
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
      queryClient.invalidateQueries({ queryKey: opsCareerInsightsKey(userId) });
    },
  });
}

const invalidateOpsCareerMemoQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string
) => {
  queryClient.invalidateQueries({ queryKey: opsCareerDetailKey(userId) });
  queryClient.invalidateQueries({ queryKey: opsCareerListKey });
  queryClient.invalidateQueries({ queryKey: queryKeys.opsMatching.all });
};

export function useCreateOpsCareerProfileMemo(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      fetchWithInternalAuth<SaveCareerProfileMemoResponse>(
        "/api/internal/career/profile-memo",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, userId }),
        }
      ),
    onSuccess: () => {
      invalidateOpsCareerMemoQueries(queryClient, userId);
    },
  });
}

export function useUpdateOpsCareerProfileMemo(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { content: string; memoId: string }) =>
      fetchWithInternalAuth<SaveCareerProfileMemoResponse>(
        "/api/internal/career/profile-memo",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...args, userId }),
        }
      ),
    onSuccess: () => {
      invalidateOpsCareerMemoQueries(queryClient, userId);
    },
  });
}

export function useDeleteOpsCareerProfileMemo(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memoId: string) =>
      fetchWithInternalAuth<DeleteCareerProfileMemoResponse>(
        "/api/internal/career/profile-memo",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memoId, userId }),
        }
      ),
    onSuccess: () => {
      invalidateOpsCareerMemoQueries(queryClient, userId);
    },
  });
}

export function useIngestCareerProfile(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      args: { source?: CareerTalentProfileIngestSource } | undefined
    ) =>
      fetchWithInternalAuth<CareerTalentProfileIngestResponse>(
        "/api/internal/career/ingest-profile",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: args?.source ?? "linkedin", userId }),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsCareerDetailKey(userId) });
      queryClient.invalidateQueries({ queryKey: opsCareerProfileKey(userId) });
      queryClient.invalidateQueries({ queryKey: opsCareerListKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.opsMatching.all });
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

export function useOpsManualInternalRecommendationRoles(
  query = "",
  limit = 40,
  enabled = true,
  userId = "",
  includeInactive = false
) {
  const normalizedQuery = query.trim();
  const normalizedUserId = userId.trim();
  return useQuery({
    queryKey: opsManualInternalRecommendationRolesKey(
      normalizedQuery,
      limit,
      normalizedUserId,
      includeInactive
    ),
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(limit),
      });
      if (normalizedQuery) {
        params.set("query", normalizedQuery);
      }
      if (normalizedUserId) {
        params.set("userId", normalizedUserId);
      }
      if (includeInactive) {
        params.set("includeInactive", "1");
      }
      return fetchWithInternalAuth<OpsManualInternalRecommendationRolesResponse>(
        `/api/internal/career/manual-internal-recommendation?${params.toString()}`
      );
    },
    enabled,
    staleTime: 15_000,
  });
}

export function useQueueOpsManualInternalRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      reason?: string | null;
      roleId: string;
      userId: string;
    }) =>
      fetchWithInternalAuth<OpsQueueManualInternalRecommendationResponse>(
        "/api/internal/career/manual-internal-recommendation",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["ops-career-recommendations", variables.userId],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.progress(variables.userId, null),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.progress(
          variables.userId,
          variables.roleId
        ),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.roleTags(variables.userId),
      });
    },
  });
}
