import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

type TalentSummary = {
  email: string | null;
  name: string | null;
  userId: string;
};

type UntypedAdminClient = ReturnType<typeof getTalentSupabaseAdmin> & {
  from: (table: string) => any;
};

type DeliverySummary = {
  channel: string;
  errorMessage: string | null;
  id: string;
  payload: Record<string, unknown>;
  sentAt: string | null;
  status: string;
};

type RecommendationSummary = {
  companyName: string | null;
  id: string;
  opportunityType: string | null;
  rank: number | null;
  roleId: string | null;
  roleName: string | null;
  sourceType: string | null;
};

export type OpsDebugOpportunityRunOutcome =
  | "all"
  | "failed"
  | "no_action"
  | "partial"
  | "queued"
  | "recommend_only"
  | "running"
  | "sent"
  | "skipped";

type OpsDebugOpportunityRunItemOutcome = Exclude<
  OpsDebugOpportunityRunOutcome,
  "all"
>;

export type OpsDebugOpportunityRunStatus =
  | "all"
  | "completed"
  | "failed"
  | "partial"
  | "queued"
  | "running";

export type OpsDebugOpportunityRunItem = {
  actionLabels: string[];
  actionSummary: string;
  agentVersion: string | null;
  channelSummary: {
    failed: string[];
    sent: string[];
    skipped: string[];
  };
  completedAt: string | null;
  coverage: Record<string, unknown>;
  createdAt: string;
  deliveries: DeliverySummary[];
  deliveryMetaSummary: string | null;
  deliverySummary: string;
  emailSubject: string | null;
  errorMessage: string | null;
  id: string;
  outcome: {
    id: OpsDebugOpportunityRunItemOutcome;
    label: string;
  };
  partialReason: string | null;
  primaryReason: string;
  queryPlan: Record<string, unknown>;
  recommendationCount: number;
  recommendations: RecommendationSummary[];
  reviewAction: {
    id: "no_action" | "ok" | "retry" | "review" | "waiting";
    label: string;
    reason: string | null;
  };
  runMode: string | null;
  searchSummary: string | null;
  status: string;
  talent: TalentSummary;
  trigger: string | null;
};

export type OpsDebugOpportunityRunStats = {
  completedCount: number;
  emailSentCount: number;
  failedCount: number;
  partialCount: number;
  recommendOnlyCount: number;
  reviewNeededCount: number;
  sentCount: number;
  skippedCount: number;
  sourceLimitReached: boolean;
  totalCount: number;
  withRecommendationsCount: number;
};

export type OpsDebugOpportunityRunsResponse = {
  filters: {
    createdFrom: string | null;
    createdTo: string | null;
    outcome: OpsDebugOpportunityRunOutcome;
    query: string;
    status: OpsDebugOpportunityRunStatus;
  };
  hasMore: boolean;
  limit: number;
  nextOffset: number | null;
  offset: number;
  runs: OpsDebugOpportunityRunItem[];
  stats: OpsDebugOpportunityRunStats;
};

const DEFAULT_DEBUG_OPPORTUNITY_RUN_LIMIT = 20;
const MAX_DEBUG_OPPORTUNITY_RUN_LIMIT = 80;
const MAX_DEBUG_OPPORTUNITY_RUN_SOURCE_LIMIT = 1200;

function toUntypedAdmin(
  admin: ReturnType<typeof getTalentSupabaseAdmin>
): UntypedAdminClient {
  return admin as unknown as UntypedAdminClient;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getFirstRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeText(value: unknown, max = 240) {
  const text =
    typeof value === "string"
      ? value
      : value == null
        ? ""
        : JSON.stringify(value);
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max
    ? `${normalized.slice(0, Math.max(0, max - 1))}…`
    : normalized;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSearchQuery(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function parseDateOnly(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const [year, month, day] = trimmed.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return trimmed;
}

function toKstDayStartIso(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0)).toISOString();
}

function toKstNextDayStartIso(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day + 1, -9, 0, 0, 0)
  ).toISOString();
}

function normalizeDateRange(args: {
  createdFrom?: string | null;
  createdTo?: string | null;
}) {
  let from = parseDateOnly(args.createdFrom);
  let to = parseDateOnly(args.createdTo);
  if (!from && to) from = to;
  if (from && !to) to = from;
  if (from && to && to < from) {
    const nextFrom = to;
    to = from;
    from = nextFrom;
  }

  return {
    from,
    startIso: from ? toKstDayStartIso(from) : null,
    to,
    endExclusiveIso: to ? toKstNextDayStartIso(to) : null,
  };
}

function coerceStringList(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => getString(item))
    .filter(Boolean)
    .slice(0, limit) as string[];
}

function coerceRecordList(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, limit)
    .map((item) => item as Record<string, unknown>);
}

function normalizeRunStatus(
  value: string | null | undefined
): OpsDebugOpportunityRunStatus {
  if (
    value === "completed" ||
    value === "failed" ||
    value === "partial" ||
    value === "queued" ||
    value === "running"
  ) {
    return value;
  }
  return "all";
}

function normalizeRunOutcome(
  value: string | null | undefined
): OpsDebugOpportunityRunOutcome {
  if (
    value === "failed" ||
    value === "no_action" ||
    value === "partial" ||
    value === "queued" ||
    value === "recommend_only" ||
    value === "running" ||
    value === "sent" ||
    value === "skipped"
  ) {
    return value;
  }
  return "all";
}

function runCreatedAt(row: any) {
  return getString(row.created_at) ?? new Date(0).toISOString();
}

function parseTalent(row: any): TalentSummary {
  const talent = getFirstRecord(row.talent);
  const fallbackUserId = getString(row.talent_id) ?? "";
  return {
    email: getString(talent.email),
    name: getString(talent.name),
    userId: getString(talent.user_id) ?? fallbackUserId,
  };
}

function getPolicyDecision(plan: Record<string, unknown>) {
  return asRecord(plan.policyDecision ?? plan.policy_decision);
}

function getDelivery(plan: Record<string, unknown>) {
  return asRecord(plan.delivery);
}

function getSearchPlan(plan: Record<string, unknown>) {
  const searchPlan = asRecord(plan.searchPlan ?? plan.search_plan);
  const policy = getPolicyDecision(plan);
  return asRecord(searchPlan.external ?? policy.externalSearch);
}

function getEmailCoverage(coverage: Record<string, unknown>) {
  return asRecord(coverage.email);
}

function getPayloadString(payload: Record<string, unknown>, key: string) {
  return getString(payload[key]);
}

function getEmailSubject(args: {
  coverage: Record<string, unknown>;
  deliveries: DeliverySummary[];
  plan: Record<string, unknown>;
}) {
  const delivery = getDelivery(args.plan);
  const coverageEmail = getEmailCoverage(args.coverage);
  const emailDelivery = args.deliveries.find(
    (item) => item.channel === "email"
  );
  return (
    getString(coverageEmail.subject) ??
    getString(delivery.emailSubject) ??
    getPayloadString(emailDelivery?.payload ?? {}, "subject") ??
    getPayloadString(emailDelivery?.payload ?? {}, "emailSubject")
  );
}

function getDeliveryBodyPreview(plan: Record<string, unknown>) {
  const delivery = getDelivery(plan);
  const value = getString(delivery.emailBody) ?? getString(delivery.chatMessage);
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 220) : null;
}

function deliveryFromRow(row: any): DeliverySummary {
  return {
    channel: getString(row.channel) ?? "unknown",
    errorMessage: getString(row.error_message),
    id: getString(row.id) ?? "",
    payload: asRecord(row.payload),
    sentAt: getString(row.sent_at),
    status: getString(row.status) ?? "unknown",
  };
}

function recommendationFromRow(
  row: any,
  roleMap: Map<string, { companyName: string | null; name: string | null; sourceType: string | null }>
): RecommendationSummary {
  const roleId = getString(row.role_id);
  const role = roleId ? roleMap.get(roleId) : null;
  return {
    companyName: role?.companyName ?? null,
    id: getString(row.id) ?? "",
    opportunityType: getString(row.opportunity_type),
    rank: getNumber(row.rank),
    roleId,
    roleName: role?.name ?? null,
    sourceType: role?.sourceType ?? null,
  };
}

function buildDeliverySummary(deliveries: DeliverySummary[]) {
  if (deliveries.length === 0) return "delivery 없음";
  return deliveries
    .map((item) => `${item.channel}:${item.status}`)
    .join(" · ");
}

function buildActionSummary(args: {
  deliveries: DeliverySummary[];
  plan: Record<string, unknown>;
  recommendationCount: number;
}) {
  const plan = args.plan;
  const policy = getPolicyDecision(plan);
  const strategy = asRecord(
    policy.recommendationStrategy ?? policy.recommendation_strategy
  );
  const decisionTypes = coerceRecordList(plan.decisions)
    .map((decision) => getString(decision.type))
    .filter(Boolean) as string[];
  const v2Actions = coerceStringList(strategy.v2Actions, 8);
  const delivery = getDelivery(plan);
  const requestedChannels = coerceStringList(delivery.channels, 5);
  const todoAction =
    getString(policy.todoAction) ?? getString(policy.todo_action);

  const parts: string[] = [];
  if (decisionTypes.length > 0) parts.push(...decisionTypes);
  if (v2Actions.length > 0) parts.push(...v2Actions);
  if (todoAction && todoAction !== "none") parts.push(todoAction);
  if (args.recommendationCount > 0) {
    parts.push(`recommend ${args.recommendationCount}`);
  }
  for (const item of args.deliveries) {
    if (item.status === "sent") parts.push(`${item.channel} sent`);
    if (item.status === "skipped") parts.push(`${item.channel} skipped`);
    if (item.status === "failed") parts.push(`${item.channel} failed`);
  }
  if (parts.length === 0 && requestedChannels.length > 0) {
    parts.push(`requested ${requestedChannels.join("/")}`);
  }
  return Array.from(new Set(parts)).join(" · ") || "-";
}

function getDeliveryMetaSummary(plan: Record<string, unknown>) {
  const value = plan.deliveryMeta ?? plan.delivery_meta;
  const direct = getString(value);
  if (direct) return normalizeText(direct, 320);

  const meta = asRecord(value);
  if (Object.keys(meta).length === 0) return null;

  const parts: string[] = [];
  const intent = normalizeText(meta.intent, 180);
  if (intent) parts.push(intent);
  for (const [label, key] of [
    ["act", "communicationAct"],
    ["shape", "shape"],
    ["ask", "askType"],
    ["roles", "roleCount"],
    ["cta", "ctaType"],
    ["opening", "openingStyle"],
  ] as const) {
    const text = normalizeText(meta[key], 80);
    if (text) parts.push(`${label}:${text}`);
  }

  if (parts.length === 0) {
    for (const [key, item] of Object.entries(meta).slice(0, 6)) {
      const text = normalizeText(item, 80);
      if (text) parts.push(`${key}:${text}`);
    }
  }

  return normalizeText(parts.join(" | "), 320);
}

function buildChannelSummary(deliveries: DeliverySummary[]) {
  return {
    failed: deliveries
      .filter((item) => item.status === "failed")
      .map((item) => item.channel),
    sent: deliveries
      .filter((item) => item.status === "sent")
      .map((item) => item.channel),
    skipped: deliveries
      .filter((item) => item.status === "skipped")
      .map((item) => item.channel),
  };
}

function getDecisionTypes(plan: Record<string, unknown>) {
  return coerceRecordList(plan.decisions)
    .map((decision) => getString(decision.type))
    .filter(Boolean) as string[];
}

function getV2Actions(plan: Record<string, unknown>) {
  const policy = getPolicyDecision(plan);
  const strategy = asRecord(
    policy.recommendationStrategy ?? policy.recommendation_strategy
  );
  return coerceStringList(strategy.v2Actions, 8);
}

function shouldTreatAsSkipped(plan: Record<string, unknown>) {
  const delivery = getDelivery(plan);
  const decisionTypes = getDecisionTypes(plan);
  const shouldSendEmail = delivery.shouldSendEmail ?? delivery.should_send_email;
  return (
    decisionTypes.includes("skip_send") ||
    shouldSendEmail === false ||
    getString(delivery.reason)?.toLowerCase().includes("not to contact") ===
      true
  );
}

function buildActionLabels(args: {
  channelSummary: ReturnType<typeof buildChannelSummary>;
  plan: Record<string, unknown>;
  recommendationCount: number;
}) {
  const labels: string[] = [];
  const add = (label: string | null | undefined) => {
    const value = getString(label);
    if (value && !labels.includes(value)) labels.push(value);
  };

  if (args.recommendationCount > 0) {
    add(`추천 ${args.recommendationCount}`);
  }
  if (args.channelSummary.sent.includes("email")) add("메일 발송");
  if (args.channelSummary.sent.includes("chat")) add("채팅 발송");
  if (args.channelSummary.skipped.includes("email")) add("메일 스킵");
  if (args.channelSummary.failed.includes("email")) add("메일 실패");
  if (args.channelSummary.failed.includes("chat")) add("채팅 실패");

  const allActions = [...getDecisionTypes(args.plan), ...getV2Actions(args.plan)];
  if (allActions.includes("held_role_question")) add("질문 포함");
  if (allActions.includes("should-ask")) add("추가 질문");
  if (allActions.includes("lifecycle_notice")) add("중단 안내");
  if (allActions.includes("skip_send")) add("발송 스킵");

  return labels.length > 0 ? labels : ["액션 없음"];
}

function buildOutcome(args: {
  channelSummary: ReturnType<typeof buildChannelSummary>;
  plan: Record<string, unknown>;
  recommendationCount: number;
  status: string;
}): { id: OpsDebugOpportunityRunItemOutcome; label: string } {
  if (args.status === "failed" || args.channelSummary.failed.length > 0) {
    return { id: "failed", label: "실패" };
  }
  if (args.status === "running") return { id: "running", label: "진행중" };
  if (args.status === "queued") return { id: "queued", label: "대기" };
  if (args.channelSummary.sent.length > 0) {
    return { id: "sent", label: "발송됨" };
  }
  if (args.channelSummary.skipped.length > 0 || shouldTreatAsSkipped(args.plan)) {
    return { id: "skipped", label: "스킵" };
  }
  if (args.recommendationCount > 0) {
    return { id: "recommend_only", label: "추천만 저장" };
  }
  if (args.status === "partial") return { id: "partial", label: "Partial" };
  return { id: "no_action", label: "액션 없음" };
}

function getFirstDecisionReason(plan: Record<string, unknown>) {
  for (const decision of coerceRecordList(plan.decisions, 5)) {
    const reason = getString(decision.reason);
    if (reason) return reason;
  }
  return null;
}

function getDeliveryReason(plan: Record<string, unknown>) {
  const delivery = getDelivery(plan);
  return getString(delivery.reason);
}

function buildPartialReason(args: {
  coverage: Record<string, unknown>;
  deliveries: DeliverySummary[];
  errorMessage: string | null;
  plan: Record<string, unknown>;
  recommendationCount: number;
  status: string;
}) {
  if (args.status !== "partial") return null;
  const explicitReason =
    getDeliveryReason(args.plan) ??
    getFirstDecisionReason(args.plan) ??
    getString(getEmailCoverage(args.coverage).reason) ??
    args.errorMessage;
  if (explicitReason) return explicitReason;

  const sentChannels = args.deliveries
    .filter((item) => item.status === "sent")
    .map((item) => item.channel);
  if (args.recommendationCount === 0 && sentChannels.length > 0) {
    return `recommendation row 0개지만 ${sentChannels.join("/")} 발송됨`;
  }
  if (args.recommendationCount === 0) {
    return "recommendation row 0개";
  }
  return "partial로 저장됨";
}

function buildPrimaryReason(args: {
  channelSummary: ReturnType<typeof buildChannelSummary>;
  deliveryMetaSummary: string | null;
  errorMessage: string | null;
  outcome: { id: OpsDebugOpportunityRunItemOutcome; label: string };
  partialReason: string | null;
  recommendationCount: number;
}) {
  if (args.outcome.id === "failed") {
    return (
      args.errorMessage ??
      `발송 실패: ${args.channelSummary.failed.join(", ") || "unknown"}`
    );
  }
  if (args.outcome.id === "running") return "아직 실행 중입니다.";
  if (args.outcome.id === "queued") return "실행 대기 중입니다.";
  if (args.outcome.id === "sent") {
    const channels = args.channelSummary.sent
      .map((channel) => (channel === "email" ? "Email" : channel === "chat" ? "Chat" : channel))
      .join("/");
    return `${args.recommendationCount}개 추천 후 ${channels || "delivery"} 발송`;
  }
  if (args.outcome.id === "skipped") {
    return (
      args.partialReason ??
      args.deliveryMetaSummary ??
      "Orchestration이 유저에게 연락하지 않기로 결정했습니다."
    );
  }
  if (args.outcome.id === "recommend_only") {
    return `${args.recommendationCount}개 추천은 저장됐지만 발송 기록은 없습니다.`;
  }
  if (args.outcome.id === "partial") {
    return args.partialReason ?? "partial로 저장됐지만 명시 사유가 없습니다.";
  }
  return "추천/발송 액션이 없습니다.";
}

function buildReviewAction(args: {
  errorMessage: string | null;
  outcome: { id: OpsDebugOpportunityRunItemOutcome; label: string };
  partialReason: string | null;
  primaryReason: string;
  status: string;
}) {
  const reason = `${args.partialReason ?? ""} ${args.errorMessage ?? ""} ${
    args.primaryReason
  }`.toLowerCase();

  if (args.outcome.id === "failed") {
    return { id: "retry" as const, label: "Retry", reason: args.primaryReason };
  }
  if (args.outcome.id === "running" || args.outcome.id === "queued") {
    return { id: "waiting" as const, label: "Waiting", reason: null };
  }
  if (
    reason.includes("no executable delivery content") ||
    reason.includes("selected contact") ||
    reason.includes("발송 가능한")
  ) {
    return { id: "review" as const, label: "Review", reason: args.primaryReason };
  }
  if (args.outcome.id === "sent") {
    return { id: "ok" as const, label: "OK", reason: null };
  }
  if (args.outcome.id === "skipped" && args.status === "partial") {
    return { id: "no_action" as const, label: "No action", reason: args.primaryReason };
  }
  if (args.outcome.id === "recommend_only" || args.outcome.id === "partial") {
    return { id: "review" as const, label: "Review", reason: args.primaryReason };
  }
  return { id: "no_action" as const, label: "No action", reason: null };
}

function buildSearchSummary(plan: Record<string, unknown>) {
  const external = getSearchPlan(plan);
  const intent = getString(external.searchIntentSummary);
  const titles = coerceStringList(external.role_titles ?? external.roleTitles, 4);
  const locations = coerceStringList(external.locations, 4);
  const parts = [
    titles.length > 0 ? `titles: ${titles.join(", ")}` : null,
    locations.length > 0 ? `loc: ${locations.join(", ")}` : null,
    intent,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function includesSearchQuery(item: OpsDebugOpportunityRunItem, query: string) {
  if (!query) return true;
  const needle = query.toLowerCase();
  const haystack = [
    item.actionSummary,
    item.agentVersion,
    item.deliverySummary,
    item.deliveryMetaSummary,
    item.emailSubject,
    item.errorMessage,
    item.id,
    item.outcome.label,
    item.partialReason,
    item.primaryReason,
    item.reviewAction.label,
    item.reviewAction.reason,
    item.runMode,
    item.searchSummary,
    item.status,
    item.talent.email,
    item.talent.name,
    item.trigger,
    ...item.actionLabels,
    ...item.recommendations.map((rec) =>
      [rec.roleName, rec.companyName, rec.sourceType, rec.opportunityType]
        .filter(Boolean)
        .join(" ")
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function compareRuns(
  a: OpsDebugOpportunityRunItem,
  b: OpsDebugOpportunityRunItem
) {
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  const safeATime = Number.isFinite(aTime) ? aTime : 0;
  const safeBTime = Number.isFinite(bTime) ? bTime : 0;
  if (safeATime !== safeBTime) return safeBTime - safeATime;
  return b.id.localeCompare(a.id);
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

async function fetchDeliveries(args: {
  admin: UntypedAdminClient;
  runIds: string[];
}) {
  const byRunId = new Map<string, DeliverySummary[]>();
  if (args.runIds.length === 0) return byRunId;

  for (const page of chunk(args.runIds, 200)) {
    const { data, error } = await args.admin
      .from("talent_opportunity_delivery")
      .select(
        "id, discovery_run_id, channel, status, payload, sent_at, error_message, created_at"
      )
      .in("discovery_run_id", page)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message ?? "Failed to load opportunity deliveries");
    }

    for (const row of data ?? []) {
      const runId = getString(row.discovery_run_id);
      if (!runId) continue;
      const current = byRunId.get(runId) ?? [];
      current.push(deliveryFromRow(row));
      byRunId.set(runId, current);
    }
  }
  return byRunId;
}

async function fetchRoleMap(args: {
  admin: UntypedAdminClient;
  roleIds: string[];
}) {
  const roleMap = new Map<
    string,
    { companyName: string | null; name: string | null; sourceType: string | null }
  >();
  const roleIds = Array.from(new Set(args.roleIds.filter(Boolean)));
  if (roleIds.length === 0) return roleMap;

  for (const page of chunk(roleIds, 200)) {
    const { data, error } = await args.admin
      .from("company_roles")
      .select(
        `
          role_id,
          name,
          source_type,
          company_workspace:company_workspace (
            company_name
          )
        `
      )
      .in("role_id", page);

    if (error) {
      throw new Error(error.message ?? "Failed to load company roles");
    }

    for (const row of data ?? []) {
      const roleId = getString(row.role_id);
      if (!roleId) continue;
      const company = getFirstRecord(row.company_workspace);
      roleMap.set(roleId, {
        companyName: getString(company.company_name),
        name: getString(row.name),
        sourceType: getString(row.source_type),
      });
    }
  }
  return roleMap;
}

async function fetchRecommendations(args: {
  admin: UntypedAdminClient;
  runIds: string[];
}) {
  const byRunId = new Map<string, RecommendationSummary[]>();
  if (args.runIds.length === 0) return byRunId;

  const rows: any[] = [];
  for (const page of chunk(args.runIds, 200)) {
    const { data, error } = await args.admin
      .from("talent_opportunity_recommendation")
      .select("id, discovery_run_id, opportunity_type, rank, role_id")
      .in("discovery_run_id", page)
      .order("rank", { ascending: true });

    if (error) {
      throw new Error(error.message ?? "Failed to load opportunity recommendations");
    }
    rows.push(...(data ?? []));
  }

  const roleMap = await fetchRoleMap({
    admin: args.admin,
    roleIds: rows.map((row) => getString(row.role_id)).filter(Boolean) as string[],
  });

  for (const row of rows) {
    const runId = getString(row.discovery_run_id);
    if (!runId) continue;
    const current = byRunId.get(runId) ?? [];
    current.push(recommendationFromRow(row, roleMap));
    byRunId.set(runId, current);
  }
  return byRunId;
}

function runFromRow(args: {
  deliveries: DeliverySummary[];
  recommendations: RecommendationSummary[];
  row: any;
}): OpsDebugOpportunityRunItem {
  const queryPlan = asRecord(args.row.query_plan);
  const coverage = asRecord(args.row.coverage);
  const status = getString(args.row.status) ?? "unknown";
  const agentVersion =
    getString(queryPlan.agentVersion) ?? getString(coverage.agentVersion);
  const recommendationCount =
    getNumber(coverage.recommendationCount) ?? args.recommendations.length;
  const emailSubject = getEmailSubject({
    coverage,
    deliveries: args.deliveries,
    plan: queryPlan,
  });
  const actionSummary = buildActionSummary({
    deliveries: args.deliveries,
    plan: queryPlan,
    recommendationCount,
  });
  const channelSummary = buildChannelSummary(args.deliveries);
  const partialReason = buildPartialReason({
    coverage,
    deliveries: args.deliveries,
    errorMessage: getString(args.row.error_message),
    plan: queryPlan,
    recommendationCount,
    status,
  });
  const deliveryMetaSummary = getDeliveryMetaSummary(queryPlan);
  const outcome = buildOutcome({
    channelSummary,
    plan: queryPlan,
    recommendationCount,
    status,
  });
  const errorMessage = getString(args.row.error_message);
  const primaryReason = buildPrimaryReason({
    channelSummary,
    deliveryMetaSummary,
    errorMessage,
    outcome,
    partialReason,
    recommendationCount,
  });
  const reviewAction = buildReviewAction({
    errorMessage,
    outcome,
    partialReason,
    primaryReason,
    status,
  });
  const bodyPreview = getDeliveryBodyPreview(queryPlan);

  return {
    actionLabels: buildActionLabels({
      channelSummary,
      plan: queryPlan,
      recommendationCount,
    }),
    actionSummary,
    agentVersion,
    channelSummary,
    completedAt: getString(args.row.completed_at),
    coverage,
    createdAt: runCreatedAt(args.row),
    deliveries: args.deliveries,
    deliveryMetaSummary,
    deliverySummary: [
      buildDeliverySummary(args.deliveries),
      emailSubject ? `subject: ${emailSubject}` : null,
      bodyPreview,
    ]
      .filter(Boolean)
      .join(" · "),
    emailSubject,
    errorMessage,
    id: getString(args.row.id) ?? "",
    outcome,
    partialReason,
    primaryReason,
    queryPlan,
    recommendationCount,
    recommendations: args.recommendations,
    reviewAction,
    runMode: getString(args.row.run_mode),
    searchSummary: buildSearchSummary(queryPlan),
    status,
    talent: parseTalent(args.row),
    trigger: getString(args.row.trigger),
  };
}

function buildStats(args: {
  runs: OpsDebugOpportunityRunItem[];
  sourceLimitReached: boolean;
}): OpsDebugOpportunityRunStats {
  return {
    completedCount: args.runs.filter((item) => item.status === "completed")
      .length,
    emailSentCount: args.runs.filter((item) =>
      item.deliveries.some(
        (delivery) => delivery.channel === "email" && delivery.status === "sent"
      )
    ).length,
    failedCount: args.runs.filter((item) => item.status === "failed").length,
    partialCount: args.runs.filter((item) => item.status === "partial").length,
    recommendOnlyCount: args.runs.filter(
      (item) => item.outcome.id === "recommend_only"
    ).length,
    reviewNeededCount: args.runs.filter(
      (item) =>
        item.reviewAction.id === "review" || item.reviewAction.id === "retry"
    ).length,
    sentCount: args.runs.filter((item) => item.outcome.id === "sent").length,
    skippedCount: args.runs.filter((item) => item.outcome.id === "skipped")
      .length,
    sourceLimitReached: args.sourceLimitReached,
    totalCount: args.runs.length,
    withRecommendationsCount: args.runs.filter(
      (item) => item.recommendationCount > 0
    ).length,
  };
}

export function parseOpsDebugOpportunityRunLimit(value: string | null) {
  const n = Number(value ?? DEFAULT_DEBUG_OPPORTUNITY_RUN_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_DEBUG_OPPORTUNITY_RUN_LIMIT;
  return Math.max(
    1,
    Math.min(MAX_DEBUG_OPPORTUNITY_RUN_LIMIT, Math.floor(n))
  );
}

export function parseOpsDebugOpportunityRunOffset(value: string | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function parseOpsDebugOpportunityRunStatus(value: string | null) {
  return normalizeRunStatus(value);
}

export function parseOpsDebugOpportunityRunOutcome(value: string | null) {
  return normalizeRunOutcome(value);
}

function matchesOutcomeFilter(
  item: OpsDebugOpportunityRunItem,
  outcome: OpsDebugOpportunityRunOutcome
) {
  if (outcome === "all") return true;
  if (outcome === "partial") return item.status === "partial";
  return item.outcome.id === outcome;
}

export async function fetchOpsDebugOpportunityRuns(args: {
  createdFrom?: string | null;
  createdTo?: string | null;
  limit?: number;
  offset?: number;
  outcome?: OpsDebugOpportunityRunOutcome;
  query?: string | null;
  status?: OpsDebugOpportunityRunStatus;
}): Promise<OpsDebugOpportunityRunsResponse> {
  const admin = toUntypedAdmin(getTalentSupabaseAdmin());
  const limit = Math.max(
    1,
    Math.min(
      MAX_DEBUG_OPPORTUNITY_RUN_LIMIT,
      args.limit ?? DEFAULT_DEBUG_OPPORTUNITY_RUN_LIMIT
    )
  );
  const offset = Math.max(0, args.offset ?? 0);
  const outcome = args.outcome ?? "all";
  const query = normalizeSearchQuery(args.query);
  const status = args.status ?? "all";
  const usesInMemoryFilter = Boolean(query) || outcome !== "all";
  const dateRange = normalizeDateRange({
    createdFrom: args.createdFrom,
    createdTo: args.createdTo,
  });
  const sourceLimit = usesInMemoryFilter
    ? MAX_DEBUG_OPPORTUNITY_RUN_SOURCE_LIMIT
    : Math.min(
        MAX_DEBUG_OPPORTUNITY_RUN_SOURCE_LIMIT,
        Math.max(offset + limit + 1, 220)
      );

  let runQuery = admin
    .from("opportunity_discovery_run")
    .select(
      `
        id,
        talent_id,
        conversation_id,
        status,
        trigger,
        run_mode,
        target_recommendation_count,
        settings_snapshot,
        trigger_payload,
        user_brief,
        query_plan,
        coverage,
        error_message,
        started_at,
        completed_at,
        created_at,
        updated_at,
        message,
        talent:talent_users!opportunity_discovery_run_talent_id_fkey (
          user_id,
          name,
          email
        )
      `
    )
    .order("created_at", { ascending: false })
    .range(0, sourceLimit - 1);

  if (dateRange.startIso) {
    runQuery = runQuery.gte("created_at", dateRange.startIso);
  }
  if (dateRange.endExclusiveIso) {
    runQuery = runQuery.lt("created_at", dateRange.endExclusiveIso);
  }
  if (status !== "all") {
    runQuery = runQuery.eq("status", status);
  }

  const { data, error } = await runQuery;
  if (error) {
    throw new Error(error.message ?? "Failed to load opportunity runs");
  }

  const rows = data ?? [];
  const runIds = rows.map((row: any) => getString(row.id)).filter(Boolean) as string[];
  const [deliveriesByRunId, recommendationsByRunId] = await Promise.all([
    fetchDeliveries({ admin, runIds }),
    fetchRecommendations({ admin, runIds }),
  ]);

  const allRuns = rows
    .map((row: any) => {
      const runId = getString(row.id) ?? "";
      return runFromRow({
        deliveries: deliveriesByRunId.get(runId) ?? [],
        recommendations: recommendationsByRunId.get(runId) ?? [],
        row,
      });
    })
    .filter((item) => matchesOutcomeFilter(item, outcome))
    .filter((item) => includesSearchQuery(item, query))
    .sort(compareRuns);

  const page = allRuns.slice(offset, offset + limit);
  const nextOffset =
    offset + page.length < allRuns.length ? offset + page.length : null;

  return {
    filters: {
      createdFrom: dateRange.from,
      createdTo: dateRange.to,
      outcome,
      query,
      status,
    },
    hasMore: nextOffset !== null,
    limit,
    nextOffset,
    offset,
    runs: page,
    stats: buildStats({
      runs: allRuns,
      sourceLimitReached: usesInMemoryFilter && rows.length >= sourceLimit,
    }),
  };
}
