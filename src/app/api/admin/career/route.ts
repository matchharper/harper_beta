import { NextRequest, NextResponse } from "next/server";
import { IncomingWebhook } from "@slack/webhook";
import { isValidAdminPassword } from "@/lib/admin";
import { isEmailExcluded } from "@/lib/adminEmailExclusions";
import {
  normalizeEmail,
  normalizeExcludedEmails,
} from "@/lib/adminMetrics/utils";
import type {
  AdminCareerAnalyticsResponse,
  AdminCareerLandingSourceBreakdown,
  AdminCareerFunnelStep,
  AdminCareerFunnelStepKey,
  AdminCareerQuickSignal,
  AdminCareerSummaryMetric,
  AdminCareerUserRow,
} from "@/lib/adminCareerAnalytics/types";
import { xaiInference } from "@/lib/llm/llm";
import {
  extractEmailFromLandingLoginType,
  getLandingLogBaseType,
  getLandingLogSource,
  isLandingLogEntryType,
} from "@/lib/landingLogTypes";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

export const runtime = "nodejs";

const BATCH_SIZE = 1000;
const CAREER_ANALYTICS_SLACK_SUMMARY_MODEL = "grok-4-1-fast-reasoning";

type LandingLogRow = Pick<
  Database["public"]["Tables"]["landing_logs"]["Row"],
  "local_id" | "type" | "created_at"
>;
type LogRow = Pick<
  Database["public"]["Tables"]["logs"]["Row"],
  "user_id" | "type" | "created_at"
>;
type TalentUserRow = Pick<
  Database["public"]["Tables"]["talent_users"]["Row"],
  | "user_id"
  | "name"
  | "email"
  | "created_at"
  | "last_logined_at"
  | "resume_file_name"
  | "resume_links"
>;
type TalentSettingRow = Pick<
  Database["public"]["Tables"]["talent_setting"]["Row"],
  "user_id" | "is_onboarding_done" | "updated_at"
>;
type TalentMessageRow = Pick<
  Database["public"]["Tables"]["talent_messages"]["Row"],
  "user_id" | "role" | "created_at" | "message_type"
>;
type TalentActivityEventRow = Pick<
  Database["public"]["Tables"]["talent_activity_events"]["Row"],
  "talent_id" | "event_type" | "occurred_at"
>;
type RecommendationRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_recommendation"]["Row"],
  | "talent_id"
  | "recommended_at"
  | "created_at"
  | "viewed_at"
  | "clicked_at"
  | "feedback"
  | "feedback_at"
  | "saved_stage"
  | "updated_at"
>;

type FetchPageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type MutableUserStats = {
  appOpenCount: number;
  companyOpenCount: number;
  firstRecommendationAt: string | null;
  jdOpenCount: number;
  lastMeaningfulAction: string | null;
  lastMeaningfulActionAt: string | null;
  messageCount: number;
  negativeFeedbackCount: number;
  positiveFeedbackCount: number;
  profileUpdateCount: number;
  recommendationCount: number;
  returnedAfterFirstRecommendation: boolean;
  statusChangeCount: number;
  viewedRecommendationCount: number;
};

type MutableLandingSourceStats = {
  entryLocalIds: Set<string>;
  eventTypes: Set<string>;
  loginLocalIds: Set<string>;
};

type AnalyticsDateRange = {
  endDate: string | null;
  endExclusiveIso: string | null;
  isActive: boolean;
  startDate: string | null;
  startIso: string | null;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function getAdminPassword(req: NextRequest) {
  return (
    req.headers.get("x-admin-password") ??
    req.headers.get("X-Admin-Password") ??
    ""
  );
}

function readExcludedEmails(payload: unknown) {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("excludedEmails" in payload)
  ) {
    return [];
  }

  const value = (payload as { excludedEmails?: unknown }).excludedEmails;
  if (typeof value === "string") return normalizeExcludedEmails(value);
  if (Array.isArray(value)) {
    return normalizeExcludedEmails(
      value.filter((item): item is string => typeof item === "string")
    );
  }
  return [];
}

function normalizeDateOnly(value: unknown) {
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

function readAnalyticsDateRange(payload: unknown): AnalyticsDateRange {
  if (!payload || typeof payload !== "object" || !("dateRange" in payload)) {
    return {
      endDate: null,
      endExclusiveIso: null,
      isActive: false,
      startDate: null,
      startIso: null,
    };
  }

  const value = (payload as { dateRange?: unknown }).dateRange;
  if (!value || typeof value !== "object") {
    return {
      endDate: null,
      endExclusiveIso: null,
      isActive: false,
      startDate: null,
      startIso: null,
    };
  }

  let startDate = normalizeDateOnly(
    (value as { startDate?: unknown }).startDate
  );
  let endDate = normalizeDateOnly((value as { endDate?: unknown }).endDate);

  if (!startDate && endDate) startDate = endDate;
  if (startDate && !endDate) endDate = startDate;
  if (startDate && endDate && endDate < startDate) {
    const nextStartDate = endDate;
    endDate = startDate;
    startDate = nextStartDate;
  }

  return {
    endDate,
    endExclusiveIso: endDate ? toKstNextDayStartIso(endDate) : null,
    isActive: Boolean(startDate || endDate),
    startDate,
    startIso: startDate ? toKstDayStartIso(startDate) : null,
  };
}

function isWithinAnalyticsDateRange(
  value: string | null | undefined,
  range: AnalyticsDateRange
) {
  if (!range.isActive) return true;
  if (!value) return false;
  if (range.startIso && value < range.startIso) return false;
  if (range.endExclusiveIso && value >= range.endExclusiveIso) return false;
  return true;
}

async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<FetchPageResult<T>>
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + BATCH_SIZE - 1;
    const { data, error } = await loadPage(from, to);
    if (error) {
      throw new Error(error.message || "Failed to load rows");
    }

    const page = data ?? [];
    rows.push(...page);
    if (page.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return rows;
}

function parseLandingLoginEmail(type: string | null) {
  return normalizeEmail(extractEmailFromLandingLoginType(type)) || null;
}

function addToSetMap(
  map: Map<string, Set<string>>,
  key: string,
  value: string
) {
  if (!key || !value) return;
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

function getOrCreateLandingSourceStats(
  map: Map<string, MutableLandingSourceStats>,
  source: string
) {
  const normalizedSource = source.trim() || "unknown";
  const current = map.get(normalizedSource);
  if (current) return current;

  const next: MutableLandingSourceStats = {
    entryLocalIds: new Set<string>(),
    eventTypes: new Set<string>(),
    loginLocalIds: new Set<string>(),
  };
  map.set(normalizedSource, next);
  return next;
}

function maxIso(
  current: string | null | undefined,
  candidate: string | null | undefined
) {
  if (!candidate) return current ?? null;
  if (!current) return candidate;
  return candidate > current ? candidate : current;
}

function isAfter(
  candidate: string | null | undefined,
  baseline: string | null | undefined
) {
  if (!candidate || !baseline) return false;
  return candidate > baseline;
}

function minIso(
  current: string | null | undefined,
  candidate: string | null | undefined
) {
  if (!candidate) return current ?? null;
  if (!current) return candidate;
  return candidate < current ? candidate : current;
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeRecommendationFeedback(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "like" || normalized === "positive") return "positive";
  if (normalized === "dislike" || normalized === "negative") {
    return "negative";
  }
  return null;
}

function addFirstOccurredAt(
  map: Map<string, string>,
  userId: string,
  occurredAt: string | null | undefined
) {
  if (!userId || !occurredAt) return;
  const nextValue = minIso(map.get(userId), occurredAt);
  if (nextValue) map.set(userId, nextValue);
}

function addOccurredAt(
  map: Map<string, string[]>,
  userId: string,
  occurredAt: string | null | undefined
) {
  if (!userId || !occurredAt) return;
  const values = map.get(userId) ?? [];
  values.push(occurredAt);
  map.set(userId, values);
}

function latestOccurredAt(map: Map<string, string[]>, userId: string) {
  return (map.get(userId) ?? []).reduce<string | null>(
    (current, occurredAt) => maxIso(current, occurredAt),
    null
  );
}

function hasOccurredAfter(
  map: Map<string, string[]>,
  userId: string,
  baseline: string | null | undefined
) {
  if (!baseline) return false;
  return (map.get(userId) ?? []).some((occurredAt) =>
    isAfter(occurredAt, baseline)
  );
}

function hasOccurredInRangeAfter(
  map: Map<string, string[]>,
  userId: string,
  baseline: string | null | undefined,
  range: AnalyticsDateRange
) {
  if (!baseline) return false;
  return (map.get(userId) ?? []).some(
    (occurredAt) =>
      isWithinAnalyticsDateRange(occurredAt, range) &&
      isAfter(occurredAt, baseline)
  );
}

function countIntersection(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) count += 1;
  }
  return count;
}

function filterUserIdsByDateRange(
  occurredAtByUserId: Map<string, string>,
  range: AnalyticsDateRange
) {
  const userIds = new Set<string>();
  for (const [userId, occurredAt] of occurredAtByUserId.entries()) {
    if (isWithinAnalyticsDateRange(occurredAt, range)) {
      userIds.add(userId);
    }
  }
  return userIds;
}

function createEmptyStats(): MutableUserStats {
  return {
    appOpenCount: 0,
    companyOpenCount: 0,
    firstRecommendationAt: null,
    jdOpenCount: 0,
    lastMeaningfulAction: null,
    lastMeaningfulActionAt: null,
    messageCount: 0,
    negativeFeedbackCount: 0,
    positiveFeedbackCount: 0,
    profileUpdateCount: 0,
    recommendationCount: 0,
    returnedAfterFirstRecommendation: false,
    statusChangeCount: 0,
    viewedRecommendationCount: 0,
  };
}

function incrementStat(
  statsByUserId: Map<string, MutableUserStats>,
  userId: string,
  key: keyof Pick<
    MutableUserStats,
    | "appOpenCount"
    | "companyOpenCount"
    | "jdOpenCount"
    | "messageCount"
    | "negativeFeedbackCount"
    | "positiveFeedbackCount"
    | "profileUpdateCount"
    | "recommendationCount"
    | "statusChangeCount"
    | "viewedRecommendationCount"
  >
) {
  const stats = statsByUserId.get(userId);
  if (!stats) return;
  stats[key] += 1;
}

function markMeaningfulAction(
  statsByUserId: Map<string, MutableUserStats>,
  userId: string,
  label: string,
  occurredAt: string | null | undefined
) {
  const stats = statsByUserId.get(userId);
  if (!stats || !occurredAt) return;

  if (
    !stats.lastMeaningfulActionAt ||
    isAfter(occurredAt, stats.lastMeaningfulActionAt)
  ) {
    stats.lastMeaningfulAction = label;
    stats.lastMeaningfulActionAt = occurredAt;
  }
}

function getCareerLogAction(type: string) {
  if (type === "career_app_opened") return "career opened";
  if (type.includes("_open_jd")) return "JD opened";
  if (type.includes("_open_company")) return "company opened";
  if (type.includes("_open_detail")) return "recommendation detail";
  if (type.includes("_status_")) return "status changed";
  if (type.includes("_positive")) return "positive feedback";
  if (type.includes("_negative")) return "negative feedback";
  if (type.includes("_question")) return "question";
  if (type.includes("profile_save") || type.includes("settings_save")) {
    return "profile updated";
  }
  if (type.includes("resume_links_save")) return "resume links updated";
  return null;
}

function buildFunnelStep(args: {
  count: number;
  detail: string;
  entryCount: number;
  key: AdminCareerFunnelStepKey;
  label: string;
  previousCount: number | null;
}): AdminCareerFunnelStep {
  return {
    key: args.key,
    label: args.label,
    count: args.count,
    detail: args.detail,
    rateFromPrevious:
      args.previousCount && args.previousCount > 0
        ? args.count / args.previousCount
        : null,
    rateFromEntry: args.entryCount > 0 ? args.count / args.entryCount : null,
  };
}

function buildSummaryMetric(
  key: string,
  label: string,
  value: number,
  detail: string,
  tooltip?: string
): AdminCareerSummaryMetric {
  return { key, label, value, detail, tooltip };
}

function buildQuickSignal(args: {
  denominator: number;
  detail: string;
  key: AdminCareerQuickSignal["key"];
  label: string;
  numerator: number;
  tooltip: string;
}): AdminCareerQuickSignal {
  return {
    key: args.key,
    label: args.label,
    numerator: args.numerator,
    denominator: args.denominator,
    rate: args.denominator > 0 ? args.numerator / args.denominator : null,
    detail: args.detail,
    tooltip: args.tooltip,
  };
}

function isIncludedUser(user: TalentUserRow, excludedEmailSet: Set<string>) {
  return !isEmailExcluded(user.email, excludedEmailSet);
}

function sortUsers(a: AdminCareerUserRow, b: AdminCareerUserRow) {
  const aLast = a.lastActiveAt ?? "";
  const bLast = b.lastActiveAt ?? "";
  if (aLast !== bLast) return bLast.localeCompare(aLast);
  return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
}

function readShouldSendSlackSummary(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  return (payload as { sendSlackSummary?: unknown }).sendSlackSummary === true;
}

function formatAnalyticsPeriod(
  dateRange: AdminCareerAnalyticsResponse["dateRange"]
) {
  if (!dateRange.isActive) return "전체 기간";
  if (dateRange.startDate && dateRange.endDate) {
    return dateRange.startDate === dateRange.endDate
      ? dateRange.startDate
      : `${dateRange.startDate} ~ ${dateRange.endDate}`;
  }
  return dateRange.startDate ?? dateRange.endDate ?? "선택 기간";
}

function formatRate(rate: number | null) {
  if (rate === null) return null;
  return `${Math.round(rate * 1000) / 10}%`;
}

function maskEmail(email: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const [localPart, domain] = normalized.split("@");
  if (!localPart || !domain) return null;
  const visiblePrefix = localPart.slice(0, Math.min(localPart.length, 2));
  return `${visiblePrefix}${localPart.length > 2 ? "***" : "*"}@${domain}`;
}

function buildCareerAnalyticsLlmInput(response: AdminCareerAnalyticsResponse) {
  return {
    generatedAt: response.generatedAt,
    period: formatAnalyticsPeriod(response.dateRange),
    excludedEmailCount: response.excludedEmails.length,
    userCount: response.users.length,
    quickSignals: response.quickSignals.map((signal) => ({
      key: signal.key,
      label: signal.label,
      numerator: signal.numerator,
      denominator: signal.denominator,
      rate: signal.rate,
      rateLabel: formatRate(signal.rate),
      detail: signal.detail,
    })),
    summary: response.summary.map((metric) => ({
      key: metric.key,
      label: metric.label,
      value: metric.value,
      detail: metric.detail,
    })),
    funnel: response.funnel.map((step) => ({
      key: step.key,
      label: step.label,
      count: step.count,
      detail: step.detail,
      rateFromPreviousLabel: formatRate(step.rateFromPrevious),
      rateFromEntryLabel: formatRate(step.rateFromEntry),
    })),
    landingSources: response.landingSources.slice(0, 15),
    recentUserSignalSample: response.users.slice(0, 25).map((user) => ({
      userIdPrefix: user.userId.slice(0, 8),
      email: maskEmail(user.email),
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt,
      lastLoginAt: user.lastLoginAt,
      onboardingDone: user.onboardingDone,
      appOpenCount: user.appOpenCount,
      messageCount: user.messageCount,
      recommendationCount: user.recommendationCount,
      viewedRecommendationCount: user.viewedRecommendationCount,
      jdOpenCount: user.jdOpenCount,
      companyOpenCount: user.companyOpenCount,
      statusChangeCount: user.statusChangeCount,
      positiveFeedbackCount: user.positiveFeedbackCount,
      negativeFeedbackCount: user.negativeFeedbackCount,
      returnedAfterFirstRecommendation: user.returnedAfterFirstRecommendation,
      lastMeaningfulAction: user.lastMeaningfulAction,
    })),
  };
}

async function generateCareerAnalyticsSlackSummary(
  response: AdminCareerAnalyticsResponse
) {
  const systemPrompt = [
    "너는 Harper Career 제품 분석 담당자다.",
    "주어진 admin/career analytics JSON만 근거로 내부 Slack에 보낼 짧은 한국어 요약을 작성한다.",
    "데이터가 적으면 표본이 작다고 명시하고, 수치로 확인되지 않는 원인은 단정하지 않는다.",
  ].join("\n");
  const userPrompt = [
    "아래 데이터로 Slack 메시지 본문을 작성해줘.",
    "형식: 최대 12줄의 Markdown. 포함: 한줄 결론, 핵심 수치 3~5개, 이상/주의점, 다음 액션 1~3개.",
    "비율은 가능한 경우 분자/분모와 함께 적어줘.",
    "",
    JSON.stringify(buildCareerAnalyticsLlmInput(response), null, 2),
  ].join("\n");

  const summary = (
    await xaiInference(
      CAREER_ANALYTICS_SLACK_SUMMARY_MODEL,
      systemPrompt,
      userPrompt,
      0.2,
      1,
      false,
      "admin-career-slack-summary"
    )
  ).trim();

  if (!summary) {
    throw new Error("LLM summary is empty");
  }

  return summary;
}

function getInternalSlackWebhook() {
  const webhookUrl = process.env.SLACK_INTERNAL_NOTI_TOKEN?.trim();
  if (!webhookUrl) {
    throw new Error("SLACK_INTERNAL_NOTI_TOKEN is required");
  }
  return new IncomingWebhook(webhookUrl);
}

function truncateSlackText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 18)).trimEnd()}\n...(truncated)`;
}

async function sendCareerAnalyticsInternalSlackAlert(args: {
  response: AdminCareerAnalyticsResponse;
  summary: string;
}) {
  const period = formatAnalyticsPeriod(args.response.dateRange);
  const generatedAt = new Date(args.response.generatedAt).toLocaleString(
    "ko-KR",
    { timeZone: "Asia/Seoul" }
  );
  const webhook = getInternalSlackWebhook();

  await webhook.send({
    text: `Career Analytics 요약 - ${period}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            "*Career Analytics 요약*",
            `기간: ${period}`,
            `생성: ${generatedAt} KST`,
            `모델: \`${CAREER_ANALYTICS_SLACK_SUMMARY_MODEL}\``,
          ].join("\n"),
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: truncateSlackText(args.summary, 2800),
        },
      },
    ],
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required" },
        { status: 500 }
      );
    }

    if (!isValidAdminPassword(getAdminPassword(req))) {
      return unauthorized();
    }

    const payload = (await req.json().catch(() => null)) as unknown;
    const excludedEmails = readExcludedEmails(payload);
    const excludedEmailSet = new Set(excludedEmails);
    const analyticsDateRange = readAnalyticsDateRange(payload);

    const [
      landingLogs,
      careerLogs,
      loginCompletedLogs,
      talentUsers,
      talentSettings,
      talentMessages,
      talentActivityEvents,
      recommendations,
    ] = await Promise.all([
      fetchAllRows<LandingLogRow>((from, to) =>
        supabaseServer
          .from("landing_logs")
          .select("local_id,type,created_at")
          .or(
            "type.eq.new_visit,type.like.new_visit:%,type.eq.new_session,type.like.new_session:%,type.like.login_email:%"
          )
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<LogRow>((from, to) =>
        supabaseServer
          .from("logs")
          .select("user_id,type,created_at")
          .like("type", "career_%")
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<LogRow>((from, to) =>
        supabaseServer
          .from("logs")
          .select("user_id,type,created_at")
          .eq("type", "login_completed")
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<TalentUserRow>((from, to) =>
        supabaseServer
          .from("talent_users")
          .select(
            "user_id,name,email,created_at,last_logined_at,resume_file_name,resume_links"
          )
          .order("created_at", { ascending: false })
          .range(from, to)
      ),
      fetchAllRows<TalentSettingRow>((from, to) =>
        supabaseServer
          .from("talent_setting")
          .select("user_id,is_onboarding_done,updated_at")
          .order("updated_at", { ascending: false })
          .range(from, to)
      ),
      fetchAllRows<TalentMessageRow>((from, to) =>
        supabaseServer
          .from("talent_messages")
          .select("user_id,role,created_at,message_type")
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<TalentActivityEventRow>((from, to) =>
        supabaseServer
          .from("talent_activity_events")
          .select("talent_id,event_type,occurred_at")
          .eq("event_type", "onboarding_completed")
          .order("occurred_at", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<RecommendationRow>((from, to) =>
        supabaseServer
          .from("talent_opportunity_recommendation")
          .select(
            "talent_id,recommended_at,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
          )
          .order("created_at", { ascending: true })
          .range(from, to)
      ),
    ]);

    const excludedLocalIds = new Set<string>();
    const loginEmailsByLocalId = new Map<string, Set<string>>();
    for (const log of landingLogs) {
      const localId = String(log.local_id ?? "").trim();
      if (!localId) continue;

      const email = parseLandingLoginEmail(log.type);
      if (!email) continue;

      addToSetMap(loginEmailsByLocalId, localId, email);
      if (isEmailExcluded(email, excludedEmailSet)) {
        excludedLocalIds.add(localId);
      }
    }

    const landingEntryLocalIds = new Set<string>();
    const landingLoginLocalIds = new Set<string>();
    const landingLoginEmails = new Set<string>();
    const landingEntrySourceByLocalId = new Map<string, string>();
    const landingSourcesBySource = new Map<string, MutableLandingSourceStats>();
    for (const log of landingLogs) {
      const localId = String(log.local_id ?? "").trim();
      if (!localId || excludedLocalIds.has(localId)) continue;
      if (!isLandingLogEntryType(log.type)) continue;

      landingEntrySourceByLocalId.set(localId, getLandingLogSource(log.type));
    }

    for (const log of landingLogs) {
      const localId = String(log.local_id ?? "").trim();
      if (localId && excludedLocalIds.has(localId)) continue;
      if (!isWithinAnalyticsDateRange(log.created_at, analyticsDateRange)) {
        continue;
      }
      const source = getLandingLogSource(log.type);
      const baseType = getLandingLogBaseType(log.type);

      if (isLandingLogEntryType(log.type)) {
        const sourceStats = getOrCreateLandingSourceStats(
          landingSourcesBySource,
          source
        );
        if (baseType) sourceStats.eventTypes.add(baseType);
        if (localId) {
          landingEntryLocalIds.add(localId);
          sourceStats.entryLocalIds.add(localId);
        }
        continue;
      }

      const email = parseLandingLoginEmail(log.type);
      if (!email || isEmailExcluded(email, excludedEmailSet)) continue;
      if (localId) {
        const resolvedSource =
          landingEntrySourceByLocalId.get(localId) ?? source;
        const loginSourceStats = getOrCreateLandingSourceStats(
          landingSourcesBySource,
          resolvedSource
        );
        landingLoginLocalIds.add(localId);
        loginSourceStats.loginLocalIds.add(localId);
        loginSourceStats.eventTypes.add("login_email");
      }
      landingLoginEmails.add(email);
    }

    const includedTalentUsers = talentUsers.filter((user) =>
      isIncludedUser(user, excludedEmailSet)
    );
    const includedUserIds = new Set(
      includedTalentUsers.map((user) => user.user_id).filter(Boolean)
    );

    const settingByUserId = new Map<string, TalentSettingRow>();
    for (const setting of talentSettings) {
      if (!includedUserIds.has(setting.user_id)) continue;
      settingByUserId.set(setting.user_id, setting);
    }

    const statsByUserId = new Map<string, MutableUserStats>();
    for (const user of includedTalentUsers) {
      statsByUserId.set(user.user_id, createEmptyStats());
    }

    const onboardingStepUsers = new Map<AdminCareerFunnelStepKey, Set<string>>([
      ["onboarding_basic", new Set<string>()],
      ["onboarding_role", new Set<string>()],
      ["onboarding_profile", new Set<string>()],
      ["onboarding_visibility", new Set<string>()],
    ]);

    const userActivityRowsByUserId = new Map<string, string[]>();
    const latestLoginCompletedAtByUserId = new Map<string, string>();
    for (const log of loginCompletedLogs) {
      const userId = String(log.user_id ?? "").trim();
      if (!userId || !includedUserIds.has(userId)) continue;

      addOccurredAt(userActivityRowsByUserId, userId, log.created_at);

      const latestLoginCompletedAt = maxIso(
        latestLoginCompletedAtByUserId.get(userId),
        log.created_at
      );
      if (latestLoginCompletedAt) {
        latestLoginCompletedAtByUserId.set(userId, latestLoginCompletedAt);
      }
    }

    const firstSignupAtByUserId = new Map<string, string>();
    const firstProfileSubmittedAtByUserId = new Map<string, string>();
    for (const log of careerLogs) {
      const userId = String(log.user_id ?? "").trim();
      const type = String(log.type ?? "").trim();
      if (!userId || !type || !includedUserIds.has(userId)) continue;

      const stats = statsByUserId.get(userId);
      if (!stats) continue;

      addOccurredAt(userActivityRowsByUserId, userId, log.created_at);
      const isInAnalyticsRange = isWithinAnalyticsDateRange(
        log.created_at,
        analyticsDateRange
      );

      if (type === "career_app_opened") {
        incrementStat(statsByUserId, userId, "appOpenCount");
      }
      if (type === "career_signup_completed") {
        addFirstOccurredAt(firstSignupAtByUserId, userId, log.created_at);
      }
      if (type === "career_onboarding_submitted") {
        addFirstOccurredAt(
          firstProfileSubmittedAtByUserId,
          userId,
          log.created_at
        );
      }
      if (
        isInAnalyticsRange &&
        type === "career_click_onboarding_next_step_1"
      ) {
        onboardingStepUsers.get("onboarding_basic")?.add(userId);
      }
      if (
        isInAnalyticsRange &&
        type === "career_click_onboarding_next_step_2"
      ) {
        onboardingStepUsers.get("onboarding_role")?.add(userId);
      }
      if (
        isInAnalyticsRange &&
        type === "career_click_onboarding_next_step_3"
      ) {
        onboardingStepUsers.get("onboarding_profile")?.add(userId);
      }
      if (
        isInAnalyticsRange &&
        (type === "career_click_onboarding_submit_button" ||
          type === "career_click_onboarding_submit")
      ) {
        onboardingStepUsers.get("onboarding_visibility")?.add(userId);
      }
      if (type.includes("_open_jd")) {
        incrementStat(statsByUserId, userId, "jdOpenCount");
      }
      if (type.includes("_open_company")) {
        incrementStat(statsByUserId, userId, "companyOpenCount");
      }
      if (type.includes("_status_")) {
        incrementStat(statsByUserId, userId, "statusChangeCount");
      }
      if (type.includes("profile_save") || type.includes("settings_save")) {
        incrementStat(statsByUserId, userId, "profileUpdateCount");
      }

      const action = getCareerLogAction(type);
      if (action) {
        markMeaningfulAction(statsByUserId, userId, action, log.created_at);
      }
    }

    for (const message of talentMessages) {
      if (!includedUserIds.has(message.user_id) || message.role !== "user") {
        continue;
      }
      if (message.message_type === "profile_submit") {
        addFirstOccurredAt(
          firstProfileSubmittedAtByUserId,
          message.user_id,
          message.created_at
        );
      }
      incrementStat(statsByUserId, message.user_id, "messageCount");
      addOccurredAt(
        userActivityRowsByUserId,
        message.user_id,
        message.created_at
      );
      markMeaningfulAction(
        statsByUserId,
        message.user_id,
        "message sent",
        message.created_at
      );
    }

    for (const user of includedTalentUsers) {
      if (!firstSignupAtByUserId.has(user.user_id)) {
        addFirstOccurredAt(
          firstSignupAtByUserId,
          user.user_id,
          user.created_at
        );
      }
    }

    const firstOnboardingCompletedAtByUserId = new Map<string, string>();
    for (const event of talentActivityEvents) {
      if (
        event.event_type !== "onboarding_completed" ||
        !includedUserIds.has(event.talent_id)
      ) {
        continue;
      }
      addFirstOccurredAt(
        firstOnboardingCompletedAtByUserId,
        event.talent_id,
        event.occurred_at
      );
    }
    for (const setting of talentSettings) {
      if (!includedUserIds.has(setting.user_id)) continue;
      if (!setting.is_onboarding_done) continue;
      if (!firstOnboardingCompletedAtByUserId.has(setting.user_id)) {
        addFirstOccurredAt(
          firstOnboardingCompletedAtByUserId,
          setting.user_id,
          setting.updated_at
        );
      }
    }

    for (const recommendation of recommendations) {
      const userId = recommendation.talent_id;
      if (!includedUserIds.has(userId)) continue;

      const stats = statsByUserId.get(userId);
      if (!stats) continue;

      incrementStat(statsByUserId, userId, "recommendationCount");
      const recommendedAt =
        recommendation.recommended_at ?? recommendation.created_at;
      if (
        recommendedAt &&
        (!stats.firstRecommendationAt ||
          recommendedAt < stats.firstRecommendationAt)
      ) {
        stats.firstRecommendationAt = recommendedAt;
      }

      if (recommendation.viewed_at) {
        incrementStat(statsByUserId, userId, "viewedRecommendationCount");
        addOccurredAt(
          userActivityRowsByUserId,
          userId,
          recommendation.viewed_at
        );
        markMeaningfulAction(
          statsByUserId,
          userId,
          "recommendation viewed",
          recommendation.viewed_at
        );
      }
      if (recommendation.clicked_at) {
        addOccurredAt(
          userActivityRowsByUserId,
          userId,
          recommendation.clicked_at
        );
        markMeaningfulAction(
          statsByUserId,
          userId,
          "JD clicked",
          recommendation.clicked_at
        );
      }
      const feedback = normalizeRecommendationFeedback(recommendation.feedback);
      if (feedback === "positive") {
        incrementStat(statsByUserId, userId, "positiveFeedbackCount");
        addOccurredAt(
          userActivityRowsByUserId,
          userId,
          recommendation.feedback_at ?? recommendation.updated_at
        );
        markMeaningfulAction(
          statsByUserId,
          userId,
          "positive feedback",
          recommendation.feedback_at ?? recommendation.updated_at
        );
      }
      if (feedback === "negative") {
        incrementStat(statsByUserId, userId, "negativeFeedbackCount");
        addOccurredAt(
          userActivityRowsByUserId,
          userId,
          recommendation.feedback_at ?? recommendation.updated_at
        );
        markMeaningfulAction(
          statsByUserId,
          userId,
          "negative feedback",
          recommendation.feedback_at ?? recommendation.updated_at
        );
      }
      if (recommendation.saved_stage) {
        incrementStat(statsByUserId, userId, "statusChangeCount");
        addOccurredAt(
          userActivityRowsByUserId,
          userId,
          recommendation.updated_at
        );
      }
    }

    for (const user of includedTalentUsers) {
      const stats = statsByUserId.get(user.user_id);
      if (!stats || !stats.firstRecommendationAt) continue;

      const userActivityAfterRecommendation = hasOccurredAfter(
        userActivityRowsByUserId,
        user.user_id,
        stats.firstRecommendationAt
      );
      stats.returnedAfterFirstRecommendation =
        userActivityAfterRecommendation ||
        isAfter(user.last_logined_at, stats.firstRecommendationAt);
    }

    const signupUserIds = new Set(firstSignupAtByUserId.keys());
    const rangedSignupUserIds = filterUserIdsByDateRange(
      firstSignupAtByUserId,
      analyticsDateRange
    );
    const onboardingCompletedUserIds = new Set(
      firstOnboardingCompletedAtByUserId.keys()
    );
    const rangedOnboardingCompletedUserIds = filterUserIdsByDateRange(
      firstOnboardingCompletedAtByUserId,
      analyticsDateRange
    );
    const submittedUserIds = new Set(firstProfileSubmittedAtByUserId.keys());
    const rangedSubmittedUserIds = filterUserIdsByDateRange(
      firstProfileSubmittedAtByUserId,
      analyticsDateRange
    );
    const recommendedUserIds = new Set(
      Array.from(statsByUserId.entries())
        .filter(([, stats]) => stats.recommendationCount > 0)
        .map(([userId]) => userId)
    );
    const firstRecommendedUserIds = new Set(
      Array.from(statsByUserId.entries())
        .filter(([, stats]) => Boolean(stats.firstRecommendationAt))
        .map(([userId]) => userId)
    );
    const rangedFirstRecommendedUserIds = new Set(
      Array.from(statsByUserId.entries())
        .filter(
          ([, stats]) =>
            Boolean(stats.firstRecommendationAt) &&
            isWithinAnalyticsDateRange(
              stats.firstRecommendationAt,
              analyticsDateRange
            )
        )
        .map(([userId]) => userId)
    );
    const returnedAfterFirstRecommendationUserIds = new Set(
      Array.from(statsByUserId.entries())
        .filter(([, stats]) => stats.returnedAfterFirstRecommendation)
        .map(([userId]) => userId)
    );
    const rangedReturnedAfterFirstRecommendationUserIds = new Set<string>();
    if (analyticsDateRange.isActive) {
      for (const user of includedTalentUsers) {
        const stats = statsByUserId.get(user.user_id);
        if (!stats?.firstRecommendationAt) continue;

        if (
          isWithinAnalyticsDateRange(
            user.last_logined_at,
            analyticsDateRange
          ) &&
          isAfter(user.last_logined_at, stats.firstRecommendationAt)
        ) {
          rangedReturnedAfterFirstRecommendationUserIds.add(user.user_id);
          continue;
        }

        if (
          hasOccurredInRangeAfter(
            userActivityRowsByUserId,
            user.user_id,
            stats.firstRecommendationAt,
            analyticsDateRange
          )
        ) {
          rangedReturnedAfterFirstRecommendationUserIds.add(user.user_id);
        }
      }
    }

    const entryCount = landingEntryLocalIds.size;
    const onboardingCompletedCount = analyticsDateRange.isActive
      ? rangedOnboardingCompletedUserIds.size
      : onboardingCompletedUserIds.size;
    const onboardingBasicCount = Math.max(
      onboardingStepUsers.get("onboarding_basic")?.size ?? 0,
      onboardingCompletedCount
    );
    const onboardingRoleCount = Math.max(
      onboardingStepUsers.get("onboarding_role")?.size ?? 0,
      onboardingCompletedCount
    );
    const onboardingProfileCount = Math.max(
      onboardingStepUsers.get("onboarding_profile")?.size ?? 0,
      onboardingCompletedCount
    );
    const onboardingVisibilityCount = Math.max(
      onboardingStepUsers.get("onboarding_visibility")?.size ?? 0,
      onboardingCompletedCount
    );
    const funnelRaw = [
      {
        key: "landing_entry" as const,
        label: "Landing entry",
        count: entryCount,
        detail: "landing_logs.type=new_visit[:source] / new_session[:source]",
      },
      {
        key: "login" as const,
        label: "Landing login",
        count: landingLoginLocalIds.size || landingLoginEmails.size,
        detail: "landing_logs.type=login_email:<email>[:source]",
      },
      {
        key: "onboarding_basic" as const,
        label: "기본 정보 통과",
        count: onboardingBasicCount,
        detail: "career_click_onboarding_next_step_1 + 완료 유저 보정",
      },
      {
        key: "onboarding_role" as const,
        label: "찾는 역할 통과",
        count: onboardingRoleCount,
        detail: "career_click_onboarding_next_step_2 + 완료 유저 보정",
      },
      {
        key: "onboarding_profile" as const,
        label: "프로필 자료 통과",
        count: onboardingProfileCount,
        detail: "career_click_onboarding_next_step_3 + 완료 유저 보정",
      },
      {
        key: "onboarding_visibility" as const,
        label: "공개 범위 제출",
        count: onboardingVisibilityCount,
        detail: "career_click_onboarding_submit* + 완료 유저 보정",
      },
      {
        key: "onboarding_completed" as const,
        label: "Onboarding complete",
        count: onboardingCompletedCount,
        detail: "onboarding_completed event + 설정 보정",
      },
      {
        key: "returned_after_first_recommendation" as const,
        label: "첫 추천 후 재접속",
        count: analyticsDateRange.isActive
          ? rangedReturnedAfterFirstRecommendationUserIds.size
          : returnedAfterFirstRecommendationUserIds.size,
        detail: "user activity after first recommendation",
      },
    ];

    const funnel: AdminCareerFunnelStep[] = funnelRaw.map((step, index) =>
      buildFunnelStep({
        ...step,
        entryCount,
        previousCount:
          index === 0 ? null : (funnelRaw[index - 1]?.count ?? null),
      })
    );

    const thirtyDaysAgo = daysAgoIso(30);
    const sevenDaysAgo = daysAgoIso(7);
    const userRows: AdminCareerUserRow[] = includedTalentUsers.map((user) => {
      const stats = statsByUserId.get(user.user_id) ?? createEmptyStats();
      const createdAt = user.created_at ?? null;
      const lastActiveAt = [
        user.last_logined_at,
        latestLoginCompletedAtByUserId.get(user.user_id),
        latestOccurredAt(userActivityRowsByUserId, user.user_id),
      ].reduce<string | null>((current, value) => maxIso(current, value), null);
      const profileSignalCount =
        (user.resume_file_name ? 1 : 0) + (user.resume_links?.length ?? 0);
      const fallbackMeaningfulAction =
        stats.recommendationCount > 0 ? "recommendation received" : null;

      return {
        userId: user.user_id,
        name: user.name,
        email: user.email,
        createdAt,
        lastActiveAt,
        lastLoginAt: user.last_logined_at,
        onboardingDone: Boolean(
          settingByUserId.get(user.user_id)?.is_onboarding_done
        ),
        appOpenCount: stats.appOpenCount,
        messageCount: stats.messageCount,
        recommendationCount: stats.recommendationCount,
        viewedRecommendationCount: stats.viewedRecommendationCount,
        jdOpenCount: Math.max(
          stats.jdOpenCount,
          recommendations.filter(
            (item) => item.talent_id === user.user_id && item.clicked_at
          ).length
        ),
        companyOpenCount: stats.companyOpenCount,
        statusChangeCount: stats.statusChangeCount,
        positiveFeedbackCount: stats.positiveFeedbackCount,
        negativeFeedbackCount: stats.negativeFeedbackCount,
        profileUpdateCount: stats.profileUpdateCount + profileSignalCount,
        firstRecommendationAt: stats.firstRecommendationAt,
        returnedAfterFirstRecommendation:
          stats.returnedAfterFirstRecommendation,
        lastMeaningfulAction:
          stats.lastMeaningfulAction ?? fallbackMeaningfulAction,
      };
    });

    const sortedUsers = userRows.sort(sortUsers);
    const activeSevenDayUsers = sortedUsers.filter(
      (user) => user.lastActiveAt && user.lastActiveAt >= sevenDaysAgo
    ).length;
    const activeThirtyDayUsers = sortedUsers.filter(
      (user) => user.lastActiveAt && user.lastActiveAt >= thirtyDaysAgo
    ).length;
    const engagedUsers = sortedUsers.filter(
      (user) =>
        user.messageCount > 0 ||
        user.viewedRecommendationCount > 0 ||
        user.jdOpenCount > 0 ||
        user.companyOpenCount > 0
    ).length;
    const signalUsers = sortedUsers.filter(
      (user) =>
        user.positiveFeedbackCount > 0 ||
        user.negativeFeedbackCount > 0 ||
        user.statusChangeCount > 0 ||
        user.profileUpdateCount > 0
    ).length;
    const totalPositiveFeedback = sortedUsers.reduce(
      (sum, user) => sum + user.positiveFeedbackCount,
      0
    );
    const totalNegativeFeedback = sortedUsers.reduce(
      (sum, user) => sum + user.negativeFeedbackCount,
      0
    );
    const rangedNewUserIds = new Set<string>();
    const rangedActiveUserIds = new Set<string>();
    const rangedCareerOpenedUserIds = new Set<string>();
    const rangedRecommendedUserIds = new Set<string>();
    const rangedEngagedUserIds = new Set<string>();
    const rangedSignalUserIds = new Set<string>();
    let rangedPositiveFeedback = 0;
    let rangedNegativeFeedback = 0;

    if (analyticsDateRange.isActive) {
      for (const user of includedTalentUsers) {
        if (isWithinAnalyticsDateRange(user.created_at, analyticsDateRange)) {
          rangedNewUserIds.add(user.user_id);
        }
        if (
          isWithinAnalyticsDateRange(user.last_logined_at, analyticsDateRange)
        ) {
          rangedActiveUserIds.add(user.user_id);
        }
      }

      for (const log of loginCompletedLogs) {
        const userId = String(log.user_id ?? "").trim();
        if (!userId || !includedUserIds.has(userId)) continue;
        if (!isWithinAnalyticsDateRange(log.created_at, analyticsDateRange)) {
          continue;
        }

        rangedActiveUserIds.add(userId);
      }

      for (const log of careerLogs) {
        const userId = String(log.user_id ?? "").trim();
        const type = String(log.type ?? "").trim();
        if (!userId || !type || !includedUserIds.has(userId)) continue;
        if (!isWithinAnalyticsDateRange(log.created_at, analyticsDateRange)) {
          continue;
        }

        rangedActiveUserIds.add(userId);
        if (type === "career_app_opened") {
          rangedCareerOpenedUserIds.add(userId);
        }
        if (
          type.includes("_open_jd") ||
          type.includes("_open_company") ||
          type.includes("_open_detail")
        ) {
          rangedEngagedUserIds.add(userId);
        }
        if (
          type.includes("_status_") ||
          type.includes("_positive") ||
          type.includes("_negative") ||
          type.includes("profile_save") ||
          type.includes("settings_save") ||
          type.includes("resume_links_save")
        ) {
          rangedSignalUserIds.add(userId);
        }
      }

      for (const message of talentMessages) {
        if (!includedUserIds.has(message.user_id) || message.role !== "user") {
          continue;
        }
        if (
          !isWithinAnalyticsDateRange(message.created_at, analyticsDateRange)
        ) {
          continue;
        }

        rangedActiveUserIds.add(message.user_id);
        rangedEngagedUserIds.add(message.user_id);
      }

      for (const recommendation of recommendations) {
        const userId = recommendation.talent_id;
        if (!includedUserIds.has(userId)) continue;

        const recommendedAt =
          recommendation.recommended_at ?? recommendation.created_at;
        if (isWithinAnalyticsDateRange(recommendedAt, analyticsDateRange)) {
          rangedRecommendedUserIds.add(userId);
        }
        if (
          isWithinAnalyticsDateRange(
            recommendation.viewed_at,
            analyticsDateRange
          )
        ) {
          rangedActiveUserIds.add(userId);
          rangedEngagedUserIds.add(userId);
        }
        if (
          isWithinAnalyticsDateRange(
            recommendation.clicked_at,
            analyticsDateRange
          )
        ) {
          rangedActiveUserIds.add(userId);
          rangedEngagedUserIds.add(userId);
        }

        const feedbackAt =
          recommendation.feedback_at ?? recommendation.updated_at;
        const feedback = normalizeRecommendationFeedback(
          recommendation.feedback
        );
        if (
          feedback === "positive" &&
          isWithinAnalyticsDateRange(feedbackAt, analyticsDateRange)
        ) {
          rangedPositiveFeedback += 1;
          rangedActiveUserIds.add(userId);
          rangedSignalUserIds.add(userId);
        }
        if (
          feedback === "negative" &&
          isWithinAnalyticsDateRange(feedbackAt, analyticsDateRange)
        ) {
          rangedNegativeFeedback += 1;
          rangedActiveUserIds.add(userId);
          rangedSignalUserIds.add(userId);
        }
        if (
          recommendation.saved_stage &&
          isWithinAnalyticsDateRange(
            recommendation.updated_at,
            analyticsDateRange
          )
        ) {
          rangedActiveUserIds.add(userId);
          rangedSignalUserIds.add(userId);
        }
      }
    }

    const selectedSignupUserIds = analyticsDateRange.isActive
      ? rangedSignupUserIds
      : signupUserIds;
    const selectedSubmittedUserIds = analyticsDateRange.isActive
      ? rangedSubmittedUserIds
      : submittedUserIds;
    const selectedOnboardingCompletedUserIds = analyticsDateRange.isActive
      ? rangedOnboardingCompletedUserIds
      : onboardingCompletedUserIds;
    const selectedFirstRecommendedUserIds = analyticsDateRange.isActive
      ? rangedFirstRecommendedUserIds
      : firstRecommendedUserIds;
    const selectedReturnedAfterFirstRecommendationUserIds =
      analyticsDateRange.isActive
        ? rangedReturnedAfterFirstRecommendationUserIds
        : returnedAfterFirstRecommendationUserIds;
    const signupToSubmissionCount = countIntersection(
      selectedSignupUserIds,
      selectedSubmittedUserIds
    );
    const submissionToOnboardingCount = countIntersection(
      selectedSubmittedUserIds,
      selectedOnboardingCompletedUserIds
    );
    const returnedAfterFirstRecommendationCount = countIntersection(
      selectedFirstRecommendedUserIds,
      selectedReturnedAfterFirstRecommendationUserIds
    );
    const quickSignals: AdminCareerQuickSignal[] = [
      buildQuickSignal({
        key: "signup_to_submission",
        label: "회원가입 -> 제출",
        numerator: signupToSubmissionCount,
        denominator: selectedSignupUserIds.size,
        detail: analyticsDateRange.isActive
          ? "선택 기간 가입자 중 같은 기간 프로필 제출"
          : "전체 가입자 중 프로필 제출",
        tooltip:
          "회원가입은 logs.type='career_signup_completed'의 첫 발생 기준이며, 과거 로그가 없으면 talent_users.created_at으로 보정합니다. 제출은 talent_messages.message_type='profile_submit' 또는 logs.type='career_onboarding_submitted'의 첫 발생 기준입니다.",
      }),
      buildQuickSignal({
        key: "submission_to_onboarding",
        label: "제출 -> 온보딩 완료",
        numerator: submissionToOnboardingCount,
        denominator: selectedSubmittedUserIds.size,
        detail: analyticsDateRange.isActive
          ? "선택 기간 제출자 중 같은 기간 완료"
          : "전체 제출자 중 온보딩 완료",
        tooltip:
          "제출은 프로필 제출 성공 기준이고, 온보딩 완료는 talent_activity_events.event_type='onboarding_completed'의 첫 발생 기준입니다. 과거 이벤트가 없으면 talent_setting.updated_at으로 보정합니다.",
      }),
      buildQuickSignal({
        key: "returned_after_first_recommendation",
        label: "첫 추천 후 재접속",
        numerator: returnedAfterFirstRecommendationCount,
        denominator: selectedFirstRecommendedUserIds.size,
        detail: analyticsDateRange.isActive
          ? "선택 기간 첫 추천자 중 같은 기간 재접속"
          : "첫 추천 받은 유저 중 재접속",
        tooltip:
          "첫 추천 이후 login_completed, career 로그, 유저 메시지, 추천 열람/클릭/피드백/status 변경, 또는 talent_users.last_logined_at이 있으면 재접속으로 봅니다. 시스템 추천 생성이나 talent_setting.updated_at만으로는 재접속으로 보지 않습니다.",
      }),
    ];

    const summary = analyticsDateRange.isActive
      ? [
          buildSummaryMetric(
            "careerUsers",
            "New users",
            rangedNewUserIds.size,
            "선택 기간 가입",
            "talent_users.created_at이 선택한 KST 날짜 범위 안에 있는 유저 수입니다. 아래 Users 테이블은 이 필터를 적용하지 않습니다."
          ),
          buildSummaryMetric(
            "active7d",
            "Active users",
            rangedActiveUserIds.size,
            "선택 기간 활동",
            "선택 기간 안에 login_completed, talent_users.last_logined_at, career 로그, 유저 메시지, 추천 열람/클릭/피드백/status 변경 중 하나라도 있는 유저 수입니다. 시스템 추천 생성이나 talent_setting.updated_at만으로는 활동으로 보지 않습니다."
          ),
          buildSummaryMetric(
            "active30d",
            "Career opens",
            rangedCareerOpenedUserIds.size,
            "career_app_opened",
            "선택 기간 안에 logs.type='career_app_opened'가 발생한 unique user_id 수입니다."
          ),
          buildSummaryMetric(
            "onboardingCompleted",
            "Onboarding done",
            rangedOnboardingCompletedUserIds.size,
            "완료 이벤트 기준",
            "선택 기간 안에 talent_activity_events.event_type='onboarding_completed'가 있는 유저 수입니다. 과거 이벤트가 없으면 talent_setting.updated_at으로 보정합니다."
          ),
          buildSummaryMetric(
            "recommendedUsers",
            "Recommended users",
            rangedRecommendedUserIds.size,
            "추천 발생 기준",
            "선택 기간 안에 talent_opportunity_recommendation.recommended_at 또는 created_at이 있는 유저 수입니다."
          ),
          buildSummaryMetric(
            "engagedUsers",
            "Engaged users",
            rangedEngagedUserIds.size,
            "메시지/추천/JD/회사",
            "선택 기간 안에 메시지 발송, 추천 열람, JD 클릭, 회사 클릭 중 하나라도 있는 유저 수입니다."
          ),
          buildSummaryMetric(
            "signalUsers",
            "Signal users",
            rangedSignalUserIds.size,
            "피드백/상태/프로필",
            "선택 기간 안에 추천 피드백, saved_stage/status 변경, 프로필/설정 저장 신호가 있는 유저 수입니다."
          ),
          buildSummaryMetric(
            "returnedAfterFirstRecommendation",
            "Returned after first rec",
            rangedReturnedAfterFirstRecommendationUserIds.size,
            "선택 기간 재접속",
            "첫 추천은 전체 기간에서 찾고, 선택 기간 안에 그 이후 login_completed, career 로그, 유저 메시지, 추천 열람/클릭/피드백/status 변경, 또는 last_logined_at이 있는 유저 수입니다."
          ),
          buildSummaryMetric(
            "positiveFeedback",
            "Positive feedback",
            rangedPositiveFeedback,
            "선택 기간 positive",
            "선택 기간 안에 feedback_at 또는 updated_at이 있는 positive 추천 피드백 수입니다."
          ),
          buildSummaryMetric(
            "negativeFeedback",
            "Negative feedback",
            rangedNegativeFeedback,
            "선택 기간 negative",
            "선택 기간 안에 feedback_at 또는 updated_at이 있는 negative 추천 피드백 수입니다."
          ),
        ]
      : [
          buildSummaryMetric(
            "careerUsers",
            "Career users",
            sortedUsers.length,
            "내부 이메일 제외"
          ),
          buildSummaryMetric(
            "active7d",
            "Active 7d",
            activeSevenDayUsers,
            "마지막 활동 기준"
          ),
          buildSummaryMetric(
            "active30d",
            "Active 30d",
            activeThirtyDayUsers,
            "마지막 활동 기준"
          ),
          buildSummaryMetric(
            "onboardingCompleted",
            "Onboarding done",
            onboardingCompletedUserIds.size,
            "완료 이벤트 + 설정 보정"
          ),
          buildSummaryMetric(
            "recommendedUsers",
            "Recommended users",
            recommendedUserIds.size,
            "추천을 1개 이상 받은 유저"
          ),
          buildSummaryMetric(
            "engagedUsers",
            "Engaged users",
            engagedUsers,
            "메시지/추천 열람/JD/회사 클릭"
          ),
          buildSummaryMetric(
            "signalUsers",
            "Signal users",
            signalUsers,
            "피드백/상태/프로필 신호"
          ),
          buildSummaryMetric(
            "returnedAfterFirstRecommendation",
            "Returned after first rec",
            returnedAfterFirstRecommendationUserIds.size,
            "첫 추천 이후 재접속"
          ),
          buildSummaryMetric(
            "positiveFeedback",
            "Positive feedback",
            totalPositiveFeedback,
            "추천 positive"
          ),
          buildSummaryMetric(
            "negativeFeedback",
            "Negative feedback",
            totalNegativeFeedback,
            "추천 negative"
          ),
        ];

    const landingSources: AdminCareerLandingSourceBreakdown[] = Array.from(
      landingSourcesBySource.entries()
    )
      .map(([source, stats]) => ({
        source,
        entryCount: stats.entryLocalIds.size,
        loginCount: stats.loginLocalIds.size,
        eventTypes: Array.from(stats.eventTypes).sort((a, b) =>
          a.localeCompare(b)
        ),
      }))
      .filter(
        (item) =>
          item.entryCount > 0 ||
          item.loginCount > 0 ||
          item.eventTypes.length > 0
      )
      .sort((a, b) => {
        if (a.entryCount !== b.entryCount) return b.entryCount - a.entryCount;
        if (a.loginCount !== b.loginCount) return b.loginCount - a.loginCount;
        return a.source.localeCompare(b.source);
      });

    const response: AdminCareerAnalyticsResponse = {
      generatedAt: new Date().toISOString(),
      dateRange: {
        endDate: analyticsDateRange.endDate,
        isActive: analyticsDateRange.isActive,
        startDate: analyticsDateRange.startDate,
      },
      excludedEmails,
      funnel,
      landingSources,
      quickSignals,
      summary,
      users: sortedUsers,
    };

    if (readShouldSendSlackSummary(payload)) {
      const summaryText = await generateCareerAnalyticsSlackSummary(response);
      await sendCareerAnalyticsInternalSlackAlert({
        response,
        summary: summaryText,
      });

      return NextResponse.json({
        ...response,
        slackSummary: {
          model: CAREER_ANALYTICS_SLACK_SUMMARY_MODEL,
          sentAt: new Date().toISOString(),
          summary: summaryText,
        },
      });
    }

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load career analytics",
      },
      { status: 500 }
    );
  }
}
