import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OrgRoleNotificationSettings,
  OrgRoleNotificationSettingsUpdate,
  OrgSlackChannelRoleAssignmentsUpdate,
} from "@/lib/org/roleNotificationTypes";
import { queryKeys } from "@/lib/queryKeys";

export function orgRoleNotificationSettingsQueryOptions(args: {
  enabled?: boolean;
  audienceChannelId?: string;
  roleId: string;
  workspaceId: string;
}) {
  return queryOptions({
    enabled:
      (args.enabled ?? true) &&
      Boolean(args.roleId) &&
      Boolean(args.workspaceId),
    queryFn: () => {
      const params = new URLSearchParams({
        roleId: args.roleId,
        workspaceId: args.workspaceId,
      });
      if (args.audienceChannelId)
        params.set("audienceChannelId", args.audienceChannelId);
      return fetchWithInternalAuth<OrgRoleNotificationSettings>(
        `/api/org/role-notifications?${params.toString()}`
      );
    },
    queryKey: args.audienceChannelId
      ? [
          ...queryKeys.org.roleNotifications(args.workspaceId, args.roleId),
          "audience",
          args.audienceChannelId,
        ]
      : queryKeys.org.roleNotifications(args.workspaceId, args.roleId),
    staleTime: 15_000,
  });
}

export function useOrgRoleNotificationSettings(args: {
  enabled?: boolean;
  audienceChannelId?: string;
  roleId: string;
  workspaceId: string;
}) {
  return useQuery(orgRoleNotificationSettingsQueryOptions(args));
}

export function useUpdateOrgRoleNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: OrgRoleNotificationSettingsUpdate) =>
      fetchWithInternalAuth<OrgRoleNotificationSettings>(
        "/api/org/role-notifications",
        {
          body: JSON.stringify(args),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        }
      ),
    onSuccess: (settings, args) => {
      void queryClient.invalidateQueries({
        queryKey: [
          ...queryKeys.org.roleNotifications(args.workspaceId, args.roleId),
          "audience",
        ],
      });
      queryClient.setQueryData(
        queryKeys.org.roleNotifications(args.workspaceId, args.roleId),
        settings
      );
    },
  });
}

export function useUpdateOrgSlackChannelRoleAssignments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: OrgSlackChannelRoleAssignmentsUpdate) =>
      fetchWithInternalAuth<{ ok: true }>("/api/org/slack/channel-roles", {
        body: JSON.stringify(args),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      }),
    onSuccess: (_, args) => {
      for (const role of args.roles) {
        queryClient.setQueriesData<OrgRoleNotificationSettings>(
          { queryKey: queryKeys.org.roleNotifications(args.workspaceId, role.roleId) },
          (settings) => settings && ({
            ...settings,
            channels: settings.channels.map((channel) => channel.channelId === args.channelId
              ? { ...channel, enabled: role.enabled } : channel),
          })
        );
      }
    },
    onError: (_, args) => {
      // A failed response can follow a completed write; reconcile the cached state.
      for (const role of args.roles) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.org.roleNotifications(args.workspaceId, role.roleId),
        });
      }
    },
  });
}
