import { getCompanyInternalRoleRecord } from "@/lib/companyInternalRole";
import "server-only";

import type { User } from "@supabase/supabase-js";
import { assertOrgRoleAccess, OrgHttpError } from "@/lib/org/server";
import type {
  OrgRoleNotificationSettings,
  OrgRoleNotificationSettingsUpdate,
} from "@/lib/org/roleNotificationTypes";
import {
  leavesRoleWithoutNotificationDestination,
  ROLE_NOTIFICATION_DESTINATION_REQUIRED,
} from "@/lib/org/roleNotificationDestinations";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { canAccessOrgRole, resolveOrgRoleAccess } from "./teamAccess";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

type ChannelRow = {
  id: string;
  slack_channel_id: string;
  slack_channel_name: string | null;
};

type WorkspaceMemberRow = {
  company_user_id: string;
  authority: string; access_scope: string; team_id: string | null;
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
  audienceChannelId?: string;
  roleId: string;
  user: User;
  workspaceId: string;
}): Promise<OrgRoleNotificationSettings & { availableAssignees: Array<{ userId: string; name: string; current: boolean }> }> {
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
  const [membershipResult, roleResult] = await Promise.all([
    (admin.from("company_user_workspace") as any).select("company_user_id, authority, access_scope, team_id, company_workspace_team_members(team_id), company_users(name,email)").eq("company_workspace_id", workspaceId),
    (admin.from("company_roles" as any) as any).select("company_internal_roles(team_id, email_notifications_enabled)").eq("company_workspace_id", workspaceId).eq("role_id", roleId).maybeSingle(),
  ]);
  if (membershipResult.error) throw membershipResult.error;
  if (roleResult.error) throw roleResult.error;
  if (!roleResult.data) throw new OrgHttpError(404, "Role을 찾지 못했습니다.");
  const internalRole = getCompanyInternalRoleRecord(roleResult.data.company_internal_roles);
  const eligibleIds = new Set((membershipResult.data ?? []).filter((row: WorkspaceMemberRow) =>
    canAccessOrgRole(resolveOrgRoleAccess(row), internalRole?.team_id)).map((row: WorkspaceMemberRow) => row.company_user_id));

  const disabledChannelIds = new Set<string>(
    (channelOptOutResult.data ?? []).map(
      (row: { channel_id: string }) => row.channel_id
    )
  );

  // The setup picker verifies the selected destination using the delivery boundary.
  let canAssign: boolean | undefined;
  if (args.audienceChannelId) {
    if (!channels.some((channel) => channel.slack_channel_id === args.audienceChannelId)) {
      throw new OrgHttpError(400, "Unknown notification target");
    }
    const { isHarperSlackAudienceAllowed } = await import("./slackHarper");
    canAssign = await isHarperSlackAudienceAllowed({ workspaceId, roleId, channelId: args.audienceChannelId });
  }

  return {
    availableAssignees: (membershipResult.data ?? []).filter((row: WorkspaceMemberRow) => eligibleIds.has(row.company_user_id)).map((row: any) => ({
      userId: row.company_user_id,
      name: text(row.company_users?.name) || text(row.company_users?.email) || "팀원",
      current: row.company_user_id === args.user.id,
    })),
    assigneeUserIds: (assigneeResult.data ?? []).filter((row: { company_user_id: string }) => eligibleIds.has(row.company_user_id)).map(
      (row: { company_user_id: string }) => row.company_user_id
    ),
    channels: channels.map((channel) => ({
      channelId: channel.slack_channel_id,
      channelName: channel.slack_channel_name,
      enabled: !disabledChannelIds.has(channel.id),
      ...(channel.slack_channel_id === args.audienceChannelId ? { canAssign } : {}),
    })),
    emailEnabled: internalRole?.email_notifications_enabled === true,
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
    .select("company_user_id, authority, access_scope, team_id, company_workspace_team_members(team_id)")
    .eq("company_workspace_id", args.workspaceId)
    .in("company_user_id", args.assigneeUserIds);
  if (memberResult.error) throw memberResult.error;
  const roleResult = await (args.admin.from("company_roles" as any) as any)
    .select("company_internal_roles(team_id)").eq("company_workspace_id", args.workspaceId).eq("role_id", args.roleId).maybeSingle();
  if (roleResult.error) throw roleResult.error;
  if (!roleResult.data) throw new OrgHttpError(404, "Role을 찾지 못했습니다.");

  const memberIds = new Set(
    ((memberResult.data ?? []) as WorkspaceMemberRow[]).map(
      (row) => canAccessOrgRole(resolveOrgRoleAccess(row), getCompanyInternalRoleRecord(roleResult.data.company_internal_roles)?.team_id) ? row.company_user_id : null
    ).filter(Boolean)
  );
  if (args.assigneeUserIds.some((userId) => !memberIds.has(userId))) {
    throw new OrgHttpError(400, "담당자는 이 Role에 접근할 수 있는 팀원이어야 합니다.");
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

async function readRoleDestinations(args: {
  admin: AdminClient;
  channels: ChannelRow[];
  roleId: string;
}) {
  const [optOutResult, internalRoleResult] = await Promise.all([
    (args.admin.from("company_role_notification_channels" as any) as any)
      .select("channel_id")
      .eq("role_id", args.roleId),
    (args.admin.from("company_internal_roles" as any) as any)
      .select("email_notifications_enabled")
      .eq("role_id", args.roleId)
      .maybeSingle(),
  ]);
  if (optOutResult.error) throw optOutResult.error;
  if (internalRoleResult.error) throw internalRoleResult.error;
  const disabledIds = new Set<string>(
    (optOutResult.data ?? []).map((row: { channel_id: string }) => row.channel_id)
  );
  return {
    channels: args.channels.map((channel) => ({
      channelId: channel.slack_channel_id,
      enabled: !disabledIds.has(channel.id),
    })),
    emailEnabled: internalRoleResult.data?.email_notifications_enabled === true,
  };
}

async function writeRoleEmailEnabled(args: {
  admin: AdminClient;
  emailEnabled: boolean;
  roleId: string;
}) {
  const { data, error } = await (
    args.admin.from("company_internal_roles" as any) as any
  )
    .update({
      email_notifications_enabled: args.emailEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq("role_id", args.roleId)
    .select("role_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new OrgHttpError(404, "Role을 찾지 못했습니다.");
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

  // Recheck at the write boundary: channel membership may have changed since reading.
  if ([...channelUpdates.values()].some(Boolean)) {
    const { isHarperSlackAudienceAllowed } = await import("./slackHarper");
    for (const [channelId, enabled] of channelUpdates) {
      if (enabled && !await isHarperSlackAudienceAllowed({ workspaceId, roleId, channelId })) {
        throw new OrgHttpError(403, "채널 참여자의 Role 접근 권한을 확인하지 못했어요. 팀과 채널 참여자를 확인해 주세요.");
      }
    }
  }

  const emailEnabled =
    typeof args.emailEnabled === "boolean" ? args.emailEnabled : undefined;
  // Every role keeps a Slack channel or email on (rule checked for every save path here).
  const touchesDestinations =
    emailEnabled === false || [...channelUpdates.values()].some((enabled) => !enabled);
  if (
    touchesDestinations &&
    leavesRoleWithoutNotificationDestination({
      ...(await readRoleDestinations({ admin, channels, roleId })),
      update: { channels: channelUpdates, emailEnabled },
    })
  ) {
    throw new OrgHttpError(400, ROLE_NOTIFICATION_DESTINATION_REQUIRED);
  }

  const channelEnabledIds: string[] = [];
  const channelDisabledIds: string[] = [];
  for (const [channelId, enabled] of channelUpdates) {
    const databaseId = channelByPublicId.get(channelId);
    if (!databaseId) continue;
    (enabled ? channelEnabledIds : channelDisabledIds).push(databaseId);
  }

  // Email first: switching a role from Slack to email never passes through no destination.
  if (emailEnabled !== undefined) {
    await writeRoleEmailEnabled({ admin, emailEnabled, roleId });
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
