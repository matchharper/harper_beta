import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { BoardCardSync } from "@/lib/org/boardCardSync";
import { BoardTextSync, mergeBoardTexts } from "@/lib/org/boardTextSync";
import type {
  OrgBoardPositions,
  OrgBoardText,
  OrgBoardViewport,
  OrgRoleListColumn,
} from "@/lib/org/roleViews";
import { queryKeys } from "@/lib/queryKeys";

/**
 * The comparison columns of a Role's inbox list. Under the "org" prefix, so
 * a finished Harper turn (which may have added a column) refreshes them.
 */
export function orgRoleListColumnsQueryOptions(
  workspaceId: string,
  roleId: string
) {
  return queryOptions({
    enabled: Boolean(workspaceId && roleId),
    queryFn: () =>
      fetchWithInternalAuth<{ columns: OrgRoleListColumn[] }>(
        `/api/org/role-views?kind=columns&workspaceId=${encodeURIComponent(workspaceId)}&roleId=${encodeURIComponent(roleId)}`
      ),
    queryKey: queryKeys.org.roleListColumns(workspaceId, roleId),
    staleTime: 30_000,
  });
}

export function useOrgRoleListColumns(args: {
  enabled?: boolean;
  roleId: string | null | undefined;
  workspaceId: string;
}) {
  const client = useQueryClient();
  const roleId = args.roleId ?? "";
  const options = orgRoleListColumnsQueryOptions(args.workspaceId, roleId);
  const queryKey = options.queryKey;
  const query = useQuery({
    ...options,
    enabled: (args.enabled ?? true) && Boolean(args.workspaceId && roleId),
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

/**
 * Where the team placed a Role's candidate cards on its board. Re-read
 * every 15 seconds so a teammate's arrangement shows without reopening it.
 */
export function orgBoardCardsQueryOptions(workspaceId: string, roleId: string) {
  return queryOptions({
    enabled: Boolean(workspaceId && roleId),
    queryFn: () =>
      fetchWithInternalAuth<{ positions: OrgBoardPositions }>(
        `/api/org/role-views?kind=board_cards&workspaceId=${encodeURIComponent(workspaceId)}&roleId=${encodeURIComponent(roleId)}`
      ),
    queryKey: queryKeys.org.roleBoardCards(workspaceId, roleId),
    refetchInterval: 15_000,
  });
}

/**
 * The team's card spots on a Role's board, with this person's moves shown
 * at once and saved in the background (see BoardCardSync).
 */
export function useOrgBoardCards(args: {
  roleId: string;
  workspaceId: string;
}) {
  const { roleId, workspaceId } = args;
  const client = useQueryClient();
  const query = useQuery(orgBoardCardsQueryOptions(workspaceId, roleId));
  const sync = useMemo(
    () =>
      new BoardCardSync(
        (change) =>
          fetchWithInternalAuth("/api/org/role-views", {
            body: JSON.stringify({
              action: "save_board_cards",
              ...change,
              roleId,
              workspaceId,
            }),
            headers: { "Content-Type": "application/json" },
            // Lets a save started as the board closes finish.
            keepalive: true,
            method: "POST",
          }).then(() => undefined),
        {
          onIdle: () =>
            void client.invalidateQueries({
              queryKey: queryKeys.org.roleBoardCards(workspaceId, roleId),
            }),
        }
      ),
    [client, roleId, workspaceId]
  );
  const locals = useSyncExternalStore(
    sync.subscribe,
    sync.getSnapshot,
    sync.getSnapshot
  );
  const { data, dataUpdatedAt } = query;
  useEffect(() => {
    if (data) sync.reconcile(data.positions, dataUpdatedAt);
  }, [data, dataUpdatedAt, sync]);
  const positions = useMemo(
    () => ({ ...(data?.positions ?? {}), ...locals }),
    [data, locals]
  );
  // Only the first read is waited for: once it fails, the board shows with
  // cards in free spots while it keeps trying.
  const reading = query.isPending && query.failureCount === 0;
  return { positions, reading, sync };
}

/** This person's last zoom and pan on a Role's board. */
export function orgBoardViewportQueryOptions(
  workspaceId: string,
  roleId: string
) {
  return queryOptions({
    enabled: Boolean(workspaceId && roleId),
    queryFn: () =>
      fetchWithInternalAuth<{ viewport: OrgBoardViewport | null }>(
        `/api/org/role-views?kind=board_viewport&workspaceId=${encodeURIComponent(workspaceId)}&roleId=${encodeURIComponent(roleId)}`
      ),
    queryKey: queryKeys.org.roleBoardViewport(workspaceId, roleId),
    staleTime: Infinity,
  });
}

export function useOrgBoardViewport(args: {
  roleId: string | null | undefined;
  workspaceId: string;
}) {
  return useQuery(
    orgBoardViewportQueryOptions(args.workspaceId, args.roleId ?? "")
  );
}

export function saveOrgBoardViewport(args: {
  roleId: string;
  viewport: OrgBoardViewport;
  workspaceId: string;
}) {
  return fetchWithInternalAuth<{ viewport: OrgBoardViewport }>(
    "/api/org/role-views",
    {
      body: JSON.stringify({ action: "save_board_viewport", ...args }),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "POST",
    }
  );
}

/**
 * The team's text boxes on one tab of a Role's board. Re-read every 15
 * seconds so a teammate's notes appear without reopening the board.
 */
export function orgBoardTextsQueryOptions(
  workspaceId: string,
  roleId: string,
  board: string
) {
  return queryOptions({
    enabled: Boolean(workspaceId && roleId && board),
    queryFn: () =>
      fetchWithInternalAuth<{ texts: OrgBoardText[] }>(
        `/api/org/role-views?kind=board_texts&workspaceId=${encodeURIComponent(workspaceId)}&roleId=${encodeURIComponent(roleId)}&board=${encodeURIComponent(board)}`
      ),
    queryKey: queryKeys.org.roleBoardTexts(workspaceId, roleId, board),
    refetchInterval: 15_000,
  });
}

/**
 * The team's text boxes on one tab of a Role's board, with this person's
 * changes shown at once and saved in the background (see BoardTextSync).
 */
export function useOrgBoardTexts(args: {
  board: string;
  roleId: string;
  workspaceId: string;
}) {
  const { board, roleId, workspaceId } = args;
  const client = useQueryClient();
  const query = useQuery(orgBoardTextsQueryOptions(workspaceId, roleId, board));
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
            queryKey: queryKeys.org.roleBoardTexts(workspaceId, roleId, board),
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
