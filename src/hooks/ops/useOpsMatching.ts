import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OpsQueueManualInternalRecommendationResponse } from "@/lib/ops/careerServer";
import { queryKeys } from "@/lib/queryKeys";
import type {
  OpsMatchingCompanyOption,
  OpsMatchingAllRolesResponse,
  OpsMatchingAllRoleUpdateResponse,
  OpsMatchingFitListResponse,
  OpsMatchingFitHumanLabelUpdateResponse,
  OpsMatchingFitLabel,
  OpsMatchingHumanLabelFilter,
  OpsMatchingProgressDeleteResponse,
  OpsMatchingProgressResponse,
  OpsMatchingReviewBoardResponse,
  OpsMatchingReviewStageId,
  OpsMatchingReviewStageUpdateResponse,
  OpsMatchingRoleReviewStageCreateResponse,
  OpsMatchingRoleReviewStageDeleteResponse,
  OpsMatchingRoleReviewStageUpdateResponse,
  OpsMatchingRoleOption,
  OpsMatchingTagOptionsResponse,
  OpsMatchingTalentHistoryResponse,
  OpsMatchingTalentHistorySection,
  OpsMatchingTalentFitsResponse,
  OpsMatchingTalentListResponse,
  OpsMatchingTalentPoolListResponse,
  OpsMatchingTalentPoolTabId,
  OpsMatchingTalentRoleTagsResponse,
  OpsMatchingTalentTag,
} from "@/lib/ops/matching";
import type { OpportunityStatus } from "@/lib/ops/opportunity";

type OpsMatchingCompaniesResponse = {
  items: OpsMatchingCompanyOption[];
};

type OpsMatchingRolesResponse = {
  items: OpsMatchingRoleOption[];
};

type OpsMatchingTagsResponse = {
  tags: OpsMatchingTalentTag[];
};

type MatchingTalentFilters = {
  createdFrom?: string;
  createdTo?: string;
  enabled?: boolean;
  excludeRecommended?: boolean;
  humanLabels?: OpsMatchingHumanLabelFilter[];
  limit?: number;
  llmLabels?: OpsMatchingFitLabel[];
  query?: string;
  roleId?: string | null;
  tags?: string[];
};

type MatchingTalentHistoryFilters = {
  enabled?: boolean;
  sections?: OpsMatchingTalentHistorySection[];
  talentIds?: string[];
};

type MatchingFitFilters = {
  enabled?: boolean;
  humanLabels?: OpsMatchingHumanLabelFilter[];
  limit?: number;
  llmLabels?: OpsMatchingFitLabel[];
  query?: string;
};

type MatchingTalentPoolFilters = Omit<MatchingTalentFilters, "roleId"> & {
  tab?: OpsMatchingTalentPoolTabId;
};

export function useOpsMatchingCompanies(args: {
  enabled?: boolean;
  query?: string;
}) {
  const query = args.query?.trim() ?? "";
  return useQuery({
    queryKey: queryKeys.opsMatching.companies(query),
    queryFn: () => {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      return fetchWithInternalAuth<OpsMatchingCompaniesResponse>(
        `/api/internal/matching/companies?${params.toString()}`
      );
    },
    enabled: args.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useOpsMatchingRoles(args: {
  companyWorkspaceId?: string | null;
  enabled?: boolean;
}) {
  const companyWorkspaceId = args.companyWorkspaceId?.trim() ?? "";
  return useQuery({
    queryKey: queryKeys.opsMatching.roles(companyWorkspaceId),
    queryFn: () => {
      const params = new URLSearchParams({ companyWorkspaceId });
      return fetchWithInternalAuth<OpsMatchingRolesResponse>(
        `/api/internal/matching/roles?${params.toString()}`
      );
    },
    enabled: (args.enabled ?? true) && Boolean(companyWorkspaceId),
    staleTime: 60_000,
  });
}

export function useOpsMatchingAllRoles(args: {
  enabled?: boolean;
  limit?: number;
  query?: string;
  selfServeOnly?: boolean;
}) {
  const limit = args.limit ?? 20;
  const query = args.query?.trim() ?? "";
  const selfServeOnly = Boolean(args.selfServeOnly);

  return useInfiniteQuery({
    queryKey: queryKeys.opsMatching.allRoles({
      limit,
      query,
      selfServeOnly,
    }),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(pageParam),
      });
      if (query) params.set("query", query);
      if (selfServeOnly) params.set("selfServeOnly", "true");
      return fetchWithInternalAuth<OpsMatchingAllRolesResponse>(
        `/api/internal/matching/all-roles?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled: args.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useUpdateOpsMatchingAllRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      isAuto?: boolean;
      roleId: string;
      status?: OpportunityStatus;
    }) =>
      fetchWithInternalAuth<OpsMatchingAllRoleUpdateResponse>(
        "/api/internal/matching/all-roles",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.opsMatching.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.opsOpportunity.all,
        }),
      ]);
    },
  });
}

export function useOpsMatchingFits(filters: MatchingFitFilters) {
  const limit = filters.limit ?? 20;
  const query = filters.query?.trim() ?? "";
  const llmLabels =
    filters.llmLabels?.map((label) => label.trim()).filter(Boolean) ?? [];
  const humanLabels =
    filters.humanLabels?.map((label) => label.trim()).filter(Boolean) ?? [];

  return useInfiniteQuery({
    queryKey: queryKeys.opsMatching.fits({
      humanLabels,
      limit,
      llmLabels,
      query,
    }),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(pageParam),
      });
      if (query) params.set("query", query);
      if (llmLabels.length > 0) params.set("llmLabels", llmLabels.join(","));
      if (humanLabels.length > 0) {
        params.set("humanLabels", humanLabels.join(","));
      }
      return fetchWithInternalAuth<OpsMatchingFitListResponse>(
        `/api/internal/matching/fits?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled: filters.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useUpdateOpsMatchingFitHumanLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      fitId: string;
      humanLabel: OpsMatchingFitLabel | null;
      humanReason?: string | null;
    }) =>
      fetchWithInternalAuth<OpsMatchingFitHumanLabelUpdateResponse>(
        "/api/internal/matching/fits/human-label",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opsMatching.all });
    },
  });
}

export function useOpsMatchingTalents(filters: MatchingTalentFilters) {
  const roleId = filters.roleId?.trim() ?? "";
  const limit = filters.limit ?? 20;
  const query = filters.query?.trim() ?? "";
  const createdFrom = filters.createdFrom?.trim() ?? "";
  const createdTo = filters.createdTo?.trim() ?? "";
  const excludeRecommended = Boolean(filters.excludeRecommended);
  const llmLabels =
    filters.llmLabels?.map((label) => label.trim()).filter(Boolean) ?? [];
  const humanLabels =
    filters.humanLabels?.map((label) => label.trim()).filter(Boolean) ?? [];
  const tags = filters.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [];

  return useInfiniteQuery({
    queryKey: queryKeys.opsMatching.talents({
      createdFrom,
      createdTo,
      excludeRecommended,
      humanLabels,
      limit,
      llmLabels,
      query,
      roleId,
      tags,
    }),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(pageParam),
        roleId,
      });
      if (query) params.set("query", query);
      if (createdFrom) params.set("createdFrom", createdFrom);
      if (createdTo) params.set("createdTo", createdTo);
      if (excludeRecommended) params.set("excludeRecommended", "1");
      if (llmLabels.length > 0) params.set("llmLabels", llmLabels.join(","));
      if (humanLabels.length > 0) {
        params.set("humanLabels", humanLabels.join(","));
      }
      if (tags.length > 0) params.set("tags", tags.join(","));
      return fetchWithInternalAuth<OpsMatchingTalentListResponse>(
        `/api/internal/matching/talents?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled: (filters.enabled ?? true) && Boolean(roleId),
    staleTime: 30_000,
  });
}

export function useOpsMatchingTalentHistory(
  filters: MatchingTalentHistoryFilters
) {
  const talentIds = Array.from(
    new Set(
      filters.talentIds?.map((talentId) => talentId.trim()).filter(Boolean)
    )
  );
  const sections = Array.from(
    new Set(filters.sections?.map((section) => section.trim()).filter(Boolean))
  );

  return useQuery({
    queryKey: queryKeys.opsMatching.talentHistory({
      sections,
      talentIds,
    }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (talentIds.length > 0) params.set("talentIds", talentIds.join(","));
      if (sections.length > 0) params.set("sections", sections.join(","));
      return fetchWithInternalAuth<OpsMatchingTalentHistoryResponse>(
        `/api/internal/matching/talent-history?${params.toString()}`
      );
    },
    enabled:
      (filters.enabled ?? true) && talentIds.length > 0 && sections.length > 0,
    staleTime: 30_000,
  });
}

export function useOpsMatchingTalentFits(
  talentId?: string | null,
  enabled = true
) {
  const normalizedTalentId = talentId?.trim() ?? "";

  return useQuery({
    queryKey: queryKeys.opsMatching.talentFits(normalizedTalentId),
    queryFn: () => {
      const params = new URLSearchParams({ talentId: normalizedTalentId });
      return fetchWithInternalAuth<OpsMatchingTalentFitsResponse>(
        `/api/internal/matching/talent-fits?${params.toString()}`
      );
    },
    enabled: enabled && normalizedTalentId.length > 0,
    staleTime: 30_000,
  });
}

export function useOpsMatchingTalentPool(filters: MatchingTalentPoolFilters) {
  const limit = filters.limit ?? 20;
  const query = filters.query?.trim() ?? "";
  const createdFrom = filters.createdFrom?.trim() ?? "";
  const createdTo = filters.createdTo?.trim() ?? "";
  const tab = filters.tab ?? "tailored";
  const tags = filters.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [];

  return useInfiniteQuery({
    queryKey: queryKeys.opsMatching.talentPool({
      createdFrom,
      createdTo,
      limit,
      query,
      tab,
      tags,
    }),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(pageParam),
        tab,
      });
      if (query) params.set("query", query);
      if (createdFrom) params.set("createdFrom", createdFrom);
      if (createdTo) params.set("createdTo", createdTo);
      if (tags.length > 0) params.set("tags", tags.join(","));
      return fetchWithInternalAuth<OpsMatchingTalentPoolListResponse>(
        `/api/internal/matching/talent-pool?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled: filters.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useOpsMatchingReviewBoard(args: {
  enabled?: boolean;
  recommendedFrom?: string;
  recommendedTo?: string;
  roleId?: string | null;
  tags?: string[];
}) {
  const roleId = args.roleId?.trim() ?? "";
  const recommendedFrom = args.recommendedFrom?.trim() ?? "";
  const recommendedTo = args.recommendedTo?.trim() ?? "";
  const tags = args.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [];
  return useQuery({
    queryKey: queryKeys.opsMatching.review(roleId, {
      recommendedFrom,
      recommendedTo,
      tags,
    }),
    queryFn: () => {
      const params = new URLSearchParams({ roleId });
      if (recommendedFrom) params.set("recommendedFrom", recommendedFrom);
      if (recommendedTo) params.set("recommendedTo", recommendedTo);
      if (tags.length > 0) params.set("tags", tags.join(","));
      return fetchWithInternalAuth<OpsMatchingReviewBoardResponse>(
        `/api/internal/matching/review?${params.toString()}`
      );
    },
    enabled: (args.enabled ?? true) && Boolean(roleId),
    staleTime: 15_000,
  });
}

export function useSetOpsMatchingReviewStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      roleId: string;
      stage: Exclude<OpsMatchingReviewStageId, "recommended">;
      talentId: string;
    }) =>
      fetchWithInternalAuth<OpsMatchingReviewStageUpdateResponse>(
        "/api/internal/matching/review",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.reviewAll(variables.roleId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.opsMatching.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.roleTags(variables.talentId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.progress(variables.talentId, null),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.progress(
          variables.talentId,
          variables.roleId
        ),
      });
    },
  });
}

export function useCreateOpsMatchingReviewStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { label: string; roleId: string }) =>
      fetchWithInternalAuth<OpsMatchingRoleReviewStageCreateResponse>(
        "/api/internal/matching/review/stages",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.reviewAll(variables.roleId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.opsMatching.all });
    },
  });
}

export function useUpdateOpsMatchingReviewStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { label: string; roleId: string; stageId: string }) =>
      fetchWithInternalAuth<OpsMatchingRoleReviewStageUpdateResponse>(
        "/api/internal/matching/review/stages",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.reviewAll(variables.roleId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.opsMatching.all });
    },
  });
}

export function useDeleteOpsMatchingReviewStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { roleId: string; stageId: string }) =>
      fetchWithInternalAuth<OpsMatchingRoleReviewStageDeleteResponse>(
        "/api/internal/matching/review/stages",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.reviewAll(variables.roleId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.opsMatching.all });
    },
  });
}

export function useQueueOpsMatchingManualInternalRecommendation() {
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
      queryClient.invalidateQueries({ queryKey: queryKeys.opsMatching.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.reviewAll(variables.roleId),
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
      queryClient.invalidateQueries({
        queryKey: ["ops-career-recommendations", variables.userId],
      });
    },
  });
}

export function useOpsMatchingTalentRoleTags(args: {
  enabled?: boolean;
  talentId?: string | null;
}) {
  const talentId = args.talentId?.trim() ?? "";
  return useQuery({
    queryKey: queryKeys.opsMatching.roleTags(talentId),
    queryFn: () => {
      const params = new URLSearchParams({ talentId });
      return fetchWithInternalAuth<OpsMatchingTalentRoleTagsResponse>(
        `/api/internal/matching/tags?${params.toString()}`
      );
    },
    enabled: (args.enabled ?? true) && Boolean(talentId),
    staleTime: 15_000,
  });
}

export function useOpsMatchingTagOptions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.opsMatching.tagOptions,
    queryFn: () =>
      fetchWithInternalAuth<OpsMatchingTagOptionsResponse>(
        "/api/internal/matching/tag-options"
      ),
    enabled,
    staleTime: 30_000,
  });
}

export function useAddOpsMatchingTalentTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      roleId?: string | null;
      tag: string;
      talentId: string;
    }) =>
      fetchWithInternalAuth<OpsMatchingTagsResponse>(
        "/api/internal/matching/tags",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opsMatching.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.tagOptions,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.roleTags(variables.talentId),
      });
      if (variables.roleId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.opsMatching.reviewAll(variables.roleId),
        });
      }
    },
  });
}

export function useDeleteOpsMatchingTalentTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      roleId?: string | null;
      tagId: string;
      talentId: string;
    }) =>
      fetchWithInternalAuth<OpsMatchingTagsResponse>(
        "/api/internal/matching/tags",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opsMatching.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.tagOptions,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.roleTags(variables.talentId),
      });
      if (variables.roleId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.opsMatching.reviewAll(variables.roleId),
        });
      }
    },
  });
}

export function useOpsMatchingProgress(args: {
  enabled?: boolean;
  roleId?: string | null;
  talentId?: string | null;
}) {
  const talentId = args.talentId?.trim() ?? "";
  const roleId = args.roleId?.trim() ?? "";
  return useQuery({
    queryKey: queryKeys.opsMatching.progress(talentId, roleId || null),
    queryFn: () => {
      const params = new URLSearchParams({ talentId });
      if (roleId) params.set("roleId", roleId);
      return fetchWithInternalAuth<OpsMatchingProgressResponse>(
        `/api/internal/matching/progress?${params.toString()}`
      );
    },
    enabled: (args.enabled ?? true) && Boolean(talentId),
    staleTime: 15_000,
  });
}

export function useCreateOpsMatchingProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { roleId: string; talentId: string; text: string }) =>
      fetchWithInternalAuth<OpsMatchingProgressResponse>(
        "/api/internal/matching/progress",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.progress(variables.talentId, null),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.progress(
          variables.talentId,
          variables.roleId
        ),
      });
    },
  });
}

export function useDeleteOpsMatchingProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      progressId: string;
      roleId?: string | null;
      talentId: string;
    }) =>
      fetchWithInternalAuth<OpsMatchingProgressDeleteResponse>(
        "/api/internal/matching/progress",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.progress(variables.talentId, null),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.opsMatching.progress(
          variables.talentId,
          variables.roleId ?? result.roleId
        ),
      });
    },
  });
}
