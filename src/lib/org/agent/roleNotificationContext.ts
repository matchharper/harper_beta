import "server-only";
import type { User } from "@supabase/supabase-js";
import { fetchOrgRoleNotificationSettings } from "../roleNotifications";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { parseRoleCreationConversationMetadata } from "./roleCreationState";

export async function readRoleNotificationContext(args: {
  roleId: string; workspaceId: string; user: User; currentChannelId?: string | null;
}) {
  const settings = await fetchOrgRoleNotificationSettings(args);
  const { data, error } = await getSupabaseAdmin().from("company_conversations")
    .select("metadata").eq("company_workspace_id", args.workspaceId)
    .eq("role_id", args.roleId).contains("metadata", { scope: "role_creation" }).maybeSingle();
  if (error) throw error;
  const metadata = parseRoleCreationConversationMetadata(data?.metadata);
  return {
    assigneeUserIds: settings.assigneeUserIds,
    availableAssignees: settings.availableAssignees,
    channels: settings.channels.map(channel => ({ ...channel, current: channel.channelId === args.currentChannelId })),
    // New candidates also go by email to the Role's assignees and Owners.
    emailEnabled: settings.emailEnabled,
    // Draft readiness distinguishes explicit selections from workspace-wide default delivery.
    confirmedAssigneeUserId: metadata.confirmedAssigneeUserId,
    confirmedChannelIds: metadata.confirmedSlackChannelIds,
  };
}
