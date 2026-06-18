import {
  DEFAULT_ADMIN_EXCLUDED_EMAILS,
  isEmailExcluded,
} from "@/lib/adminEmailExclusions";
import {
  OFFICIAL_JOBS_LANDING_SOURCE,
  parseOfficialJobLandingLogType,
} from "@/lib/officialJobs/landingLogs";
import {
  OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE,
  OFFICIAL_JOBS_INTERNAL_COPY_SLUG,
} from "@/lib/officialJobs";
import { extractEmailFromLandingLoginType } from "@/lib/landingLogTypes";
import { normalizeEmail } from "@/lib/adminMetrics/utils";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

const BATCH_SIZE = 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
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
  "user_id" | "email" | "created_at"
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
type TalentSettingRow = Pick<
  Database["public"]["Tables"]["talent_setting"]["Row"],
  "user_id" | "is_onboarding_done" | "updated_at"
>;
type RecommendationRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_recommendation"]["Row"],
  | "id"
  | "talent_id"
  | "opportunity_type"
  | "recommended_at"
  | "created_at"
  | "viewed_at"
  | "clicked_at"
  | "feedback"
  | "feedback_at"
  | "saved_stage"
  | "updated_at"
>;
type CareerEmailMessageRow = Pick<
  Database["public"]["Tables"]["career_email_messages"]["Row"],
  | "direction"
  | "mail_type"
  | "metadata"
  | "occurred_at"
  | "status"
  | "talent_id"
>;
type TalentOpportunityDeliveryRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_delivery"]["Row"],
  "channel" | "discovery_run_id" | "id" | "sent_at" | "status" | "talent_id"
>;
type LandingLogRow = Pick<
  Database["public"]["Tables"]["landing_logs"]["Row"],
  "created_at" | "local_id" | "type"
>;
type OfficialJobRow = Pick<
  Database["public"]["Tables"]["official_jobs"]["Row"],
  "company_name" | "role_title" | "slug"
>;

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
  signupCount: number;
  slug: string;
  title: string;
  viewCount: number;
};

export type DailyUserStatsReport = {
  activeTalentsCount: number;
  callTranscriptMessageCount: number;
  chatMessageCount: number;
  chatUniqueTalentCount: number;
  cumulativeTalentsCount: number;
  date: string;
  endIso: string;
  failedToolCallCount: number;
  highIntentTalentsCount: number;
  internalRecommendationCount: number;
  jobs: DailyUserStatsJobRow[];
  mailReplyCount: number;
  mailSentCount: number;
  negativeFeedbackCount: number;
  newSignupOnboardingCompletedCount: number;
  newSignupSubmittedCount: number;
  onboardingCompletedCount: number;
  periodicRecommendationMailUserCount: number;
  positiveFeedbackCount: number;
  recommendationCount: number;
  returningOnboardingCompletedCount: number;
  returningSubmittedCount: number;
  signupCount: number;
  startIso: string;
  submittedCount: number;
  toolFailureRate: number | null;
  tools: DailyUserStatsToolRow[];
  userMessageCount: number;
  userMessageUniqueTalentCount: number;
  viewedRecommendationCount: number;
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

export function getDefaultDailyUserStatsDate(now = new Date()) {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  kstNow.setUTCDate(kstNow.getUTCDate() - 1);
  return kstNow.toISOString().slice(0, 10);
}

export function resolveDailyUserStatsDate(value: unknown, now = new Date()) {
  return normalizeDateOnly(value) ?? getDefaultDailyUserStatsDate(now);
}

function getKstDayRange(date: string) {
  const normalized = normalizeDateOnly(date);
  if (!normalized) {
    throw new Error("date must be YYYY-MM-DD");
  }

  const [year, month, day] = normalized.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, -9, 0, 0, 0));
  return {
    date: normalized,
    endIso: end.toISOString(),
    startIso: start.toISOString(),
  };
}

function isInRange(
  value: string | null | undefined,
  startIso: string,
  endIso: string
) {
  return Boolean(value && value >= startIso && value < endIso);
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

function parseLandingLoginEmail(type: string | null | undefined) {
  return normalizeEmail(extractEmailFromLandingLoginType(type)) || null;
}

function getLandingLogSource(type: string | null | undefined) {
  const value = String(type ?? "");
  const parts = value.split(":");
  return parts.length >= 3 && parts[0] === "login_email"
    ? parts.slice(2).join(":")
    : "";
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

function buildJobRows(args: {
  excludedEmailSet: Set<string>;
  jobs: OfficialJobRow[];
  landingLogs: LandingLogRow[];
  signedUpEmails: Set<string>;
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

  const signupLocalIds = new Set<string>();
  const viewsBySlug = new Map<string, Set<string>>();
  for (const log of args.landingLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId || excludedLocalIds.has(localId)) continue;

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
    if (parsed?.event !== "job_view" || !parsed.jobSlug) continue;

    const views = viewsBySlug.get(parsed.jobSlug) ?? new Set<string>();
    views.add(localId);
    viewsBySlug.set(parsed.jobSlug, views);
  }

  const jobBySlug = new Map(args.jobs.map((job) => [job.slug, job] as const));
  return Array.from(viewsBySlug.entries())
    .map(([slug, views]) => {
      const job = jobBySlug.get(slug);
      return {
        companyName: job?.company_name ?? "-",
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
}

function isUserChatMessage(message: TalentMessageRow) {
  return message.role === "user" && message.message_type === "chat";
}

function isUserCallTranscriptMessage(message: TalentMessageRow) {
  return message.role === "user" && message.message_type === "call_transcript";
}

export async function buildDailyUserStatsReport(
  dateInput?: string | null
): Promise<DailyUserStatsReport> {
  const { date, startIso, endIso } = getKstDayRange(
    resolveDailyUserStatsDate(dateInput)
  );
  const excludedEmailSet = new Set(DAILY_USER_STATS_EXCLUDED_EMAILS);

  const [
    talentUsers,
    signupAndSubmitLogs,
    messages,
    onboardingEvents,
    onboardingSettings,
    recommendedRows,
    viewedRows,
    clickedRows,
    feedbackAtRows,
    legacyFeedbackRows,
    savedStageRows,
    emailRows,
    opportunityEmailDeliveries,
    toolUsageLogs,
    toolFailureLogs,
    jobLandingLogs,
    officialJobs,
  ] = await Promise.all([
    fetchAllRows<TalentUserRow>((from, to) =>
      supabaseServer
        .from("talent_users")
        .select("user_id,email,created_at")
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
    fetchAllRows<TalentSettingRow>((from, to) =>
      supabaseServer
        .from("talent_setting")
        .select("user_id,is_onboarding_done,updated_at")
        .eq("is_onboarding_done", true)
        .gte("updated_at", startIso)
        .lt("updated_at", endIso)
        .order("updated_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<RecommendationRow>((from, to) =>
      supabaseServer
        .from("talent_opportunity_recommendation")
        .select(
          "id,talent_id,opportunity_type,recommended_at,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
        )
        .gte("recommended_at", startIso)
        .lt("recommended_at", endIso)
        .order("recommended_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<RecommendationRow>((from, to) =>
      supabaseServer
        .from("talent_opportunity_recommendation")
        .select(
          "id,talent_id,opportunity_type,recommended_at,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
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
          "id,talent_id,opportunity_type,recommended_at,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
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
          "id,talent_id,opportunity_type,recommended_at,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
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
          "id,talent_id,opportunity_type,recommended_at,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
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
          "id,talent_id,opportunity_type,recommended_at,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
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
        .select("talent_id,direction,mail_type,status,occurred_at,metadata")
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
        .select("created_at,local_id,type")
        .or("type.like.official_jobs:%,type.like.login_email:%")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<OfficialJobRow>((from, to) =>
      supabaseServer
        .from("official_jobs")
        .select("company_name,role_title,slug")
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

  const onboardingCompletedUserIds = new Set<string>();
  for (const event of onboardingEvents) {
    if (isIncludedUserId(event.talent_id)) {
      addUserId(onboardingCompletedUserIds, event.talent_id);
    }
  }
  for (const setting of onboardingSettings) {
    if (setting.is_onboarding_done && isIncludedUserId(setting.user_id)) {
      addUserId(onboardingCompletedUserIds, setting.user_id);
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
  for (const message of chatMessages) {
    addUserId(chatUserIds, message.user_id);
  }
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

  const outboundEmailRows = emailRows.filter(
    (row) =>
      isIncludedUserId(row.talent_id) &&
      row.direction === "outbound" &&
      row.status === "sent"
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

  const activeTalentIds = new Set<string>();
  for (const source of [
    signupUserIds,
    userMessageUserIds,
    inboundEmailUserIds,
    new Set(includedViewedRows.map((row) => row.talent_id)),
    new Set(includedClickedRows.map((row) => row.talent_id)),
    new Set(includedFeedbackRows.map((row) => row.talent_id)),
    new Set(includedSavedStageRows.map((row) => row.talent_id)),
  ]) {
    for (const userId of source) activeTalentIds.add(userId);
  }

  const highIntentTalentIds = new Set<string>();
  for (const source of [
    userMessageUserIds,
    inboundEmailUserIds,
    new Set(includedClickedRows.map((row) => row.talent_id)),
    new Set(includedFeedbackRows.map((row) => row.talent_id)),
    new Set(includedSavedStageRows.map((row) => row.talent_id)),
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

  return {
    activeTalentsCount: activeTalentIds.size,
    callTranscriptMessageCount: callTranscriptMessages.length,
    chatMessageCount: chatMessages.length,
    chatUniqueTalentCount: chatUserIds.size,
    cumulativeTalentsCount: cumulativeTalentCount,
    date,
    endIso,
    failedToolCallCount,
    highIntentTalentsCount: highIntentTalentIds.size,
    internalRecommendationCount: includedRecommendedRows.filter((row) =>
      isInternalOpportunity(row.opportunity_type)
    ).length,
    jobs: buildJobRows({
      excludedEmailSet,
      jobs: officialJobs,
      landingLogs: jobLandingLogs,
      signedUpEmails,
    }).slice(0, 8),
    mailReplyCount: inboundEmailRows.length,
    mailSentCount:
      outboundEmailRowsForSentCount.length +
      includedOpportunityEmailDeliveries.length,
    negativeFeedbackCount: negativeFeedbackRows.length,
    newSignupOnboardingCompletedCount,
    newSignupSubmittedCount,
    onboardingCompletedCount: onboardingCompletedUserIds.size,
    periodicRecommendationMailUserCount: recommendationEmailUserIds.size,
    positiveFeedbackCount: positiveFeedbackRows.length,
    recommendationCount: includedRecommendedRows.length,
    returningOnboardingCompletedCount,
    returningSubmittedCount,
    signupCount: signupUserIds.size,
    startIso,
    submittedCount: submittedUserIds.size,
    toolFailureRate: countRate(failedToolCallCount, toolCallCount),
    tools: toolRows.slice(0, 10),
    userMessageCount: chatMessages.length + callTranscriptMessages.length,
    userMessageUniqueTalentCount: userMessageUserIds.size,
    viewedRecommendationCount: includedViewedRecommendedRows.length,
  };
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

export function formatDailyUserStatsSlackMessage(report: DailyUserStatsReport) {
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
  const jobs =
    report.jobs.length > 0
      ? report.jobs
          .map(
            (job) =>
              `- ${job.title} @ ${job.companyName}: ${formatCount(
                job.viewCount
              )}명 / ${formatCount(job.signupCount)}명 회원가입`
          )
          .join("\n")
      : "- 없음";

  return [
    `[Daily User Stats] ${report.date}, KST`,
    "",
    "**신규**",
    `신규 가입: ${formatCount(report.signupCount)}명`,
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
    `오늘 신규 가입이 아니지만 다시 들어와서 제출 완료한 사람: ${formatCount(
      report.returningSubmittedCount
    )}명`,
    `오늘 신규 가입이 아니지만 다시 들어와서 온보딩 완료한 사람: ${formatCount(
      report.returningOnboardingCompletedCount
    )}명`,
    "",
    `Active talents: ${formatCount(report.activeTalentsCount)}명`,
    // `High_intent_talents: ${formatCount(report.highIntentTalentsCount)}명`,
    `누적 talents: ${formatCount(report.cumulativeTalentsCount)}명`,
    "",
    "**추천 통계**",
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
    `추천된 내부 기회 수: ${formatCount(report.internalRecommendationCount)}개`,
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
    `메일 답장: ${formatCount(report.mailReplyCount)}개`,
    "",
    "Tools",
    tools,
    `- failed tool calls: ${formatCount(
      report.failedToolCallCount
    )}, ${formatPercent(report.toolFailureRate)}`,
    "",
    "jobs",
    jobs,
  ].join("\n");
}
