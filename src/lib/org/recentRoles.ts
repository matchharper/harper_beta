import type { OrgRole } from "@/lib/org/server";
import {
  getOrgRoleStatusFilterValue,
  type OrgRoleStatus,
} from "@/lib/org/roleStatus";

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

const RECENT_ROLE_STATUS_ORDER: Record<OrgRoleStatus, number> = {
  draft: 0,
  top_priority: 1,
  active: 1,
  paused: 2,
  ended: 3,
  deleted: 4,
};

export function sortOrgRolesForRecentList(roles: readonly OrgRole[]) {
  return [...roles].sort((left, right) => {
    const statusOrder =
      RECENT_ROLE_STATUS_ORDER[getOrgRoleStatusFilterValue(left.status)] -
      RECENT_ROLE_STATUS_ORDER[getOrgRoleStatusFilterValue(right.status)];
    if (statusOrder !== 0) return statusOrder;

    const createdAtOrder =
      timestamp(right.createdAt) - timestamp(left.createdAt);
    if (createdAtOrder !== 0) return createdAtOrder;

    return left.roleId.localeCompare(right.roleId);
  });
}
