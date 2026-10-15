import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { refreshOrgWorkspaceData } from "./useOrg";
import type { OrgAccessScope } from "@/lib/org/teamAccess";

type TeamChange = {
  method: "POST" | "PATCH" | "DELETE";
  workspaceId: string;
  teamId?: string | null;
  teamIds?: string[];
  name?: string;
  userIds?: string[];
  roleIds?: string[];
  userId?: string;
  accessScope?: OrgAccessScope;
};
export function useOrgTeamChange() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: "org-directory" },
    mutationFn: ({ method, ...body }: TeamChange) =>
      fetchWithInternalAuth<{ ok: true; teamId?: string }>("/api/org/teams", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (_result, args) =>
      refreshOrgWorkspaceData(queryClient, args.workspaceId),
  });
}
