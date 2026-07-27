import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";

export type OrgSlackStatus = {
  channelId: string | null;
  channelName: string | null;
  connected: boolean;
  connectedAt: string | null;
  lastError: string | null;
  lastSentAt: string | null;
  notifications: {
    candidateAccepted: boolean;
    candidateRejected: boolean;
    memberJoined: boolean;
  };
  teamId: string | null;
  teamName: string | null;
};

export function useUpdateOrgSlackNotifications(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notifications: OrgSlackStatus["notifications"]) =>
      fetchWithInternalAuth<{ ok: true }>("/api/org/slack", {
        body: JSON.stringify({ notifications, workspaceId }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      }),
    onMutate: async (notifications) => {
      const queryKey = queryKeys.org.slack(workspaceId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<OrgSlackStatus>(queryKey);
      if (previous) {
        queryClient.setQueryData<OrgSlackStatus>(queryKey, {
          ...previous,
          notifications,
        });
      }
      return { previous };
    },
    onError: (_error, _notifications, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.org.slack(workspaceId),
          context.previous
        );
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.slack(workspaceId),
      }),
  });
}

export function orgSlackStatusQueryOptions(args: {
  enabled?: boolean;
  workspaceId: string;
}) {
  return queryOptions({
    enabled: (args.enabled ?? true) && Boolean(args.workspaceId),
    queryFn: () =>
      fetchWithInternalAuth<OrgSlackStatus>(
        `/api/org/slack?workspaceId=${encodeURIComponent(args.workspaceId)}`
      ),
    queryKey: queryKeys.org.slack(args.workspaceId),
    staleTime: 15_000,
  });
}

export function useOrgSlackStatus(args: {
  enabled?: boolean;
  workspaceId: string;
}) {
  return useQuery(orgSlackStatusQueryOptions(args));
}

export function useConnectOrgSlack() {
  return useMutation({
    mutationFn: (args: { returnTo: string; workspaceId: string }) =>
      fetchWithInternalAuth<{ authorizeUrl: string }>("/api/org/slack", {
        body: JSON.stringify({ action: "connect", ...args }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
  });
}

export function useTestOrgSlack(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchWithInternalAuth<{ ok: true }>("/api/org/slack", {
        body: JSON.stringify({ action: "test", workspaceId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.slack(workspaceId),
      });
    },
  });
}

export function useDisconnectOrgSlack(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchWithInternalAuth<{ ok: true }>("/api/org/slack", {
        body: JSON.stringify({ workspaceId }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.slack(workspaceId),
      });
    },
  });
}
