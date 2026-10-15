import { getCompanyInternalRoleRecord } from "@/lib/companyInternalRole";
import type { User } from "@supabase/supabase-js";
import { hasOrgWorkspaceAccessBypass } from "./access";
import { OrgHttpError } from "./httpError";
import { normalizeOrgMembershipRole, type OrgMembershipRole } from "./permissions";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export type OrgAccessScope = "organization" | "team";
export type OrgTeam = { teamId: string; workspaceId: string; name: string; createdAt: string };
export type OrgRoleAccess = {
  authority: OrgMembershipRole;
  scope: OrgAccessScope;
  teamId: string | null;
  teamName: string | null;
  teamIds: string[];
  teamNames: string[];
  audienceRestricted?: boolean;
};
type Admin = ReturnType<typeof getSupabaseAdmin>;
const orgRoleAudienceScope = Symbol("org-role-audience-scope");

/** Scope this server-side reader to the verified recipients without changing membership. */
export function withOrgRoleAudienceScope<T extends object>(admin: T, teamIds: string[] | null): T {
  if (teamIds === null) return admin;
  return new Proxy(admin, { get(target, property) {
    if (property === orgRoleAudienceScope) return teamIds;
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

export function constrainOrgRoleAudience(access: OrgRoleAccess, teamIds?: string[]): OrgRoleAccess {
  if (!teamIds) return access;
  return { ...access, scope: "team", audienceRestricted: true,
    teamIds: access.scope === "organization" ? [...teamIds] : access.teamIds.filter(id => teamIds.includes(id)) };
}

export function resolveOrgRoleAccess(membership: {
  authority?: string | null;
  access_scope?: string | null;
  team_id?: string | null;
  company_workspace_team_members?: Array<{ team_id: string }>;
}, teamName: string | null = null): OrgRoleAccess {
  const authority = normalizeOrgMembershipRole(membership.authority);
  const scope = authority === "owner" || membership.access_scope === "organization" || membership.access_scope === undefined
    ? "organization" : "team";
  const teamIds = membership.company_workspace_team_members?.map(row => row.team_id)
    ?? (membership.team_id ? [membership.team_id] : []);
  return { authority, scope, teamId: membership.team_id ?? null, teamName, teamIds, teamNames: teamName ? [teamName] : [] };
}

export function canAccessOrgRole(access: OrgRoleAccess, teamId: string | null | undefined) {
  return access.scope === "organization" || Boolean(teamId && access.teamIds.includes(teamId));
}

/** Authorization is read from current membership, never user-editable claims or the LLM. */
export async function readOrgRoleAccess(args: { admin: Admin; user: User; workspaceId: string }): Promise<OrgRoleAccess> {
  const audienceTeamIds = (args.admin as any)[orgRoleAudienceScope] as string[] | undefined;
  if (hasOrgWorkspaceAccessBypass(args.user.email)) {
    return constrainOrgRoleAudience({ authority: "owner", scope: "organization", teamId: null, teamName: null, teamIds: [], teamNames: [] }, audienceTeamIds);
  }
  const { data, error } = await (args.admin.from("company_user_workspace") as any)
    .select("authority, access_scope, team_id, company_workspace_team_members(team_id)")
    .eq("company_user_id", args.user.id).eq("company_workspace_id", args.workspaceId).maybeSingle();
  if (error) throw error;
  if (!data) throw new OrgHttpError(403, "Workspace access denied");
  const access = resolveOrgRoleAccess(data);
  if (!access.teamIds.length) return constrainOrgRoleAudience(access, audienceTeamIds);
  const { data: teams, error: teamError } = await (args.admin.from("company_workspace_teams" as any) as any)
    .select("id,name").in("id", access.teamIds).eq("company_workspace_id", args.workspaceId).is("deleted_at", null);
  if (teamError) throw teamError;
  if ((teams ?? []).length !== access.teamIds.length) throw new OrgHttpError(403, "배정된 팀을 찾을 수 없습니다.");
  return constrainOrgRoleAudience({ ...access, teamName: teams.find((team: any) => team.id === access.teamId)?.name ?? null,
    teamNames: teams.map((team: any) => team.name) }, audienceTeamIds);

}

/** The query must select company_internal_roles; non-null embedding filters parent rows too. */
export function scopeOrgRoleQuery<T>(query: T, access: OrgRoleAccess): T {
  if (access.scope === "organization") return query;
  return access.teamIds.length ? (query as any).in("company_internal_roles.team_id", access.teamIds).not("company_internal_roles", "is", null) : (query as any).in("role_id", []);
}

export async function visibleOrgRoleIds(args: { admin: Admin; user: User; workspaceId: string }): Promise<string[] | null> {
  const access = await readOrgRoleAccess(args);
  if (access.scope === "organization") return null;
  if (!access.teamIds.length) return [];
  const { data, error } = await (args.admin.from("company_roles") as any)
    .select("role_id, company_internal_roles!inner(team_id)").eq("company_workspace_id", args.workspaceId).in("company_internal_roles.team_id", access.teamIds).eq("source_type", "internal");
  if (error) throw error;
  return (data ?? []).map((row: { role_id: string }) => row.role_id);
}

export async function assertOrgTeamRoleAccess(args: { admin: Admin; user: User; workspaceId: string; roleId: string }) {
  const access = await readOrgRoleAccess(args);
  const { data, error } = await (args.admin.from("company_roles") as any)
    .select("role_id, company_internal_roles(team_id)").eq("company_workspace_id", args.workspaceId).eq("role_id", args.roleId)
    .eq("source_type", "internal").maybeSingle();
  if (error) throw error;
  if (!data || !canAccessOrgRole(access, getCompanyInternalRoleRecord(data.company_internal_roles)?.team_id)) throw new OrgHttpError(404, "Role을 찾을 수 없습니다.");
  return access;
}

export async function fetchOrgTeams(admin: Admin, workspaceId: string): Promise<OrgTeam[]> {
  const { data, error } = await (admin.from("company_workspace_teams" as any) as any)
    .select("id, company_workspace_id, name, created_at").eq("company_workspace_id", workspaceId).is("deleted_at", null).order("created_at");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ teamId: row.id, workspaceId: row.company_workspace_id, name: row.name, createdAt: row.created_at }));
}

/** Client projections always use all assignments, with a legacy single-Team fallback. */
export function orgMemberTeamIds(member: { teamIds?: string[]; teamId?: string | null }) {
  return member.teamIds ?? (member.teamId ? [member.teamId] : []);
}

export function orgGeneralConversationTeamScope(access: OrgRoleAccess) {
  return access.scope === "organization" ? [] : [...access.teamIds].sort();
}
