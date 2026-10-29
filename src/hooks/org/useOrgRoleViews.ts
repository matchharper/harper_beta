import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { BoardTextSync, mergeBoardTexts } from "@/lib/org/boardTextSync";
import type {
  OrgBoardLayout,
  OrgBoardText,
  OrgRoleListColumn,
} from "@/lib/org/roleViews";

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

export const orgBoardTextsKey = (
  workspaceId: string,
  roleId: string,
  board: string
) => ["org-board-texts", workspaceId, roleId, board];

/**
 * The team's text boxes on one tab of a Role's board, with this person's
 * changes shown at once and saved in the background (see BoardTextSync).
 * Re-read every 15 seconds so a teammate's notes appear without reopening
 * the board.
 */
export function useOrgBoardTexts(args: {
  board: string;
  roleId: string;
  workspaceId: string;
}) {
  const { board, roleId, workspaceId } = args;
  const client = useQueryClient();
  const query = useQuery({
    enabled: Boolean(workspaceId && roleId && board),
    queryFn: () =>
      fetchWithInternalAuth<{ texts: OrgBoardText[] }>(
        `/api/org/role-views?kind=board_texts&workspaceId=${encodeURIComponent(workspaceId)}&roleId=${encodeURIComponent(roleId)}&board=${encodeURIComponent(board)}`
      ),
    queryKey: orgBoardTextsKey(workspaceId, roleId, board),
    refetchInterval: 15_000,
  });
  // One store per board tab, so one tab's boxes never show on another.
  const sync = useMemo(() => {
    const post = (body: Record<string, unknown>) =>
      fetchWithInternalAuth("/api/org/role-views", {
        body: JSON.stringify({ ...body, board, roleId, workspaceId }),
        headers: { "Content-Type": "application/json" },
        // Lets a save started as the board closes finish.
        keepalive: true,
        method: "POST",
      }).then(() => undefined);
    return new BoardTextSync(
      {
        remove: (textId) => post({ action: "delete_board_text", textId }),
        save: ({ id, size, text, x, y }) =>
          post({ action: "save_board_text", text: { id, size, text, x, y } }),
      },
      {
        onIdle: () =>
          void client.invalidateQueries({
            queryKey: orgBoardTextsKey(workspaceId, roleId, board),
          }),
      }
    );
  }, [board, client, roleId, workspaceId]);
  const locals = useSyncExternalStore(
    sync.subscribe,
    sync.getSnapshot,
    sync.getSnapshot
  );
  const { data, dataUpdatedAt } = query;
  useEffect(() => {
    if (data) sync.reconcile(data.texts, dataUpdatedAt);
  }, [data, dataUpdatedAt, sync]);
  // Leaving the board keeps what was being typed.
  useEffect(() => () => sync.releaseAll(), [sync]);
  const texts = useMemo(
    () => mergeBoardTexts(data?.texts ?? [], locals),
    [data, locals]
  );
  return { locals, sync, texts };
}
