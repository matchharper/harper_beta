import { supabaseServer } from "@/lib/supabaseServer";

const BATCH_SIZE = 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const ACTIVE_ROLE_STATUSES = new Set(["active", "top_priority"]);
const DETAIL_ROLE_STATUSES = new Set(["active", "paused"]);
const ACCEPTED_FEEDBACK_VALUES = new Set([
  "accepted",
  "like",
  "liked",
  "positive",
]);
const REJECTED_FEEDBACK_VALUES = new Set(["dislike", "negative", "rejected"]);

type CompanyWorkspaceRow = {
  company_name: string;
  company_workspace_id: string;
};

type CompanyRoleRow = {
  company_internal_roles:
    | {
        is_auto: boolean | null;
        role_status_changed_at?: string | null;
      }
    | Array<{
        is_auto: boolean | null;
        role_status_changed_at?: string | null;
      }>
    | null;
  company_workspace_id: string;
  created_at?: string | null;
  is_expired: boolean;
  name?: string | null;
  role_id: string;
  source_type: string;
  status: string;
};

type CompanyMembershipRow = {
  company_user_id: string;
  company_workspace_id: string;
  created_at?: string | null;
};

type CompanyEventRow = {
  content: string;
  created_at: string;
  workspace_id: string;
};

type CompanySlackIntegrationRow = {
  company_workspace_id: string;
  status: string;
};

type CompanyMessageRow = {
  company_workspace_id: string;
  created_at: string;
  message_type: string;
  role: string;
};

type CompanyToolMessageRow = {
  company_workspace_id: string;
  created_at: string;
  metadata: unknown;
  status: string | null;
  thinking_logs?: unknown;
};

type LoginLogRow = {
  created_at: string;
  type: string | null;
  user_id: string | null;
};

type RecommendationRow = {
  feedback: string | null;
  feedback_at: string | null;
  id: string;
  role_id: string;
  saved_stage: string | null;
  talent_id: string;
};

type OpportunityTagRow = {
  id: string;
  opportunity_id: string;
  tag: string;
  talent_id: string;
  updated_at: string;
};

type TalentProgressRow = {
  company_user_id: string | null;
  created_at: string;
  kind: string;
  metadata: unknown;
  recommendation_id: string | null;
  role_id: string;
  talent_id: string;
};

type FetchPageResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

export type DailyCompanyUsageKind = "accepted" | "chat" | "rejected" | "slack";

export type DailyCompanyRoleLifecycleEvent = {
  action: "activated" | "created" | "deleted" | "ended" | "paused";
  occurredAt: string;
  roleName: string;
};

export type DailyCompanyToolRow = {
  callCount: number;
  failedCallCount: number;
  name: string;
};

export type DailyCompanyRoleStatsRow = DailyCompanyCandidateStats & {
  roleId: string;
  roleName: string;
  roleStatus: string;
};

export type DailyCompanyStatsRow = {
  acceptedCount: number;
  acceptedTodayCount: number;
  activeRoleCount: number;
  chatTodayCount: number;
  companyName: string;
  companyWorkspaceId: string;
  connectedCount: number;
  connectedTodayCount: number;
  isAuto: boolean;
  isServed: boolean;
  isSlackConnected: boolean;
  latestLoginAt: string | null;
  latestUsageAt: string | null;
  latestUsageKind: DailyCompanyUsageKind | null;
  memberCount: number;
  newMemberTodayCount: number;
  newRoleTodayCount: number;
  pendingConnectionCount: number;
  pendingConnectionTodayCount: number;
  rejectedCount: number;
  rejectedTodayCount: number;
  roleLifecycleEvents: DailyCompanyRoleLifecycleEvent[];
  roleStats: DailyCompanyRoleStatsRow[];
  slackTodayCount: number;
};

export type DailyCompanyCandidateStats = {
  acceptedCount: number;
  connectedCount: number;
  pendingConnectionCount: number;
  rejectedCount: number;
};

export type DailyCompanyStatsTotals = {
  acceptedCount: number;
  acceptedTodayCount: number;
  activeRoleCount: number;
  chatTodayCount: number;
  connectedCount: number;
  connectedTodayCount: number;
  memberCount: number;
  newMemberTodayCount: number;
  newRoleTodayCount: number;
  pendingConnectionCount: number;
  pendingConnectionTodayCount: number;
  rejectedCount: number;
  rejectedTodayCount: number;
  rolling7Day: DailyCompanyCandidateStats;
  slackTodayCount: number;
};

export type DailyCompanyStatsReport = {
  date: string;
  endIso: string;
  failedToolCallCount: number;
  otherCompanies: DailyCompanyStatsRow[];
  servedCompanies: DailyCompanyStatsRow[];
  startIso: string;
  tools: DailyCompanyToolRow[];
  totals: DailyCompanyStatsTotals;
};

export type DailyCompanyStatsSourceRows = {
  events: CompanyEventRow[];
  loginLogs: LoginLogRow[];
  memberships: CompanyMembershipRow[];
  messages: CompanyMessageRow[];
  progress: TalentProgressRow[];
  recommendations: RecommendationRow[];
  roles: CompanyRoleRow[];
  slackIntegrations: CompanySlackIntegrationRow[];
  tags: OpportunityTagRow[];
  toolMessages: CompanyToolMessageRow[];
  workspaces: CompanyWorkspaceRow[];
};

type CurrentCandidateStage =
  | "accepted"
  | "connected"
  | "pending_connection"
  | "rejected";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return text(value).toLowerCase();
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isAcceptedFeedback(value: unknown) {
  return ACCEPTED_FEEDBACK_VALUES.has(normalized(value));
}

function isRejectedFeedback(value: unknown) {
  return REJECTED_FEEDBACK_VALUES.has(normalized(value));
}

function getInternalRoleRows(row: CompanyRoleRow) {
  return Array.isArray(row.company_internal_roles)
    ? row.company_internal_roles
    : row.company_internal_roles
      ? [row.company_internal_roles]
      : [];
}

function isAutoRole(row: CompanyRoleRow) {
  return getInternalRoleRows(row).some(
    (internalRole) => internalRole.is_auto === true
  );
}

function getRoleStatusChangedAt(row: CompanyRoleRow) {
  return getInternalRoleRows(row)
    .map((internalRole) => internalRole.role_status_changed_at)
    .find((value): value is string => Boolean(value));
}

function roleLifecycleActionFromStatus(
  value: unknown
): DailyCompanyRoleLifecycleEvent["action"] | null {
  const status = normalized(value);
  if (status === "active" || status === "top_priority") return "activated";
  if (status === "paused" || status === "on_hold") return "paused";
  if (
    ["ended", "closed", "expired", "inactive", "stopped", "deleted"].includes(
      status
    )
  ) {
    return "ended";
  }
  return null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lifecycleActionFromEventContent(
  content: string,
  roleName: string
): DailyCompanyRoleLifecycleEvent["action"] | null {
  const role = escapeRegExp(roleName);
  if (!role) return null;

  if (
    new RegExp(
      `${role}\\.is_expired:\\s*-\\s*(?:false|"false")\\s*\\+\\s*(?:true|"true")`,
      "i"
    ).test(content)
  ) {
    return "deleted";
  }

  const statusChange = content.match(
    new RegExp(
      `${role}\\.status:\\s*-\\s*(?:"[^"]*"|[^+;]+)\\s*\\+\\s*"?([^";\\s]+)`,
      "i"
    )
  );
  const statusAction = roleLifecycleActionFromStatus(statusChange?.[1]);
  if (statusAction) return statusAction;

  const koreanStatusChange = content.match(
    new RegExp(`${role}\\s*역할\\s*상태:\\s*([^;]+)`, "i")
  );
  const koreanStatus = normalized(koreanStatusChange?.[1]);
  if (koreanStatus.includes("진행")) return "activated";
  if (koreanStatus.includes("중단") || koreanStatus.includes("일시 중지")) {
    return "paused";
  }
  if (koreanStatus.includes("종료") || koreanStatus.includes("정지")) {
    return "ended";
  }
  return null;
}

function buildRoleLifecycleEvents(args: {
  endIso: string;
  events: CompanyEventRow[];
  roles: CompanyRoleRow[];
  startIso: string;
  workspaceId: string;
}) {
  const events: DailyCompanyRoleLifecycleEvent[] = [];
  const addedKeys = new Set<string>();
  const addEvent = (event: DailyCompanyRoleLifecycleEvent) => {
    const key = `${event.action}:${event.roleName}:${event.occurredAt}`;
    if (addedKeys.has(key)) return;
    addedKeys.add(key);
    events.push(event);
  };
  const roles = args.roles.filter(
    (role) => text(role.company_workspace_id) === args.workspaceId
  );

  for (const role of roles) {
    const roleName = text(role.name) || "이름 없는 역할";
    if (isInRange(role.created_at, args.startIso, args.endIso)) {
      addEvent({
        action: "created",
        occurredAt: text(role.created_at),
        roleName,
      });
    }

    const matchingEvents = args.events.filter(
      (event) =>
        text(event.workspace_id) === args.workspaceId &&
        isInRange(event.created_at, args.startIso, args.endIso) &&
        event.content.includes(roleName)
    );
    for (const event of matchingEvents) {
      const action = lifecycleActionFromEventContent(event.content, roleName);
      if (!action) continue;
      addEvent({ action, occurredAt: event.created_at, roleName });
    }

    if (
      matchingEvents.some((event) =>
        lifecycleActionFromEventContent(event.content, roleName)
      )
    ) {
      continue;
    }
    const statusChangedAt = getRoleStatusChangedAt(role);
    const action = roleLifecycleActionFromStatus(role.status);
    if (
      action &&
      statusChangedAt &&
      !isInRange(role.created_at, args.startIso, args.endIso) &&
      isInRange(statusChangedAt, args.startIso, args.endIso)
    ) {
      addEvent({ action, occurredAt: statusChangedAt, roleName });
    }
  }

  return events.sort((left, right) => {
    const byTime = left.occurredAt.localeCompare(right.occurredAt);
    return byTime || left.roleName.localeCompare(right.roleName, "ko");
  });
}

function buildCompanyToolRows(args: {
  endIso: string;
  startIso: string;
  toolMessages: CompanyToolMessageRow[];
}) {
  const tools = new Map<string, DailyCompanyToolRow>();
  const addTool = (name: string, failed: boolean) => {
    if (!name) return;
    const current = tools.get(name) ?? {
      callCount: 0,
      failedCallCount: 0,
      name,
    };
    current.callCount += 1;
    if (failed) current.failedCallCount += 1;
    tools.set(name, current);
  };
  for (const message of args.toolMessages) {
    if (!isInRange(message.created_at, args.startIso, args.endIso)) continue;
    const metadata = getRecord(message.metadata);
    const toolResults = metadata.toolResults;
    if (Array.isArray(toolResults)) {
      for (const toolResult of toolResults) {
        const result = getRecord(toolResult);
        addTool(text(result.name), normalized(result.status) === "error");
      }
      continue;
    }
    if (text(metadata.source) !== "org_role_creation_assistant") continue;
    const thinkingLogs = Array.isArray(message.thinking_logs)
      ? message.thinking_logs
      : [];
    for (const thinkingLog of thinkingLogs) {
      const log = getRecord(thinkingLog);
      const label = text(log.label);
      if (!label) continue;
      addTool(
        roleCreationToolNameFromThinkingLabel(label),
        normalized(log.status) === "error"
      );
    }
  }
  return Array.from(tools.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

function roleCreationToolNameFromThinkingLabel(label: string) {
  if (label.includes("역할 설명 참고자료")) {
    return "research_role_description_sources";
  }
  if (label.includes("이전 역할 기준")) return "read_other_roles";
  if (label.includes("알림 채널과 담당자")) return "set_role_notification";
  if (label.includes("완료 조건")) return "request_role_creation_confirmation";
  if (label.includes("역할 등록")) return "confirm_pending_role_creation";
  if (label.includes("회사 정보")) return "update_company_context";
  if (label.includes("링크")) return "open_url";
  if (label.includes("웹")) return "web_search";
  return "update_role_draft";
}

function getKstDayRange(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("date must be YYYY-MM-DD");
  }
  const start = new Date(`${date}T00:00:00+09:00`);
  if (!Number.isFinite(start.getTime())) {
    throw new Error("date must be YYYY-MM-DD");
  }
  const end = new Date(start.getTime() + DAY_MS);
  return { endIso: end.toISOString(), startIso: start.toISOString() };
}

function getRolling7DayStartIso(startIso: string) {
  return new Date(new Date(startIso).getTime() - 6 * DAY_MS).toISOString();
}

function isInRange(
  value: string | null | undefined,
  startIso: string,
  endIso: string
) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return (
    Number.isFinite(timestamp) &&
    timestamp >= new Date(startIso).getTime() &&
    timestamp < new Date(endIso).getTime()
  );
}

function setLatestUsage(
  map: Map<string, { at: string; kind: DailyCompanyUsageKind }>,
  workspaceId: string,
  at: string,
  kind: DailyCompanyUsageKind
) {
  if (!workspaceId || !at) return;
  const timestamp = new Date(at).getTime();
  if (!Number.isFinite(timestamp)) return;
  const current = map.get(workspaceId);
  if (!current || timestamp > new Date(current.at).getTime()) {
    map.set(workspaceId, { at, kind });
  }
}

function setLatestTimestamp(
  map: Map<string, string>,
  workspaceId: string,
  at: string
) {
  if (!workspaceId || !at) return;
  const timestamp = new Date(at).getTime();
  if (!Number.isFinite(timestamp)) return;
  const current = map.get(workspaceId);
  if (!current || timestamp > new Date(current).getTime()) {
    map.set(workspaceId, at);
  }
}

function talentRoleKey(talentId: string, roleId: string) {
  return `${talentId}:${roleId}`;
}

function workspaceTalentKey(workspaceId: string, talentId: string) {
  return `${workspaceId}:${talentId}`;
}

function getStageFromTag(
  value: unknown
): CurrentCandidateStage | "inactive" | null {
  const tag = normalized(value).replace(/\s+/g, "");
  if (!tag) return null;
  if (tag === "내부:수락") return "accepted";
  if (tag === "내부:연결대기") return "pending_connection";
  if (tag === "내부:거절") return "rejected";
  if (
    tag === "내부:연결됨" ||
    tag === "내부:최종오퍼" ||
    tag.startsWith("내부단계:")
  ) {
    return "connected";
  }
  if (
    tag === "내부:아카이브" ||
    tag === "내부:보류" ||
    tag === "내부:추천" ||
    tag === "내부:프로세스중단"
  ) {
    return "inactive";
  }
  return null;
}

function chooseCandidateStage(
  current: CurrentCandidateStage | undefined,
  next: CurrentCandidateStage
) {
  const rank: Record<CurrentCandidateStage, number> = {
    accepted: 1,
    pending_connection: 2,
    connected: 3,
    rejected: 0,
  };
  return !current || rank[next] > rank[current] ? next : current;
}

function resolveRecommendationStage(args: {
  connectedRecommendationIds: ReadonlySet<string>;
  recommendation: RecommendationRow;
  tagsByTalentRole: ReadonlyMap<string, OpportunityTagRow[]>;
}): CurrentCandidateStage | null {
  const { recommendation } = args;
  const tags =
    args.tagsByTalentRole.get(
      talentRoleKey(recommendation.talent_id, recommendation.role_id)
    ) ?? [];
  const currentTagStage = tags
    .map((row) => getStageFromTag(row.tag))
    .find((stage) => stage !== null);

  if (currentTagStage === "inactive") return null;
  if (currentTagStage === "accepted") {
    return args.connectedRecommendationIds.has(recommendation.id)
      ? "connected"
      : "accepted";
  }
  if (currentTagStage) return currentTagStage;

  const savedStage = normalized(recommendation.saved_stage);
  if (savedStage === "pending_connection") return "pending_connection";
  if (savedStage === "closed" || savedStage === "hidden") return null;
  if (
    savedStage === "rejected" ||
    isRejectedFeedback(recommendation.feedback)
  ) {
    return "rejected";
  }
  if (
    savedStage === "accepted" ||
    isAcceptedFeedback(recommendation.feedback)
  ) {
    return args.connectedRecommendationIds.has(recommendation.id)
      ? "connected"
      : "accepted";
  }
  if (savedStage === "connected") return "connected";
  return null;
}

function sortCompanyRows(rows: DailyCompanyStatsRow[]) {
  return rows.sort((left, right) =>
    left.companyName.localeCompare(right.companyName, "ko")
  );
}

function sortRoleStats(rows: DailyCompanyRoleStatsRow[]) {
  const statusRank = new Map([
    ["active", 0],
    ["paused", 1],
  ]);
  return rows.sort((left, right) => {
    const byStatus =
      (statusRank.get(left.roleStatus) ?? 2) -
      (statusRank.get(right.roleStatus) ?? 2);
    return byStatus || left.roleName.localeCompare(right.roleName, "ko");
  });
}

export function compileDailyCompanyStatsReport(args: {
  date: string;
  rows: DailyCompanyStatsSourceRows;
}): DailyCompanyStatsReport {
  const { endIso, startIso } = getKstDayRange(args.date);
  const rolling7DayStartIso = getRolling7DayStartIso(startIso);
  const workspaceIds = new Set(
    args.rows.workspaces.map((row) => text(row.company_workspace_id))
  );
  const internalRoles = args.rows.roles.filter(
    (row) =>
      normalized(row.source_type) === "internal" &&
      workspaceIds.has(text(row.company_workspace_id))
  );
  const roleWorkspaceId = new Map(
    internalRoles.map((row) => [
      text(row.role_id),
      text(row.company_workspace_id),
    ])
  );

  const membersByWorkspaceId = new Map<string, Set<string>>();
  const newMembersTodayByWorkspaceId = new Map<string, Set<string>>();
  const workspaceIdsByMemberId = new Map<string, Set<string>>();
  for (const row of args.rows.memberships) {
    const workspaceId = text(row.company_workspace_id);
    const userId = text(row.company_user_id);
    if (!workspaceIds.has(workspaceId) || !userId) continue;
    const members = membersByWorkspaceId.get(workspaceId) ?? new Set<string>();
    members.add(userId);
    membersByWorkspaceId.set(workspaceId, members);
    const memberWorkspaces =
      workspaceIdsByMemberId.get(userId) ?? new Set<string>();
    memberWorkspaces.add(workspaceId);
    workspaceIdsByMemberId.set(userId, memberWorkspaces);
    if (isInRange(row.created_at, startIso, endIso)) {
      const newMembers =
        newMembersTodayByWorkspaceId.get(workspaceId) ?? new Set<string>();
      newMembers.add(userId);
      newMembersTodayByWorkspaceId.set(workspaceId, newMembers);
    }
  }

  const slackWorkspaceIds = new Set(
    args.rows.slackIntegrations
      .filter((row) => normalized(row.status) === "active")
      .map((row) => text(row.company_workspace_id))
      .filter((workspaceId) => workspaceIds.has(workspaceId))
  );

  const activeRoleCountByWorkspaceId = new Map<string, number>();
  const autoWorkspaceIds = new Set<string>();
  const newRolesTodayByWorkspaceId = new Map<string, Set<string>>();
  for (const role of internalRoles) {
    const workspaceId = text(role.company_workspace_id);
    if (!role.is_expired && ACTIVE_ROLE_STATUSES.has(normalized(role.status))) {
      activeRoleCountByWorkspaceId.set(
        workspaceId,
        (activeRoleCountByWorkspaceId.get(workspaceId) ?? 0) + 1
      );
    }
    if (isAutoRole(role)) autoWorkspaceIds.add(workspaceId);
    if (isInRange(role.created_at, startIso, endIso)) {
      const newRoles =
        newRolesTodayByWorkspaceId.get(workspaceId) ?? new Set<string>();
      newRoles.add(text(role.role_id));
      newRolesTodayByWorkspaceId.set(workspaceId, newRoles);
    }
  }

  const sortedTags = [...args.rows.tags].sort((left, right) => {
    const updated = text(right.updated_at).localeCompare(text(left.updated_at));
    return updated || text(right.id).localeCompare(text(left.id));
  });
  const tagsByTalentRole = new Map<string, OpportunityTagRow[]>();
  for (const tag of sortedTags) {
    if (!roleWorkspaceId.has(text(tag.opportunity_id))) continue;
    const key = talentRoleKey(text(tag.talent_id), text(tag.opportunity_id));
    const rows = tagsByTalentRole.get(key) ?? [];
    rows.push(tag);
    tagsByTalentRole.set(key, rows);
  }

  const connectedRecommendationIds = new Set<string>();
  for (const row of args.rows.progress) {
    if (
      normalized(row.kind) === "org_stage_change" &&
      normalized(getRecord(row.metadata).stage) === "connected" &&
      row.recommendation_id
    ) {
      connectedRecommendationIds.add(text(row.recommendation_id));
    }
  }

  const candidateStageByWorkspaceTalent = new Map<
    string,
    CurrentCandidateStage
  >();
  const candidateStageByTalentRole = new Map<string, CurrentCandidateStage>();
  const acceptedTodayByWorkspaceId = new Map<string, Set<string>>();
  const rejectedTodayByWorkspaceId = new Map<string, Set<string>>();
  const rolling7DayAcceptedByWorkspaceId = new Map<string, Set<string>>();
  const rolling7DayRejectedByWorkspaceId = new Map<string, Set<string>>();
  for (const recommendation of args.rows.recommendations) {
    const workspaceId = roleWorkspaceId.get(text(recommendation.role_id));
    const talentId = text(recommendation.talent_id);
    if (!workspaceId || !talentId) continue;

    const stage = resolveRecommendationStage({
      connectedRecommendationIds,
      recommendation,
      tagsByTalentRole,
    });
    if (stage) {
      const workspaceKey = workspaceTalentKey(workspaceId, talentId);
      candidateStageByWorkspaceTalent.set(
        workspaceKey,
        chooseCandidateStage(
          candidateStageByWorkspaceTalent.get(workspaceKey),
          stage
        )
      );
      const roleKey = talentRoleKey(talentId, text(recommendation.role_id));
      candidateStageByTalentRole.set(
        roleKey,
        chooseCandidateStage(candidateStageByTalentRole.get(roleKey), stage)
      );
    }

    if (isAcceptedFeedback(recommendation.feedback)) {
      if (isInRange(recommendation.feedback_at, startIso, endIso)) {
        const acceptedToday =
          acceptedTodayByWorkspaceId.get(workspaceId) ?? new Set<string>();
        acceptedToday.add(talentId);
        acceptedTodayByWorkspaceId.set(workspaceId, acceptedToday);
      }
      if (isInRange(recommendation.feedback_at, rolling7DayStartIso, endIso)) {
        const rolling7DayAccepted =
          rolling7DayAcceptedByWorkspaceId.get(workspaceId) ??
          new Set<string>();
        rolling7DayAccepted.add(talentId);
        rolling7DayAcceptedByWorkspaceId.set(workspaceId, rolling7DayAccepted);
      }
    }
    if (isRejectedFeedback(recommendation.feedback)) {
      if (isInRange(recommendation.feedback_at, startIso, endIso)) {
        const rejectedToday =
          rejectedTodayByWorkspaceId.get(workspaceId) ?? new Set<string>();
        rejectedToday.add(talentId);
        rejectedTodayByWorkspaceId.set(workspaceId, rejectedToday);
      }
      if (isInRange(recommendation.feedback_at, rolling7DayStartIso, endIso)) {
        const rolling7DayRejected =
          rolling7DayRejectedByWorkspaceId.get(workspaceId) ??
          new Set<string>();
        rolling7DayRejected.add(talentId);
        rolling7DayRejectedByWorkspaceId.set(workspaceId, rolling7DayRejected);
      }
    }
  }

  const connectedTodayByWorkspaceId = new Map<string, Set<string>>();
  const rolling7DayConnectedByWorkspaceId = new Map<string, Set<string>>();
  const pendingConnectionTodayByWorkspaceId = new Map<string, Set<string>>();
  const rolling7DayPendingConnectionByWorkspaceId = new Map<
    string,
    Set<string>
  >();
  const latestUsageByWorkspaceId = new Map<
    string,
    { at: string; kind: DailyCompanyUsageKind }
  >();
  for (const row of args.rows.progress) {
    if (normalized(row.kind) !== "org_stage_change") continue;
    const workspaceId = roleWorkspaceId.get(text(row.role_id));
    const talentId = text(row.talent_id);
    if (!workspaceId || !talentId) continue;
    const stage = normalized(getRecord(row.metadata).stage);
    if (stage === "connected" && isInRange(row.created_at, startIso, endIso)) {
      const connectedToday =
        connectedTodayByWorkspaceId.get(workspaceId) ?? new Set<string>();
      connectedToday.add(talentId);
      connectedTodayByWorkspaceId.set(workspaceId, connectedToday);
    }
    if (
      stage === "connected" &&
      isInRange(row.created_at, rolling7DayStartIso, endIso)
    ) {
      const rolling7DayConnected =
        rolling7DayConnectedByWorkspaceId.get(workspaceId) ?? new Set<string>();
      rolling7DayConnected.add(talentId);
      rolling7DayConnectedByWorkspaceId.set(workspaceId, rolling7DayConnected);
    }
    if (
      stage === "pending_connection" &&
      isInRange(row.created_at, startIso, endIso)
    ) {
      const pendingToday =
        pendingConnectionTodayByWorkspaceId.get(workspaceId) ??
        new Set<string>();
      pendingToday.add(talentId);
      pendingConnectionTodayByWorkspaceId.set(workspaceId, pendingToday);
    }
    if (
      stage === "pending_connection" &&
      isInRange(row.created_at, rolling7DayStartIso, endIso)
    ) {
      const rolling7DayPending =
        rolling7DayPendingConnectionByWorkspaceId.get(workspaceId) ??
        new Set<string>();
      rolling7DayPending.add(talentId);
      rolling7DayPendingConnectionByWorkspaceId.set(
        workspaceId,
        rolling7DayPending
      );
    }
    if (
      row.company_user_id &&
      (stage === "connected" || stage === "process_stopped")
    ) {
      setLatestUsage(
        latestUsageByWorkspaceId,
        workspaceId,
        row.created_at,
        stage === "connected" ? "accepted" : "rejected"
      );
    }
  }

  const chatsTodayByWorkspaceId = new Map<
    string,
    { chat: number; slack: number }
  >();
  for (const row of args.rows.messages) {
    const workspaceId = text(row.company_workspace_id);
    const messageType = normalized(row.message_type);
    if (
      !workspaceIds.has(workspaceId) ||
      normalized(row.role) !== "user" ||
      (messageType !== "chat" && messageType !== "slack")
    ) {
      continue;
    }
    setLatestUsage(
      latestUsageByWorkspaceId,
      workspaceId,
      row.created_at,
      messageType as "chat" | "slack"
    );
    if (isInRange(row.created_at, startIso, endIso)) {
      const chats = chatsTodayByWorkspaceId.get(workspaceId) ?? {
        chat: 0,
        slack: 0,
      };
      if (messageType === "chat") chats.chat += 1;
      else chats.slack += 1;
      chatsTodayByWorkspaceId.set(workspaceId, chats);
    }
  }

  const latestLoginByWorkspaceId = new Map<string, string>();
  for (const row of args.rows.loginLogs) {
    if (normalized(row.type) !== "login_completed" || !row.user_id) continue;
    for (const workspaceId of workspaceIdsByMemberId.get(text(row.user_id)) ??
      []) {
      setLatestTimestamp(latestLoginByWorkspaceId, workspaceId, row.created_at);
    }
  }

  const candidateCountsByWorkspaceId = new Map<
    string,
    { accepted: number; connected: number; pending: number; rejected: number }
  >();
  for (const [key, stage] of candidateStageByWorkspaceTalent) {
    const separator = key.lastIndexOf(":");
    const workspaceId = key.slice(0, separator);
    const counts = candidateCountsByWorkspaceId.get(workspaceId) ?? {
      accepted: 0,
      connected: 0,
      pending: 0,
      rejected: 0,
    };
    if (stage === "accepted") counts.accepted += 1;
    else if (stage === "pending_connection") counts.pending += 1;
    else if (stage === "rejected") counts.rejected += 1;
    else counts.connected += 1;
    candidateCountsByWorkspaceId.set(workspaceId, counts);
  }

  const acceptedTalentIdsByWorkspaceId = new Map<string, Set<string>>();
  const candidateCountsByRoleId = new Map<
    string,
    { accepted: number; connected: number; pending: number; rejected: number }
  >();
  for (const [key, stage] of candidateStageByTalentRole) {
    const separator = key.lastIndexOf(":");
    const talentId = key.slice(0, separator);
    const roleId = key.slice(separator + 1);
    const workspaceId = roleWorkspaceId.get(roleId);
    if (!workspaceId) continue;

    if (stage === "accepted") {
      const acceptedTalents =
        acceptedTalentIdsByWorkspaceId.get(workspaceId) ?? new Set<string>();
      acceptedTalents.add(talentId);
      acceptedTalentIdsByWorkspaceId.set(workspaceId, acceptedTalents);
    }

    const counts = candidateCountsByRoleId.get(roleId) ?? {
      accepted: 0,
      connected: 0,
      pending: 0,
      rejected: 0,
    };
    if (stage === "accepted") counts.accepted += 1;
    else if (stage === "pending_connection") counts.pending += 1;
    else if (stage === "rejected") counts.rejected += 1;
    else counts.connected += 1;
    candidateCountsByRoleId.set(roleId, counts);
  }

  for (const [workspaceId, acceptedTalents] of acceptedTalentIdsByWorkspaceId) {
    const counts = candidateCountsByWorkspaceId.get(workspaceId) ?? {
      accepted: 0,
      connected: 0,
      pending: 0,
      rejected: 0,
    };
    counts.accepted = acceptedTalents.size;
    candidateCountsByWorkspaceId.set(workspaceId, counts);
  }

  const allCompanies = args.rows.workspaces.map((workspace) => {
    const workspaceId = text(workspace.company_workspace_id);
    const memberCount = membersByWorkspaceId.get(workspaceId)?.size ?? 0;
    const isAuto = autoWorkspaceIds.has(workspaceId);
    const isSlackConnected = slackWorkspaceIds.has(workspaceId);
    const usage = latestUsageByWorkspaceId.get(workspaceId);
    const counts = candidateCountsByWorkspaceId.get(workspaceId) ?? {
      accepted: 0,
      connected: 0,
      pending: 0,
      rejected: 0,
    };
    const chatsToday = chatsTodayByWorkspaceId.get(workspaceId) ?? {
      chat: 0,
      slack: 0,
    };
    return {
      acceptedCount: counts.accepted,
      acceptedTodayCount:
        acceptedTodayByWorkspaceId.get(workspaceId)?.size ?? 0,
      activeRoleCount: activeRoleCountByWorkspaceId.get(workspaceId) ?? 0,
      chatTodayCount: chatsToday.chat,
      companyName: text(workspace.company_name) || "회사명 없음",
      companyWorkspaceId: workspaceId,
      connectedCount: counts.connected,
      connectedTodayCount:
        connectedTodayByWorkspaceId.get(workspaceId)?.size ?? 0,
      isAuto,
      isServed: isSlackConnected || (isAuto && memberCount > 0),
      isSlackConnected,
      latestLoginAt: latestLoginByWorkspaceId.get(workspaceId) ?? null,
      latestUsageAt: usage?.at ?? null,
      latestUsageKind: usage?.kind ?? null,
      memberCount,
      newMemberTodayCount:
        newMembersTodayByWorkspaceId.get(workspaceId)?.size ?? 0,
      newRoleTodayCount: newRolesTodayByWorkspaceId.get(workspaceId)?.size ?? 0,
      pendingConnectionCount: counts.pending,
      pendingConnectionTodayCount:
        pendingConnectionTodayByWorkspaceId.get(workspaceId)?.size ?? 0,
      rejectedCount: counts.rejected,
      rejectedTodayCount:
        rejectedTodayByWorkspaceId.get(workspaceId)?.size ?? 0,
      roleLifecycleEvents: buildRoleLifecycleEvents({
        endIso,
        events: args.rows.events,
        roles: internalRoles,
        startIso,
        workspaceId,
      }),
      roleStats: sortRoleStats(
        internalRoles
          .filter(
            (role) =>
              text(role.company_workspace_id) === workspaceId &&
              !role.is_expired &&
              DETAIL_ROLE_STATUSES.has(normalized(role.status))
          )
          .map((role) => {
            const roleCounts = candidateCountsByRoleId.get(
              text(role.role_id)
            ) ?? {
              accepted: 0,
              connected: 0,
              pending: 0,
              rejected: 0,
            };
            return {
              acceptedCount: roleCounts.accepted,
              connectedCount: roleCounts.connected,
              pendingConnectionCount: roleCounts.pending,
              rejectedCount: roleCounts.rejected,
              roleId: text(role.role_id),
              roleName: text(role.name) || "이름 없는 역할",
              roleStatus: normalized(role.status),
            } satisfies DailyCompanyRoleStatsRow;
          })
      ),
      slackTodayCount: chatsToday.slack,
    } satisfies DailyCompanyStatsRow;
  });

  const tools = buildCompanyToolRows({
    endIso,
    startIso,
    toolMessages: args.rows.toolMessages,
  });
  const totals = allCompanies.reduce<DailyCompanyStatsTotals>(
    (current, company) => ({
      acceptedCount: current.acceptedCount + company.acceptedCount,
      acceptedTodayCount:
        current.acceptedTodayCount + company.acceptedTodayCount,
      activeRoleCount: current.activeRoleCount + company.activeRoleCount,
      chatTodayCount: current.chatTodayCount + company.chatTodayCount,
      connectedCount: current.connectedCount + company.connectedCount,
      connectedTodayCount:
        current.connectedTodayCount + company.connectedTodayCount,
      memberCount: current.memberCount + company.memberCount,
      newMemberTodayCount:
        current.newMemberTodayCount + company.newMemberTodayCount,
      newRoleTodayCount: current.newRoleTodayCount + company.newRoleTodayCount,
      pendingConnectionCount:
        current.pendingConnectionCount + company.pendingConnectionCount,
      pendingConnectionTodayCount:
        current.pendingConnectionTodayCount +
        company.pendingConnectionTodayCount,
      rejectedCount: current.rejectedCount + company.rejectedCount,
      rejectedTodayCount:
        current.rejectedTodayCount + company.rejectedTodayCount,
      rolling7Day: {
        acceptedCount:
          current.rolling7Day.acceptedCount +
          (rolling7DayAcceptedByWorkspaceId.get(company.companyWorkspaceId)
            ?.size ?? 0),
        connectedCount:
          current.rolling7Day.connectedCount +
          (rolling7DayConnectedByWorkspaceId.get(company.companyWorkspaceId)
            ?.size ?? 0),
        pendingConnectionCount:
          current.rolling7Day.pendingConnectionCount +
          (rolling7DayPendingConnectionByWorkspaceId.get(
            company.companyWorkspaceId
          )?.size ?? 0),
        rejectedCount:
          current.rolling7Day.rejectedCount +
          (rolling7DayRejectedByWorkspaceId.get(company.companyWorkspaceId)
            ?.size ?? 0),
      },
      slackTodayCount: current.slackTodayCount + company.slackTodayCount,
    }),
    {
      acceptedCount: 0,
      acceptedTodayCount: 0,
      activeRoleCount: 0,
      chatTodayCount: 0,
      connectedCount: 0,
      connectedTodayCount: 0,
      memberCount: 0,
      newMemberTodayCount: 0,
      newRoleTodayCount: 0,
      pendingConnectionCount: 0,
      pendingConnectionTodayCount: 0,
      rejectedCount: 0,
      rejectedTodayCount: 0,
      rolling7Day: {
        acceptedCount: 0,
        connectedCount: 0,
        pendingConnectionCount: 0,
        rejectedCount: 0,
      },
      slackTodayCount: 0,
    }
  );

  return {
    date: args.date,
    endIso,
    failedToolCallCount: tools.reduce(
      (count, tool) => count + tool.failedCallCount,
      0
    ),
    otherCompanies: sortCompanyRows(
      allCompanies.filter((company) => !company.isServed)
    ),
    servedCompanies: sortCompanyRows(
      allCompanies.filter((company) => company.isServed)
    ),
    startIso,
    tools,
    totals,
  };
}

async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<FetchPageResult<T>>
) {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await loadPage(from, from + BATCH_SIZE - 1);
    if (error) throw new Error(error.message ?? "Failed to load company stats");
    const page = data ?? [];
    rows.push(...page);
    if (page.length < BATCH_SIZE) return rows;
    from += BATCH_SIZE;
  }
}

export async function buildDailyCompanyStatsReport(
  date: string
): Promise<DailyCompanyStatsReport> {
  const { endIso, startIso } = getKstDayRange(date);
  const workspaces = await fetchAllRows<CompanyWorkspaceRow>((from, to) =>
    supabaseServer
      .from("company_workspace")
      .select("company_workspace_id,company_name")
      .eq("is_internal", true)
      .order("company_name", { ascending: true })
      .range(from, to)
  );
  const workspaceIds = workspaces.map((row) => row.company_workspace_id);
  if (workspaceIds.length === 0) {
    return compileDailyCompanyStatsReport({
      date,
      rows: {
        events: [],
        loginLogs: [],
        memberships: [],
        messages: [],
        progress: [],
        recommendations: [],
        roles: [],
        slackIntegrations: [],
        tags: [],
        toolMessages: [],
        workspaces,
      },
    });
  }

  const [
    roles,
    memberships,
    slackIntegrations,
    messages,
    events,
    toolMessages,
  ] = await Promise.all([
    fetchAllRows<CompanyRoleRow>((from, to) =>
      (supabaseServer.from("company_roles") as any)
        .select(
          "role_id,company_workspace_id,name,status,is_expired,source_type,created_at,company_internal_roles(is_auto,role_status_changed_at)"
        )
        .in("company_workspace_id", workspaceIds)
        .eq("source_type", "internal")
        .range(from, to)
    ),
    fetchAllRows<CompanyMembershipRow>((from, to) =>
      supabaseServer
        .from("company_user_workspace")
        .select("company_workspace_id,company_user_id,created_at")
        .in("company_workspace_id", workspaceIds)
        .range(from, to)
    ),
    fetchAllRows<CompanySlackIntegrationRow>((from, to) =>
      supabaseServer
        .from("company_slack_integrations")
        .select("company_workspace_id,status")
        .in("company_workspace_id", workspaceIds)
        .range(from, to)
    ),
    fetchAllRows<CompanyMessageRow>((from, to) =>
      supabaseServer
        .from("company_messages")
        .select("company_workspace_id,role,message_type,created_at")
        .in("company_workspace_id", workspaceIds)
        .eq("role", "user")
        .in("message_type", ["chat", "slack"])
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    fetchAllRows<CompanyEventRow>((from, to) =>
      supabaseServer
        .from("company_events")
        .select("workspace_id,content,created_at")
        .in("workspace_id", workspaceIds)
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<CompanyToolMessageRow>((from, to) =>
      supabaseServer
        .from("company_messages")
        .select("company_workspace_id,created_at,metadata,status,thinking_logs")
        .in("company_workspace_id", workspaceIds)
        .eq("role", "assistant")
        .in("message_type", ["chat", "slack"])
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .range(from, to)
    ),
  ]);

  const roleIds = roles.map((row) => row.role_id);
  const memberIds = Array.from(
    new Set(memberships.map((row) => text(row.company_user_id)).filter(Boolean))
  );
  const [recommendations, tags, progress, loginLogs] = await Promise.all([
    roleIds.length > 0
      ? fetchAllRows<RecommendationRow>((from, to) =>
          supabaseServer
            .from("talent_opportunity_recommendation")
            .select("id,talent_id,role_id,feedback,feedback_at,saved_stage")
            .in("role_id", roleIds)
            .order("id", { ascending: true })
            .range(from, to)
        )
      : Promise.resolve([]),
    roleIds.length > 0
      ? fetchAllRows<OpportunityTagRow>((from, to) =>
          supabaseServer
            .from("talent_opportunity_tag")
            .select("id,talent_id,opportunity_id,tag,updated_at")
            .in("opportunity_id", roleIds)
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to)
        )
      : Promise.resolve([]),
    roleIds.length > 0
      ? fetchAllRows<TalentProgressRow>((from, to) =>
          supabaseServer
            .from("talent_progress")
            .select(
              "company_user_id,created_at,kind,metadata,recommendation_id,role_id,talent_id"
            )
            .in("role_id", roleIds)
            .eq("kind", "org_stage_change")
            .order("created_at", { ascending: false })
            .range(from, to)
        )
      : Promise.resolve([]),
    memberIds.length > 0
      ? fetchAllRows<LoginLogRow>((from, to) =>
          supabaseServer
            .from("logs")
            .select("user_id,type,created_at")
            .in("user_id", memberIds)
            .eq("type", "login_completed")
            .order("created_at", { ascending: false })
            .range(from, to)
        )
      : Promise.resolve([]),
  ]);

  return compileDailyCompanyStatsReport({
    date,
    rows: {
      events,
      loginLogs,
      memberships,
      messages,
      progress,
      recommendations,
      roles,
      slackIntegrations,
      tags,
      toolMessages,
      workspaces,
    },
  });
}

function escapeSlackText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function companyJobsUrl(companyWorkspaceId: string, roleId = "all") {
  return `https://matchharper.com/org/jobs?orgId=${encodeURIComponent(
    companyWorkspaceId
  )}&roleId=${encodeURIComponent(roleId)}`;
}

function companyConversationsUrl(companyWorkspaceId: string) {
  return `https://matchharper.com/ops/company?workspaceId=${encodeURIComponent(
    companyWorkspaceId
  )}&tab=conversations`;
}

function formatAcceptedLink(company: DailyCompanyStatsRow) {
  return `<${companyJobsUrl(company.companyWorkspaceId)}|수락 ${company.acceptedCount}>`;
}

function formatCompanyLine(company: DailyCompanyStatsRow) {
  const prefix = `• ${escapeSlackText(company.companyName)} — `;
  const details = [
    formatAcceptedLink(company),
    `연결 대기 ${company.pendingConnectionCount}`,
    `진행 중 ${company.connectedCount}`,
    `거절 ${company.rejectedCount}`,
  ];
  return `${prefix}${details.join(" · ")}`;
}

function formatRoleStatsLine(
  company: DailyCompanyStatsRow,
  role: DailyCompanyRoleStatsRow
) {
  const acceptedLink = `<${companyJobsUrl(
    company.companyWorkspaceId,
    role.roleId
  )}|수락 ${role.acceptedCount}>`;
  const details = [
    acceptedLink,
    `연결 대기 ${role.pendingConnectionCount}`,
    `진행 중 ${role.connectedCount}`,
    `거절 ${role.rejectedCount}`,
  ];
  return `  • ${escapeSlackText(role.roleName)} (${escapeSlackText(
    role.roleStatus
  )}) — ${details.join(" · ")}`;
}

export function formatDailyCompanyStatsSlackMessage(
  report: DailyCompanyStatsReport
) {
  const servedLines =
    report.servedCompanies.length > 0
      ? report.servedCompanies.map(formatCompanyLine)
      : ["• 없음"];
  const otherLines =
    report.otherCompanies.length > 0
      ? report.otherCompanies.map(formatCompanyLine)
      : ["• 없음"];
  return [
    `🏢 [Daily Company Stats] ${report.date}`,
    "",
    "*전체*",
    `- 채팅 수: Slack ${report.totals.slackTodayCount}개 · web ${report.totals.chatTodayCount}개`,
    `- 전체 멤버 수: ${report.totals.memberCount}명 (+오늘 ${report.totals.newMemberTodayCount}명)`,
    `- 전체 active 상태 역할 수: ${report.totals.activeRoleCount}개 (+오늘 새 역할 ${report.totals.newRoleTodayCount}개)`,
    `- 전체 후보 상태: 수락자 ${report.totals.acceptedCount}명 · 연결 대기 ${report.totals.pendingConnectionCount}명 · 진행 중 ${report.totals.connectedCount}명 · 거절 ${report.totals.rejectedCount}명`,
    `- 오늘 신규 전환: 수락자 ${report.totals.acceptedTodayCount}명 · 연결 대기 ${report.totals.pendingConnectionTodayCount}명 · 연결됨 ${report.totals.connectedTodayCount}명 · 거절 ${report.totals.rejectedTodayCount}명`,
    `- 지난 7일 신규 전환: 수락자 ${report.totals.rolling7Day.acceptedCount}명 · 연결 대기 ${report.totals.rolling7Day.pendingConnectionCount}명 · 연결됨 ${report.totals.rolling7Day.connectedCount}명 · 거절 ${report.totals.rolling7Day.rejectedCount}명`,
    "",
    `*Slack/직접 서빙 중 · ${report.servedCompanies.length}개*`,
    ...servedLines,
    "",
    `*그 외 회사 · ${report.otherCompanies.length}개*`,
    ...otherLines,
  ].join("\n");
}

function lifecycleActionLabel(
  action: DailyCompanyRoleLifecycleEvent["action"]
) {
  if (action === "created") return "역할 등록";
  if (action === "activated") return "역할 진행";
  if (action === "paused") return "역할 중단";
  if (action === "ended") return "역할 정지";
  return "역할 삭제";
}

function formatCompanyDetailLines(company: DailyCompanyStatsRow) {
  const lines: string[] = [];
  const chatTodayCount = company.chatTodayCount + company.slackTodayCount;
  if (chatTodayCount > 0) {
    lines.push(
      `- <${companyConversationsUrl(
        company.companyWorkspaceId
      )}|오늘 채팅 수: Slack ${company.slackTodayCount}개 · web ${
        company.chatTodayCount
      }개>`
    );
  }
  if (company.memberCount > 0 || company.newMemberTodayCount > 0) {
    lines.push(
      `- 멤버 ${company.memberCount}명 (+오늘 ${company.newMemberTodayCount}명)`
    );
  }
  for (const event of company.roleLifecycleEvents) {
    lines.push(
      `- ${lifecycleActionLabel(event.action)}: ${escapeSlackText(
        event.roleName
      )}`
    );
  }
  if (company.pendingConnectionTodayCount > 0) {
    lines.push(
      `- 새로 등록된 연결 대기 ${company.pendingConnectionTodayCount}명`
    );
  }
  if (company.connectedTodayCount > 0) {
    lines.push(`- 새로 연결된 후보 ${company.connectedTodayCount}명`);
  }
  if (company.acceptedTodayCount > 0) {
    lines.push(
      `- <${companyJobsUrl(
        company.companyWorkspaceId
      )}|새로 등록된 수락자 ${company.acceptedTodayCount}명>`
    );
  }
  if (company.roleStats.length > 0) {
    lines.push("- 역할별 후보 상태");
    lines.push(
      ...company.roleStats.map((role) => formatRoleStatsLine(company, role))
    );
  }
  return lines;
}

function splitSlackMessage(text: string, maxLength = 35_000) {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (current && next.length > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function formatDailyCompanyStatsSlackDetailMessages(
  report: DailyCompanyStatsReport
) {
  const toolLines =
    report.tools.length > 0
      ? report.tools.map(
          (tool) =>
            `- ${escapeSlackText(tool.name)}: ${tool.callCount} calls / error ${tool.failedCallCount}`
        )
      : ["- 없음"];
  const companies = [...report.servedCompanies, ...report.otherCompanies];
  const companySections = companies
    .map((company) => {
      const lines = formatCompanyDetailLines(company);
      if (lines.length === 0) return null;
      return [`*${escapeSlackText(company.companyName)}*`, ...lines].join("\n");
    })
    .filter((section): section is string => Boolean(section));
  const sections = [
    [
      "*회사측 LLM 도구 호출*",
      ...toolLines,
      `- 실패한 tool call: ${report.failedToolCallCount}개`,
    ].join("\n"),
    "*회사별 상세 지표*",
    companySections.length > 0
      ? companySections.join("\n\n")
      : "오늘 기록된 회사별 상세 지표가 없습니다.",
  ];
  return splitSlackMessage(sections.join("\n\n"));
}
