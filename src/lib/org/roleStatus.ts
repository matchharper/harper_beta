export const ORG_ROLE_STATUS_VALUES = [
  "draft",
  "top_priority",
  "active",
  "ended",
  "paused",
  "deleted",
] as const;

export const ORG_ACTIVE_ROLE_LIMIT = 5;
export const ORG_ACTIVE_ROLE_LIMIT_MESSAGE = `현재 채용 중인 역할이 ${ORG_ACTIVE_ROLE_LIMIT}개여서 새 역할을 더 등록할 수 없어요. 추가 등록이 필요하면 Harper 팀에 문의해 주세요.`;

const ORG_ACTIVE_ROLE_COUNTED_STATUSES = new Set([
  "active",
  "open",
  "top_priority",
]);

export type OrgRoleStatus = (typeof ORG_ROLE_STATUS_VALUES)[number];
export type OrgRoleLifecycleAction = "delete" | "pause" | "resume";

export const ORG_ROLE_MUTATION_STATUS_VALUES = [
  "top_priority",
  "active",
  "paused",
  "ended",
  "deleted",
] as const satisfies readonly OrgRoleStatus[];

export type OrgRoleMutationStatus =
  (typeof ORG_ROLE_MUTATION_STATUS_VALUES)[number];

const ORG_ROLE_STATUS_PRESENTATION = {
  active: { label: "진행 중", tone: "positive" },
  deleted: { label: "삭제됨", tone: "neutral" },
  draft: { label: "작성 중", tone: "action" },
  ended: { label: "종료", tone: "neutral" },
  paused: { label: "중단", tone: "primary" },
  top_priority: { label: "최우선 진행 중", tone: "primary" },
} as const satisfies Record<
  OrgRoleStatus,
  {
    label: string;
    tone: "action" | "critical" | "info" | "neutral" | "positive" | "primary";
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

const ORG_ROLE_MUTATION_STATUS_ALIASES: Partial<
  Record<string, OrgRoleMutationStatus>
> = {
  진행: "active",
  "진행 중": "active",
  중단: "paused",
  "일시 중단": "paused",
  종료: "ended",
  "채용 종료": "ended",
  삭제: "deleted",
  삭제됨: "deleted",
};

const ORG_ROLE_STATUS_FILTER_ORDER = [
  "draft",
  "active",
  "paused",
  "ended",
] as const satisfies readonly OrgRoleStatus[];

export const ORG_ROLE_STATUS_FILTER_OPTIONS = ORG_ROLE_STATUS_FILTER_ORDER.map(
  (status) => ({
    status,
    ...ORG_ROLE_STATUS_PRESENTATION[status],
  })
);

export function normalizeOrgRoleStatus(value: unknown): OrgRoleStatus {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return ORG_ROLE_STATUS_VALUES.includes(normalized as OrgRoleStatus)
    ? (normalized as OrgRoleStatus)
    : "active";
}

export function isOrgRoleCountedAsActive(value: unknown) {
  return ORG_ACTIVE_ROLE_COUNTED_STATUSES.has(
    String(value ?? "")
      .trim()
      .toLowerCase()
  );
}

export function hasReachedOrgActiveRoleLimit(
  roles: ReadonlyArray<{ status: unknown }>
) {
  return (
    roles.filter((role) => isOrgRoleCountedAsActive(role.status)).length >=
    ORG_ACTIVE_ROLE_LIMIT
  );
}

export function parseOrgRoleMutationStatus(
  value: unknown
): OrgRoleMutationStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  const aliased = ORG_ROLE_MUTATION_STATUS_ALIASES[normalized] ?? normalized;

  return ORG_ROLE_MUTATION_STATUS_VALUES.includes(
    aliased as OrgRoleMutationStatus
  )
    ? (aliased as OrgRoleMutationStatus)
    : null;
}

export function resolveOrgRoleMutationExpiry(args: {
  isExpired: unknown;
  status: OrgRoleMutationStatus | null | undefined;
}): boolean | undefined {
  if (args.status === "deleted") return true;
  return typeof args.isExpired === "boolean" ? args.isExpired : undefined;
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
  status: OrgRoleMutationStatus;
} {
  if (action === "delete") {
    return { isExpired: true, status: "deleted" };
  }
  return { status: action === "pause" ? "paused" : "active" };
}
