import type { OrgMember, OrgRole } from "@/lib/org/server";
import { getOrgPermissions } from "@/lib/org/permissions";
import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";

export type OrgOnboardingStep =
  | "profile"
  | "slack"
  | "company-details"
  | "company"
  | "plan"
  | "roles"
  | "done";

// Bootstrap already excludes internal operating accounts from this list.
export function isFirstOrgMember(members: OrgMember[], userId: string) {
  const first = [...members].sort(
    (left, right) =>
      left.joinedAt.localeCompare(right.joinedAt) ||
      left.userId.localeCompare(right.userId)
  )[0];
  return first?.userId === userId;
}

export function canProvideOrgCompanyContext(
  members: OrgMember[],
  member: OrgMember
) {
  return (
    isFirstOrgMember(members, member.userId) &&
    getOrgPermissions(member.authority).canManageWorkspace
  );
}

export function getOrgOnboardingRoles(roles: OrgRole[]) {
  return roles.filter(
    (role) => getOrgRoleStatusPresentation(role.status).status !== "deleted"
  );
}

export function getOrgOnboardingSteps(args: {
  showSlack: boolean;
  showCompany: boolean;
  showCompanyDetails?: boolean;
  roles: OrgRole[];
  showPlan?: boolean;
}): OrgOnboardingStep[] {
  return [
    "profile",
    ...(args.showCompanyDetails ? ["company-details" as const] : []),
    ...(args.showCompany ? ["company" as const] : []),
    ...(args.showSlack ? ["slack" as const] : []),
    ...(getOrgOnboardingRoles(args.roles).length ? ["roles" as const] : []),
    ...(args.showPlan ? ["plan" as const] : []),
    "done",
  ];
}

export function getOrgOnboardingRoleCopy(roles: OrgRole[]) {
  const statuses = getOrgOnboardingRoles(roles).map(
    (role) => getOrgRoleStatusPresentation(role.status).status
  );
  if (statuses.every((status) => status === "draft")) {
    return {
      title: "미리 준비해 둔 역할이 있어요.",
      description:
        "아직 채용을 진행하고 있지는 않아요. 시작한 뒤 원하는 인재의 기준을 더 자세히 알려주세요. 함께 다듬고, 준비되면 채용을 시작할 수 있어요. Harper에게 채용 시작해라고 말해주세요.",
    };
  }
  return {
    title: statuses.some(
      (status) => status === "active" || status === "top_priority"
    )
      ? "현재 채용 중인 역할이 있어요."
      : "회사의 채용 역할을 확인해 보세요.",
    description:
      "언제든지 원하는 인재의 기준과 달라진 상황을 Harper에게 알려주세요. 바로 수정된 기준에 맞는 인재를 연결해드릴게요.",
  };
}

export function buildSlackChannelLinks(
  teamId?: string | null,
  channelId?: string | null
) {
  if (!teamId || !channelId) return null;
  const team = encodeURIComponent(teamId);
  const channel = encodeURIComponent(channelId);
  return {
    app: `slack://channel?team=${team}&id=${channel}`,
    web: `https://app.slack.com/client/${team}/${channel}`,
  };
}
