import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { isTestOnlyInternalRole } from "@/lib/internalRoleSafety";
import { assertOrgRoleAccess, OrgHttpError } from "./server";
import { countRoleClosureRecipients } from "./roleClosurePreview";

export async function fetchOrgRoleClosurePreview(args: { user: User; workspaceId: string; roleId: string }) {
  if (!args.workspaceId || !args.roleId) throw new OrgHttpError(400, "Missing required fields");
  const admin = getSupabaseAdmin();
  await assertOrgRoleAccess({ ...args, admin });
  const role = await admin.from("company_roles").select("source_type,information,name,source_provider,source_job_id")
    .eq("role_id", args.roleId).eq("company_workspace_id", args.workspaceId).single();
  if (role.error) throw role.error;
  if (role.data.source_type !== "internal" || isTestOnlyInternalRole(role.data)) {
    return { recipientCount: 0 };
  }
  const readAll = async (query: () => any) => {
    const rows: any[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await query().range(offset, offset + 499);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 500) return rows;
    }
  };
  const recommendations = await readAll(() => admin.from("talent_opportunity_recommendation")
    .select("talent_id,feedback,saved_stage,processed_stage,feedback_at,recommended_at,created_at,updated_at")
    .eq("role_id", args.roleId).or("feedback.in.(like,positive),saved_stage.eq.accepted")
    .order("id"));
  if (!recommendations.length) return { recipientCount: 0 };
  recommendations.sort((a, b) => (b.feedback_at ?? b.recommended_at ?? b.created_at)
    .localeCompare(a.feedback_at ?? a.recommended_at ?? a.created_at));
  const [tags, events] = await Promise.all([
    readAll(() => admin.from("talent_opportunity_tag").select("talent_id,tag,created_at,updated_at")
      .eq("opportunity_id", args.roleId).order("id")),
    readAll(() => admin.from("talent_progress").select("talent_id,kind,text,metadata,created_at")
      .eq("role_id", args.roleId).not("kind", "in", "(memo,saved_stage_changed)").order("id")),
  ]);
  return { recipientCount: countRoleClosureRecipients({ recommendations, tags, events }) };
}
