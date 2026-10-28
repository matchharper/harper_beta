import { queryOptions } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { RoleMatchingBrief } from "@/lib/org/roleStart/matchingBrief.server";

export function roleMatchingBriefQueryOptions(workspaceId: string, roleId: string) {
  return queryOptions({
    // Keep the board editor's invalidation prefix; the matching view has its own response shape.
    queryKey: ["org", "role-rubric", workspaceId, roleId, "matching"],
    queryFn: ({ signal }) => fetchWithInternalAuth<RoleMatchingBrief>(
      `/api/org/role/matching-brief?roleId=${encodeURIComponent(roleId)}&workspaceId=${encodeURIComponent(workspaceId)}`,
      { signal }
    ),
    staleTime: 30_000,
  });
}
