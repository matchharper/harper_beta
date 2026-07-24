import { useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OrgInternalTalentSystemResponse } from "@/lib/org/internalTalentTypes";

export function useOrgInternalTalentSystem(args: {
  enabled?: boolean;
  talentId?: string | null;
  workspaceId: string;
}) {
  const talentId = args.talentId?.trim() ?? "";
  return useQuery({
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
    queryKey: ["org", "internal-talent-system", args.workspaceId, talentId],
    staleTime: 30_000,
  });
}
