import "server-only";

import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  extractSlackRoleMarkerIds,
  extractSlackTalentMarkerIds,
  selectSlackTalentLinkTargets,
  type SlackRoleLinkTarget,
  type SlackTalentLinkTarget,
  type SlackTalentRecommendationRow,
} from "@/lib/org/slackTalentLinks";

export async function loadSlackOrgLinkTargets(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  message: string;
  preferredRoleId?: string | null;
  workspaceId: string;
}): Promise<{
  roleTargets: SlackRoleLinkTarget[];
  talentTargets: SlackTalentLinkTarget[];
}> {
  const markedRoleIds = new Set(extractSlackRoleMarkerIds(args.message));
  const talentIds = extractSlackTalentMarkerIds(args.message);
  if (markedRoleIds.size === 0 && talentIds.length === 0) {
    return { roleTargets: [], talentTargets: [] };
  }

  const { data: roleData, error: roleError } = await (
    args.admin.from("company_roles" as any) as any
  )
    .select("role_id")
    .eq("company_workspace_id", args.workspaceId)
    .eq("source_type", "internal")
    .not("is_expired", "is", true);
  if (roleError) throw roleError;
  const roleIds = ((roleData ?? []) as Array<{ role_id: string }>).map(
    (row) => row.role_id
  );
  const roleTargets = roleIds
    .filter((roleId) => markedRoleIds.has(roleId.toLowerCase()))
    .map((roleId) => ({ roleId }));
  if (roleIds.length === 0 || talentIds.length === 0) {
    return { roleTargets, talentTargets: [] };
  }

  const { data, error } = await (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select("id, talent_id, role_id, recommended_at")
    .in("talent_id", talentIds)
    .in("role_id", roleIds)
    .order("recommended_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1_000);
  if (error) throw error;

  return {
    roleTargets,
    talentTargets: selectSlackTalentLinkTargets({
      preferredRoleId: args.preferredRoleId,
      rows: (data ?? []).map(
        (row: {
          id: string;
          recommended_at: string;
          role_id: string;
          talent_id: string;
        }): SlackTalentRecommendationRow => ({
          recommendationId: row.id,
          recommendedAt: row.recommended_at,
          roleId: row.role_id,
          talentId: row.talent_id,
        })
      ),
    }),
  };
}
