import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OrgBoardResponse,
  OrgBootstrapResponse,
  OrgFeedCreateResponse,
  OrgFeedMutationResponse,
  OrgInvitationMutationResponse,
  OrgInvitePreviewResponse,
  OrgInviteSendResponse,
  OrgMembershipRoleUpdateResponse,
  OrgRoleReviewStageCreateResponse,
  OrgRoleReviewStageDeleteResponse,
  OrgRoleReviewStageUpdateResponse,
  OrgResumeAccessResponse,
  OrgStageChangeOptions,
  OrgStageId,
  OrgTalentDetailResponse,
  OrgWorkspaceLeaveResponse,
} from "@/lib/org/server";
import type { OrgMembershipRole } from "@/lib/org/permissions";
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

export function orgBootstrapQueryOptions(args: {
  enabled?: boolean;
  orgId?: string | null;
}) {
  const orgId = args.orgId?.trim() ?? "";
  return queryOptions({
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

export function useOrgBootstrap(args: {
  enabled?: boolean;
  orgId?: string | null;
}) {
  return useQuery(orgBootstrapQueryOptions(args));
}

export function orgInvitePreviewQueryOptions(args: {
  enabled?: boolean;
  orgId?: string | null;
}) {
  const orgId = args.orgId?.trim() ?? "";
  return queryOptions({
    queryKey: queryKeys.org.invitePreview(orgId),
    queryFn: async () => {
      const response = await fetch(
        `/api/org/invite-preview?orgId=${encodeURIComponent(orgId)}`
      );
      const payload = (await response.json().catch(() => ({}))) as Partial<
        OrgInvitePreviewResponse & { error: string }
      >;
      if (!response.ok || !payload.workspace) {
        throw new Error(payload.error ?? "초대 정보를 불러오지 못했습니다.");
      }
      return payload as OrgInvitePreviewResponse;
    },
    enabled: (args.enabled ?? true) && Boolean(orgId),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useOrgInvitePreview(args: {
  enabled?: boolean;
  orgId?: string | null;
}) {
  return useQuery(orgInvitePreviewQueryOptions(args));
}

export function useSendOrgInvitations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      emails: string[];
      role: OrgMembershipRole;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgInviteSendResponse>("/api/org/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.bootstrapAll,
      }),
  });
}

export function useCancelOrgInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { invitationId: string; workspaceId: string }) =>
      fetchWithInternalAuth<OrgInvitationMutationResponse>(
        "/api/org/invitations",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.bootstrapAll,
      }),
  });
}

export function useUpdateOrgMembershipRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      role: OrgMembershipRole;
      userId: string;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgMembershipRoleUpdateResponse>(
        "/api/org/membership",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.bootstrapAll,
      }),
  });
}

export function useLeaveOrgWorkspace() {
  return useMutation({
    mutationFn: (args: { workspaceId: string }) =>
      fetchWithInternalAuth<OrgWorkspaceLeaveResponse>("/api/org/membership", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      }),
  });
}

export function orgBoardQueryOptions(filters: OrgBoardFilters) {
  const workspaceId = filters.workspaceId?.trim() ?? "";
  const roleId = filters.roleId?.trim() ?? "";
  const recommendedDate = filters.recommendedDate?.trim() ?? "";
  const recommendedFromDate = filters.recommendedFromDate?.trim() ?? "";
  const recommendedToDate = filters.recommendedToDate?.trim() ?? "";
  const query = filters.query?.trim() ?? "";

  return queryOptions({
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

export function useOrgBoard(filters: OrgBoardFilters) {
  return useQuery(orgBoardQueryOptions(filters));
}

export function orgTalentDetailQueryOptions(args: {
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

  return queryOptions({
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

export function useOrgTalentDetail(args: {
  enabled?: boolean;
  recommendationId?: string | null;
  roleId?: string | null;
  talentId?: string | null;
  workspaceId?: string | null;
}) {
  return useQuery(orgTalentDetailQueryOptions(args));
}

export function useSetOrgCandidateStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      acceptReason?: OrgStageChangeOptions["acceptReason"];
      contactDirectly?: OrgStageChangeOptions["contactDirectly"];
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
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.org.boardAll }),
        queryClient.invalidateQueries({ queryKey: queryKeys.org.detailAll }),
      ]),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.org.detailAll }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.org.detailAll }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.org.detailAll }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.org.boardAll }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.org.boardAll }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.org.boardAll }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.org.detailAll }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.org.bootstrapAll }),
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
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.org.bootstrapAll }),
        queryClient.invalidateQueries({ queryKey: queryKeys.org.boardAll }),
        queryClient.invalidateQueries({ queryKey: queryKeys.org.detailAll }),
      ]),
  });
}
