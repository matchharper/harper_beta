import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";

export type OrgSlackChannel = {
  channelId: string;
  channelName: string | null;
  defaultRoleId: string | null;
  isEnabled: boolean;
  isPrivate: boolean;
  replyToHarperThreads: boolean;
  respondToMentions: boolean;
};

export type OrgSlackStatus = {
  availableChannels: OrgSlackChannel[];
  channels: OrgSlackChannel[];
  canCreateChannels: boolean;
  connected: boolean;
  needsReinstall: boolean;
  teamId: string | null;
  teamName: string | null;
};

export function useCreateOrgSlackChannel(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { channelName: string; isPrivate: boolean }) =>
      fetchWithInternalAuth<{
        channel: OrgSlackChannel;
        creatingUserInvited: boolean;
        ok: true;
        welcomeMessageSent: boolean;
      }>("/api/org/slack", {
        body: JSON.stringify({
          action: "create_channel",
          ...args,
          workspaceId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.slack(workspaceId),
      }),
  });
}

export function useAddOrgSlackChannel(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { channelId: string }) =>
      fetchWithInternalAuth<{ ok: true }>("/api/org/slack", {
        body: JSON.stringify({ action: "add_channel", ...args, workspaceId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
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

export function useRemoveOrgSlackChannel(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) =>
      fetchWithInternalAuth<{ ok: true }>("/api/org/slack", {
        body: JSON.stringify({ channelId, workspaceId }),
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
