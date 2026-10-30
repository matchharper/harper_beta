import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { isOrgQueryAccessError } from "@/lib/org/queryError";
import type { OrgTodoResponse } from "@/lib/org/todo";
import { queryKeys } from "@/lib/queryKeys";

/** One Role's To-do. Refreshed on focus and every minute while open. */
export function orgRoleTodoQueryOptions(args: {
  locale: string;
  /** "all": finished work and notices without a time limit. */
  range: "all" | "recent";
  roleId: string;
  workspaceId: string;
}) {
  const { locale, range, roleId, workspaceId } = args;
  return queryOptions({
    queryKey: queryKeys.org.roleTodoRange(workspaceId, roleId, range),
    queryFn: () =>
      fetchWithInternalAuth<OrgTodoResponse>(
        `/api/org/todo?${new URLSearchParams({ locale, range, roleId, workspaceId })}`
      ),
    enabled: Boolean(roleId && workspaceId),
    refetchInterval: (query) =>
      isOrgQueryAccessError(query.state.error) ? false : 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

export function useOrgRoleTodo(args: {
  range?: "all" | "recent";
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  const { locale } = useOrgLocale();
  return useQuery(
    orgRoleTodoQueryOptions({
      locale,
      range: args.range ?? "recent",
      roleId: args.roleId?.trim() ?? "",
      workspaceId: args.workspaceId?.trim() ?? "",
    })
  );
}

/** The team's answer to a Harper suggestion on the To-do. */
export function useDecideOrgTodoSuggestion(args: {
  roleId: string;
  workspaceId: string;
}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      decision: "approve" | "dismiss" | "mute";
      suggestionId: string;
    }) =>
      fetchWithInternalAuth<{ plan: string; title: string }>("/api/org/todo", {
        body: JSON.stringify({ ...input, ...args }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    onSettled: () =>
      client.invalidateQueries({
        queryKey: queryKeys.org.roleTodo(args.workspaceId, args.roleId),
      }),
  });
}

/** "읽음" on an update: hidden at once above the chat and in the tab. */
export function useMarkOrgTodoRead(args: {
  roleId: string;
  workspaceId: string;
}) {
  const client = useQueryClient();
  const key = queryKeys.org.roleTodo(args.workspaceId, args.roleId);
  return useMutation({
    mutationFn: (itemId: string) =>
      fetchWithInternalAuth<{ ok: true }>("/api/org/todo", {
        body: JSON.stringify({ ...args, read: itemId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    onMutate: (itemId) => {
      client.setQueriesData<OrgTodoResponse>({ queryKey: key }, (old) =>
        old
          ? { ...old, items: old.items.filter((item) => item.id !== itemId) }
          : old
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}
