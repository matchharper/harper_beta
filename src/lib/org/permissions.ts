export type OrgMembershipRole = "owner" | "admin" | "viewer";

export type OrgPermissions = {
  canManageCandidates: boolean;
  canManageIntegrations: boolean;
  canManageMembers: boolean;
  canManageWorkspace: boolean;
  role: OrgMembershipRole;
};

export const ORG_MEMBERSHIP_ROLE_OPTIONS: Array<{
  description: string;
  label: string;
  value: OrgMembershipRole;
}> = [
  {
    description: "멤버 초대와 권한 변경을 포함해 모든 기능을 관리합니다.",
    label: "Owner",
    value: "owner",
  },
  {
    description:
      "후보자와 Jobs, 회사 정보 및 연동을 관리합니다. 멤버 초대 및 제거는 할 수 없습니다.",
    label: "Admin",
    value: "admin",
  },
  {
    description: "후보자와 회사 정보를 확인할 수 있지만 변경할 수 없습니다.",
    label: "Viewer",
    value: "viewer",
  },
];

export function normalizeOrgMembershipRole(
  value: string | null | undefined
): OrgMembershipRole {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "owner") return "owner";
  if (normalized === "viewer") return "viewer";
  if (normalized === "admin" || normalized === "member") return "admin";
  // Unknown values fail closed. The RBAC migration maps known legacy values
  // before adding the owner/admin/viewer constraint.
  return "viewer";
}

export function getOrgPermissions(
  value: string | null | undefined
): OrgPermissions {
  const role = normalizeOrgMembershipRole(value);
  const isOwner = role === "owner";
  const canManageCandidates = role === "owner" || role === "admin";
  return {
    canManageCandidates,
    canManageIntegrations: canManageCandidates,
    canManageMembers: isOwner,
    canManageWorkspace: canManageCandidates,
    role,
  };
}

export function getOrgRoleLabel(value: string | null | undefined) {
  const role = normalizeOrgMembershipRole(value);
  return role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Viewer";
}
