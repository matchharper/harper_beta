import {
  DEFAULT_ADMIN_EXCLUDED_EMAILS,
  isEmailExcluded,
} from "@/lib/adminEmailExclusions";
import {
  isOfficialJobsLandingAbtestType,
  OFFICIAL_JOBS_APPLY_HELP_VARIANTS,
  OFFICIAL_JOBS_LANDING_SOURCE,
  parseOfficialJobLandingLogType,
  parseOfficialJobsApplyHelpVariant,
} from "@/lib/officialJobs/landingLogs";
import {
  OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE,
  OFFICIAL_JOBS_INTERNAL_COPY_SLUG,
} from "@/lib/officialJobs";
import {
  CAREER_SIGNUP_FLOW_CONTROL_ABTEST_TYPE,
  CAREER_SIGNUP_FLOW_EMAIL_FIRST_ABTEST_TYPE,
} from "@/lib/careerEmailOnboarding/constants";
import {
  extractEmailFromLandingLoginType,
  getLandingLogSource,
  isLandingLogEntryType,
} from "@/lib/landingLogTypes";
import {
  buildReferralFunnelStats,
  type DailyUserStatsReferralFunnelStats,
} from "@/lib/dailyUserStatsReferral";
import { normalizeEmail } from "@/lib/adminMetrics/utils";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

const BATCH_SIZE = 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const NO_RECOMMENDATION_GRACE_PERIOD_MS = 60 * 60 * 1000;
const ACCOUNT_DELETED_LOG_TYPE = "career_account_deleted";
const TOOL_USAGE_LOG_PREFIX = "career_tool_call:";
const TOOL_FAILURE_LOG_PREFIX = "career_tool_call_failed:";
const DAILY_USER_STATS_EXTRA_EXCLUDED_EMAILS = [
  "@matchharper.com",
  "@krewcapital.com",
  "hongbeom.heo@gmail.com",
  "yijunlee.000@gmail.com",
  "khj605123@gmail.com",
  "tarsyang05@gmail.com",
  "junhyuck0819@gmail.com",
  "khj6051@optimizerai.xyz",
  "hyunbin.bk@gmail.com",
  "yijunlee.125@snu.ac.kr",
];
const DAILY_USER_STATS_EXCLUDED_EMAILS = Array.from(
  new Set(
    [
      ...DEFAULT_ADMIN_EXCLUDED_EMAILS,
      ...DAILY_USER_STATS_EXTRA_EXCLUDED_EMAILS,
    ]
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
  )
);

type TalentUserRow = Pick<
  Database["public"]["Tables"]["talent_users"]["Row"],
  "user_id" | "email" | "created_at" | "last_logined_at"
>;
type LogRow = Pick<
  Database["public"]["Tables"]["logs"]["Row"],
  "user_id" | "type" | "created_at"
>;
type TalentMessageRow = Pick<
  Database["public"]["Tables"]["talent_messages"]["Row"],
  "user_id" | "role" | "message_type" | "created_at"
>;
type TalentActivityEventRow = Pick<
  Database["public"]["Tables"]["talent_activity_events"]["Row"],
  "talent_id" | "event_type" | "created_at"
>;
type RecommendationRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_recommendation"]["Row"],
  | "id"
  | "talent_id"
  | "role_id"
  | "opportunity_type"
  | "created_at"
  | "viewed_at"
  | "clicked_at"
  | "feedback"
  | "feedback_at"
  | "saved_stage"
  | "updated_at"
>;
type ExternalNegativeFeedbackReasonRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_recommendation"]["Row"],
  "feedback_at" | "feedback_reason" | "id" | "talent_id" | "updated_at"
>;
type CareerEmailMessageRow = Pick<
  Database["public"]["Tables"]["career_email_messages"]["Row"],
  | "direction"
  | "mail_type"
  | "metadata"
  | "occurred_at"
  | "reply_job_id"
  | "status"
  | "talent_id"
>;
type TalentOpportunityDeliveryRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_delivery"]["Row"],
  "channel" | "discovery_run_id" | "id" | "sent_at" | "status" | "talent_id"
>;
type OpportunityDiscoveryRunRow = Pick<
  Database["public"]["Tables"]["opportunity_discovery_run"]["Row"],
  "completed_at" | "id" | "status" | "talent_id" | "updated_at"
>;
type LandingLogRow = Pick<
  Database["public"]["Tables"]["landing_logs"]["Row"],
  "abtest_type" | "created_at" | "local_id" | "type"
>;
type EmailOnboardingLeadRow = Pick<
  Database["public"]["Tables"]["career_email_onboarding_leads"]["Row"],
  | "abtest_type"
  | "converted_user_id"
  | "created_at"
  | "email"
  | "local_id"
  | "normalized_email"
  | "profile_ingested_at"
  | "profile_received_at"
  | "talent_id"
>;
type OfficialJobRow = Pick<
  Database["public"]["Tables"]["official_jobs"]["Row"],
  "company_name" | "location" | "role_title" | "slug"
>;
type InternalOpportunityRoleRow = Pick<
  Database["public"]["Tables"]["company_roles"]["Row"],
  "name" | "role_id"
> & {
  company_workspace:
    | { company_name: string | null }
    | { company_name: string | null }[]
    | null;
};

type FetchPageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export type DailyUserStatsToolRow = {
  callCount: number;
  failedCallCount: number;
  name: string;
  userCount: number;
};

export type DailyUserStatsJobRow = {
  companyName: string;
  location: string;
  signupCount: number;
  slug: string;
  title: string;
  viewCount: number;
};

export type DailyUserStatsJobsSummary = {
  abtestRows: DailyUserStatsJobsAbtestRow[];
  signupCount: number;
  talkClickCount: number;
  viewCount: number;
  viewedJobCount: number;
};

export type DailyUserStatsJobsAbtestRow = {
  ctaLabel: string;
  entryCount: number;
  helpVisible: boolean;
  label: "A" | "B";
  signupCount: number;
  talkClickCount: number;
};

export type DailyUserStatsInternalConnectionResponseStats = {
  acceptedCount: number;
  endDate: string;
  endIso: string;
  noResponseCount: number;
  recommendationCount: number;
  rejectedCount: number;
  startDate: string;
  startIso: string;
};

export type DailyUserStatsInternalOpportunityStats = {
  acceptedCount: number;
  checkedCount: number;
  recommendationCount: number;
  rejectedCount: number;
};

export type DailyUserStatsInternalOpportunityRecommendationRow = {
  companyName: string;
  roleName: string;
  talentCount: number;
};

export type DailyUserStatsExternalNegativeFeedbackReasonRow = {
  count: number;
  label: string;
  rate: number | null;
};

export type DailyUserStatsExternalNegativeFeedbackReasonStats = {
  endDate: string;
  reasonSelectionResponseCount: number;
  rows: DailyUserStatsExternalNegativeFeedbackReasonRow[];
  startDate: string;
};

export type DailyUserStatsLandingAbtestRow = {
  abtestType: string;
  entryCount: number;
  label: string;
  onboardingCompletedCount: number;
  onboardingCompletedRateFromEntry: number | null;
  signupSubmittedCount: number;
  signupSubmittedRateFromEntry: number | null;
};

export type DailyUserStatsActiveTalentBreakdown = {
  callTranscriptTalentCount: number;
  chatTalentCount: number;
  clickedRecommendationTalentCount: number;
  feedbackRecommendationTalentCount: number;
  inboundEmailTalentCount: number;
  loggedInTalentCount: number;
  savedRecommendationTalentCount: number;
  signupTalentCount: number;
  viewedRecommendationTalentCount: number;
};

export type DailyUserStatsReport = {
  activeTalentBreakdown: DailyUserStatsActiveTalentBreakdown;
  activeTalentsCount: number;
  accountDeletedCount: number;
  callTranscriptMessageCount: number;
  chatMessageCount: number;
  chatUniqueTalentCount: number;
  onboardingCompletedNoRecommendationUserCount: number;
  cumulativeTalentsCount: number;
  date: string;
  dateLabel: string;
  endDateExclusive: string;
  endIso: string;
  externalNegativeFeedbackReasonStats: DailyUserStatsExternalNegativeFeedbackReasonStats;
  failedToolCallCount: number;
  highIntentTalentsCount: number;
  internalConnectionResponseStats: DailyUserStatsInternalConnectionResponseStats | null;
  internalOpportunityRolling7DayStats: DailyUserStatsInternalOpportunityStats;
  internalOpportunityRecommendationRows: DailyUserStatsInternalOpportunityRecommendationRow[];
  internalOpportunityStats: DailyUserStatsInternalOpportunityStats;
  internalRecommendationCount: number;
  jobs: DailyUserStatsJobRow[];
  jobsSummary: DailyUserStatsJobsSummary;
  landingAbtestRows: DailyUserStatsLandingAbtestRow[];
  referralFunnelStats: DailyUserStatsReferralFunnelStats;
  harperMailReplyCount: number;
  mailReplyCount: number;
  mailSentCount: number;
  negativeFeedbackCount: number;
  negativeFeedbackClickedCount: number;
  newSignupFourPlusChatDropoffCount: number;
  newSignupOnboardingCompletedCount: number;
  newSignupSubmittedCount: number;
  newVisitorCount: number;
  onboardingCompletedCount: number;
  opportunityDiscoveryFailedRunCount: number;
  period: "daily" | "weekly";
  periodicRecommendationMailUserCount: number;
  positiveFeedbackCount: number;
  recommendationCount: number;
  returningOnboardingCompletedCount: number;
  returningSubmittedCount: number;
  signupCount: number;
  startDate: string;
  startIso: string;
  submittedCount: number;
  toolFailureRate: number | null;
  tools: DailyUserStatsToolRow[];
  userMessageCount: number;
  userMessageUniqueTalentCount: number;
  viewedRecommendationCount: number;
};

export type DailyUserStatsSlackMessages = {
  details: string;
  jobs: string;
  main: string;
  tools: string;
};

type KstDateRange = {
  date: string;
  dateLabel: string;
  endDateExclusive: string;
  endIso: string;
  startDate: string;
  startIso: string;
};

function normalizeDateOnly(value: unknown) {
  const date = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function addDaysToDateOnly(date: string, days: number) {
  const normalized = normalizeDateOnly(date);
  if (!normalized) {
    throw new Error("date must be YYYY-MM-DD");
  }

  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0, 0))
    .toISOString()
    .slice(0, 10);
}

function getKstDateOnly(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function getKstWeekStartDate(date: string) {
  const normalized = normalizeDateOnly(date);
  if (!normalized) {
    throw new Error("date must be YYYY-MM-DD");
  }

  const [year, month, day] = normalized.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  const daysSinceMonday = (parsed.getUTCDay() + 6) % 7;
  return addDaysToDateOnly(normalized, -daysSinceMonday);
}

export function getDefaultDailyUserStatsDate(now = new Date()) {
  return addDaysToDateOnly(getKstDateOnly(now), -1);
}

export function resolveDailyUserStatsDate(value: unknown, now = new Date()) {
  return normalizeDateOnly(value) ?? getDefaultDailyUserStatsDate(now);
}

export function getDefaultWeeklyUserStatsStartDate(now = new Date()) {
  const currentWeekStart = getKstWeekStartDate(getKstDateOnly(now));
  return addDaysToDateOnly(currentWeekStart, -7);
}

export function resolveWeeklyUserStatsStartDate(
  value: unknown,
  now = new Date()
) {
  const normalized = normalizeDateOnly(value);
  if (normalized) return getKstWeekStartDate(normalized);
  return getDefaultWeeklyUserStatsStartDate(now);
}

function getKstRange(startDate: string, dayCount: number): KstDateRange {
  const normalizedStartDate = normalizeDateOnly(startDate);
  if (!normalizedStartDate) {
    throw new Error("date must be YYYY-MM-DD");
  }
  if (!Number.isInteger(dayCount) || dayCount <= 0) {
    throw new Error("dayCount must be a positive integer");
  }

  const [year, month, day] = normalizedStartDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + dayCount, -9, 0, 0, 0));
  const endDateExclusive = addDaysToDateOnly(normalizedStartDate, dayCount);
  const endDateInclusive = addDaysToDateOnly(endDateExclusive, -1);
  const dateLabel =
    dayCount === 1
      ? normalizedStartDate
      : `${normalizedStartDate} ~ ${endDateInclusive}`;
  return {
    date: normalizedStartDate,
    dateLabel,
    endDateExclusive,
    endIso: end.toISOString(),
    startDate: normalizedStartDate,
    startIso: start.toISOString(),
  };
}

function getKstDayRange(date: string) {
  return getKstRange(date, 1);
}

function getKstWeekRange(weekStartDate: string) {
  return getKstRange(weekStartDate, 7);
}

function isInRange(
  value: string | null | undefined,
  startIso: string,
  endIso: string
) {
  return Boolean(value && value >= startIso && value < endIso);
}

function addMillisecondsToIso(value: string, milliseconds: number) {
  return new Date(new Date(value).getTime() + milliseconds).toISOString();
}

async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<FetchPageResult<T>>
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + BATCH_SIZE - 1;
    const { data, error } = await loadPage(from, to);
    if (error) throw new Error(error.message || "Failed to load rows");

    const page = data ?? [];
    rows.push(...page);
    if (page.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return rows;
}

function normalizeRecommendationFeedback(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "like" || normalized === "positive") return "positive";
  if (normalized === "dislike" || normalized === "negative") return "negative";
  return null;
}

function dedupeRecommendationRows(rows: RecommendationRow[]) {
  const byId = new Map<string, RecommendationRow>();
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (id && !byId.has(id)) byId.set(id, row);
  }
  return Array.from(byId.values());
}

function isInternalOpportunity(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return (
    normalized === "internal_recommendation" || normalized === "intro_request"
  );
}

function addUserId(set: Set<string>, userId: string | null | undefined) {
  const normalized = String(userId ?? "").trim();
  if (normalized) set.add(normalized);
}

function buildUserIdSet(userIds: Iterable<string | null | undefined>) {
  const set = new Set<string>();
  for (const userId of userIds) addUserId(set, userId);
  return set;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getJsonString(value: unknown, key: string) {
  const raw = asRecord(value)[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function getOpportunityDeliveryDedupeKey(args: {
  discoveryRunId: string | null | undefined;
  fallbackId?: string | null;
  talentId: string | null | undefined;
}) {
  const talentId = String(args.talentId ?? "").trim();
  const discoveryRunId = String(args.discoveryRunId ?? "").trim();
  if (talentId && discoveryRunId) return `${talentId}:${discoveryRunId}`;

  const fallbackId = String(args.fallbackId ?? "").trim();
  return fallbackId ? `delivery:${fallbackId}` : "";
}

function countRate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

const EXTERNAL_NEGATIVE_FEEDBACK_REASON_OPTIONS = [
  {
    label: "역할이나 직무가 맞지 않아요",
    value: "역할이나 직무가 맞지 않아요",
  },
  {
    label: "회사 혹은 조건이 기준을 충족하지 못해요",
    value: "회사 혹은 조건이 기준을 충족하지 못해요.",
  },
  {
    label: "이미 지원했던 회사/역할입니다",
    value: "이미 지원했던 회사/역할입니다.",
  },
  {
    label: "만료된 공고에요",
    value: "만료된 공고에요.",
  },
  {
    label: "근무 조건이 맞지않아요(리모트, 위치 등)",
    value: "근무 조건이 맞지않아요(리모트, 위치 등)",
  },
  {
    label: "기타 직접 입력",
    value: "other",
  },
] as const;

function parseExternalNegativeFeedbackReasonOptions(
  feedbackReason: string | null | undefined
) {
  const raw = String(feedbackReason ?? "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as { selectedOptions?: unknown };
    if (Array.isArray(parsed.selectedOptions)) {
      const selectedSet = new Set(
        parsed.selectedOptions.map((value) => String(value).trim())
      );
      return EXTERNAL_NEGATIVE_FEEDBACK_REASON_OPTIONS.filter(
        (option) =>
          selectedSet.has(option.value) || selectedSet.has(option.label)
      ).map((option) => option.value);
    }
  } catch {
    // Older feedback_reason values were stored as " | "-separated text.
  }

  const segments = new Set(
    raw
      .split(" | ")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  return EXTERNAL_NEGATIVE_FEEDBACK_REASON_OPTIONS.filter(
    (option) => segments.has(option.value) || segments.has(option.label)
  ).map((option) => option.value);
}

export function buildExternalNegativeFeedbackReasonStats(args: {
  endDate: string;
  rows: Array<Pick<ExternalNegativeFeedbackReasonRow, "feedback_reason">>;
  startDate: string;
}): DailyUserStatsExternalNegativeFeedbackReasonStats {
  const countByValue = new Map(
    EXTERNAL_NEGATIVE_FEEDBACK_REASON_OPTIONS.map((option) => [option.value, 0])
  );
  let reasonSelectionResponseCount = 0;

  for (const row of args.rows) {
    const selectedOptions = parseExternalNegativeFeedbackReasonOptions(
      row.feedback_reason
    );
    if (selectedOptions.length === 0) continue;

    reasonSelectionResponseCount += 1;
    for (const value of selectedOptions) {
      countByValue.set(value, (countByValue.get(value) ?? 0) + 1);
    }
  }

  return {
    endDate: args.endDate,
    reasonSelectionResponseCount,
    rows: EXTERNAL_NEGATIVE_FEEDBACK_REASON_OPTIONS.map((option) => {
      const count = countByValue.get(option.value) ?? 0;
      return {
        count,
        label: option.label,
        rate: countRate(count, reasonSelectionResponseCount),
      };
    }),
    startDate: args.startDate,
  };
}

const DAILY_USER_STATS_LANDING_ABTEST_VARIANTS = [
  {
    abtestType: CAREER_SIGNUP_FLOW_EMAIL_FIRST_ABTEST_TYPE,
    label: "Email first",
  },
  {
    abtestType: CAREER_SIGNUP_FLOW_CONTROL_ABTEST_TYPE,
    label: "Login first",
  },
] as const;

function minIso(
  current: string | null | undefined,
  candidate: string | null | undefined
) {
  if (!candidate) return current ?? null;
  if (!current) return candidate;
  return candidate < current ? candidate : current;
}

function addFirstOccurredAt(
  map: Map<string, string>,
  userId: string | null | undefined,
  occurredAt: string | null | undefined
) {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId || !occurredAt) return;

  const nextValue = minIso(map.get(normalizedUserId), occurredAt);
  if (nextValue) map.set(normalizedUserId, nextValue);
}

function addSetValue(
  map: Map<string, Set<string>>,
  key: string | null | undefined,
  value: string | null | undefined
) {
  const normalizedKey = String(key ?? "").trim();
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedKey || !normalizedValue) return;

  const set = map.get(normalizedKey) ?? new Set<string>();
  set.add(normalizedValue);
  map.set(normalizedKey, set);
}

function hasEventAfterEntry(args: {
  entryAt: string;
  eventAtByUserId: Map<string, string>;
  userIds: Set<string> | undefined;
}) {
  if (!args.userIds?.size) return false;
  for (const userId of args.userIds) {
    const eventAt = args.eventAtByUserId.get(userId);
    if (eventAt && eventAt >= args.entryAt) return true;
  }
  return false;
}

function parseLandingLoginEmail(type: string | null | undefined) {
  return normalizeEmail(extractEmailFromLandingLoginType(type)) || null;
}

function countIntersection(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) count += 1;
  }
  return count;
}

function parseToolName(type: string | null | undefined, prefix: string) {
  const value = String(type ?? "");
  if (!value.startsWith(prefix)) return "";
  return value.slice(prefix.length).trim() || "unknown_tool";
}

function sortToolRows(a: DailyUserStatsToolRow, b: DailyUserStatsToolRow) {
  if (b.callCount !== a.callCount) return b.callCount - a.callCount;
  if (b.userCount !== a.userCount) return b.userCount - a.userCount;
  if (b.failedCallCount !== a.failedCallCount) {
    return b.failedCallCount - a.failedCallCount;
  }
  return a.name.localeCompare(b.name);
}

function buildToolRows(logs: LogRow[], failureLogs: LogRow[]) {
  const callsByName = new Map<string, number>();
  const failedCallsByName = new Map<string, number>();
  const usersByName = new Map<string, Set<string>>();

  for (const log of logs) {
    const name = parseToolName(log.type, TOOL_USAGE_LOG_PREFIX);
    if (!name) continue;

    callsByName.set(name, (callsByName.get(name) ?? 0) + 1);
    const userId = String(log.user_id ?? "").trim();
    if (userId) {
      const users = usersByName.get(name) ?? new Set<string>();
      users.add(userId);
      usersByName.set(name, users);
    }
  }

  for (const log of failureLogs) {
    const name = parseToolName(log.type, TOOL_FAILURE_LOG_PREFIX);
    if (!name) continue;

    failedCallsByName.set(name, (failedCallsByName.get(name) ?? 0) + 1);
    const userId = String(log.user_id ?? "").trim();
    if (userId) {
      const users = usersByName.get(name) ?? new Set<string>();
      users.add(userId);
      usersByName.set(name, users);
    }
  }

  return Array.from(
    new Set([...callsByName.keys(), ...failedCallsByName.keys()])
  )
    .map((name) => ({
      callCount: callsByName.get(name) ?? 0,
      failedCallCount: failedCallsByName.get(name) ?? 0,
      name,
      userCount: usersByName.get(name)?.size ?? 0,
    }))
    .sort(sortToolRows);
}

function buildJobStats(args: {
  excludedEmailSet: Set<string>;
  jobs: OfficialJobRow[];
  landingLogs: LandingLogRow[];
  signedUpEmails: Set<string>;
}): { rows: DailyUserStatsJobRow[]; summary: DailyUserStatsJobsSummary } {
  const excludedLocalIds = buildExcludedLandingLocalIds({
    excludedEmailSet: args.excludedEmailSet,
    landingLogs: args.landingLogs,
  });

  const signupLocalIds = new Set<string>();
  const pageViewLocalIds = new Set<string>();
  const talkClickLocalIds = new Set<string>();
  const viewsBySlug = new Map<string, Set<string>>();
  const experimentVariantByLocalId = new Map<string, "a" | "b">();
  for (const log of args.landingLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId) continue;

    if (excludedLocalIds.has(localId)) continue;

    const experimentVariant = parseOfficialJobsApplyHelpVariant(
      log.abtest_type
    );
    if (experimentVariant && !experimentVariantByLocalId.has(localId)) {
      experimentVariantByLocalId.set(localId, experimentVariant);
    }

    if (
      isLandingLogEntryType(log.type) &&
      isOfficialJobsLandingAbtestType(log.abtest_type) &&
      getLandingLogSource(log.type) === OFFICIAL_JOBS_LANDING_SOURCE
    ) {
      pageViewLocalIds.add(localId);
      continue;
    }

    const email = parseLandingLoginEmail(log.type);
    if (
      email &&
      getLandingLogSource(log.type) === OFFICIAL_JOBS_LANDING_SOURCE &&
      !isEmailExcluded(email, args.excludedEmailSet) &&
      args.signedUpEmails.has(email)
    ) {
      signupLocalIds.add(localId);
      continue;
    }

    const parsed = parseOfficialJobLandingLogType(log.type);
    if (!parsed) continue;

    if (parsed.event === "list_view") {
      pageViewLocalIds.add(localId);
    } else if (parsed.event === "list_talk_click") {
      talkClickLocalIds.add(localId);
    } else if (parsed.event === "job_view" && parsed.jobSlug) {
      pageViewLocalIds.add(localId);
      const views = viewsBySlug.get(parsed.jobSlug) ?? new Set<string>();
      views.add(localId);
      viewsBySlug.set(parsed.jobSlug, views);
    } else if (parsed.event === "talk_click" && parsed.jobSlug) {
      talkClickLocalIds.add(localId);
    }
  }

  const jobBySlug = new Map(args.jobs.map((job) => [job.slug, job] as const));
  const rows = Array.from(viewsBySlug.entries())
    .map(([slug, views]) => {
      const job = jobBySlug.get(slug);
      return {
        companyName: job?.company_name ?? "-",
        location: job?.location ?? "-",
        signupCount: countIntersection(views, signupLocalIds),
        slug,
        title: job?.role_title ?? slug,
        viewCount: views.size,
      };
    })
    .sort((a, b) => {
      if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
      if (b.signupCount !== a.signupCount) return b.signupCount - a.signupCount;
      return a.title.localeCompare(b.title);
    });

  const abtestRows: DailyUserStatsJobsAbtestRow[] =
    OFFICIAL_JOBS_APPLY_HELP_VARIANTS.map((variantConfig) => {
      const variantLocalIds = new Set(
        Array.from(experimentVariantByLocalId.entries())
          .filter(([, variant]) => variant === variantConfig.variant)
          .map(([localId]) => localId)
      );
      const variantEntryLocalIds = new Set(
        Array.from(pageViewLocalIds).filter((localId) =>
          variantLocalIds.has(localId)
        )
      );

      return {
        ctaLabel: variantConfig.ctaLabel,
        entryCount: variantEntryLocalIds.size,
        helpVisible: variantConfig.helpVisible,
        label: variantConfig.label,
        signupCount: countIntersection(variantEntryLocalIds, signupLocalIds),
        talkClickCount: countIntersection(variantLocalIds, talkClickLocalIds),
      };
    });

  return {
    rows,
    summary: {
      abtestRows,
      signupCount: countIntersection(pageViewLocalIds, signupLocalIds),
      talkClickCount: talkClickLocalIds.size,
      viewCount: pageViewLocalIds.size,
      viewedJobCount: rows.length,
    },
  };
}

function buildExcludedLandingLocalIds(args: {
  excludedEmailSet: Set<string>;
  landingLogs: LandingLogRow[];
}) {
  const excludedLocalIds = new Set<string>();
  for (const log of args.landingLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId) continue;

    const email = parseLandingLoginEmail(log.type);
    if (email && isEmailExcluded(email, args.excludedEmailSet)) {
      excludedLocalIds.add(localId);
    }
  }

  return excludedLocalIds;
}

function countNewVisitors(args: {
  excludedEmailSet: Set<string>;
  landingLogs: LandingLogRow[];
}) {
  const excludedLocalIds = buildExcludedLandingLocalIds(args);
  const visitorLocalIds = new Set<string>();

  for (const log of args.landingLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId || excludedLocalIds.has(localId)) continue;
    if (isLandingLogEntryType(log.type)) visitorLocalIds.add(localId);
  }

  return visitorLocalIds.size;
}

function buildLandingAbtestRows(args: {
  emailOnboardingLeads: EmailOnboardingLeadRow[];
  excludedEmailSet: Set<string>;
  landingLoginLogs: LandingLogRow[];
  landingLogs: LandingLogRow[];
  onboardingEvents: TalentActivityEventRow[];
  profileSubmitMessages: TalentMessageRow[];
  signupAndSubmitLogs: LogRow[];
  talentUsers: TalentUserRow[];
}): DailyUserStatsLandingAbtestRow[] {
  const entryAtByVariant = new Map<string, Map<string, string>>();
  for (const variant of DAILY_USER_STATS_LANDING_ABTEST_VARIANTS) {
    entryAtByVariant.set(variant.abtestType, new Map<string, string>());
  }

  const cohortLocalIds = new Set<string>();
  for (const log of args.landingLogs) {
    if (!isLandingLogEntryType(log.type)) continue;

    const abtestType = String(log.abtest_type ?? "").trim();
    const entryAtByLocalId = entryAtByVariant.get(abtestType);
    if (!entryAtByLocalId) continue;

    const localId = String(log.local_id ?? "").trim();
    if (!localId) continue;

    const firstEntryAt = minIso(entryAtByLocalId.get(localId), log.created_at);
    if (!firstEntryAt) continue;

    entryAtByLocalId.set(localId, firstEntryAt);
    cohortLocalIds.add(localId);
  }

  const excludedLocalIds = buildExcludedLandingLocalIds({
    excludedEmailSet: args.excludedEmailSet,
    landingLogs: [...args.landingLogs, ...args.landingLoginLogs],
  });
  const includedTalentUsers = args.talentUsers.filter(
    (user) => !isEmailExcluded(user.email, args.excludedEmailSet)
  );
  const includedUserIds = new Set(
    includedTalentUsers.map((user) => user.user_id).filter(Boolean)
  );
  const isIncludedUserId = (userId: string | null | undefined) => {
    const normalized = String(userId ?? "").trim();
    return Boolean(normalized && includedUserIds.has(normalized));
  };

  const emailToUserIds = new Map<string, Set<string>>();
  const signupAtByUserId = new Map<string, string>();
  for (const user of includedTalentUsers) {
    const email = normalizeEmail(user.email);
    if (email) addSetValue(emailToUserIds, email, user.user_id);
    addFirstOccurredAt(signupAtByUserId, user.user_id, user.created_at);
  }

  const userIdsByLocalId = new Map<string, Set<string>>();
  for (const log of args.landingLoginLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId || !cohortLocalIds.has(localId)) continue;

    const email = parseLandingLoginEmail(log.type);
    if (!email) continue;
    if (isEmailExcluded(email, args.excludedEmailSet)) {
      excludedLocalIds.add(localId);
      continue;
    }

    for (const userId of emailToUserIds.get(email) ?? []) {
      addSetValue(userIdsByLocalId, localId, userId);
    }
  }

  const submittedAtByUserId = new Map<string, string>();
  for (const lead of args.emailOnboardingLeads) {
    const localId = String(lead.local_id ?? "").trim();
    if (!localId || !cohortLocalIds.has(localId)) continue;

    const email = normalizeEmail(lead.normalized_email || lead.email);
    if (email && isEmailExcluded(email, args.excludedEmailSet)) {
      excludedLocalIds.add(localId);
      continue;
    }

    const leadUserIds = [
      String(lead.talent_id ?? "").trim(),
      String(lead.converted_user_id ?? "").trim(),
    ].filter(Boolean);
    for (const userId of leadUserIds) {
      addSetValue(userIdsByLocalId, localId, userId);
    }
    if (email) {
      for (const userId of emailToUserIds.get(email) ?? []) {
        addSetValue(userIdsByLocalId, localId, userId);
      }
    }

    addFirstOccurredAt(signupAtByUserId, lead.talent_id, lead.created_at);
    const profileSubmittedAt = minIso(
      lead.profile_received_at,
      lead.profile_ingested_at
    );
    addFirstOccurredAt(submittedAtByUserId, lead.talent_id, profileSubmittedAt);
  }

  for (const log of args.signupAndSubmitLogs) {
    if (!isIncludedUserId(log.user_id)) continue;
    if (log.type === "career_signup_completed") {
      addFirstOccurredAt(signupAtByUserId, log.user_id, log.created_at);
    } else if (log.type === "career_onboarding_submitted") {
      addFirstOccurredAt(submittedAtByUserId, log.user_id, log.created_at);
    }
  }

  for (const message of args.profileSubmitMessages) {
    if (!isIncludedUserId(message.user_id)) continue;
    addFirstOccurredAt(
      submittedAtByUserId,
      message.user_id,
      message.created_at
    );
  }

  const completedAtByUserId = new Map<string, string>();
  for (const event of args.onboardingEvents) {
    if (event.event_type !== "onboarding_completed") continue;
    if (!isIncludedUserId(event.talent_id)) continue;
    addFirstOccurredAt(completedAtByUserId, event.talent_id, event.created_at);
  }

  return DAILY_USER_STATS_LANDING_ABTEST_VARIANTS.map((variant) => {
    const entries = Array.from(
      entryAtByVariant.get(variant.abtestType)?.entries() ?? []
    )
      .filter(([localId]) => !excludedLocalIds.has(localId))
      .filter(([localId, entryAt]) => {
        const userIds = userIdsByLocalId.get(localId);
        if (!userIds?.size) return true;

        // A landing entry written only after an already-signed-up user arrives
        // is not an acquisition experiment exposure. This also protects old
        // reports from the authenticated-entry tracking race fixed at source.
        return Array.from(userIds).some((userId) => {
          const signupAt = signupAtByUserId.get(userId);
          return !signupAt || signupAt >= entryAt;
        });
      });
    const entryCount = entries.length;
    let signupSubmittedCount = 0;
    let onboardingCompletedCount = 0;

    for (const [localId, entryAt] of entries) {
      const userIds = userIdsByLocalId.get(localId);
      const hasSignup = hasEventAfterEntry({
        entryAt,
        eventAtByUserId: signupAtByUserId,
        userIds,
      });
      const hasSubmitted = hasEventAfterEntry({
        entryAt,
        eventAtByUserId: submittedAtByUserId,
        userIds,
      });
      if (hasSignup && hasSubmitted) signupSubmittedCount += 1;

      // Keep the reported funnel nested. An existing user can otherwise land
      // after signup/submission and make completion exceed signup+submission.
      const hasCompleted = hasEventAfterEntry({
        entryAt,
        eventAtByUserId: completedAtByUserId,
        userIds,
      });
      if (hasSignup && hasSubmitted && hasCompleted) {
        onboardingCompletedCount += 1;
      }
    }

    return {
      abtestType: variant.abtestType,
      entryCount,
      label: variant.label,
      onboardingCompletedCount,
      onboardingCompletedRateFromEntry: countRate(
        onboardingCompletedCount,
        entryCount
      ),
      signupSubmittedCount,
      signupSubmittedRateFromEntry: countRate(signupSubmittedCount, entryCount),
    };
  });
}

function isUserChatMessage(message: TalentMessageRow) {
  return message.role === "user" && message.message_type === "chat";
}

function isUserCallTranscriptMessage(message: TalentMessageRow) {
  return message.role === "user" && message.message_type === "call_transcript";
}

function buildInternalConnectionResponseStats(args: {
  endDate: string;
  endIso: string;
  rows: RecommendationRow[];
  startDate: string;
  startIso: string;
}): DailyUserStatsInternalConnectionResponseStats {
  const acceptedCount = args.rows.filter(
    (row) => normalizeRecommendationFeedback(row.feedback) === "positive"
  ).length;
  const rejectedCount = args.rows.filter(
    (row) => normalizeRecommendationFeedback(row.feedback) === "negative"
  ).length;
  const noResponseCount = args.rows.length - acceptedCount - rejectedCount;

  return {
    acceptedCount,
    endDate: args.endDate,
    endIso: args.endIso,
    noResponseCount,
    recommendationCount: args.rows.length,
    rejectedCount,
    startDate: args.startDate,
    startIso: args.startIso,
  };
}

export function buildInternalOpportunityStats(
  rows: Array<Pick<RecommendationRow, "feedback" | "viewed_at">>
): DailyUserStatsInternalOpportunityStats {
  const acceptedCount = rows.filter(
    (row) => normalizeRecommendationFeedback(row.feedback) === "positive"
  ).length;
  const rejectedCount = rows.filter(
    (row) => normalizeRecommendationFeedback(row.feedback) === "negative"
  ).length;
  const checkedCount = rows.filter(
    (row) =>
      Boolean(row.viewed_at) ||
      normalizeRecommendationFeedback(row.feedback) !== null
  ).length;

  return {
    acceptedCount,
    checkedCount,
    recommendationCount: rows.length,
    rejectedCount,
  };
}

function chunkArray<T>(values: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function getInternalOpportunityCompanyName(row: InternalOpportunityRoleRow) {
  const workspace = Array.isArray(row.company_workspace)
    ? row.company_workspace[0]
    : row.company_workspace;
  return String(workspace?.company_name ?? "").trim() || "-";
}

async function fetchInternalOpportunityRoleRows(roleIds: Iterable<string>) {
  const normalizedRoleIds = Array.from(
    new Set(
      Array.from(roleIds)
        .map((roleId) => String(roleId ?? "").trim())
        .filter(Boolean)
    )
  );
  if (normalizedRoleIds.length === 0) return [];

  const rows: InternalOpportunityRoleRow[] = [];
  for (const chunk of chunkArray(normalizedRoleIds, BATCH_SIZE)) {
    const { data, error } = await (supabaseServer
      .from("company_roles")
      .select(
        "role_id,name,company_workspace:company_workspace_id(company_name)"
      )
      .in("role_id", chunk) as unknown as PromiseLike<
      FetchPageResult<InternalOpportunityRoleRow>
    >);

    if (error) throw new Error(error.message || "Failed to load company roles");
    rows.push(...(data ?? []));
  }

  return rows;
}

function buildInternalOpportunityRecommendationRows(args: {
  recommendations: RecommendationRow[];
  roles: InternalOpportunityRoleRow[];
}): DailyUserStatsInternalOpportunityRecommendationRow[] {
  const roleById = new Map(
    args.roles.map((role) => [String(role.role_id ?? "").trim(), role] as const)
  );
  const talentIdsByRoleId = new Map<string, Set<string>>();

  for (const row of args.recommendations) {
    const roleId = String(row.role_id ?? "").trim();
    const talentId = String(row.talent_id ?? "").trim();
    if (!roleId || !talentId) continue;

    const talentIds = talentIdsByRoleId.get(roleId) ?? new Set<string>();
    talentIds.add(talentId);
    talentIdsByRoleId.set(roleId, talentIds);
  }

  return Array.from(talentIdsByRoleId.entries())
    .map(([roleId, talentIds]) => {
      const role = roleById.get(roleId);
      return {
        companyName: role ? getInternalOpportunityCompanyName(role) : "-",
        roleName: String(role?.name ?? "").trim() || roleId,
        talentCount: talentIds.size,
      };
    })
    .sort((a, b) => {
      if (b.talentCount !== a.talentCount) return b.talentCount - a.talentCount;
      const companyCompare = a.companyName.localeCompare(b.companyName);
      if (companyCompare !== 0) return companyCompare;
      return a.roleName.localeCompare(b.roleName);
    });
}

async function buildUserStatsReport(args: {
  internalConnectionResponseRange?: KstDateRange | null;
  period: DailyUserStatsReport["period"];
  range: KstDateRange;
}): Promise<DailyUserStatsReport> {
  const { date, dateLabel, endDateExclusive, endIso, startDate, startIso } =
    args.range;
  // The stats cron runs at KST 01:00, so this metric observes recommendations
  // for one hour after the daily/weekly period closes.
  const noRecommendationObservationEndIso = addMillisecondsToIso(
    endIso,
    NO_RECOMMENDATION_GRACE_PERIOD_MS
  );
  const noRecommendationEligibleEventEndIso = addMillisecondsToIso(
    noRecommendationObservationEndIso,
    -NO_RECOMMENDATION_GRACE_PERIOD_MS
  );
  const internalOpportunityRolling7DayRange = getKstRange(
    addDaysToDateOnly(endDateExclusive, -7),
    7
  );
  // Keep rejection reasons on the same window as the report. In particular,
  // the daily cron must not repeat a rolling seven days of reasons each day.
  const externalNegativeFeedbackReasonRange = args.range;
  const excludedEmailSet = new Set(DAILY_USER_STATS_EXCLUDED_EMAILS);

  const [
    talentUsers,
    signupAndSubmitLogs,
    loginCompletedLogs,
    messages,
    onboardingEvents,
    recommendedRows,
    viewedRows,
    clickedRows,
    feedbackAtRows,
    legacyFeedbackRows,
    savedStageRows,
    emailRows,
    opportunityEmailDeliveries,
    failedDiscoveryCompletedRuns,
    failedDiscoveryLegacyRuns,
    noRecommendationOnboardingEvents,
    recommendationTalentRowsBeforeObservationEnd,
    internalOpportunityRolling7DayRows,
    externalNegativeFeedbackReasonAtRows,
    externalNegativeFeedbackReasonLegacyRows,
    internalConnectionResponseRows,
    accountDeletionLogs,
    toolUsageLogs,
    toolFailureLogs,
    landingLogs,
    funnelLoginLogs,
    funnelEmailOnboardingLeads,
    funnelSignupAndSubmitLogs,
    funnelProfileSubmitMessages,
    funnelOnboardingEvents,
    referralVisitLogs,
    officialJobs,
  ] = await Promise.all([
    fetchAllRows<TalentUserRow>((from, to) =>
      supabaseServer
        .from("talent_users")
        .select("user_id,email,created_at,last_logined_at")
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LogRow>((from, to) =>
      supabaseServer
        .from("logs")
        .select("user_id,type,created_at")
        .in("type", ["career_signup_completed", "career_onboarding_submitted"])
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LogRow>((from, to) =>
      supabaseServer
        .from("logs")
        .select("user_id,type,created_at")
        .eq("type", "login_completed")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<TalentMessageRow>((from, to) =>
      supabaseServer
        .from("talent_messages")
        .select("user_id,role,message_type,created_at")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<TalentActivityEventRow>((from, to) =>
      supabaseServer
        .from("talent_activity_events")
        .select("talent_id,event_type,created_at")
        .eq("event_type", "onboarding_completed")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<RecommendationRow>((from, to) =>
      supabaseServer
        .from("talent_opportunity_recommendation")
        .select(
          "id,talent_id,role_id,opportunity_type,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
        )
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<RecommendationRow>((from, to) =>
      supabaseServer
        .from("talent_opportunity_recommendation")
        .select(
          "id,talent_id,role_id,opportunity_type,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
        )
        .gte("viewed_at", startIso)
        .lt("viewed_at", endIso)
        .order("viewed_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<RecommendationRow>((from, to) =>
      supabaseServer
        .from("talent_opportunity_recommendation")
        .select(
          "id,talent_id,role_id,opportunity_type,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
        )
        .gte("clicked_at", startIso)
        .lt("clicked_at", endIso)
        .order("clicked_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<RecommendationRow>((from, to) =>
      supabaseServer
        .from("talent_opportunity_recommendation")
        .select(
          "id,talent_id,role_id,opportunity_type,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
        )
        .not("feedback", "is", null)
        .gte("feedback_at", startIso)
        .lt("feedback_at", endIso)
        .order("feedback_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<RecommendationRow>((from, to) =>
      supabaseServer
        .from("talent_opportunity_recommendation")
        .select(
          "id,talent_id,role_id,opportunity_type,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
        )
        .not("feedback", "is", null)
        .is("feedback_at", null)
        .gte("updated_at", startIso)
        .lt("updated_at", endIso)
        .order("updated_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<RecommendationRow>((from, to) =>
      supabaseServer
        .from("talent_opportunity_recommendation")
        .select(
          "id,talent_id,role_id,opportunity_type,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
        )
        .not("saved_stage", "is", null)
        .gte("updated_at", startIso)
        .lt("updated_at", endIso)
        .order("updated_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<CareerEmailMessageRow>((from, to) =>
      supabaseServer
        .from("career_email_messages")
        .select(
          "talent_id,direction,mail_type,status,occurred_at,metadata,reply_job_id"
        )
        .gte("occurred_at", startIso)
        .lt("occurred_at", endIso)
        .order("occurred_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<TalentOpportunityDeliveryRow>((from, to) =>
      supabaseServer
        .from("talent_opportunity_delivery")
        .select("id,talent_id,discovery_run_id,channel,status,sent_at")
        .eq("channel", "email")
        .eq("status", "sent")
        .gte("sent_at", startIso)
        .lt("sent_at", endIso)
        .order("sent_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<OpportunityDiscoveryRunRow>((from, to) =>
      supabaseServer
        .from("opportunity_discovery_run")
        .select("id,talent_id,status,completed_at,updated_at")
        .eq("status", "failed")
        .gte("completed_at", startIso)
        .lt("completed_at", endIso)
        .order("completed_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<OpportunityDiscoveryRunRow>((from, to) =>
      supabaseServer
        .from("opportunity_discovery_run")
        .select("id,talent_id,status,completed_at,updated_at")
        .eq("status", "failed")
        .is("completed_at", null)
        .gte("updated_at", startIso)
        .lt("updated_at", endIso)
        .order("updated_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<TalentActivityEventRow>((from, to) =>
      supabaseServer
        .from("talent_activity_events")
        .select("talent_id,event_type,created_at")
        .eq("event_type", "onboarding_completed")
        .gte("created_at", startIso)
        .lt("created_at", noRecommendationEligibleEventEndIso)
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<Pick<RecommendationRow, "created_at" | "talent_id">>(
      (from, to) =>
        supabaseServer
          .from("talent_opportunity_recommendation")
          .select("talent_id,created_at")
          .lt("created_at", noRecommendationObservationEndIso)
          .order("created_at", { ascending: true })
          .range(from, to)
    ),
    fetchAllRows<RecommendationRow>((from, to) =>
      supabaseServer
        .from("talent_opportunity_recommendation")
        .select(
          "id,talent_id,role_id,opportunity_type,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
        )
        .gte("created_at", internalOpportunityRolling7DayRange.startIso)
        .lt("created_at", internalOpportunityRolling7DayRange.endIso)
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<ExternalNegativeFeedbackReasonRow>((from, to) =>
      supabaseServer
        .from("talent_opportunity_recommendation")
        .select("id,talent_id,feedback_at,feedback_reason,updated_at")
        .eq("opportunity_type", "external_jd")
        .in("feedback", ["dislike", "negative"])
        .gte("feedback_at", externalNegativeFeedbackReasonRange.startIso)
        .lt("feedback_at", externalNegativeFeedbackReasonRange.endIso)
        .order("feedback_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<ExternalNegativeFeedbackReasonRow>((from, to) =>
      supabaseServer
        .from("talent_opportunity_recommendation")
        .select("id,talent_id,feedback_at,feedback_reason,updated_at")
        .eq("opportunity_type", "external_jd")
        .in("feedback", ["dislike", "negative"])
        .is("feedback_at", null)
        .gte("updated_at", externalNegativeFeedbackReasonRange.startIso)
        .lt("updated_at", externalNegativeFeedbackReasonRange.endIso)
        .order("updated_at", { ascending: true })
        .range(from, to)
    ),
    args.internalConnectionResponseRange
      ? fetchAllRows<RecommendationRow>((from, to) =>
          supabaseServer
            .from("talent_opportunity_recommendation")
            .select(
              "id,talent_id,role_id,opportunity_type,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
            )
            .gte(
              "created_at",
              args.internalConnectionResponseRange?.startIso ?? startIso
            )
            .lt(
              "created_at",
              args.internalConnectionResponseRange?.endIso ?? endIso
            )
            .order("created_at", { ascending: true })
            .range(from, to)
        )
      : Promise.resolve([]),
    fetchAllRows<LogRow>((from, to) =>
      supabaseServer
        .from("logs")
        .select("user_id,type,created_at")
        .eq("type", ACCOUNT_DELETED_LOG_TYPE)
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LogRow>((from, to) =>
      supabaseServer
        .from("logs")
        .select("user_id,type,created_at")
        .like("type", `${TOOL_USAGE_LOG_PREFIX}%`)
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LogRow>((from, to) =>
      supabaseServer
        .from("logs")
        .select("user_id,type,created_at")
        .like("type", `${TOOL_FAILURE_LOG_PREFIX}%`)
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LandingLogRow>((from, to) =>
      supabaseServer
        .from("landing_logs")
        .select("abtest_type,created_at,local_id,type")
        .or(
          "type.eq.new_visit,type.like.new_visit:%,type.eq.new_session,type.like.new_session:%,type.like.official_jobs:%,type.like.login_email:%"
        )
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LandingLogRow>((from, to) =>
      supabaseServer
        .from("landing_logs")
        .select("abtest_type,created_at,local_id,type")
        .like("type", "login_email:%")
        .gte("created_at", startIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<EmailOnboardingLeadRow>((from, to) =>
      supabaseServer
        .from("career_email_onboarding_leads")
        .select(
          "abtest_type,converted_user_id,created_at,email,local_id,normalized_email,profile_ingested_at,profile_received_at,talent_id"
        )
        .gte("created_at", startIso)
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LogRow>((from, to) =>
      supabaseServer
        .from("logs")
        .select("user_id,type,created_at")
        .in("type", ["career_signup_completed", "career_onboarding_submitted"])
        .gte("created_at", startIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<TalentMessageRow>((from, to) =>
      supabaseServer
        .from("talent_messages")
        .select("user_id,role,message_type,created_at")
        .eq("message_type", "profile_submit")
        .gte("created_at", startIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<TalentActivityEventRow>((from, to) =>
      supabaseServer
        .from("talent_activity_events")
        .select("talent_id,event_type,created_at")
        .eq("event_type", "onboarding_completed")
        .gte("created_at", startIso)
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LandingLogRow>((from, to) =>
      supabaseServer
        .from("landing_logs")
        .select("abtest_type,created_at,local_id,type")
        .like("type", "talent_network_referral_visit:%")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<OfficialJobRow>((from, to) =>
      supabaseServer
        .from("official_jobs")
        .select("company_name,location,role_title,slug")
        .neq("role_title", OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE)
        .neq("slug", OFFICIAL_JOBS_INTERNAL_COPY_SLUG)
        .order("display_order", { ascending: true })
        .range(from, to)
    ),
  ]);

  const includedTalentUsers = talentUsers.filter(
    (user) => !isEmailExcluded(user.email, excludedEmailSet)
  );
  const includedUserIds = new Set(
    includedTalentUsers.map((user) => user.user_id).filter(Boolean)
  );
  const isIncludedUserId = (userId: string | null | undefined) => {
    const normalized = String(userId ?? "").trim();
    return Boolean(normalized && includedUserIds.has(normalized));
  };

  const signupUserIds = new Set<string>();
  for (const user of includedTalentUsers) {
    if (isInRange(user.created_at, startIso, endIso)) {
      addUserId(signupUserIds, user.user_id);
    }
  }
  for (const log of signupAndSubmitLogs) {
    if (
      log.type === "career_signup_completed" &&
      isIncludedUserId(log.user_id)
    ) {
      addUserId(signupUserIds, log.user_id);
    }
  }

  const submittedUserIds = new Set<string>();
  for (const log of signupAndSubmitLogs) {
    if (
      log.type === "career_onboarding_submitted" &&
      isIncludedUserId(log.user_id)
    ) {
      addUserId(submittedUserIds, log.user_id);
    }
  }
  for (const message of messages) {
    if (
      message.message_type === "profile_submit" &&
      isIncludedUserId(message.user_id)
    ) {
      addUserId(submittedUserIds, message.user_id);
    }
  }

  // Completion counts must use immutable activity events. talent_setting.updated_at
  // also changes on login/settings writes, so it cannot represent completion time.
  const onboardingCompletedUserIds = new Set<string>();
  for (const event of onboardingEvents) {
    if (isIncludedUserId(event.talent_id)) {
      addUserId(onboardingCompletedUserIds, event.talent_id);
    }
  }
  const returningSubmittedCount = Array.from(submittedUserIds).filter(
    (userId) => !signupUserIds.has(userId)
  ).length;
  const newSignupSubmittedCount = Array.from(submittedUserIds).filter(
    (userId) => signupUserIds.has(userId)
  ).length;
  const returningOnboardingCompletedCount = Array.from(
    onboardingCompletedUserIds
  ).filter((userId) => !signupUserIds.has(userId)).length;
  const newSignupOnboardingCompletedCount = Array.from(
    onboardingCompletedUserIds
  ).filter((userId) => signupUserIds.has(userId)).length;
  const signedUpEmails = new Set(
    includedTalentUsers
      .filter((user) => signupUserIds.has(user.user_id))
      .map((user) => normalizeEmail(user.email))
      .filter(Boolean)
  );

  const chatUserIds = new Set<string>();
  const chatMessages = messages.filter(
    (message) => isUserChatMessage(message) && isIncludedUserId(message.user_id)
  );
  const chatMessageCountByUserId = new Map<string, number>();
  for (const message of chatMessages) {
    addUserId(chatUserIds, message.user_id);
    const userId = String(message.user_id ?? "").trim();
    if (userId) {
      chatMessageCountByUserId.set(
        userId,
        (chatMessageCountByUserId.get(userId) ?? 0) + 1
      );
    }
  }
  const newSignupFourPlusChatDropoffCount = Array.from(signupUserIds).filter(
    (userId) =>
      (chatMessageCountByUserId.get(userId) ?? 0) >= 4 &&
      !onboardingCompletedUserIds.has(userId)
  ).length;
  const callTranscriptUserIds = new Set<string>();
  const callTranscriptMessages = messages.filter(
    (message) =>
      isUserCallTranscriptMessage(message) && isIncludedUserId(message.user_id)
  );
  for (const message of callTranscriptMessages) {
    addUserId(callTranscriptUserIds, message.user_id);
  }
  const userMessageUserIds = new Set([
    ...chatUserIds,
    ...callTranscriptUserIds,
  ]);

  const cumulativeTalentCount = includedTalentUsers.filter(
    (user) => user.created_at && user.created_at < endIso
  ).length;
  const includedRecommendedRows = recommendedRows.filter((row) =>
    isIncludedUserId(row.talent_id)
  );
  const includedInternalRecommendedRows = includedRecommendedRows.filter(
    (row) => isInternalOpportunity(row.opportunity_type)
  );
  const includedRolling7DayInternalRecommendedRows =
    internalOpportunityRolling7DayRows.filter(
      (row) =>
        isIncludedUserId(row.talent_id) &&
        isInternalOpportunity(row.opportunity_type)
    );
  const internalOpportunityStats = buildInternalOpportunityStats(
    includedInternalRecommendedRows
  );
  const internalOpportunityRolling7DayStats = buildInternalOpportunityStats(
    includedRolling7DayInternalRecommendedRows
  );
  const includedExternalNegativeFeedbackReasonRows = Array.from(
    new Map(
      [
        ...externalNegativeFeedbackReasonAtRows,
        ...externalNegativeFeedbackReasonLegacyRows,
      ].map((row) => [row.id, row])
    ).values()
  ).filter(
    (row) =>
      isIncludedUserId(row.talent_id) &&
      isInRange(
        row.feedback_at ?? row.updated_at,
        externalNegativeFeedbackReasonRange.startIso,
        externalNegativeFeedbackReasonRange.endIso
      )
  );
  const externalNegativeFeedbackReasonStats =
    buildExternalNegativeFeedbackReasonStats({
      endDate: addDaysToDateOnly(
        externalNegativeFeedbackReasonRange.endDateExclusive,
        -1
      ),
      rows: includedExternalNegativeFeedbackReasonRows,
      startDate: externalNegativeFeedbackReasonRange.startDate,
    });
  const internalOpportunityRoleRows = await fetchInternalOpportunityRoleRows(
    includedInternalRecommendedRows.map((row) => row.role_id)
  );
  const internalOpportunityRecommendationRows =
    buildInternalOpportunityRecommendationRows({
      recommendations: includedInternalRecommendedRows,
      roles: internalOpportunityRoleRows,
    });
  const includedRecommendedRowIds = new Set(
    includedRecommendedRows.map((row) => row.id).filter(Boolean)
  );
  const includedViewedRows = viewedRows.filter((row) =>
    isIncludedUserId(row.talent_id)
  );
  const includedViewedRecommendedRows = includedViewedRows.filter((row) =>
    includedRecommendedRowIds.has(row.id)
  );
  const includedClickedRows = clickedRows.filter((row) =>
    isIncludedUserId(row.talent_id)
  );
  const includedSavedStageRows = savedStageRows.filter((row) =>
    isIncludedUserId(row.talent_id)
  );
  const includedFeedbackRows = dedupeRecommendationRows([
    ...feedbackAtRows,
    ...legacyFeedbackRows,
  ]).filter(
    (row) =>
      isIncludedUserId(row.talent_id) &&
      isInRange(row.feedback_at ?? row.updated_at, startIso, endIso)
  );
  const includedFeedbackRecommendedRows = includedFeedbackRows.filter((row) =>
    includedRecommendedRowIds.has(row.id)
  );
  const positiveFeedbackRows = includedFeedbackRecommendedRows.filter(
    (row) => normalizeRecommendationFeedback(row.feedback) === "positive"
  );
  const negativeFeedbackRows = includedFeedbackRecommendedRows.filter(
    (row) => normalizeRecommendationFeedback(row.feedback) === "negative"
  );
  const negativeFeedbackClickedRows = negativeFeedbackRows.filter((row) =>
    Boolean(row.clicked_at)
  );

  const outboundEmailRows = emailRows.filter(
    (row) =>
      isIncludedUserId(row.talent_id) &&
      row.direction === "outbound" &&
      row.status === "sent"
  );
  const harperMailReplyRows = outboundEmailRows.filter(
    (row) => row.mail_type === "auto_reply" && Boolean(row.reply_job_id)
  );
  const includedOpportunityEmailDeliveries = opportunityEmailDeliveries.filter(
    (row) =>
      isIncludedUserId(row.talent_id) &&
      row.channel === "email" &&
      row.status === "sent"
  );
  const opportunityDeliveryDedupeKeys = new Set(
    includedOpportunityEmailDeliveries
      .map((row) =>
        getOpportunityDeliveryDedupeKey({
          discoveryRunId: row.discovery_run_id,
          fallbackId: row.id,
          talentId: row.talent_id,
        })
      )
      .filter(Boolean)
  );
  const outboundEmailRowsForSentCount = outboundEmailRows.filter((row) => {
    if (row.mail_type !== "opportunity_recommendation") return true;

    const deliveryKey = getOpportunityDeliveryDedupeKey({
      discoveryRunId: getJsonString(row.metadata, "discoveryRunId"),
      talentId: row.talent_id,
    });
    return !deliveryKey || !opportunityDeliveryDedupeKeys.has(deliveryKey);
  });
  const recommendationEmailUserIds = new Set<string>();
  for (const row of outboundEmailRows) {
    if (row.mail_type === "opportunity_recommendation") {
      addUserId(recommendationEmailUserIds, row.talent_id);
    }
  }
  for (const row of includedOpportunityEmailDeliveries) {
    addUserId(recommendationEmailUserIds, row.talent_id);
  }
  const inboundEmailRows = emailRows.filter(
    (row) =>
      isIncludedUserId(row.talent_id) &&
      row.direction === "inbound" &&
      row.status !== "failed" &&
      row.status !== "skipped"
  );
  const inboundEmailUserIds = new Set<string>();
  for (const row of inboundEmailRows) {
    addUserId(inboundEmailUserIds, row.talent_id);
  }

  const loggedInUserIds = new Set<string>();
  for (const user of includedTalentUsers) {
    if (isInRange(user.last_logined_at, startIso, endIso)) {
      addUserId(loggedInUserIds, user.user_id);
    }
  }
  for (const log of loginCompletedLogs) {
    if (log.type === "login_completed" && isIncludedUserId(log.user_id)) {
      addUserId(loggedInUserIds, log.user_id);
    }
  }

  const viewedRecommendationTalentIds = buildUserIdSet(
    includedViewedRows.map((row) => row.talent_id)
  );
  const clickedRecommendationTalentIds = buildUserIdSet(
    includedClickedRows.map((row) => row.talent_id)
  );
  const feedbackRecommendationTalentIds = buildUserIdSet(
    includedFeedbackRows.map((row) => row.talent_id)
  );
  const savedRecommendationTalentIds = buildUserIdSet(
    includedSavedStageRows.map((row) => row.talent_id)
  );

  const activeTalentIds = new Set<string>();
  for (const source of [
    signupUserIds,
    loggedInUserIds,
    userMessageUserIds,
    inboundEmailUserIds,
    viewedRecommendationTalentIds,
    clickedRecommendationTalentIds,
    feedbackRecommendationTalentIds,
    savedRecommendationTalentIds,
  ]) {
    for (const userId of source) activeTalentIds.add(userId);
  }

  const highIntentTalentIds = new Set<string>();
  for (const source of [
    userMessageUserIds,
    inboundEmailUserIds,
    clickedRecommendationTalentIds,
    feedbackRecommendationTalentIds,
    savedRecommendationTalentIds,
  ]) {
    for (const userId of source) highIntentTalentIds.add(userId);
  }

  const includedToolUsageLogs = toolUsageLogs.filter((log) =>
    isIncludedUserId(log.user_id)
  );
  const includedToolFailureLogs = toolFailureLogs.filter((log) =>
    isIncludedUserId(log.user_id)
  );
  const toolRows = buildToolRows(
    includedToolUsageLogs,
    includedToolFailureLogs
  );
  const failedToolCallCount = includedToolFailureLogs.length;
  const toolCallCount = toolRows.reduce((sum, row) => sum + row.callCount, 0);
  const toolAttemptCount = toolCallCount + failedToolCallCount;

  const failedDiscoveryRunIds = new Set<string>();
  for (const row of [
    ...failedDiscoveryCompletedRuns,
    ...failedDiscoveryLegacyRuns,
  ]) {
    if (isIncludedUserId(row.talent_id) && row.id) {
      failedDiscoveryRunIds.add(row.id);
    }
  }

  const noRecommendationEligibleOnboardingCompletedUserIds = new Set<string>();
  for (const event of noRecommendationOnboardingEvents) {
    if (
      event.event_type === "onboarding_completed" &&
      isIncludedUserId(event.talent_id)
    ) {
      addUserId(
        noRecommendationEligibleOnboardingCompletedUserIds,
        event.talent_id
      );
    }
  }
  const recommendationTalentIdsBeforeObservationEnd = new Set<string>();
  for (const row of recommendationTalentRowsBeforeObservationEnd) {
    if (isIncludedUserId(row.talent_id)) {
      addUserId(recommendationTalentIdsBeforeObservationEnd, row.talent_id);
    }
  }
  const onboardingCompletedNoRecommendationUserCount = Array.from(
    noRecommendationEligibleOnboardingCompletedUserIds
  ).filter(
    (userId) => !recommendationTalentIdsBeforeObservationEnd.has(userId)
  ).length;

  const includedInternalConnectionResponseRows =
    internalConnectionResponseRows.filter(
      (row) =>
        isIncludedUserId(row.talent_id) &&
        isInternalOpportunity(row.opportunity_type)
    );
  const internalConnectionResponseStats =
    args.internalConnectionResponseRange === null ||
    args.internalConnectionResponseRange === undefined
      ? null
      : buildInternalConnectionResponseStats({
          endDate: addDaysToDateOnly(
            args.internalConnectionResponseRange.endDateExclusive,
            -1
          ),
          endIso: args.internalConnectionResponseRange.endIso,
          rows: includedInternalConnectionResponseRows,
          startDate: args.internalConnectionResponseRange.startDate,
          startIso: args.internalConnectionResponseRange.startIso,
        });
  const jobStats = buildJobStats({
    excludedEmailSet,
    jobs: officialJobs,
    landingLogs,
    signedUpEmails,
  });
  const landingAbtestRows =
    args.period === "daily"
      ? buildLandingAbtestRows({
          emailOnboardingLeads: funnelEmailOnboardingLeads,
          excludedEmailSet,
          landingLoginLogs: funnelLoginLogs,
          landingLogs,
          onboardingEvents: funnelOnboardingEvents,
          profileSubmitMessages: funnelProfileSubmitMessages,
          signupAndSubmitLogs: funnelSignupAndSubmitLogs,
          talentUsers,
        })
      : [];
  const referralFunnelStats = buildReferralFunnelStats({
    emailOnboardingLeads: funnelEmailOnboardingLeads,
    excludedEmailSet,
    landingLoginLogs: funnelLoginLogs,
    onboardingEvents: funnelOnboardingEvents,
    profileSubmitMessages: funnelProfileSubmitMessages,
    referralVisitLogs,
    signupAndSubmitLogs: funnelSignupAndSubmitLogs,
    talentUsers,
  });

  return {
    activeTalentBreakdown: {
      callTranscriptTalentCount: callTranscriptUserIds.size,
      chatTalentCount: chatUserIds.size,
      clickedRecommendationTalentCount: clickedRecommendationTalentIds.size,
      feedbackRecommendationTalentCount: feedbackRecommendationTalentIds.size,
      inboundEmailTalentCount: inboundEmailUserIds.size,
      loggedInTalentCount: loggedInUserIds.size,
      savedRecommendationTalentCount: savedRecommendationTalentIds.size,
      signupTalentCount: signupUserIds.size,
      viewedRecommendationTalentCount: viewedRecommendationTalentIds.size,
    },
    activeTalentsCount: activeTalentIds.size,
    accountDeletedCount: accountDeletionLogs.length,
    callTranscriptMessageCount: callTranscriptMessages.length,
    chatMessageCount: chatMessages.length,
    chatUniqueTalentCount: chatUserIds.size,
    onboardingCompletedNoRecommendationUserCount,
    cumulativeTalentsCount: cumulativeTalentCount,
    date,
    dateLabel,
    endDateExclusive,
    endIso,
    externalNegativeFeedbackReasonStats,
    failedToolCallCount,
    highIntentTalentsCount: highIntentTalentIds.size,
    internalConnectionResponseStats,
    internalOpportunityRolling7DayStats,
    internalOpportunityRecommendationRows,
    internalOpportunityStats,
    internalRecommendationCount: internalOpportunityStats.recommendationCount,
    jobs: jobStats.rows.slice(0, 8),
    jobsSummary: jobStats.summary,
    landingAbtestRows,
    referralFunnelStats,
    harperMailReplyCount: harperMailReplyRows.length,
    mailReplyCount: inboundEmailRows.length,
    mailSentCount:
      outboundEmailRowsForSentCount.length +
      includedOpportunityEmailDeliveries.length,
    negativeFeedbackCount: negativeFeedbackRows.length,
    negativeFeedbackClickedCount: negativeFeedbackClickedRows.length,
    newSignupFourPlusChatDropoffCount,
    newSignupOnboardingCompletedCount,
    newSignupSubmittedCount,
    newVisitorCount: countNewVisitors({
      excludedEmailSet,
      landingLogs,
    }),
    onboardingCompletedCount: onboardingCompletedUserIds.size,
    opportunityDiscoveryFailedRunCount: failedDiscoveryRunIds.size,
    period: args.period,
    periodicRecommendationMailUserCount: recommendationEmailUserIds.size,
    positiveFeedbackCount: positiveFeedbackRows.length,
    recommendationCount: includedRecommendedRows.length,
    returningOnboardingCompletedCount,
    returningSubmittedCount,
    signupCount: signupUserIds.size,
    startDate,
    startIso,
    submittedCount: submittedUserIds.size,
    toolFailureRate: countRate(failedToolCallCount, toolAttemptCount),
    tools: toolRows.slice(0, 10),
    userMessageCount: chatMessages.length + callTranscriptMessages.length,
    userMessageUniqueTalentCount: userMessageUserIds.size,
    viewedRecommendationCount: includedViewedRecommendedRows.length,
  };
}

export async function buildDailyUserStatsReport(
  dateInput?: string | null
): Promise<DailyUserStatsReport> {
  return buildUserStatsReport({
    period: "daily",
    range: getKstDayRange(resolveDailyUserStatsDate(dateInput)),
  });
}

export async function buildWeeklyUserStatsReport(
  weekStartDateInput?: string | null
): Promise<DailyUserStatsReport> {
  const range = getKstWeekRange(
    resolveWeeklyUserStatsStartDate(weekStartDateInput)
  );
  const internalConnectionResponseRange = getKstWeekRange(
    addDaysToDateOnly(range.startDate, -7)
  );

  return buildUserStatsReport({
    internalConnectionResponseRange,
    period: "weekly",
    range,
  });
}

const numberFormatter = new Intl.NumberFormat("ko-KR");

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
}

function formatRatio(numerator: number, denominator: number) {
  return formatPercent(countRate(numerator, denominator));
}

function formatSlackSectionTitle(value: string) {
  return `*${value}*`;
}

function formatInternalConnectionResponseStats(
  stats: DailyUserStatsInternalConnectionResponseStats | null
) {
  if (!stats) return null;

  return [
    formatSlackSectionTitle("Internal 연결 제안 반응률"),
    `${stats.startDate} ~ ${stats.endDate} 추천 cohort`,
    `• 수락: ${formatCount(stats.acceptedCount)}개, ${formatRatio(
      stats.acceptedCount,
      stats.recommendationCount
    )}`,
    `• 거절: ${formatCount(stats.rejectedCount)}개, ${formatRatio(
      stats.rejectedCount,
      stats.recommendationCount
    )}`,
    `• 무응답: ${formatCount(stats.noResponseCount)}개, ${formatRatio(
      stats.noResponseCount,
      stats.recommendationCount
    )}`,
  ].join("\n");
}

function formatLandingAbtestRows(rows: DailyUserStatsLandingAbtestRow[]) {
  return [
    formatSlackSectionTitle("랜딩페이지 A/B Test"),
    "career signup-flow 실험의 신규 가입 대상 unique visitor 대비 (전체 신규 방문자와 별도)",
    "현재 배정 비율: Email first 25% / Login first 75%",
    ...rows.map(
      (row) =>
        `- ${row.label}: 회원가입+제출완료 ${formatCount(
          row.signupSubmittedCount
        )}/${formatCount(row.entryCount)}명 (${formatPercent(
          row.signupSubmittedRateFromEntry
        )}), 온보딩 완료 ${formatCount(
          row.onboardingCompletedCount
        )}/${formatCount(row.entryCount)}명 (${formatPercent(
          row.onboardingCompletedRateFromEntry
        )})`
    ),
  ].join("\n");
}

function formatReferralFunnelStats(stats: DailyUserStatsReferralFunnelStats) {
  return [
    formatSlackSectionTitle("레퍼럴 링크"),
    "레퍼럴 링크 접속자 대비",
    `- 접속: ${formatCount(stats.visitCount)}명 (${formatPercent(
      countRate(stats.visitCount, stats.visitCount)
    )})`,
    `- 회원가입: ${formatCount(stats.signupCount)}명 (${formatPercent(
      stats.signupRateFromVisit
    )})`,
    `- 제출 완료: ${formatCount(stats.submittedCount)}명 (${formatPercent(
      stats.submittedRateFromVisit
    )})`,
    `- 온보딩 완료: ${formatCount(
      stats.onboardingCompletedCount
    )}명 (${formatPercent(stats.onboardingCompletedRateFromVisit)})`,
  ].join("\n");
}

export function formatExternalNegativeFeedbackReasonStats(
  stats: DailyUserStatsExternalNegativeFeedbackReasonStats
) {
  return [
    formatSlackSectionTitle("거절 사유"),
    `${stats.startDate} ~ ${stats.endDate} external 공고 dislike 중 객관식 선택 ${formatCount(
      stats.reasonSelectionResponseCount
    )}건 기준 (복수 선택)`,
    ...stats.rows.map(
      (row) =>
        `- ${row.label}: ${formatCount(row.count)}건 (${formatPercent(
          row.rate
        )})`
    ),
  ].join("\n");
}

export function formatDailyUserStatsSlackMessages(
  report: DailyUserStatsReport
): DailyUserStatsSlackMessages {
  const tools =
    report.tools.length > 0
      ? report.tools
          .map(
            (tool) =>
              `- ${tool.name}: ${formatCount(tool.callCount)} calls / ${formatCount(
                tool.userCount
              )} users / error ${formatCount(tool.failedCallCount)}`
          )
          .join("\n")
      : "- 없음";

  const internalConnectionResponseStats = formatInternalConnectionResponseStats(
    report.internalConnectionResponseStats
  );
  const title =
    report.period === "weekly"
      ? `🌔 [Weekly User Stats] ${report.dateLabel}`
      : `😎 [Daily User Stats] ${report.date}`;

  const returningUserLabelPrefix =
    report.period === "weekly"
      ? "기간 내 신규 가입은 아니지만 다시 들어와서"
      : "오늘 신규 가입이 아니지만 다시 들어와서";

  const jobSummary = `전체 jobs 페이지: ${formatCount(
    report.jobsSummary.viewCount
  )}명 진입, ${formatCount(
    report.jobsSummary.talkClickCount
  )}명 Talk to Harper 클릭, ${formatCount(
    report.jobsSummary.signupCount
  )}명 회원가입 (${formatRatio(
    report.jobsSummary.signupCount,
    report.jobsSummary.viewCount
  )})`;
  const jobAbtestRows = report.jobsSummary.abtestRows.map(
    (row) =>
      `- ${row.label} (${row.ctaLabel}, 지원 안내 ${
        row.helpVisible ? "있음" : "없음"
      }): ${formatCount(row.entryCount)}명 진입, ${formatCount(
        row.talkClickCount
      )}명 ${row.ctaLabel} 클릭, ${formatCount(
        row.signupCount
      )}명 회원가입 (${formatRatio(row.signupCount, row.entryCount)})`
  );
  const jobRows =
    report.jobs.length > 0
      ? report.jobs
          .map(
            (job) =>
              `- ${job.title} @ ${job.companyName} (${job.location}): ${formatCount(
                job.viewCount
              )}명 / ${formatCount(job.signupCount)}명 회원가입`
          )
          .join("\n")
      : "- 없음";
  const jobRowsScope =
    report.jobsSummary.viewedJobCount > report.jobs.length
      ? `공고별 상세: 방문 발생 ${formatCount(
          report.jobsSummary.viewedJobCount
        )}개 중 상위 ${formatCount(report.jobs.length)}개`
      : "공고별 상세";
  const jobs = [
    jobSummary,
    ...jobAbtestRows,
    `${jobRowsScope} (공고별 unique visitor, 공고 간 중복 포함)`,
    jobRows,
  ].join("\n");
  const internalOpportunityRecommendations =
    report.internalOpportunityRecommendationRows.length > 0
      ? report.internalOpportunityRecommendationRows
          .map(
            (row) =>
              `- ${row.companyName} - ${row.roleName} : ${formatCount(
                row.talentCount
              )}명`
          )
          .join("\n")
      : "- 없음";
  const toolsMessage = [
    formatSlackSectionTitle("Tools"),
    tools,
    `- failed tool calls: ${formatCount(
      report.failedToolCallCount
    )}, ${formatPercent(report.toolFailureRate)}`,
  ].join("\n");
  const jobsMessage = [formatSlackSectionTitle("Jobs"), jobs].join("\n");
  const internalOpportunityRecommendationsMessage = [
    formatSlackSectionTitle("내부 기회 추천"),
    internalOpportunityRecommendations,
  ].join("\n");
  const landingAbtestMessage =
    report.period === "daily"
      ? formatLandingAbtestRows(report.landingAbtestRows)
      : null;
  const referralFunnelMessage = formatReferralFunnelStats(
    report.referralFunnelStats
  );
  const externalNegativeFeedbackReasonMessage =
    report.period === "daily"
      ? formatExternalNegativeFeedbackReasonStats(
          report.externalNegativeFeedbackReasonStats
        )
      : null;
  const detailsMessage = [
    toolsMessage,
    "",
    jobsMessage,
    "",
    internalOpportunityRecommendationsMessage,
    ...(landingAbtestMessage ? ["", landingAbtestMessage] : []),
    "",
    referralFunnelMessage,
    ...(externalNegativeFeedbackReasonMessage
      ? ["", externalNegativeFeedbackReasonMessage]
      : []),
  ].join("\n");

  const lines = [
    title,
    "",
    formatSlackSectionTitle("신규"),
    `신규 가입: ${formatCount(report.signupCount)}명`,
    `신규 방문자 수: ${formatCount(
      report.newVisitorCount
    )}명, 회원가입 전환율: ${formatRatio(
      report.signupCount,
      report.newVisitorCount
    )}`,
    `신규 가입자 중 제출 완료: ${formatCount(
      report.newSignupSubmittedCount
    )}명, 가입 대비 ${formatRatio(
      report.newSignupSubmittedCount,
      report.signupCount
    )}`,
    `신규 가입자 중 온보딩 완료: ${formatCount(
      report.newSignupOnboardingCompletedCount
    )}명, 가입 대비 ${formatRatio(
      report.newSignupOnboardingCompletedCount,
      report.signupCount
    )}`,
    `채팅 4번 이상 후 진행 도중 이탈: ${formatCount(
      report.newSignupFourPlusChatDropoffCount
    )}명, ${formatRatio(
      report.newSignupFourPlusChatDropoffCount,
      report.signupCount
    )}`,
    `회원 탈퇴: ${formatCount(report.accountDeletedCount)}명`,
    `${returningUserLabelPrefix} 제출 완료한 사람: ${formatCount(
      report.returningSubmittedCount
    )}명`,
    `${returningUserLabelPrefix} 온보딩 완료한 사람: ${formatCount(
      report.returningOnboardingCompletedCount
    )}명`,
    "",
    `Active talents: ${formatCount(
      report.activeTalentsCount
    )}명 (로그인 없이 발생한 활동 포함, 상세 항목은 중복 포함)`,
    `- 로그인: ${formatCount(
      report.activeTalentBreakdown.loggedInTalentCount
    )}명`,
    `- 신규 가입: ${formatCount(
      report.activeTalentBreakdown.signupTalentCount
    )}명`,
    `- 채팅: ${formatCount(report.activeTalentBreakdown.chatTalentCount)}명`,
    `- 통화: ${formatCount(
      report.activeTalentBreakdown.callTranscriptTalentCount
    )}명`,
    `- 메일 답장: ${formatCount(
      report.activeTalentBreakdown.inboundEmailTalentCount
    )}명`,
    `- 추천 열람: ${formatCount(
      report.activeTalentBreakdown.viewedRecommendationTalentCount
    )}명`,
    `- 추천 클릭: ${formatCount(
      report.activeTalentBreakdown.clickedRecommendationTalentCount
    )}명`,
    `- 추천 피드백: ${formatCount(
      report.activeTalentBreakdown.feedbackRecommendationTalentCount
    )}명`,
    `- 추천 저장/상태 변경: ${formatCount(
      report.activeTalentBreakdown.savedRecommendationTalentCount
    )}명`,
    // `High_intent_talents: ${formatCount(report.highIntentTalentsCount)}명`,
    `누적 talents: ${formatCount(report.cumulativeTalentsCount)}명`,
    "",
    formatSlackSectionTitle("추천 통계"),
    `추천된 기회: ${formatCount(report.recommendationCount)}개`,
    `열람(확인): ${formatCount(
      report.viewedRecommendationCount
    )}개, ${formatRatio(
      report.viewedRecommendationCount,
      report.recommendationCount
    )}`,
    `수락/좋아요: ${formatCount(report.positiveFeedbackCount)}개, ${formatRatio(
      report.positiveFeedbackCount,
      report.recommendationCount
    )}`,
    `싫어요: ${formatCount(report.negativeFeedbackCount)}개, ${formatRatio(
      report.negativeFeedbackCount,
      report.recommendationCount
    )}`,
    `  ㄴ JD 확인 오픈: ${formatCount(
      report.negativeFeedbackClickedCount
    )}개, ${formatRatio(
      report.negativeFeedbackClickedCount,
      report.negativeFeedbackCount
    )}`,
    `opportunity_discovery_run failed 종료: ${formatCount(
      report.opportunityDiscoveryFailedRunCount
    )}개`,
    `• 기간 내 온보딩 완료 후 1시간+ 추천 0개인 유저 수: ${formatCount(
      report.onboardingCompletedNoRecommendationUserCount
    )}명`,
    "",
    formatSlackSectionTitle("내부 기회"),
    `추천된 내부 기회 수: ${formatCount(
      report.internalOpportunityStats.recommendationCount
    )}개`,
    `수락: ${formatCount(
      report.internalOpportunityStats.acceptedCount
    )}개, 전체 추천 대비 ${formatRatio(
      report.internalOpportunityStats.acceptedCount,
      report.internalOpportunityStats.recommendationCount
    )}`,
    `거절: ${formatCount(
      report.internalOpportunityStats.rejectedCount
    )}개, 전체 추천 대비 ${formatRatio(
      report.internalOpportunityStats.rejectedCount,
      report.internalOpportunityStats.recommendationCount
    )}`,
    `전체 확인 비율: ${formatCount(
      report.internalOpportunityStats.checkedCount
    )}개, 전체 추천 대비 ${formatRatio(
      report.internalOpportunityStats.checkedCount,
      report.internalOpportunityStats.recommendationCount
    )}`,
    `지난 7일 수락: ${formatCount(
      report.internalOpportunityRolling7DayStats.acceptedCount
    )}개, 전체 추천 대비 ${formatRatio(
      report.internalOpportunityRolling7DayStats.acceptedCount,
      report.internalOpportunityRolling7DayStats.recommendationCount
    )}`,
    `지난 7일 거절: ${formatCount(
      report.internalOpportunityRolling7DayStats.rejectedCount
    )}개, 전체 추천 대비 ${formatRatio(
      report.internalOpportunityRolling7DayStats.rejectedCount,
      report.internalOpportunityRolling7DayStats.recommendationCount
    )}`,
    "",
    `유저가 보낸 메시지: ${formatCount(report.userMessageCount)}개`,
    `- 채팅: ${formatCount(report.chatMessageCount)}개`,
    `- 통화: ${formatCount(report.callTranscriptMessageCount)}개`,
    `메시지를 보낸 unique talents 수: ${formatCount(
      report.userMessageUniqueTalentCount
    )}명`,
    `메일 발송: ${formatCount(report.mailSentCount)}개`,
    `주기적인 추천 메일을 받은 유저 수: ${formatCount(
      report.periodicRecommendationMailUserCount
    )}명`,
    `메일 답장: ${formatCount(
      report.mailReplyCount
    )}개 - Harper 답장: ${formatCount(report.harperMailReplyCount)}개`,
    "",
  ];

  if (internalConnectionResponseStats) {
    lines.push(internalConnectionResponseStats, "");
  }

  return {
    details: detailsMessage,
    jobs: jobsMessage,
    main: lines.join("\n"),
    tools: toolsMessage,
  };
}

export function formatDailyUserStatsSlackMessage(report: DailyUserStatsReport) {
  const messages = formatDailyUserStatsSlackMessages(report);
  return [messages.main, messages.details].join("\n");
}
