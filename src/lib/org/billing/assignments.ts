import type { BillingSlot, BillingSummary } from "./types";
import {
  getOrgRoleStatusPresentation,
  isOrgRoleCountedAsActive,
} from "../roleStatus";

export type BillingAssignmentSlot = Pick<
  BillingSlot,
  "id" | "label" | "roleId" | "roleName" | "revision"
>;
export type BillingAssignmentRole = {
  roleId: string;
  name: string;
  status: string | null;
};

export function isBillingRoleVisible(role: BillingAssignmentRole) {
  const { status } = getOrgRoleStatusPresentation(role.status);
  return status !== "ended" && status !== "deleted";
}

export function billingAssignmentSlots(
  summary: BillingSummary
): BillingAssignmentSlot[] {
  return summary.slots.filter((slot) => slot.active);
}

/** Only this checkout's unassigned slots and currently active Free Roles. */
export function purchasedSlotAssignmentOptions(
  summary: BillingSummary | undefined,
  roles: BillingAssignmentRole[],
  purchasedSlotIds: readonly string[]
) {
  const activeSlots = summary ? billingAssignmentSlots(summary) : [];
  const assignedRoles = new Set(activeSlots.map((slot) => slot.roleId));
  return {
    slots: activeSlots.filter(
      (slot) => purchasedSlotIds.includes(slot.id) && !slot.roleId
    ),
    roles: roles.filter(
      (role) =>
        isOrgRoleCountedAsActive(role.status) && !assignedRoles.has(role.roleId)
    ),
  };
}
