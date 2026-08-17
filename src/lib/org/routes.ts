export type OrgWorkspacePageId =
  | "all"
  | "home"
  | "inbox"
  | "jobs"
  | "member"
  | "new-role"
  | "role"
  | "team"
  | "settings"
  | "documents";

export type OrgJobsView = "pipeline" | "role";

const ORG_PAGE_PATHS: Record<OrgWorkspacePageId, string> = {
  all: "/org/all",
  documents: "/org/documents",
  home: "/org/home",
  inbox: "/org/inbox",
  jobs: "/org/jobs",
  member: "/org/member",
  "new-role": "/org/new",
  role: "/org/role",
  settings: "/org/settings",
  team: "/org/team",
};

export function buildOrgHref(args: {
  detail?: {
    recommendationId?: string | null;
    roleId?: string | null;
    talentId?: string | null;
    workspaceId?: string | null;
  } | null;
  orgId?: string | null;
  page?: OrgWorkspacePageId;
  roleId?: string | null;
  view?: OrgJobsView | null;
}) {
  const params = new URLSearchParams();
  const orgId = args.orgId?.trim();
  const roleId = args.roleId?.trim();
  const detailTalentId = args.detail?.talentId?.trim();
  const detailRecommendationId = args.detail?.recommendationId?.trim();
  const detailRoleId = args.detail?.roleId?.trim();
  const detailWorkspaceId = args.detail?.workspaceId?.trim();
  if (orgId) params.set("orgId", orgId);
  if (
    roleId &&
    (args.page === "jobs" ||
      args.page === "new-role" ||
      args.page === "role")
  ) {
    params.set("roleId", roleId);
  }
  if (roleId && roleId !== "all" && args.page === "jobs" && args.view) {
    params.set("view", args.view);
  }
  if (detailTalentId) params.set("talentId", detailTalentId);
  if (detailRecommendationId) {
    params.set("recommendationId", detailRecommendationId);
  }
  if (detailRoleId) params.set("detailRoleId", detailRoleId);
  if (detailWorkspaceId) params.set("detailWorkspaceId", detailWorkspaceId);
  const query = params.toString();
  const pathname = ORG_PAGE_PATHS[args.page ?? "home"];
  return query ? `${pathname}?${query}` : pathname;
}
