import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsCompanyActivityResponse,
  OpsCompanyMembersResponse,
  OpsCompanyWaitingResponse,
} from "@/lib/ops/company";
import { queryKeys } from "@/lib/queryKeys";

export const OPS_COMPANY_ACTIVITY_PAGE_SIZE = 20;

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
