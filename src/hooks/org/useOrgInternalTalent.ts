import { queryOptions, useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OrgInternalTalentSystemResponse } from "@/lib/org/internalTalentTypes";
import { queryKeys } from "@/lib/queryKeys";

export function orgInternalTalentSystemQueryOptions(args: {
  enabled?: boolean;
  talentId?: string | null;
  workspaceId: string;
}) {
  const talentId = args.talentId?.trim() ?? "";
  return queryOptions({
    enabled:
      (args.enabled ?? true) && Boolean(talentId) && Boolean(args.workspaceId),
    queryFn: () => {
      const params = new URLSearchParams({
        talentId,
        workspaceId: args.workspaceId,
      });
      return fetchWithInternalAuth<OrgInternalTalentSystemResponse>(
        `/api/org/internal-talent?${params.toString()}`
      );
    },
    queryKey: queryKeys.org.internalTalent({
      talentId,
      workspaceId: args.workspaceId,
    }),
    staleTime: 30_000,
  });
}

export function useOrgInternalTalentSystem(args: {
  enabled?: boolean;
  talentId?: string | null;
  workspaceId: string;
}) {
  return useQuery(orgInternalTalentSystemQueryOptions(args));
}
