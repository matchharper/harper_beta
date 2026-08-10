export const ORG_ROLE_STATUS_VALUES = [
  "draft",
  "top_priority",
  "active",
  "ended",
  "paused",
] as const;

export type OrgRoleStatus = (typeof ORG_ROLE_STATUS_VALUES)[number];
export type OrgRoleLifecycleAction = "delete" | "pause" | "resume";

const ORG_ROLE_STATUS_PRESENTATION = {
  active: { label: "진행 중", tone: "positive" },
  draft: { label: "역할 작성 중", tone: "neutral" },
  ended: { label: "종료", tone: "critical" },
  paused: { label: "중지", tone: "info" },
  top_priority: { label: "최우선 진행 중", tone: "primary" },
} as const satisfies Record<
  OrgRoleStatus,
  {
    label: string;
    tone: "critical" | "info" | "neutral" | "positive" | "primary";
  }
>;

const ORG_ROLE_STATUS_ALIASES: Partial<Record<string, OrgRoleStatus>> = {
  archived: "ended",
  closed: "ended",
  expired: "ended",
  inactive: "ended",
  on_hold: "paused",
  open: "active",
  pending: "draft",
  stopped: "ended",
};

const ORG_ROLE_STATUS_FILTER_ORDER = [
  "draft",
  "active",
  "paused",
  "ended",
] as const satisfies readonly OrgRoleStatus[];

export const ORG_ROLE_STATUS_FILTER_OPTIONS =
  ORG_ROLE_STATUS_FILTER_ORDER.map((status) => ({
    status,
    ...ORG_ROLE_STATUS_PRESENTATION[status],
  }));

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

export function getOrgRoleStatusPresentation(value: unknown) {
  const rawStatus = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const aliasedStatus = ORG_ROLE_STATUS_ALIASES[rawStatus] ?? rawStatus;
  const status = normalizeOrgRoleStatus(aliasedStatus);

  return {
    status,
    ...ORG_ROLE_STATUS_PRESENTATION[status],
  };
}

export function getOrgRoleStatusFilterValue(value: unknown): OrgRoleStatus {
  const status = getOrgRoleStatusPresentation(value).status;
  return status === "top_priority" ? "active" : status;
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
