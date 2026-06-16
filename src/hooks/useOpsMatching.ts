import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";
import type {
  OpsMatchingCompanyOption,
  OpsMatchingProgressDeleteResponse,
  OpsMatchingProgressResponse,
  OpsMatchingReviewBoardResponse,
  OpsMatchingReviewStageId,
  OpsMatchingReviewStageUpdateResponse,
  OpsMatchingRoleOption,
  OpsMatchingTalentListResponse,
  OpsMatchingTalentPoolListResponse,
  OpsMatchingTalentPoolTabId,
  OpsMatchingTalentRoleTagsResponse,
  OpsMatchingTalentTag,
} from "@/lib/opsMatching";

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
  limit?: number;
  query?: string;
  roleId?: string | null;
  tags?: string[];
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

export function useOpsMatchingTalents(filters: MatchingTalentFilters) {
  const roleId = filters.roleId?.trim() ?? "";
  const limit = filters.limit ?? 20;
  const query = filters.query?.trim() ?? "";
  const createdFrom = filters.createdFrom?.trim() ?? "";
  const createdTo = filters.createdTo?.trim() ?? "";
  const tags = filters.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [];

  return useInfiniteQuery({
    queryKey: queryKeys.opsMatching.talents({
      createdFrom,
      createdTo,
      limit,
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
