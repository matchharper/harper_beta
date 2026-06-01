import {
  type InfiniteData,
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
  CareerTalentOpsProfileMemo,
  CareerTalentProfileIngestSource,
  CareerTalentProfileIngestResponse,
  CareerTalentRecommendationsResponse,
  CareerTalentRecommendationSourceFilter,
  OpsInternalRecommendationAcceptedFilter,
  OpsInternalRecommendationHideResponse,
  OpsInternalRecommendationStageBulkUpdateResponse,
  OpsInternalRecommendationsResponse,
  OpsManualInternalRecommendationRolesResponse,
  OpsQueueManualInternalRecommendationResponse,
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

type SaveCareerProfileMemoResponse = {
  ok: true;
  memo: CareerTalentOpsProfileMemo | null;
};

type OpsCareerTalentListFilters = {
  createdFrom?: string;
  createdTo?: string;
  includeExpandedProfile?: boolean;
  onboardingDoneOnly?: boolean;
  submittedMaterialOnly?: boolean;
};

type OpsInternalRecommendationsInfiniteData =
  InfiniteData<OpsInternalRecommendationsResponse>;

const OPS_INTERNAL_RECOMMENDATIONS_ROOT_KEY = [
  "ops-internal-recommendations",
] as const;

const isHiddenOnlyInternalRecommendationsKey = (queryKey: readonly unknown[]) =>
  queryKey[0] === OPS_INTERNAL_RECOMMENDATIONS_ROOT_KEY[0] &&
  queryKey[5] === true;

const removeInternalRecommendationFromPages = (
  current: OpsInternalRecommendationsInfiniteData | undefined,
  recommendationId: string
) => {
  if (!current) return current;
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      recommendations: page.recommendations.filter(
        (item) => item.recommendationId !== recommendationId
      ),
    })),
  };
};

export const opsCareerListKey = ["ops-career-list"] as const;
export const opsCareerDetailKey = (userId?: string | null) =>
  ["ops-career-detail", userId] as const;
export const opsCareerMailHistoryKey = (userId?: string | null) =>
  ["ops-career-mail-history", userId] as const;
export const opsCareerRecommendationsKey = (
  userId?: string | null,
  sourceType: CareerTalentRecommendationSourceFilter = "all"
) => ["ops-career-recommendations", userId, sourceType] as const;
export const opsInternalRecommendationsKey = (
  acceptedFilter: OpsInternalRecommendationAcceptedFilter = "all",
  limit = 80,
  recommendedFrom = "",
  recommendedTo = "",
  hiddenOnly = false
) =>
  [
    "ops-internal-recommendations",
    acceptedFilter,
    limit,
    recommendedFrom,
    recommendedTo,
    hiddenOnly,
  ] as const;
export const opsManualInternalRecommendationRolesKey = (
  query: string,
  limit = 40,
  userId = ""
) =>
  ["ops-manual-internal-recommendation-roles", query, limit, userId] as const;

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
      queryClient.invalidateQueries({ queryKey: opsCareerDetailKey(userId) });
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

export function useSaveOpsCareerProfileMemo(userId: string) {
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
      queryClient.invalidateQueries({ queryKey: opsCareerDetailKey(userId) });
      queryClient.invalidateQueries({ queryKey: opsCareerListKey });
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
        queryKey: ["ops-career-recommendations", variables.userId],
      });
    },
  });
}

export function useOpsManualInternalRecommendationRoles(
  query = "",
  limit = 40,
  enabled = true,
  userId = ""
) {
  const normalizedQuery = query.trim();
  const normalizedUserId = userId.trim();
  return useQuery({
    queryKey: opsManualInternalRecommendationRolesKey(
      normalizedQuery,
      limit,
      normalizedUserId
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
    },
  });
}

export function useOpsInternalRecommendations(
  acceptedFilter: OpsInternalRecommendationAcceptedFilter = "all",
  limit = 80,
  enabled = true,
  filters: {
    hiddenOnly?: boolean;
    recommendedFrom?: string;
    recommendedTo?: string;
  } = {}
) {
  const hiddenOnly = Boolean(filters.hiddenOnly);
  const recommendedFrom = filters.recommendedFrom?.trim() ?? "";
  const recommendedTo = filters.recommendedTo?.trim() ?? "";
  return useInfiniteQuery({
    queryKey: opsInternalRecommendationsKey(
      acceptedFilter,
      limit,
      recommendedFrom,
      recommendedTo,
      hiddenOnly
    ),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        acceptedFilter,
        limit: String(limit),
        offset: String(pageParam),
      });
      if (recommendedFrom) {
        params.set("recommendedFrom", recommendedFrom);
      }
      if (recommendedTo) {
        params.set("recommendedTo", recommendedTo);
      }
      if (hiddenOnly) {
        params.set("hiddenOnly", "1");
      }
      return fetchWithInternalAuth<OpsInternalRecommendationsResponse>(
        `/api/internal/career/internal-recommendations?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled,
    staleTime: 10_000,
  });
}

export function useBulkUpdateOpsInternalRecommendationStages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      updates: Array<{
        processedStage: string | null;
        recommendationId: string;
      }>;
    }) =>
      fetchWithInternalAuth<OpsInternalRecommendationStageBulkUpdateResponse>(
        "/api/internal/career/internal-recommendations",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["ops-internal-recommendations"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["ops-career-recommendations"],
        }),
      ]);
    },
  });
}

export function useHideOpsInternalRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { recommendationId: string }) =>
      fetchWithInternalAuth<OpsInternalRecommendationHideResponse>(
        "/api/internal/career/internal-recommendations",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onMutate: async ({ recommendationId }) => {
      await queryClient.cancelQueries({
        queryKey: OPS_INTERNAL_RECOMMENDATIONS_ROOT_KEY,
      });

      const previousQueries =
        queryClient.getQueriesData<OpsInternalRecommendationsInfiniteData>({
          queryKey: OPS_INTERNAL_RECOMMENDATIONS_ROOT_KEY,
        });

      previousQueries.forEach(([queryKey]) => {
        if (isHiddenOnlyInternalRecommendationsKey(queryKey)) return;
        queryClient.setQueryData<OpsInternalRecommendationsInfiniteData>(
          queryKey,
          (current) =>
            removeInternalRecommendationFromPages(current, recommendationId)
        );
      });

      return { previousQueries };
    },
    onError: (_error, _variables, context) => {
      context?.previousQueries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: OPS_INTERNAL_RECOMMENDATIONS_ROOT_KEY,
        refetchType: "inactive",
      });
    },
  });
}
