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
} from "@/lib/org/roleNotificationTypes";
import { queryKeys } from "@/lib/queryKeys";

export function orgRoleNotificationSettingsQueryOptions(args: {
  enabled?: boolean;
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
      return fetchWithInternalAuth<OrgRoleNotificationSettings>(
        `/api/org/role-notifications?${params.toString()}`
      );
    },
    queryKey: queryKeys.org.roleNotifications(args.workspaceId, args.roleId),
    staleTime: 15_000,
  });
}

export function useOrgRoleNotificationSettings(args: {
  enabled?: boolean;
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
      queryClient.setQueryData(
        queryKeys.org.roleNotifications(args.workspaceId, args.roleId),
        settings
      );
    },
  });
}
