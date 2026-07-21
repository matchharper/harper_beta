import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OrgBoardResponse,
  OrgBootstrapResponse,
  OrgFeedCreateResponse,
  OrgFeedMutationResponse,
  OrgRoleReviewStageCreateResponse,
  OrgRoleReviewStageDeleteResponse,
  OrgRoleReviewStageUpdateResponse,
  OrgResumeAccessResponse,
  OrgStageChangeOptions,
  OrgStageId,
  OrgTalentDetailResponse,
} from "@/lib/org/server";
import { queryKeys } from "@/lib/queryKeys";

type OrgBoardFilters = {
  enabled?: boolean;
  query?: string;
  recommendedDate?: string;
  recommendedFromDate?: string;
  recommendedToDate?: string;
  roleId?: string | null;
  workspaceId?: string | null;
};

export function useOrgBootstrap(args: {
  enabled?: boolean;
  orgId?: string | null;
}) {
  const orgId = args.orgId?.trim() ?? "";
  return useQuery({
    queryKey: queryKeys.org.bootstrap(orgId),
    queryFn: () => {
      const params = new URLSearchParams();
      if (orgId) params.set("orgId", orgId);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return fetchWithInternalAuth<OrgBootstrapResponse>(
        `/api/org/bootstrap${suffix}`
      );
    },
    enabled: args.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useOrgBoard(filters: OrgBoardFilters) {
  const workspaceId = filters.workspaceId?.trim() ?? "";
  const roleId = filters.roleId?.trim() ?? "";
  const recommendedDate = filters.recommendedDate?.trim() ?? "";
  const recommendedFromDate = filters.recommendedFromDate?.trim() ?? "";
  const recommendedToDate = filters.recommendedToDate?.trim() ?? "";
  const query = filters.query?.trim() ?? "";

  return useQuery({
    queryKey: queryKeys.org.board({
      query,
      recommendedDate,
      recommendedFromDate,
      recommendedToDate,
      roleId,
      workspaceId,
    }),
    queryFn: () => {
      const params = new URLSearchParams({ workspaceId });
      if (roleId) params.set("roleId", roleId);
      if (recommendedDate) params.set("recommendedDate", recommendedDate);
      if (recommendedFromDate)
        params.set("recommendedFromDate", recommendedFromDate);
      if (recommendedToDate) params.set("recommendedToDate", recommendedToDate);
      if (query) params.set("query", query);
      return fetchWithInternalAuth<OrgBoardResponse>(
        `/api/org/board?${params.toString()}`
      );
    },
    enabled: (filters.enabled ?? true) && Boolean(workspaceId),
    staleTime: 20_000,
  });
}

export function useOrgTalentDetail(args: {
  enabled?: boolean;
  recommendationId?: string | null;
  roleId?: string | null;
  talentId?: string | null;
  workspaceId?: string | null;
}) {
  const workspaceId = args.workspaceId?.trim() ?? "";
  const talentId = args.talentId?.trim() ?? "";
  const roleId = args.roleId?.trim() ?? "";
  const recommendationId = args.recommendationId?.trim() ?? "";

  return useQuery({
    queryKey: queryKeys.org.detail({
      recommendationId,
      roleId,
      talentId,
      workspaceId,
    }),
    queryFn: () => {
      const params = new URLSearchParams({ talentId, workspaceId });
      if (roleId) params.set("roleId", roleId);
      if (recommendationId) params.set("recommendationId", recommendationId);
      return fetchWithInternalAuth<OrgTalentDetailResponse>(
        `/api/org/detail?${params.toString()}`
      );
    },
    enabled:
      (args.enabled ?? true) && Boolean(workspaceId) && Boolean(talentId),
    staleTime: 20_000,
  });
}

export function useSetOrgCandidateStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      acceptReason?: OrgStageChangeOptions["acceptReason"];
      introEmails?: OrgStageChangeOptions["introEmails"];
      recommendationId: string;
      roleId: string;
      stage: OrgStageId;
      stopNote?: OrgStageChangeOptions["stopNote"];
      stopReason?: OrgStageChangeOptions["stopReason"];
      talentId: string;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<{ ok: true; roleId: string; stage: OrgStageId }>(
        "/api/org/stage",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    },
  });
}

export function useCreateOrgFeedItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      recommendationId?: string | null;
      roleId: string;
      talentId: string;
      text: string;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgFeedCreateResponse>("/api/org/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    },
  });
}

export function useUpdateOrgFeedItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      progressId: string;
      text: string;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgFeedMutationResponse>("/api/org/feed", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    },
  });
}

export function useDeleteOrgFeedItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { progressId: string; workspaceId: string }) =>
      fetchWithInternalAuth<OrgFeedMutationResponse>("/api/org/feed", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    },
  });
}

export function useCreateOrgReviewStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      label: string;
      roleId: string;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgRoleReviewStageCreateResponse>(
        "/api/org/stages",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    },
  });
}

export function useUpdateOrgReviewStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      label: string;
      roleId: string;
      stageId: string;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgRoleReviewStageUpdateResponse>(
        "/api/org/stages",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    },
  });
}

export function useDeleteOrgReviewStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      roleId: string;
      stageId: string;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgRoleReviewStageDeleteResponse>(
        "/api/org/stages",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    },
  });
}

export function useOpenOrgResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      kind?: "storage" | "link" | null;
      link?: string | null;
      talentId: string;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgResumeAccessResponse>("/api/org/resume-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    },
  });
}

export function useUpdateOrgWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      companyDescription?: string | null;
      pitch?: string | null;
      request?: string | null;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<{ ok: true }>("/api/org/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    },
  });
}

export function useUpdateOrgRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      description?: string | null;
      employmentTypes?: string[] | null;
      externalJdUrl?: string | null;
      isExpired?: boolean | null;
      locationText?: string | null;
      name?: string | null;
      request?: string | null;
      roleId: string;
      status?: string | null;
      workMode?: string | null;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<{ ok: true }>("/api/org/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    },
  });
}
