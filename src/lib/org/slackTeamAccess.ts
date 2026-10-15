import { getCompanyInternalRoleRecord } from "@/lib/companyInternalRole";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { canAccessOrgRole, resolveOrgRoleAccess } from "./teamAccess";

type Admin = ReturnType<typeof getSupabaseAdmin>;
type Page = { members?: string[]; response_metadata?: { next_cursor?: string } };

/** Retain the caller's channel order and verify actual membership, including pagination. */
export async function findSlackMemberChannel<T extends { channelId: string }>(args: {
  channels: T[];
  slackUserId: string;
  readMembers: (channelId: string, cursor: string) => Promise<Page>;
}) {
  for (const channel of args.channels) {
    try {
      let cursor = "";
      do {
        const page = await args.readMembers(channel.channelId, cursor);
        if (page.members?.includes(args.slackUserId)) return channel;
        cursor = page.response_metadata?.next_cursor?.trim() ?? "";
      } while (cursor);
    } catch {
      // An inaccessible or archived channel does not prevent trying the others.
    }
  }
  return null;
}

/** Slack is another delivery surface: every channel recipient must have the same Role access. */
export async function canShareOrgTeamSlackAudience(args: {
  admin: Admin; workspaceId: string; roleId?: string | null; accessTeamId?: string | null;
  botUserId: string; channelId: string;
  readMembers: (cursor: string) => Promise<Page>;
  readEmail: (slackUserId: string) => Promise<string | null>;
}) {
  const membership = await (args.admin.from("company_user_workspace") as any)
    .select("company_user_id, authority, access_scope, team_id, company_workspace_team_members(team_id)").eq("company_workspace_id", args.workspaceId);
  if (membership.error) throw membership.error;
  const members = membership.data ?? [];
  if (!members.some((member: any) => member.access_scope === "team")) return true;
  let teamId = args.accessTeamId ?? null;
  if (args.roleId) {
    const role = await (args.admin.from("company_roles") as any).select("company_internal_roles(team_id)")
      .eq("company_workspace_id", args.workspaceId).eq("role_id", args.roleId).maybeSingle();
    if (role.error) throw role.error;
    if (!role.data) return false;
    teamId = getCompanyInternalRoleRecord(role.data.company_internal_roles)?.team_id ?? null;
  }
  const allowedIds = members.filter((member: any) => canAccessOrgRole(resolveOrgRoleAccess(member), teamId))
    .map((member: any) => member.company_user_id);
  if (!allowedIds.length) return false;
  const users = await (args.admin.from("company_users") as any).select("email").in("user_id", allowedIds);
  if (users.error) throw users.error;
  const allowedEmails = new Set<string>((users.data ?? []).map((user: any) => String(user.email ?? "").trim().toLowerCase()).filter(Boolean));
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const result = await args.readMembers(cursor);
    if (!Array.isArray(result.members)) return false;
    for (const slackUserId of result.members) {
      if (slackUserId === args.botUserId) continue;
      const email = await args.readEmail(slackUserId);
      if (!email || !allowedEmails.has(email.trim().toLowerCase())) return false;
    }
    cursor = result.response_metadata?.next_cursor?.trim() ?? "";
    if (!cursor) return true;
  }
  return false;
}
