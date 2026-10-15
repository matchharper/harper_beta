import "server-only";
import { getCompanyInternalRoleRecord } from "@/lib/companyInternalRole";
import { withOrgRoleAudienceScope } from "../teamAccess";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";

/** A Role conversation is shared with that Team, including when the actor is Owner.
 * Keep ordinary read tools and their existing current-membership checks; only
 * narrow their data audience to the shared conversation's durable Role scope.
 */
export async function companyConversationReadAdmin(args: {
  admin: ReturnType<typeof getSupabaseAdmin>; roleId: string | null; workspaceId: string;
}) {
  if (!args.roleId) return args.admin;
  const { data, error } = await (args.admin.from("company_roles") as any)
    .select("company_internal_roles(team_id)").eq("role_id", args.roleId)
    .eq("company_workspace_id", args.workspaceId).single();
  if (error) throw error;
  const teamId = getCompanyInternalRoleRecord(data.company_internal_roles)?.team_id;
  return withOrgRoleAudienceScope(args.admin, teamId ? [teamId] : null);
}
