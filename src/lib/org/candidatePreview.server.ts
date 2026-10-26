import { projectCompanyPublicExtras } from "./publicProfile";
import type { User } from "@supabase/supabase-js";
import { resolveTalentLocation } from "@/lib/talentLocation";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { canPreviewCompanyCandidate, type OrgCandidateDetailResult, type OrgCandidateProfilePreview } from "./candidatePreview";
import { companyIntroRoleIsAvailable } from "./companyIntroRoleAvailability";
import { OrgHttpError } from "./httpError";
import { isCompanyVisibleRole } from "./roleVisibility";
import { assertOrgWorkspacePermission, fetchOrgTalentDetail } from "./server";
import { readOrgRoleAccess, scopeOrgRoleQuery } from "./teamAccess";

type CandidateReference = {
  admin?: ReturnType<typeof getSupabaseAdmin>;
  recommendationId?: string | null;
  roleId?: string | null;
  talentId: string;
  user: User;
  workspaceId: string;
};

/** Resolve an existing company-visible pair first. Previewing never creates a pair. */
export async function readOrgCandidateDetail(args: CandidateReference): Promise<OrgCandidateDetailResult> {
  try {
    return await fetchOrgTalentDetail(args);
  } catch (error) {
    if (!(error instanceof OrgHttpError) || error.status !== 404 || args.recommendationId) throw error;
  }

  const admin = args.admin ?? getSupabaseAdmin();
  await assertOrgWorkspacePermission({ admin, permission: "view", user: args.user, workspaceId: args.workspaceId });
  const access = await readOrgRoleAccess({ admin, user: args.user, workspaceId: args.workspaceId });
  const rolesResult = await scopeOrgRoleQuery(admin.from("company_roles")
    .select("role_id,name,source_type,status,expires_at,is_expired,information,company_internal_roles(team_id,is_harper_tailored_role),company_role_assignees(company_users(email))")
    .eq("company_workspace_id", args.workspaceId).eq("source_type", "internal").not("is_expired", "is", true), access);
  if (rolesResult.error) throw rolesResult.error;
  const roles = (rolesResult.data ?? []).filter(isCompanyVisibleRole)
    .filter(role => companyIntroRoleIsAvailable(role, args.talentId, true));
  if (!roles.length || (args.roleId && !roles.some(role => role.role_id === args.roleId))) {
    throw new OrgHttpError(404, "Talent not found");
  }
  const roleIds = roles.map(role => role.role_id);
  const [recommendations, introductions] = await Promise.all([
    admin.from("talent_effective_opportunity_recommendations_v1")
      .select("id,role_id").eq("talent_id", args.talentId).in("role_id", roleIds)
      .order("recommended_at", { ascending: false }),
    admin.from("company_intro_candidates").select("id,role_id")
      .eq("company_workspace_id", args.workspaceId).eq("talent_id", args.talentId).in("role_id", roleIds)
      .in("status", ["ready", "awaiting_talent", "connecting", "closed", "passed"])
      .or("close_reason.is.null,close_reason.neq.route_replaced").order("updated_at", { ascending: false }),
  ]);
  if (recommendations.error) throw recommendations.error;
  if (introductions.error) throw introductions.error;
  const pairs = [
    ...(introductions.data ?? []).map(row => ({ roleId: row.role_id, recommendationId: `company-intro:${row.id}` })),
    ...(recommendations.data ?? []).flatMap(row => row.id && row.role_id ? [{ roleId: row.role_id, recommendationId: row.id }] : []),
  ].sort((left, right) => Number(right.roleId === args.roleId) - Number(left.roleId === args.roleId));
  for (const pair of pairs) {
    try {
      return await fetchOrgTalentDetail({ ...args, ...pair });
    } catch (error) {
      if (!(error instanceof OrgHttpError) || error.status !== 404) throw error;
    }
  }

  const role = args.roleId ? roles.find(role => role.role_id === args.roleId) : roles[0];
  if (!role) throw new OrgHttpError(403, "프로필을 확인할 수 있는 Role을 선택해 주세요.");

  // Read sharing eligibility before requesting profile fields. Old shared pairs
  // above retain their existing visibility contract after preference changes.
  const [talentState, setting, workspace] = await Promise.all([
    admin.from("talent_users").select("user_id,deleted_at").eq("user_id", args.talentId).maybeSingle(),
    admin.from("talent_setting").select("is_onboarding_done,profile_visibility,get_internal_recommendation,blocked_companies")
      .eq("user_id", args.talentId).maybeSingle(),
    admin.from("company_workspace").select("company_name,published_name").eq("company_workspace_id", args.workspaceId).maybeSingle(),
  ]);
  for (const result of [talentState, setting, workspace]) if (result.error) throw result.error;
  if (!talentState.data || !workspace.data || !canPreviewCompanyCandidate({
    deletedAt: talentState.data.deleted_at,
    setting: setting.data,
    companyNames: [workspace.data.company_name, workspace.data.published_name],
  })) throw new OrgHttpError(404, "Talent not found");

  const [talent, experiences, educations, extras] = await Promise.all([
    admin.from("talent_users").select("user_id,name,headline,bio,profile_picture,location,current_location")
      .eq("user_id", args.talentId).is("deleted_at", null).maybeSingle(),
    admin.from("talent_experiences").select("company_logo,company_location,company_name,description,employment_type,end_date,role,start_date")
      .eq("talent_id", args.talentId).order("start_date", { ascending: false, nullsFirst: false }),
    admin.from("talent_educations").select("degree,description,end_date,field,school,start_date,url")
      .eq("talent_id", args.talentId).order("start_date", { ascending: false, nullsFirst: false }),
    admin.from("talent_extras").select("content").eq("talent_id", args.talentId).maybeSingle(),
  ]);
  for (const result of [talent, experiences, educations, extras]) if (result.error) throw result.error;
  if (!talent.data) throw new OrgHttpError(404, "Talent not found");
  const preview: OrgCandidateProfilePreview = {
    profilePreview: true,
    role: { roleId: role.role_id, name: role.name },
    workspace: { workspaceId: args.workspaceId, companyName: workspace.data.company_name },
    talent: { userId: talent.data.user_id, name: talent.data.name, headline: talent.data.headline,
      bio: talent.data.bio, profilePicture: talent.data.profile_picture, email: null },
    profile: {
      bio: talent.data.bio, location: resolveTalentLocation(talent.data),
      documents: [], registeredLinks: [],
      extras: projectCompanyPublicExtras(extras.data?.content).map(item => ({ ...item, memo: null })),
      experiences: (experiences.data ?? []).map(row => ({ companyLogo: row.company_logo, companyLocation: row.company_location,
        companyName: row.company_name, description: row.description, employmentType: row.employment_type,
        endDate: row.end_date, memo: null, role: row.role, startDate: row.start_date })),
      educations: (educations.data ?? []).map(row => ({ degree: row.degree, description: row.description,
        endDate: row.end_date, field: row.field, memo: null, school: row.school, startDate: row.start_date, url: row.url })),
    },
    profileMarkdown: "", resume: { fileName: null, hasStorageFile: false, links: [] },
  };
  return preview;
}
