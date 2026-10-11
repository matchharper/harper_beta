import type { BillingSlot, BillingSummary } from "./types";
import { getOrgRoleStatusPresentation } from "../roleStatus";

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
