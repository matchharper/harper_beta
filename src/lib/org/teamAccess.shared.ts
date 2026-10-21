import { normalizeOrgMembershipRole, type OrgMembershipRole } from "./permissions";

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

/** Client projections always use all assignments, with a legacy single-Team fallback. */
export function orgMemberTeamIds(member: { teamIds?: string[]; teamId?: string | null }) {
  return member.teamIds ?? (member.teamId ? [member.teamId] : []);
}

