import { supabaseServer } from "@/lib/supabaseServer";

const BATCH_SIZE = 1_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const ACTIVE_ROLE_STATUSES = new Set(["active", "top_priority"]);
const ACCEPTED_FEEDBACK_VALUES = new Set([
  "accepted",
  "like",
  "liked",
  "positive",
]);

type CompanyWorkspaceRow = {
  company_name: string;
  company_workspace_id: string;
};

type CompanyRoleRow = {
  company_internal_roles:
    | { is_auto: boolean | null }
    | Array<{ is_auto: boolean | null }>
    | null;
  company_workspace_id: string;
  is_expired: boolean;
  role_id: string;
  source_type: string;
  status: string;
};

type CompanyMembershipRow = {
  company_user_id: string;
  company_workspace_id: string;
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

export type DailyCompanyStatsRow = {
  acceptedCount: number;
  acceptedTodayCount: number;
  activeRoleCount: number;
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
  pendingConnectionCount: number;
};

export type DailyCompanyStatsReport = {
  date: string;
  endIso: string;
  otherCompanies: DailyCompanyStatsRow[];
  servedCompanies: DailyCompanyStatsRow[];
  startIso: string;
};

export type DailyCompanyStatsSourceRows = {
  loginLogs: LoginLogRow[];
  memberships: CompanyMembershipRow[];
  messages: CompanyMessageRow[];
  progress: TalentProgressRow[];
  recommendations: RecommendationRow[];
  roles: CompanyRoleRow[];
  slackIntegrations: CompanySlackIntegrationRow[];
  tags: OpportunityTagRow[];
  workspaces: CompanyWorkspaceRow[];
};

type CurrentCandidateStage = "accepted" | "connected" | "pending_connection";

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

function isAutoRole(row: CompanyRoleRow) {
  const internalRoles = Array.isArray(row.company_internal_roles)
    ? row.company_internal_roles
    : row.company_internal_roles
      ? [row.company_internal_roles]
      : [];
  return internalRoles.some((internalRole) => internalRole.is_auto === true);
}

function getKstDayRange(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("date must be YYYY-MM-DD");
  }
  const start = new Date(`${date}T00:00:00+09:00`);
  if (!Number.isFinite(start.getTime())) {
    throw new Error("date must be YYYY-MM-DD");
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1_000);
  return { endIso: end.toISOString(), startIso: start.toISOString() };
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
  if (
    tag === "내부:연결됨" ||
    tag === "내부:최종오퍼" ||
    tag.startsWith("내부단계:")
  ) {
    return "connected";
  }
  if (
    tag === "내부:아카이브" ||
    tag === "내부:거절" ||
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
  if (savedStage === "connected") return "connected";
  if (savedStage === "pending_connection") return "pending_connection";
  if (savedStage === "closed" || savedStage === "hidden") return null;
  if (
    savedStage === "accepted" ||
    isAcceptedFeedback(recommendation.feedback)
  ) {
    return args.connectedRecommendationIds.has(recommendation.id)
      ? "connected"
      : "accepted";
  }
  return null;
}

function sortCompanyRows(rows: DailyCompanyStatsRow[]) {
  return rows.sort((left, right) =>
    left.companyName.localeCompare(right.companyName, "ko")
  );
}

export function compileDailyCompanyStatsReport(args: {
  date: string;
  rows: DailyCompanyStatsSourceRows;
}): DailyCompanyStatsReport {
  const { endIso, startIso } = getKstDayRange(args.date);
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
  }

  const slackWorkspaceIds = new Set(
    args.rows.slackIntegrations
      .filter((row) => normalized(row.status) === "active")
      .map((row) => text(row.company_workspace_id))
      .filter((workspaceId) => workspaceIds.has(workspaceId))
  );

  const activeRoleCountByWorkspaceId = new Map<string, number>();
  const autoWorkspaceIds = new Set<string>();
  for (const role of internalRoles) {
    const workspaceId = text(role.company_workspace_id);
    if (!role.is_expired && ACTIVE_ROLE_STATUSES.has(normalized(role.status))) {
      activeRoleCountByWorkspaceId.set(
        workspaceId,
        (activeRoleCountByWorkspaceId.get(workspaceId) ?? 0) + 1
      );
    }
    if (isAutoRole(role)) autoWorkspaceIds.add(workspaceId);
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
  const acceptedTodayByWorkspaceId = new Map<string, Set<string>>();
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
      const key = workspaceTalentKey(workspaceId, talentId);
      candidateStageByWorkspaceTalent.set(
        key,
        chooseCandidateStage(candidateStageByWorkspaceTalent.get(key), stage)
      );
    }

    if (
      isAcceptedFeedback(recommendation.feedback) &&
      isInRange(recommendation.feedback_at, startIso, endIso)
    ) {
      const acceptedToday =
        acceptedTodayByWorkspaceId.get(workspaceId) ?? new Set<string>();
      acceptedToday.add(talentId);
      acceptedTodayByWorkspaceId.set(workspaceId, acceptedToday);
    }
  }

  const connectedTodayByWorkspaceId = new Map<string, Set<string>>();
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
      messageType
    );
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
    { accepted: number; connected: number; pending: number }
  >();
  for (const [key, stage] of candidateStageByWorkspaceTalent) {
    const separator = key.lastIndexOf(":");
    const workspaceId = key.slice(0, separator);
    const counts = candidateCountsByWorkspaceId.get(workspaceId) ?? {
      accepted: 0,
      connected: 0,
      pending: 0,
    };
    if (stage === "accepted") counts.accepted += 1;
    else if (stage === "pending_connection") counts.pending += 1;
    else counts.connected += 1;
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
    };
    return {
      acceptedCount: counts.accepted,
      acceptedTodayCount:
        acceptedTodayByWorkspaceId.get(workspaceId)?.size ?? 0,
      activeRoleCount: activeRoleCountByWorkspaceId.get(workspaceId) ?? 0,
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
      pendingConnectionCount: counts.pending,
    } satisfies DailyCompanyStatsRow;
  });

  return {
    date: args.date,
    endIso,
    otherCompanies: sortCompanyRows(
      allCompanies.filter((company) => !company.isServed)
    ),
    servedCompanies: sortCompanyRows(
      allCompanies.filter((company) => company.isServed)
    ),
    startIso,
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
        loginLogs: [],
        memberships: [],
        messages: [],
        progress: [],
        recommendations: [],
        roles: [],
        slackIntegrations: [],
        tags: [],
        workspaces,
      },
    });
  }

  const [roles, memberships, slackIntegrations, messages] = await Promise.all([
    fetchAllRows<CompanyRoleRow>((from, to) =>
      (supabaseServer.from("company_roles") as any)
        .select(
          "role_id,company_workspace_id,status,is_expired,source_type,company_internal_roles(is_auto)"
        )
        .in("company_workspace_id", workspaceIds)
        .eq("source_type", "internal")
        .range(from, to)
    ),
    fetchAllRows<CompanyMembershipRow>((from, to) =>
      supabaseServer
        .from("company_user_workspace")
        .select("company_workspace_id,company_user_id")
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
      loginLogs,
      memberships,
      messages,
      progress,
      recommendations,
      roles,
      slackIntegrations,
      tags,
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

function formatKstTimestamp(value: string | null) {
  if (!value) return "없음";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "없음";
  const kst = new Date(timestamp + KST_OFFSET_MS).toISOString();
  return `${kst.slice(5, 10).replace("-", "/")} ${kst.slice(11, 16)}`;
}

function usageKindLabel(value: DailyCompanyUsageKind | null) {
  if (value === "accepted") return "수락";
  if (value === "rejected") return "거절";
  if (value === "slack") return "Slack";
  if (value === "chat") return "채팅";
  return null;
}

function formatCompanyLine(company: DailyCompanyStatsRow, served: boolean) {
  const prefix = `• ${escapeSlackText(company.companyName)} — `;
  if (!served) {
    const details = [
      `active role ${company.activeRoleCount}`,
      `수락 ${company.acceptedCount}(+오늘 ${company.acceptedTodayCount})`,
      ...(company.isAuto ? ["auto O"] : []),
    ];
    return `${prefix}${details.join(" · ")}`;
  }
  const usageLabel = usageKindLabel(company.latestUsageKind);
  const latestUsage = usageLabel
    ? `${usageLabel} ${formatKstTimestamp(company.latestUsageAt)}`
    : "없음";
  const details = [
    ...(company.isAuto ? ["auto O"] : []),
    `Slack ${company.isSlackConnected ? "O" : "X"}`,
    `멤버 ${company.memberCount}`,
    `active role ${company.activeRoleCount}`,
    `연결 대기 ${company.pendingConnectionCount}`,
    `수락 ${company.acceptedCount}(+오늘 ${company.acceptedTodayCount})`,
    `연결 중 ${company.connectedCount}(+오늘 ${company.connectedTodayCount})`,
    `최근 사용 ${latestUsage}`,
    `최근 접속 ${formatKstTimestamp(company.latestLoginAt)}`,
  ];
  return `${prefix}${details.join(" · ")}`;
}

export function formatDailyCompanyStatsSlackMessage(
  report: DailyCompanyStatsReport
) {
  const servedLines =
    report.servedCompanies.length > 0
      ? report.servedCompanies.map((company) =>
          formatCompanyLine(company, true)
        )
      : ["• 없음"];
  const otherLines =
    report.otherCompanies.length > 0
      ? report.otherCompanies.map((company) =>
          formatCompanyLine(company, false)
        )
      : ["• 없음"];
  return [
    `🏢 [Daily Company Stats] ${report.date}`,
    "",
    `*Slack/직접 서빙 중 · ${report.servedCompanies.length}개*`,
    ...servedLines,
    "",
    `*그 외 회사 · ${report.otherCompanies.length}개*`,
    ...otherLines,
  ].join("\n");
}
