import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { ProfileEntityRef } from "@/lib/org/profileNotes";
import type { OrgBoardLayout, OrgRoleListColumn } from "@/lib/org/roleViews";

// Under the "org" prefix so a finished Harper turn (which may have added a
// column) refreshes the list.
const columnsKey = (workspaceId: string, roleId: string) => [
  "org",
  "role-list-columns",
  workspaceId,
  roleId,
];

export function useOrgRoleListColumns(args: {
  enabled?: boolean;
  roleId: string | null | undefined;
  workspaceId: string;
}) {
  const client = useQueryClient();
  const roleId = args.roleId ?? "";
  const queryKey = columnsKey(args.workspaceId, roleId);
  const query = useQuery({
    enabled: (args.enabled ?? true) && Boolean(args.workspaceId && roleId),
    queryFn: () =>
      fetchWithInternalAuth<{ columns: OrgRoleListColumn[] }>(
        `/api/org/role-views?kind=columns&workspaceId=${encodeURIComponent(args.workspaceId)}&roleId=${encodeURIComponent(roleId)}`
      ),
    queryKey,
    staleTime: 30_000,
  });
  const remove = useMutation({
    mutationFn: (columnId: string) =>
      fetchWithInternalAuth<{ columns: OrgRoleListColumn[] }>(
        "/api/org/role-views",
        {
          body: JSON.stringify({
            action: "remove_column",
            columnId,
            roleId,
            workspaceId: args.workspaceId,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      ),
    onSuccess: (data) => client.setQueryData(queryKey, data),
  });
  // Candidates who joined the list after a column was made get their cells
  // written by Harper when the list shows them.
  const fillKey = ["org-role-list-column-fill", args.workspaceId, roleId];
  const fill = useMutation({
    mutationKey: fillKey,
    mutationFn: (input: { columnId: string; talentIds: string[] }) =>
      fetchWithInternalAuth<{ columns: OrgRoleListColumn[] }>(
        "/api/org/role-views",
        {
          body: JSON.stringify({
            action: "fill_column",
            columnId: input.columnId,
            roleId,
            talentIds: input.talentIds,
            workspaceId: args.workspaceId,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      ),
    onSuccess: (data) => client.setQueryData(queryKey, data),
  });
  return { columns: query.data?.columns ?? [], fill, fillKey, query, remove };
}

export const orgBoardLayoutKey = (workspaceId: string, roleId: string) => [
  "org-board-layout",
  workspaceId,
  roleId,
];

export function useOrgBoardLayout(args: {
  roleId: string | null | undefined;
  workspaceId: string;
}) {
  const roleId = args.roleId ?? "";
  return useQuery({
    enabled: Boolean(args.workspaceId && roleId),
    queryFn: () =>
      fetchWithInternalAuth<{ layout: OrgBoardLayout }>(
        `/api/org/role-views?kind=board&workspaceId=${encodeURIComponent(args.workspaceId)}&roleId=${encodeURIComponent(roleId)}`
      ),
    // The board keeps its own copy after the first load; later refreshes do
    // not move cards under the person's hand. Each save writes here too, so
    // reopening the board shows the last arrangement.
    queryKey: orgBoardLayoutKey(args.workspaceId, roleId),
    staleTime: Infinity,
  });
}

export function saveOrgBoardLayout(args: {
  layout: OrgBoardLayout;
  roleId: string;
  workspaceId: string;
}) {
  return fetchWithInternalAuth<{ layout: OrgBoardLayout }>(
    "/api/org/role-views",
    {
      body: JSON.stringify({ action: "save_board", ...args }),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "POST",
    }
  );
}

export function useOrgProfileNotes(args: {
  entities: ProfileEntityRef[];
  locale: "ko" | "en";
  workspaceId: string;
}) {
  const names = args.entities
    .map((entity) => `${entity.kind}:${entity.name.trim()}`)
    .filter((key) => !key.endsWith(":"));
  return useQuery({
    enabled: Boolean(args.workspaceId) && names.length > 0,
    queryFn: () =>
      fetchWithInternalAuth<{ notes: Record<string, string> }>(
        "/api/org/profile-notes",
        {
          body: JSON.stringify({
            entities: args.entities,
            locale: args.locale,
            workspaceId: args.workspaceId,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      ),
    queryKey: ["org-profile-notes", args.locale, ...[...names].sort()],
    retry: false,
    staleTime: Infinity,
  });
}
