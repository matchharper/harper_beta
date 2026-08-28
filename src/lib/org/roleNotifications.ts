import "server-only";

import type { User } from "@supabase/supabase-js";
import { assertOrgRoleAccess, OrgHttpError } from "@/lib/org/server";
import type {
  OrgRoleNotificationSettings,
  OrgRoleNotificationSettingsUpdate,
} from "@/lib/org/roleNotificationTypes";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

type ChannelRow = {
  id: string;
  slack_channel_id: string;
  slack_channel_name: string | null;
};

type WorkspaceMemberRow = {
  company_user_id: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function fetchRoleNotificationChannels(args: {
  admin: AdminClient;
  permission: "manage_candidates" | "view";
  roleId: string;
  user: User;
  workspaceId: string;
}) {
  await assertOrgRoleAccess(args);

  const channelResult = await (
    args.admin.from("company_slack_channels" as any) as any
  )
    .select("id, slack_channel_id, slack_channel_name")
    .eq("company_workspace_id", args.workspaceId)
    .eq("is_enabled", true)
    .order("slack_channel_name");

  if (channelResult.error) throw channelResult.error;
  return (channelResult.data ?? []) as ChannelRow[];
}

export async function fetchOrgRoleNotificationSettings(args: {
  roleId: string;
  user: User;
  workspaceId: string;
}): Promise<OrgRoleNotificationSettings> {
  const admin = getSupabaseAdmin();
  const workspaceId = text(args.workspaceId);
  const roleId = text(args.roleId);
  if (!workspaceId || !roleId) {
    throw new OrgHttpError(400, "Missing required fields");
  }

  const channels = await fetchRoleNotificationChannels({
    admin,
    permission: "view",
    roleId,
    user: args.user,
    workspaceId,
  });
  const [channelOptOutResult, assigneeResult] = await Promise.all([
    (admin.from("company_role_notification_channels" as any) as any)
      .select("channel_id")
      .eq("role_id", roleId),
    (admin.from("company_role_assignees" as any) as any)
      .select("company_user_id")
      .eq("role_id", roleId),
  ]);

  if (channelOptOutResult.error) throw channelOptOutResult.error;
  if (assigneeResult.error) throw assigneeResult.error;

  const disabledChannelIds = new Set<string>(
    (channelOptOutResult.data ?? []).map(
      (row: { channel_id: string }) => row.channel_id
    )
  );

  return {
    assigneeUserIds: (assigneeResult.data ?? []).map(
      (row: { company_user_id: string }) => row.company_user_id
    ),
    channels: channels.map((channel) => ({
      channelId: channel.slack_channel_id,
      channelName: channel.slack_channel_name,
      enabled: !disabledChannelIds.has(channel.id),
    })),
    roleId,
  };
}

function normalizeUserIds(value: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => text(item))
        .filter(Boolean)
    )
  );
}

async function replaceRoleAssignees(args: {
  admin: AdminClient;
  assigneeUserIds: string[];
  roleId: string;
  workspaceId: string;
}) {
  if (args.assigneeUserIds.length === 0) {
    const deleteResult = await (
      args.admin.from("company_role_assignees" as any) as any
    )
      .delete()
      .eq("role_id", args.roleId);
    if (deleteResult.error) throw deleteResult.error;
    return;
  }

  const memberResult = await (
    args.admin.from("company_user_workspace" as any) as any
  )
    .select("company_user_id")
    .eq("company_workspace_id", args.workspaceId)
    .in("company_user_id", args.assigneeUserIds);
  if (memberResult.error) throw memberResult.error;

  const memberIds = new Set(
    ((memberResult.data ?? []) as WorkspaceMemberRow[]).map(
      (row) => row.company_user_id
    )
  );
  if (args.assigneeUserIds.some((userId) => !memberIds.has(userId))) {
    throw new OrgHttpError(400, "담당자는 현재 Organization 멤버여야 합니다.");
  }

  const deleteResult = await (
    args.admin.from("company_role_assignees" as any) as any
  )
    .delete()
    .eq("role_id", args.roleId);
  if (deleteResult.error) throw deleteResult.error;

  const insertResult = await (
    args.admin.from("company_role_assignees" as any) as any
  ).insert(
    args.assigneeUserIds.map((companyUserId) => ({
      company_user_id: companyUserId,
      role_id: args.roleId,
    }))
  );
  if (insertResult.error) throw insertResult.error;
}

function normalizeChannelUpdates(
  value: OrgRoleNotificationSettingsUpdate["channels"]
) {
  const updates = new Map<string, boolean>();
  for (const item of Array.isArray(value) ? value : []) {
    const channelId = text(item?.channelId);
    if (channelId && typeof item?.enabled === "boolean") {
      updates.set(channelId, item.enabled);
    }
  }
  return updates;
}

async function replaceOptOuts(args: {
  admin: AdminClient;
  disabledIds: string[];
  enabledIds: string[];
  roleId: string;
}) {
  if (args.enabledIds.length > 0) {
    const { error } = await (
      args.admin.from("company_role_notification_channels" as any) as any
    )
      .delete()
      .eq("role_id", args.roleId)
      .in("channel_id", args.enabledIds);
    if (error) throw error;
  }

  if (args.disabledIds.length > 0) {
    const rows = args.disabledIds.map((id) => ({
      channel_id: id,
      role_id: args.roleId,
    }));
    const { error } = await (
      args.admin.from("company_role_notification_channels" as any) as any
    ).upsert(rows, { onConflict: "role_id,channel_id" });
    if (error) throw error;
  }
}

export async function updateOrgRoleNotificationSettings(
  args: OrgRoleNotificationSettingsUpdate & { user: User }
): Promise<OrgRoleNotificationSettings> {
  const admin = getSupabaseAdmin();
  const workspaceId = text(args.workspaceId);
  const roleId = text(args.roleId);
  if (!workspaceId || !roleId) {
    throw new OrgHttpError(400, "Missing required fields");
  }

  const channels = await fetchRoleNotificationChannels({
    admin,
    permission: "manage_candidates",
    roleId,
    user: args.user,
    workspaceId,
  });
  const channelUpdates = normalizeChannelUpdates(args.channels);
  const assigneeUserIds = normalizeUserIds(args.assigneeUserIds);
  const channelByPublicId = new Map(
    channels.map((channel) => [channel.slack_channel_id, channel.id])
  );

  const unknownChannel = [...channelUpdates.keys()].find(
    (channelId) => !channelByPublicId.has(channelId)
  );
  if (unknownChannel) {
    throw new OrgHttpError(400, "Unknown notification target");
  }

  const channelEnabledIds: string[] = [];
  const channelDisabledIds: string[] = [];
  for (const [channelId, enabled] of channelUpdates) {
    const databaseId = channelByPublicId.get(channelId);
    if (!databaseId) continue;
    (enabled ? channelEnabledIds : channelDisabledIds).push(databaseId);
  }

  await replaceOptOuts({
    admin,
    disabledIds: channelDisabledIds,
    enabledIds: channelEnabledIds,
    roleId,
  });
  if (args.assigneeUserIds !== undefined) {
    await replaceRoleAssignees({
      admin,
      assigneeUserIds,
      roleId,
      workspaceId,
    });
  }

  return fetchOrgRoleNotificationSettings({
    roleId,
    user: args.user,
    workspaceId,
  });
}
