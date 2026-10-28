import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { OrgCandidateSort } from "@/lib/org/candidateBoardSort";
import type { OrgInboxPage, OrgInboxStage } from "@/lib/org/inboxPagination";

export type OrgRoleInboxFilters = {
  stage: OrgInboxStage;
  sort: OrgCandidateSort;
};
type Scope = {
  workspaceId?: string | null;
  roleId?: string | null;
  enabled?: boolean;
};

export function orgRoleInboxQueryOptions(args: Scope & OrgRoleInboxFilters) {
  const workspaceId = args.workspaceId ?? "";
  const roleId = args.roleId ?? "";
  return infiniteQueryOptions({
    queryKey: queryKeys.org.roleInbox({
      workspaceId,
      roleId,
      stage: args.stage,
      sort: args.sort,
    }),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal, client }) => {
      const startedAt = Date.now();
      const params = new URLSearchParams({
        workspaceId,
        roleId,
        inboxStage: args.stage,
        sort: args.sort,
        offset: String(pageParam),
      });
      const page = await fetchWithInternalAuth<OrgInboxPage>(
        `/api/org/board?${params}`,
        {
          signal,
        }
      );
      signal.throwIfAborted();
      // Seed before publishing the page: selecting any of its candidates must
      // synchronously find the complete detail, including on the first render.
      for (const item of page.items) {
        const detail = page.details?.[item.recommendationId];
        if (!detail) continue;
        const key = queryKeys.org.detail({
          workspaceId,
          roleId: item.roleId,
          talentId: item.talentId,
          recommendationId: item.recommendationId,
        });
        const existing = client.getQueryState(key);
        // A detail mutation may have completed while this batch was in flight.
        if (existing && existing.dataUpdatedAt > startedAt) continue;
        client.setQueryData(key, detail);
      }
      return page;
    },
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    enabled: (args.enabled ?? true) && Boolean(workspaceId && roleId),
    staleTime: 20_000,
    retry: 1,
  });
}

export function useOrgRoleInbox(args: Scope & OrgRoleInboxFilters) {
  return useInfiniteQuery(orgRoleInboxQueryOptions(args));
}

export function useOrgInboxCounts(args: Scope) {
  const workspaceId = args.workspaceId ?? "";
  const roleId = args.roleId ?? "";
  return useQuery({
    queryKey: queryKeys.org.inboxCounts({ workspaceId, roleId }),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ workspaceId, inboxCounts: "true" });
      if (roleId) params.set("roleId", roleId);
      return fetchWithInternalAuth<OrgInboxPage>(`/api/org/board?${params}`, {
        signal,
      });
    },
    enabled: (args.enabled ?? true) && Boolean(workspaceId),
    staleTime: 20_000,
    retry: 1,
  });
}
