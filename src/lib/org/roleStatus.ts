export const ORG_ROLE_STATUS_VALUES = [
  "top_priority",
  "active",
  "ended",
  "paused",
] as const;

export type OrgRoleStatus = (typeof ORG_ROLE_STATUS_VALUES)[number];
export type OrgRoleLifecycleAction = "delete" | "pause" | "resume";

export function normalizeOrgRoleStatus(value: unknown): OrgRoleStatus {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  // Older clients used this unsupported status for soft deletion.
  if (normalized === "deleted") return "ended";

  return ORG_ROLE_STATUS_VALUES.includes(normalized as OrgRoleStatus)
    ? (normalized as OrgRoleStatus)
    : "active";
}

export function getOrgRoleLifecycleUpdate(action: OrgRoleLifecycleAction): {
  isExpired?: boolean;
  status: OrgRoleStatus;
} {
  if (action === "delete") {
    return { isExpired: true, status: "ended" };
  }
  return { status: action === "pause" ? "paused" : "active" };
}
