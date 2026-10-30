import { matchingHistoryKey } from "./useOrgMatchingHistory";
import {
  type InfiniteData,
  type QueryClient,
  type Query,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { isOrgCandidateProfilePreview, type OrgCandidateDetailResult } from "@/lib/org/candidatePreview";
import type { OpsMatchingConnectionConfirmationEmailActionResponse } from "@/lib/ops/connectionConfirmationEmail";
import type {
  OrgBoardProfileLabelsResponse,
  OrgBoardResponse,
  OrgAcceptedTalentsResponse,
  OrgBootstrapResponse,
  OrgCompanyIntroMutationResponse,
  OrgCompanyTalentRequestCancelResponse,
  OrgFeedCreateResponse,
  OrgFeedMutationResponse,
  OrgInvitationMutationResponse,
  OrgInvitePreviewResponse,
  OrgInviteSendResponse,
  OrgMemberProfileUpdateResponse,
  OrgMemberRemoveResponse,
  OrgMembershipAuthorityUpdateResponse,
  OrgRole,
  OrgRoleReviewStageCreateResponse,
  OrgRoleReviewStageDeleteResponse,
  OrgRoleReviewStageUpdateResponse,
  OrgResumeAccessResponse,
  OrgWorkspaceLeaveResponse,
  OrgWorkspaceUpdateFields,
} from "@/lib/org/server";
import type { OrgMembershipRole } from "@/lib/org/permissions";
import type { OrgRoleCriterion } from "@/lib/org/roleCriteria";
import {
  applyOrgCandidateStageToAcceptedTalents,
  applyOrgCandidateStageToBoard,
  applyOrgCandidateStageToDetail,
  ORG_CANDIDATE_STAGE_MUTATION_KEY,
  type OrgCandidateStageMutationInput,
  type OrgCandidateStageMutationResponse,
} from "@/lib/org/candidateStageClient";
import { queryKeys } from "@/lib/queryKeys";
import {
  orgBillingMatches,
  mapOrgBoardCache,
  type OrgBoardCache,
  orgBoardMatches,
  orgDetailMatches,
  reconcileOrgCompanyIntro,
  reconcileOrgRole,
} from "@/lib/org/mutationCache";

type OrgBoardFilters = {
  enabled?: boolean;
  query?: string;
  recommendedDate?: string;
  recommendedFromDate?: string;
  recommendedToDate?: string;
  roleId?: string | null;
  workspaceId?: string | null;
};

type OrgAgentWebActionStatus = {
  done: boolean;
  ok: true;
  progressMessageId: number | null;
  roleId: string | null;
  status: string;
  terminalMessageId: number | null;
};

async function refreshOrgAgentWebActionWhenReady(args: {
  jobId?: string | null;
  queryClient: QueryClient;
  roleId?: string | null;
  workspaceId: string;
}) {
  const jobId = args.jobId?.trim();
  if (!jobId || !args.workspaceId) return;
  let observedProgressMessageId: number | null = null;
  let terminalStateObserved = false;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
    }
    const params = new URLSearchParams({
      jobId,
      workspaceId: args.workspaceId,
    });
    let status: OrgAgentWebActionStatus;
    try {
      status = await fetchWithInternalAuth<OrgAgentWebActionStatus>(
        `/api/org/agent/web-action/status?${params.toString()}`
      );
    } catch {
      continue;
    }
    const roleId = status.roleId ?? args.roleId ?? null;
    const hasNewProgress =
      status.progressMessageId !== null &&
      status.progressMessageId !== observedProgressMessageId;
    const hasNewTerminalState = status.done && !terminalStateObserved;
    if (hasNewProgress || hasNewTerminalState) {
      await args.queryClient.invalidateQueries({
        queryKey: queryKeys.org.agentMessages({
          mode: roleId ? "role" : "general",
          roleId,
          workspaceId: args.workspaceId,
        }),
      });
    }
    observedProgressMessageId =
      status.progressMessageId ?? observedProgressMessageId;
    terminalStateObserved = terminalStateObserved || status.done;
    if (status.done) {
      await args.queryClient.invalidateQueries({
        queryKey: ["org", "billing"],
      });
      return;
    }
  }
}

export function orgBootstrapQueryOptions(args: {
  enabled?: boolean;
  orgId?: string | null;
}) {
  const orgId = args.orgId?.trim() ?? "";
  return queryOptions({
    queryKey: queryKeys.org.bootstrap(orgId),
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (orgId) params.set("orgId", orgId);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return fetchWithInternalAuth<OrgBootstrapResponse>(
        `/api/org/bootstrap${suffix}`,
        { signal, cache: "no-store" }
      );
    },
    enabled: args.enabled ?? true,
    staleTime: 30_000,
  });
}

/** Refresh one authoritative snapshot, including inactive aliases used by dialogs/routes.
 * Cancel old reads first so an in-flight response cannot restore pre-mutation assignments. */
export async function refreshOrgWorkspaceData(
  queryClient: QueryClient,
  workspaceId: string
) {
  const matches = (query: {
    queryKey: readonly unknown[];
    state: { data: unknown };
  }) =>
    query.queryKey[0] === "org" &&
    query.queryKey[1] === "bootstrap" &&
    (query.queryKey[2] === workspaceId ||
      (query.state.data as OrgBootstrapResponse | undefined)?.workspace
        ?.workspaceId === workspaceId);
  await queryClient.cancelQueries({ predicate: matches });
  await queryClient.invalidateQueries({
    predicate: matches,
    refetchType: "none",
  });
  const fresh = await queryClient.fetchQuery({
    ...orgBootstrapQueryOptions({ orgId: workspaceId }),
    staleTime: 0,
  });
  queryClient.setQueriesData<OrgBootstrapResponse>(
    { predicate: matches },
    fresh
  );
  void queryClient.invalidateQueries({
    queryKey: queryKeys.org.all,
    predicate: (query) => query.queryKey[1] !== "bootstrap",
  });
}

export function useOrgBootstrap(args: {
  enabled?: boolean;
  orgId?: string | null;
}) {
  const queryClient = useQueryClient();
  const workspaceId = args.orgId?.trim();
  // The first visit may resolve a default workspace under the empty key. Reuse
  // that snapshot when URL normalization switches to its canonical ID.
  const cached = workspaceId
    ? queryClient
        .getQueryCache()
        .findAll({
          queryKey: queryKeys.org.bootstrapAll,
          predicate: (query) =>
            query.state.status === "success" &&
            !query.state.isInvalidated &&
            (query.state.data as OrgBootstrapResponse | undefined)?.workspace
              ?.workspaceId === workspaceId,
        })
        .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0]
    : undefined;
  return useQuery({
    ...orgBootstrapQueryOptions(args),
    initialData: cached?.state.data as OrgBootstrapResponse | undefined,
    initialDataUpdatedAt: cached?.state.dataUpdatedAt,
  });
}

export function orgInvitePreviewQueryOptions(args: {
  enabled?: boolean;
  errorMessage?: string;
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
        throw new Error(
          payload.error ??
            args.errorMessage ??
            "초대 정보를 불러오지 못했습니다."
        );
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
  const { c } = useOrgLocale();
  return useQuery(
    orgInvitePreviewQueryOptions({
      ...args,
      errorMessage: c(
        "초대 정보를 불러오지 못했습니다.",
        "Couldn't load invite details."
      ),
    })
  );
}

export function useSendOrgInvitations() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: "org-directory" },
    mutationFn: (args: {
      emails: string[];
      teamId?: string | null;
      role: OrgMembershipRole;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgInviteSendResponse>("/api/org/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      }),
    onSuccess: (_result, args) =>
      refreshOrgWorkspaceData(queryClient, args.workspaceId),
  });
}

export function useCancelOrgInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: "org-directory" },
    mutationFn: (args: { invitationId: string; workspaceId: string }) =>
      fetchWithInternalAuth<OrgInvitationMutationResponse>(
        "/api/org/invitations",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: (_result, args) =>
      refreshOrgWorkspaceData(queryClient, args.workspaceId),
  });
}

export function useUpdateOrgMembershipAuthority() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: "org-directory" },
    mutationFn: (args: {
      authority: OrgMembershipRole;
      userId: string;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgMembershipAuthorityUpdateResponse>(
        "/api/org/membership",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: (_result, args) =>
      refreshOrgWorkspaceData(queryClient, args.workspaceId),
  });
}

export function useUpdateOrgMemberProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: "org-directory" },
    mutationFn: (args: {
      name?: string;
      firstName?: string;
      lastName?: string;
      role: string;
      userId?: string;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgMemberProfileUpdateResponse>(
        "/api/org/member-profile",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: (_result, args) =>
      refreshOrgWorkspaceData(queryClient, args.workspaceId),
  });
}

export function useRemoveOrgMember() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: "org-directory" },
    mutationFn: (args: { userId: string; workspaceId: string }) =>
      fetchWithInternalAuth<OrgMemberRemoveResponse>("/api/org/membership", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      }),
    onSuccess: (_result, args) =>
      refreshOrgWorkspaceData(queryClient, args.workspaceId),
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

export function useDeleteOrgWorkspace() {
  return useMutation({
    retry: false,
    mutationFn: (args: { workspaceId: string; confirmationName: string }) =>
      fetchWithInternalAuth<{ ok: true; workspaceId: string }>("/api/org/workspace", {
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
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ workspaceId });
      if (roleId) params.set("roleId", roleId);
      if (recommendedDate) params.set("recommendedDate", recommendedDate);
      if (recommendedFromDate)
        params.set("recommendedFromDate", recommendedFromDate);
      if (recommendedToDate) params.set("recommendedToDate", recommendedToDate);
      if (query) params.set("query", query);
      return fetchWithInternalAuth<OrgBoardResponse>(
        `/api/org/board?${params.toString()}`,
        { signal }
      );
    },
    enabled: (filters.enabled ?? true) && Boolean(workspaceId),
    staleTime: 20_000,
    retry: 1,
  });
}

export function useOrgBoard(filters: OrgBoardFilters) {
  return useQuery(orgBoardQueryOptions(filters));
}

export function useOrgInbox(args: {
  enabled?: boolean;
  workspaceId?: string | null;
}) {
  // Home, Inbox and the sidebar read the same unfiltered board. Sharing the
  // query also shares an in-flight request and mutation invalidation.
  return useOrgBoard(args);
}

export function useOrgAcceptedTalents(args: {
  enabled?: boolean;
  workspaceIds?: string[];
}) {
  const workspaceIds = Array.from(
    new Set(
      (args.workspaceIds ?? []).map((value) => value.trim()).filter(Boolean)
    )
  ).sort();
  return useInfiniteQuery({
    queryKey: [...queryKeys.org.acceptedTalents, workspaceIds.join(",")],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        offset: String(pageParam),
      });
      for (const workspaceId of workspaceIds) {
        params.append("workspaceId", workspaceId);
      }
      return fetchWithInternalAuth<OrgAcceptedTalentsResponse>(
        `/api/org/accepted-talents?${params.toString()}`,
        { signal }
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled: args.enabled ?? true,
    staleTime: 20_000,
  });
}

export function useOrgBoardProfileLabels(args: {
  enabled?: boolean;
  recommendationIds: string[];
  workspaceId?: string | null;
}) {
  const workspaceId = args.workspaceId?.trim() ?? "";
  const recommendationIds = Array.from(
    new Set(args.recommendationIds.map((value) => value.trim()).filter(Boolean))
  );
  return useQuery({
    queryKey: queryKeys.org.boardProfileLabels({
      recommendationIds,
      workspaceId,
    }),
    queryFn: () =>
      fetchWithInternalAuth<OrgBoardProfileLabelsResponse>(
        "/api/org/board/profile-labels",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recommendationIds, workspaceId }),
        }
      ),
    enabled:
      (args.enabled ?? true) &&
      Boolean(workspaceId) &&
      recommendationIds.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function orgTalentDetailQueryOptions(args: {
  initialData?: OrgCandidateDetailResult;
  staleTime?: number;
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
    initialData: args.initialData,
    queryKey: queryKeys.org.detail({
      recommendationId,
      roleId,
      talentId,
      workspaceId,
    }),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ talentId, workspaceId });
      if (roleId) params.set("roleId", roleId);
      if (recommendationId) params.set("recommendationId", recommendationId);
      return fetchWithInternalAuth<OrgCandidateDetailResult>(
        `/api/org/detail?${params.toString()}`,
        { signal }
      );
    },
    enabled:
      (args.enabled ?? true) && Boolean(workspaceId) && Boolean(talentId),
    staleTime: args.staleTime ?? 20_000,
  });
}

export function useOrgTalentDetail(args: {
  initialData?: OrgCandidateDetailResult;
  staleTime?: number;
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
    mutationKey: ORG_CANDIDATE_STAGE_MUTATION_KEY,
    mutationFn: (args: OrgCandidateStageMutationInput) =>
      fetchWithInternalAuth<OrgCandidateStageMutationResponse>(
        "/api/org/stage",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...args, agentActionId: crypto.randomUUID() }),
        }
      ),
    onSuccess: async (result, variables) => {
      const board = {
        predicate: (query: Query) =>
          orgBoardMatches(query, variables.workspaceId, variables.roleId),
      };
      const detail = {
        predicate: (query: Query) =>
          orgDetailMatches(
            query,
            variables.workspaceId,
            variables.roleId,
            variables.talentId
          ),
      };
      const accepted = {
        queryKey: queryKeys.org.acceptedAll,
        predicate: (query: Query) =>
          String(query.queryKey[2] ?? "")
            .split(",")
            .includes(variables.workspaceId),
      };
      await Promise.all([
        queryClient.cancelQueries(board),
        queryClient.cancelQueries(detail),
        queryClient.cancelQueries(accepted),
      ]);
      queryClient.setQueriesData<OrgBoardCache>(board, (current) =>
        mapOrgBoardCache(current, page => applyOrgCandidateStageToBoard(page, result, variables) ?? page)
      );
      queryClient.setQueriesData<OrgCandidateDetailResult>(detail, (current) =>
        isOrgCandidateProfilePreview(current) ? current : applyOrgCandidateStageToDetail(current, result, variables)
      );
      queryClient.setQueriesData<
        InfiniteData<OrgAcceptedTalentsResponse, number>
      >(accepted, (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map(
                (page) =>
                  applyOrgCandidateStageToAcceptedTalents(
                    page,
                    result,
                    variables
                  ) ?? page
              ),
            }
          : current
      );

      void queryClient.invalidateQueries({
        predicate: (query) => orgBillingMatches(query, variables.workspaceId),
      });
      void queryClient.invalidateQueries(accepted);
      void queryClient.invalidateQueries(board);
      void queryClient.invalidateQueries(detail);
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.org.meetingSchedulesAll, variables.workspaceId],
      });
      void refreshOrgAgentWebActionWhenReady({
        jobId: result.agentJobId,
        queryClient,
        roleId: variables.roleId,
        workspaceId: variables.workspaceId,
      });
    },
  });
}

export function useRequestOrgCompanyIntro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      companyAppeal: string;
      introCandidateId: string;
      introRecipientEmails: string[];
      nextStageId?: string | null;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgCompanyIntroMutationResponse>(
        "/api/org/company-intro",
        {
          body: JSON.stringify({
            action: "request",
            ...args,
            agentActionId: crypto.randomUUID(),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      ),
    onSuccess: (result, variables) => {
      void refreshOrgAgentWebActionWhenReady({
        jobId: result.agentJobId,
        queryClient,
        workspaceId: variables.workspaceId,
      });
      return reconcileOrgCompanyIntro(
        queryClient,
        variables.workspaceId,
        result
      );
    },
  });
}

export function usePassOrgCompanyIntro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      introCandidateId: string;
      workspaceId: string;
      reason?: string;
    }) =>
      fetchWithInternalAuth<OrgCompanyIntroMutationResponse>(
        "/api/org/company-intro",
        {
          body: JSON.stringify({
            action: "pass",
            ...args,
            agentActionId: crypto.randomUUID(),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      ),
    onSuccess: (result, variables) => {
      void refreshOrgAgentWebActionWhenReady({
        jobId: result.agentJobId,
        queryClient,
        workspaceId: variables.workspaceId,
      });
      return reconcileOrgCompanyIntro(
        queryClient,
        variables.workspaceId,
        result
      );
    },
  });
}

export function usePendingOrgCandidateStageMutations() {
  return useMutationState<OrgCandidateStageMutationInput>({
    filters: {
      mutationKey: ORG_CANDIDATE_STAGE_MUTATION_KEY,
      status: "pending",
    },
    select: (mutation) =>
      mutation.state.variables as OrgCandidateStageMutationInput,
  });
}

export function useUpdateOrgConnectionConfirmationEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      action: "cancel" | "send_now";
      queueId: string;
      roleId: string;
      talentId: string;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OpsMatchingConnectionConfirmationEmailActionResponse>(
        "/api/org/connection-confirmation-email",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.org.detailAll }),
  });
}

export function useCancelOrgCompanyTalentRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      requestId: string;
      roleId: string;
      talentId: string;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgCompanyTalentRequestCancelResponse>(
        "/api/org/company-talent-request",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel", ...args }),
        }
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.org.detailAll }),
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
        body: JSON.stringify({ ...args, agentActionId: crypto.randomUUID() }),
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
      documentId?: string | null;
      roleId?: string | null;
      kind?: "storage" | "link" | "document" | null;
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
    mutationFn: (args: OrgWorkspaceUpdateFields & { workspaceId: string }) =>
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
      criteria?: OrgRoleCriterion[];
      description?: string | null;
      employmentTypes?: string[] | null;
      externalJdUrl?: string | null;
      expectedCriteria?: OrgRoleCriterion[];
      expectedRequest?: string | null;
      isCompanyFirstSearch?: boolean;
      isPromote?: boolean;
      isAnonymous?: boolean;
      introSearchDate?: string[];
      introSearchTime?: number;
      isExpired?: boolean | null;
      locationText?: string | null;
      name?: string | null;
      request?: string | null;
      roleId: string;
      salaryRange?: string | null;
      status?: string | null;
      workMode?: string | null;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<{
        agentJobId?: string | null;
        hiringBriefHistoryId?: string | null;
        ok: true;
        role: OrgRole;
      }>("/api/org/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, agentActionId: crypto.randomUUID() }),
      }),
    onSuccess: (result, variables) => {
      if (result.hiringBriefHistoryId) {
        void queryClient.invalidateQueries({ queryKey: matchingHistoryKey(variables.workspaceId, variables.roleId) });
        // The server owns the durable user message. Refresh it immediately;
        // the existing job watcher refreshes the subsequent assistant result.
        void queryClient.invalidateQueries({ queryKey: queryKeys.org.agentMessages({
          mode: "role", roleId: variables.roleId, workspaceId: variables.workspaceId,
        }) });
      }
      void refreshOrgAgentWebActionWhenReady({
        jobId: result.agentJobId,
        queryClient,
        roleId: variables.roleId,
        workspaceId: variables.workspaceId,
      });
      return reconcileOrgRole(queryClient, result.role, variables.isExpired);
    },
  });
}
