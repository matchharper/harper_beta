import "server-only";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { assertOrgWorkspacePermission, fetchRoleRowsForWorkspace, OrgHttpError } from "./server";
import { isHarperSlackAudienceAllowed } from "./slackHarper";
import { leavesRoleWithoutNotificationDestination, ROLE_NOTIFICATION_DESTINATION_REQUIRED } from "./roleNotificationDestinations";
import type { OrgSlackChannelRoleAssignmentsUpdate } from "./roleNotificationTypes";

/** Save one channel's changed assignments together, leaving every other channel untouched. */
export async function updateOrgSlackChannelRoleAssignments(
  args: OrgSlackChannelRoleAssignmentsUpdate & { user: User }
) {
  const { workspaceId, channelId, roles } = args;
  if (!workspaceId || !channelId || !Array.isArray(roles) || roles.some(
    (role) => !role || typeof role.roleId !== "string" || !role.roleId || typeof role.enabled !== "boolean"
  )) throw new OrgHttpError(400, "Missing required fields");

  const admin = getSupabaseAdmin();
  await assertOrgWorkspacePermission({ admin, user: args.user, workspaceId, permission: "manage_candidates" });
  const visibleRoles = await fetchRoleRowsForWorkspace(admin, workspaceId, args.user);
  const visibleIds = new Set(visibleRoles.map((role) => role.role_id));
  const updates = new Map(roles.map((role) => [role.roleId, role.enabled]));
  if ([...updates.keys()].some((id) => !visibleIds.has(id))) {
    throw new OrgHttpError(404, "Role not found");
  }

  const channelsResult = await (admin.from("company_slack_channels" as any) as any)
    .select("id, slack_channel_id")
    .eq("company_workspace_id", workspaceId).eq("is_enabled", true);
  if (channelsResult.error) throw channelsResult.error;
  const channels = (channelsResult.data ?? []) as Array<{ id: string; slack_channel_id: string }>;
  const channel = channels.find((item) => item.slack_channel_id === channelId);
  if (!channel) throw new OrgHttpError(400, "Unknown notification target");
  if (!updates.size) return { ok: true as const };

  const roleIds = [...updates.keys()];
  const [optOutResult, emailResult] = await Promise.all([
    (admin.from("company_role_notification_channels" as any) as any)
      .select("role_id, channel_id").in("role_id", roleIds),
    (admin.from("company_internal_roles" as any) as any)
      .select("role_id, email_notifications_enabled").in("role_id", roleIds),
  ]);
  if (optOutResult.error) throw optOutResult.error;
  if (emailResult.error) throw emailResult.error;
  const disabledByRole = new Map<string, Set<string>>();
  for (const row of optOutResult.data ?? []) {
    if (!disabledByRole.has(row.role_id)) disabledByRole.set(row.role_id, new Set());
    disabledByRole.get(row.role_id)!.add(row.channel_id);
  }
  const emailByRole = new Map<string, boolean>((emailResult.data ?? []).map(
    (row: { role_id: string; email_notifications_enabled: boolean }) => [row.role_id, row.email_notifications_enabled === true]
  ));

  // Validate the complete selection before writing any of it.
  for (const [roleId, enabled] of updates) {
    if (!emailByRole.has(roleId)) throw new OrgHttpError(404, "Role not found");
    if (!enabled && leavesRoleWithoutNotificationDestination({
      channels: channels.map((item) => ({ channelId: item.slack_channel_id, enabled: !disabledByRole.get(roleId)?.has(item.id) })),
      emailEnabled: emailByRole.get(roleId) === true,
      update: { channels: new Map([[channelId, enabled]]) },
    })) throw new OrgHttpError(400, ROLE_NOTIFICATION_DESTINATION_REQUIRED);
  }
  const enabledIds = roleIds.filter((roleId) => updates.get(roleId));
  const allowed = await Promise.all(enabledIds.map((roleId) =>
    isHarperSlackAudienceAllowed({ workspaceId, roleId, channelId })
  ));
  if (allowed.some((value) => !value)) {
    throw new OrgHttpError(403, "채널 참여자의 Role 접근 권한을 확인하지 못했어요. 팀과 채널 참여자를 확인해 주세요.");
  }

  if (enabledIds.length) {
    const { error } = await (admin.from("company_role_notification_channels" as any) as any)
      .delete().eq("channel_id", channel.id).in("role_id", enabledIds);
    if (error) throw error;
  }
  const disabledIds = roleIds.filter((roleId) => !updates.get(roleId));
  if (disabledIds.length) {
    const { error } = await (admin.from("company_role_notification_channels" as any) as any)
      .upsert(disabledIds.map((roleId) => ({ role_id: roleId, channel_id: channel.id })), { onConflict: "role_id,channel_id" });
    if (error) throw error;
  }
  return { ok: true as const };
}
