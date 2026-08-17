import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsCompanyActivityResponse,
  OpsCompanyConversationsResponse,
  OpsCompanyMembersResponse,
  OpsCompanyWaitingResponse,
  OpsCompanyWorkspaceUpdateInput,
  OpsCompanyWorkspaceUpdateResponse,
} from "@/lib/ops/company";
import type { OrgBoardResponse, OrgRole, OrgWorkspace } from "@/lib/org/server";
import { queryKeys } from "@/lib/queryKeys";

export const OPS_COMPANY_ACTIVITY_PAGE_SIZE = 20;
export const OPS_COMPANY_CONVERSATION_PAGE_SIZE = 20;

export function useUpdateOpsCompanyWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: OpsCompanyWorkspaceUpdateInput) =>
      fetchWithInternalAuth<OpsCompanyWorkspaceUpdateResponse>(
        "/api/internal/company",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.opsOpportunity.all,
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.opsCompany.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.org.all }),
      ]);
    },
  });
}

export function useOpsCompanyWaiting(enabled = true) {
  return useQuery({
    queryKey: queryKeys.opsCompany.waiting,
    queryFn: () =>
      fetchWithInternalAuth<OpsCompanyWaitingResponse>(
        "/api/internal/company/waiting"
      ),
    enabled,
    staleTime: 15_000,
  });
}

export function useOpsCompanyMembers(args: {
  enabled?: boolean;
  query?: string | null;
  workspaceId?: string | null;
}) {
  const workspaceId = String(args.workspaceId ?? "").trim();
  const query = String(args.query ?? "").trim();

  return useQuery({
    queryKey: queryKeys.opsCompany.members({ query, workspaceId }),
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("workspaceId", workspaceId);
      if (query) params.set("query", query);
      return fetchWithInternalAuth<OpsCompanyMembersResponse>(
        `/api/internal/company/members?${params.toString()}`
      );
    },
    enabled: (args.enabled ?? true) && Boolean(workspaceId),
    staleTime: 15_000,
  });
}

export function useOpsCompanyActivity(args: {
  enabled?: boolean;
  workspaceId?: string | null;
}) {
  const workspaceId = String(args.workspaceId ?? "").trim();
  const limit = OPS_COMPANY_ACTIVITY_PAGE_SIZE;

  return useInfiniteQuery({
    queryKey: queryKeys.opsCompany.activity({
      limit,
      offset: 0,
      workspaceId,
    }),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("workspaceId", workspaceId);
      params.set("limit", String(limit));
      params.set("offset", String(pageParam));
      return fetchWithInternalAuth<OpsCompanyActivityResponse>(
        `/api/internal/company/activity?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: (args.enabled ?? true) && Boolean(workspaceId),
    staleTime: 15_000,
  });
}

export function useOpsCompanyBoard(args: {
  enabled?: boolean;
  workspaceId?: string | null;
}) {
  const workspaceId = String(args.workspaceId ?? "").trim();

  return useQuery({
    queryKey: queryKeys.opsCompany.board(workspaceId),
    queryFn: () =>
      fetchWithInternalAuth<{
        board: OrgBoardResponse;
        roles: OrgRole[];
        workspace: OrgWorkspace | null;
      }>(
        `/api/internal/company/board?workspaceId=${encodeURIComponent(workspaceId)}`
      ),
    enabled: (args.enabled ?? true) && Boolean(workspaceId),
    staleTime: 15_000,
  });
}

export function useOpsCompanyConversations(args: {
  enabled?: boolean;
  workspaceId?: string | null;
}) {
  const workspaceId = String(args.workspaceId ?? "").trim();
  const limit = OPS_COMPANY_CONVERSATION_PAGE_SIZE;

  return useInfiniteQuery({
    queryKey: queryKeys.opsCompany.conversations({
      cursor: 0,
      limit,
      workspaceId,
    }),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("workspaceId", workspaceId);
      params.set("limit", String(limit));
      if (pageParam) params.set("cursor", String(pageParam));
      return fetchWithInternalAuth<OpsCompanyConversationsResponse>(
        `/api/internal/company/conversations?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: (args.enabled ?? true) && Boolean(workspaceId),
    staleTime: 15_000,
  });
}
