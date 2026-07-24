import { runWebSearch } from "@/lib/tools/webSearch";
import {
  fetchTalentOpportunityHistory,
  fetchTalentOpportunityHistoryByIds,
  fetchTalentOpportunityHistoryByRoleIds,
  updateTalentOpportunityHistoryItem,
  type TalentOpportunityFeedback,
  type TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import {
  getPostingRoleIdFromOpportunityId,
  isPostingRoleId,
  normalizePostingRoleId,
  toPostingOpportunityId,
} from "@/lib/career/postingLinks";
import { runCareerJobPostingRecommendations } from "./jobPostingRecommendations";
import { lookupAnswerExamples } from "@/lib/serviceAnswerExamples";
import { normalizeGeneratedTalentInsightEntry } from "./insights";
import { openUrlWithDocumentsCache } from "./openUrlTool";
import {
  appendEducationMemo,
  appendExperienceMemo,
  appendExtraMemo,
  fetchTalentUserProfile,
} from "./profileStore";
import {
  fetchTalentInsights,
  fetchTalentSetting,
  normalizeTalentInsightContent,
  refreshTalentPreferredLocale,
  upsertTalentInsights,
  upsertTalentSetting,
} from "./server";
import {
  TALENT_RECOMMENDATION_BATCH_SIZE_MAX,
  TALENT_RECOMMENDATION_BATCH_SIZE_MIN,
  normalizeTalentRecommendationBatchSize,
} from "./recommendationSettings";
import {
  buildInsightActivitySummary,
  buildPreferenceActivitySummary,
  buildRowMemoActivitySummary,
  compactActivityChanges,
  fetchTalentActivityEvents,
  insertTalentActivityEvent,
  insertTalentOpportunityFeedbackActivityEvent,
  isSameActivityValue,
  type TalentActivityChange,
  type TalentActivityImpactLevel,
  type TalentRowMemoActivityItem,
} from "./activityEvents";
import {
  logTalentToolCall,
  logTalentToolError,
  logTalentToolResult,
} from "./toolLogging";
import {
  insertTalentToolFailureLog,
  insertTalentToolUsageLog,
} from "./toolUsageLog";
import { recordInternalFitReevaluationInformation } from "./internalFitHoldQuestion";
import type { TalentAdminClient } from "./admin";
import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import { formatCareerPromptCompactDateTime } from "@/lib/career/prompts/promptUtils";
import { searchInternalRolesForCareerTool } from "@/lib/career/internalRoleSearch";
import { IncomingWebhook } from "@slack/webhook";
import { notifyInternalOpportunityDecisionSlack } from "@/lib/internalOpportunityDecisionSlack";

export type TalentToolChannel = "chat" | "voice";

export type TalentToolExecutionContext = {
  admin?: unknown;
  abortSignal?: AbortSignal;
  conversationId?: string;
  isMobile?: boolean | null;
  responseLocale?: string | null;
  userMessageId?: number | string | null;
  userId?: string;
};

export type TalentToolDefinition = {
  channels: TalentToolChannel[];
  description: string;
  execute?: (
    input: Record<string, unknown>,
    context?: TalentToolExecutionContext
  ) => Promise<unknown>;
  name: string;
  parameters: Record<string, unknown>;
  stopAfterExecution?: boolean;
  voicePreamble?: string;
};

async function insertToolUsageLogFromContext(args: {
  context?: TalentToolExecutionContext;
  name: string;
}) {
  const admin = args.context?.admin;
  if (!admin) return;

  await insertTalentToolUsageLog({
    admin: admin as TalentAdminClient,
    name: args.name,
    userId: args.context?.userId,
  });
}

async function insertToolFailureLogFromContext(args: {
  context?: TalentToolExecutionContext;
  name: string;
}) {
  const admin = args.context?.admin;
  if (!admin) return;

  await insertTalentToolFailureLog({
    admin: admin as TalentAdminClient,
    name: args.name,
    userId: args.context?.userId,
  });
}

export class TalentToolError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TalentToolError";
    this.status = status;
  }
}

export const TALENT_TOOL_NAMES = {
  END_CALL: "end_call",
  RECOMMEND_JOB_POSTINGS: "recommend_job_postings",
  READ_RECOMMENDED_OPPORTUNITIES: "read_recommended_opportunities",
  GET_INTERNAL_ROLES: "get_internal_roles",
  REQUEST_INTERNAL_ROLE_PRIORITY_REVIEW:
    "request_internal_role_priority_review",
  GET_ROLE_CONTEXT: "get_role_context",
  UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK:
    "update_recommended_opportunity_feedback",
  WEB_SEARCH: "web_search",
  OPEN_URL: "open_url",
  RESEARCH_COMPANY: "research_company",
  LOOKUP_ANSWER_EXAMPLES: "lookup_answer_examples",
  READ_TALENT_ACTIVITY_EVENTS: "read_talent_activity_events",
  UPDATE_SETTING: "update_setting",
  UPDATE_TALENT_PROFILE: "update_talent_profile",
  RECORD_INTERNAL_FIT_REEVALUATION_INFORMATION:
    "record_internal_fit_reevaluation_information",
} as const;

export type TalentToolName =
  (typeof TALENT_TOOL_NAMES)[keyof typeof TALENT_TOOL_NAMES];

export const DEFAULT_ENABLED_TALENT_TOOL_NAMES = [
  TALENT_TOOL_NAMES.END_CALL,
  TALENT_TOOL_NAMES.WEB_SEARCH,
  TALENT_TOOL_NAMES.OPEN_URL,
  TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS,
  TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES,
  TALENT_TOOL_NAMES.GET_INTERNAL_ROLES,
  TALENT_TOOL_NAMES.REQUEST_INTERNAL_ROLE_PRIORITY_REVIEW,
  TALENT_TOOL_NAMES.GET_ROLE_CONTEXT,
  TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
  TALENT_TOOL_NAMES.RESEARCH_COMPANY,
  TALENT_TOOL_NAMES.LOOKUP_ANSWER_EXAMPLES,
  TALENT_TOOL_NAMES.READ_TALENT_ACTIVITY_EVENTS,
  TALENT_TOOL_NAMES.UPDATE_SETTING,
  TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
  TALENT_TOOL_NAMES.RECORD_INTERNAL_FIT_REEVALUATION_INFORMATION,
] as const;

// Edit this value to change the common final-reply guidance added to every
// talent tool result's assistantInstruction.
export const TALENT_TOOL_COMMON_ASSISTANT_INSTRUCTION = [
  "After every tool result, the final user-facing reply should be longer and more detailed than a terse confirmation.",
  "In the user's language, explain what was checked, changed, saved, or found; what Harper will do differently from now on; what will no longer happen when applicable; what the user can expect or wait for; and how they can change it again later.",
  "Use Markdown structure when it improves readability.",
  "Do not answer only one-line confirmation. Do not mention tool names, system field names.",
].join(" ");

const optionalToolString = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

function buildCommonTalentToolAssistantInstruction(instruction: unknown) {
  return [
    TALENT_TOOL_COMMON_ASSISTANT_INSTRUCTION,
    optionalToolString(instruction),
  ]
    .filter((text): text is string => Boolean(text))
    .join(" ");
}

function isTalentToolResultRecord(
  value: unknown
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function withTalentToolAssistantInstruction(
  result: unknown
): Record<string, unknown> {
  if (isTalentToolResultRecord(result)) {
    return {
      ...result,
      assistantInstruction: buildCommonTalentToolAssistantInstruction(
        result.assistantInstruction
      ),
    };
  }

  return {
    assistantInstruction: buildCommonTalentToolAssistantInstruction(null),
    ok: true,
    result,
  };
}

const normalizeToolBio = (value: unknown) => {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.slice(0, 8000) : null;
};

const normalizeToolLocation = (value: unknown) => {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 240) : null;
};

function getTalentToolResponseLanguage(
  context?: TalentToolExecutionContext | null
) {
  return getCareerPromptLanguageName(context?.responseLocale);
}

const IMPACT_LEVEL_RANK: Record<TalentActivityImpactLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function normalizeToolImpactLevel(
  value: unknown
): TalentActivityImpactLevel | null {
  const text = optionalToolString(value);
  if (text === "low" || text === "medium" || text === "high") return text;
  return null;
}

function maxImpactLevel(
  levels: Array<TalentActivityImpactLevel | null | undefined>
): TalentActivityImpactLevel {
  return levels.reduce<TalentActivityImpactLevel>((current, next) => {
    if (!next) return current;
    return IMPACT_LEVEL_RANK[next] > IMPACT_LEVEL_RANK[current]
      ? next
      : current;
  }, "low");
}

const normalizeToolLimit = (value: unknown, fallback: number) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
};

const TALENT_ACTIVITY_EVENT_TYPES = new Set([
  "company_followed",
  "company_unfollowed",
  "insight_updated",
  "onboarding_completed",
  "profile_updated",
  "preferences_changed",
  "row_memo_added",
]);

function normalizeActivityEventTypes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry ?? "").trim())
        .filter((entry) => TALENT_ACTIVITY_EVENT_TYPES.has(entry))
    )
  );
}

function normalizeSinceDate(input: Record<string, unknown>) {
  const since = optionalToolString(input.since);
  if (since) {
    const time = Date.parse(since);
    if (!Number.isNaN(time)) return new Date(time).toISOString();
  }

  const daysBack =
    typeof input.sinceDays === "number"
      ? input.sinceDays
      : Number.parseInt(String(input.sinceDays ?? ""), 10);
  if (!Number.isFinite(daysBack)) return null;
  const normalizedDays = Math.max(1, Math.min(365, Math.floor(daysBack)));
  return new Date(
    Date.now() - normalizedDays * 24 * 60 * 60 * 1000
  ).toISOString();
}

type RecommendedOpportunityToolFeedback = "like" | "dislike";

const RECOMMENDED_OPPORTUNITY_TOOL_FEEDBACK = new Set<string>([
  "like",
  "dislike",
]);

function normalizeRecommendedOpportunityToolFeedback(
  value: unknown
): RecommendedOpportunityToolFeedback | null {
  const text = optionalToolString(value);
  return text && RECOMMENDED_OPPORTUNITY_TOOL_FEEDBACK.has(text)
    ? (text as RecommendedOpportunityToolFeedback)
    : null;
}

function toTalentOpportunityFeedback(
  feedback: RecommendedOpportunityToolFeedback
): TalentOpportunityFeedback {
  return feedback === "like" ? "positive" : "negative";
}

function compactOpportunityForTool(item: TalentOpportunityHistoryItem) {
  return {
    id: item.id,
    roleId: item.roleId,
    companyName: item.companyName,
    title: item.title,
    opportunityType: item.opportunityType,
    sourceType: item.sourceType,
    location: item.location,
    workMode: item.workMode,
    feedback: item.feedback,
    internalProgress: item.internalProgress,
    href: item.href,
  };
}

function includesLoose(haystack: string, needle: string) {
  return haystack
    .toLocaleLowerCase("ko-KR")
    .includes(needle.toLocaleLowerCase("ko-KR"));
}

function formatCompactToolDate(value: string | null | undefined) {
  return formatCareerPromptCompactDateTime(value) || null;
}

function formatRecommendedOpportunityRole(item: TalentOpportunityHistoryItem) {
  const title = optionalToolString(item.title) ?? "Untitled role";
  const companyName = optionalToolString(item.companyName) ?? "Unknown company";
  const details = [
    item.location ? `location: ${item.location}` : null,
    optionalToolString(item.workMode),
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");
  const employmentType = optionalToolString(item.employmentTypes[0]);

  return [
    `${title} at ${companyName}`,
    details ? `, ${details}` : "",
    employmentType ? ` - ${employmentType}` : "",
  ].join("");
}

function formatRecommendedOpportunityName(item: TalentOpportunityHistoryItem) {
  const title = optionalToolString(item.title) ?? "Untitled role";
  const companyName = optionalToolString(item.companyName) ?? "Unknown company";
  return `${title} at ${companyName}`;
}

function formatRecommendedOpportunityProgress(
  item: TalentOpportunityHistoryItem
) {
  if (!item.internalProgress) return null;

  return {
    UserAcceptedAt:
      formatCompactToolDate(item.internalProgress.acceptedAt) ??
      item.internalProgress.acceptedAt,
    code: item.internalProgress.code,
    message: item.internalProgress.message,
  };
}

function shouldCloseRecommendedOpportunityFromProgress(
  item: TalentOpportunityHistoryItem
) {
  return (
    item.sourceType === "internal" &&
    item.internalProgress?.code === "closed_by_company" &&
    item.savedStage !== "closed"
  );
}

const ROLE_CONTEXT_ROLE_ID_LIMIT = 3;
const ROLE_CONTEXT_COMPANY_DESCRIPTION_MAX_CHARS = 1600;

const ROLE_CONTEXT_ROLE_SELECT = `
  role_id,
  name,
  description,
  external_jd_url,
  location_text,
  work_mode,
  type,
  seniority_level,
  salary_range,
  status,
  posted_at,
  expires_at,
  source_type,
  request,
  company_workspace:company_workspace!inner (
    company_db:company_db (
      name,
      short_description,
      description,
      location,
      founded_year,
      employee_count_range
    )
  )
`;

const ROLE_CONTEXT_RECOMMENDATION_SELECT = `
  role_id,
  opportunity_type,
  fit_summary,
  fit_reasons,
  tradeoffs,
  preference_fit,
  created_at,
  feedback,
  feedback_reason,
  saved_stage
`;

function asToolRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asToolRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          asToolRecord(entry) !== null
      )
    : [];
}

function optionalClippedToolString(value: unknown, maxLength: number) {
  const text = optionalToolString(value);
  return text ? text.slice(0, maxLength) : null;
}

function normalizeRoleContextRoleIds(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [value];
  const roleIds: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of rawValues) {
    const rawText = optionalToolString(rawValue);
    if (!rawText) continue;
    const postingRoleId = getPostingRoleIdFromOpportunityId(rawText);
    const roleId = normalizePostingRoleId(postingRoleId || rawText);
    if (!isPostingRoleId(roleId) || seen.has(roleId)) continue;
    seen.add(roleId);
    roleIds.push(roleId);
    if (roleIds.length >= ROLE_CONTEXT_ROLE_ID_LIMIT) break;
  }

  return roleIds;
}

function normalizeRoleContextStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map(optionalToolString)
        .filter((text): text is string => Boolean(text))
    : [];
}

function pickLatestRoleContextRecommendation(
  rows: readonly Record<string, unknown>[]
) {
  return [...rows].sort((left, right) => {
    const leftTime = Date.parse(String(left.created_at ?? ""));
    const rightTime = Date.parse(String(right.created_at ?? ""));
    const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
    const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : 0;
    return normalizedRightTime - normalizedLeftTime;
  })[0];
}

async function runGetRoleContext(args: {
  admin: any;
  includeJd: boolean;
  roleIds: string[];
  userId: string;
}) {
  const [roleResponse, recommendationResponse] = await Promise.all([
    (args.admin.from("company_roles" as any) as any)
      .select(ROLE_CONTEXT_ROLE_SELECT)
      .in("role_id", args.roleIds),
    (args.admin.from("talent_opportunity_recommendation" as any) as any)
      .select(ROLE_CONTEXT_RECOMMENDATION_SELECT)
      .eq("talent_id", args.userId)
      .in("role_id", args.roleIds)
      .order("created_at", { ascending: false }),
  ]);

  if (roleResponse.error) {
    throw new TalentToolError(
      roleResponse.error.message ?? "Failed to load role context."
    );
  }
  if (recommendationResponse.error) {
    throw new TalentToolError(
      recommendationResponse.error.message ??
        "Failed to load role recommendation context."
    );
  }

  const roleRows = asToolRecordArray(roleResponse.data);
  const recommendationRows = asToolRecordArray(recommendationResponse.data);
  const roleById = new Map(
    roleRows
      .map((row) => [optionalToolString(row.role_id), row] as const)
      .filter((entry): entry is readonly [string, Record<string, unknown>] =>
        Boolean(entry[0])
      )
  );
  const recommendationsByRoleId = new Map<string, Record<string, unknown>[]>();

  for (const row of recommendationRows) {
    const roleId = optionalToolString(row.role_id);
    if (!roleId) continue;
    const current = recommendationsByRoleId.get(roleId) ?? [];
    current.push(row);
    recommendationsByRoleId.set(roleId, current);
  }

  const roles = args.roleIds.map((roleId) => {
    const row = roleById.get(roleId);
    if (!row) {
      return {
        found: false,
        roleId,
      };
    }

    const workspace = asToolRecord(row.company_workspace);
    const companyDb = asToolRecord(workspace?.company_db);
    const latestRecommendation = pickLatestRoleContextRecommendation(
      recommendationsByRoleId.get(roleId) ?? []
    );

    return {
      found: true,
      roleId,
      role: {
        roleId,
        name: optionalToolString(row.name),
        ...(args.includeJd
          ? { description: optionalToolString(row.description) }
          : {}),
        externalJdUrl: optionalToolString(row.external_jd_url),
        locationText: optionalToolString(row.location_text),
        workMode: optionalToolString(row.work_mode),
        type: normalizeRoleContextStringArray(row.type),
        seniorityLevel: optionalToolString(row.seniority_level),
        salaryRange: optionalToolString(row.salary_range),
        status: optionalToolString(row.status),
        postedAt: optionalToolString(row.posted_at),
        expiresAt: optionalToolString(row.expires_at),
        sourceType: optionalToolString(row.source_type),
        internalRequest: optionalToolString(row.request),
      },
      companyDb: {
        name: optionalToolString(companyDb?.name),
        shortDescription: optionalToolString(companyDb?.short_description),
        description: optionalClippedToolString(
          companyDb?.description,
          ROLE_CONTEXT_COMPANY_DESCRIPTION_MAX_CHARS
        ),
        hqLocation: optionalToolString(companyDb?.location),
        foundedYear:
          typeof companyDb?.founded_year === "number"
            ? companyDb.founded_year
            : optionalToolString(companyDb?.founded_year),
        employeeCountRange: companyDb?.employee_count_range ?? null,
      },
      recommendation: latestRecommendation
        ? {
            opportunityType: optionalToolString(
              latestRecommendation.opportunity_type
            ),
            fitSummary: optionalToolString(latestRecommendation.fit_summary),
            fitReasons: latestRecommendation.fit_reasons ?? [],
            tradeoffs: latestRecommendation.tradeoffs ?? [],
            preferenceFit: latestRecommendation.preference_fit ?? null,
            recommendedAt: optionalToolString(latestRecommendation.created_at),
            feedback: optionalToolString(latestRecommendation.feedback),
            feedbackReason: optionalToolString(
              latestRecommendation.feedback_reason
            ),
            savedStage: optionalToolString(latestRecommendation.saved_stage),
          }
        : null,
    };
  });

  return {
    requestedRoleIds: args.roleIds,
    missingRoleIds: roles
      .filter((role) => !role.found)
      .map((role) => role.roleId),
    roles,
  };
}

async function resolveRecommendedOpportunityForFeedbackUpdate(args: {
  admin: any;
  companyName: string | null;
  opportunityId: string | null;
  roleId: string | null;
  roleTitle: string | null;
  userId: string;
}) {
  if (args.opportunityId) {
    const postingRoleId = getPostingRoleIdFromOpportunityId(args.opportunityId);
    if (postingRoleId) {
      const [opportunity] = await fetchTalentOpportunityHistoryByRoleIds({
        admin: args.admin,
        roleIds: [postingRoleId],
        userId: args.userId,
      });
      return {
        ok: true as const,
        opportunity: opportunity ?? null,
        updateOpportunityId: opportunity?.id ?? args.opportunityId,
      };
    }

    const [opportunity] = await fetchTalentOpportunityHistoryByIds({
      admin: args.admin,
      ids: [args.opportunityId],
      userId: args.userId,
    });
    if (!opportunity) {
      return {
        ok: false as const,
        reason: "not_found",
        message:
          "No recommended opportunity matched the provided opportunityId.",
        candidates: [],
      };
    }
    return {
      ok: true as const,
      opportunity,
      updateOpportunityId: args.opportunityId,
    };
  }

  if (args.roleId) {
    const roleId = args.roleId;
    const [opportunity] = await fetchTalentOpportunityHistoryByRoleIds({
      admin: args.admin,
      roleIds: [roleId],
      userId: args.userId,
    });
    return {
      ok: true as const,
      opportunity: opportunity ?? null,
      updateOpportunityId: opportunity?.id ?? toPostingOpportunityId(roleId),
    };
  }

  const opportunities = await fetchTalentOpportunityHistory({
    admin: args.admin,
    userId: args.userId,
  });
  const filtered = opportunities.filter((item) => {
    if (
      args.companyName &&
      !includesLoose(item.companyName, args.companyName)
    ) {
      return false;
    }
    if (args.roleTitle && !includesLoose(item.title, args.roleTitle)) {
      return false;
    }
    return true;
  });

  if (filtered.length === 1) {
    return {
      ok: true as const,
      opportunity: filtered[0],
      updateOpportunityId: filtered[0].id,
    };
  }

  return {
    ok: false as const,
    reason: filtered.length === 0 ? "not_found" : "ambiguous",
    message:
      filtered.length === 0
        ? "No recommended opportunity matched the provided filters."
        : "Multiple recommended opportunities matched. Ask the user which one.",
    candidates: filtered.slice(0, 5).map(compactOpportunityForTool),
  };
}

async function updateRecommendedOpportunityFeedback(args: {
  admin: any;
  companyName: string | null;
  feedback: RecommendedOpportunityToolFeedback;
  feedbackReason: string | null;
  opportunityId: string | null;
  roleId: string | null;
  roleTitle: string | null;
  userId: string;
  conversationId?: string | null;
  isMobile?: boolean | null;
}) {
  const resolved = await resolveRecommendedOpportunityForFeedbackUpdate({
    admin: args.admin,
    companyName: args.companyName,
    opportunityId: args.opportunityId,
    roleId: args.roleId,
    roleTitle: args.roleTitle,
    userId: args.userId,
  });

  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason,
      message: resolved.message,
      candidates: resolved.candidates,
    };
  }

  const feedback = toTalentOpportunityFeedback(args.feedback);
  const savedStage =
    feedback === "positive" && resolved.opportunity?.sourceType === "internal"
      ? "connected"
      : undefined;
  const result = await updateTalentOpportunityHistoryItem({
    action: "feedback",
    admin: args.admin,
    clearEmailAcceptanceConfirmation:
      resolved.opportunity?.sourceType === "internal",
    feedback,
    feedbackReason: args.feedbackReason,
    opportunityId: resolved.updateOpportunityId,
    savedStage,
    userId: args.userId,
  });
  const [updatedOpportunity] = await fetchTalentOpportunityHistoryByIds({
    admin: args.admin,
    ids: [result.opportunityId],
    userId: args.userId,
  });

  if (updatedOpportunity) {
    await insertTalentOpportunityFeedbackActivityEvent({
      action: feedback,
      admin: args.admin,
      conversationId: args.conversationId ?? null,
      feedbackReason: args.feedbackReason,
      opportunity: updatedOpportunity,
      userId: args.userId,
    });

    await notifyInternalOpportunityDecisionSlack({
      admin: args.admin,
      decision: feedback,
      deviceLabel:
        typeof args.isMobile === "boolean"
          ? args.isMobile
            ? "모바일"
            : "데스크탑"
          : null,
      feedbackReason: args.feedbackReason,
      opportunity: updatedOpportunity,
      sourceLabel: "Harper 채팅",
      userId: args.userId,
    });
  }

  return {
    ok: true,
    feedback: args.feedback,
    updatedAt: result.updatedAt,
    opportunity: updatedOpportunity
      ? compactOpportunityForTool(updatedOpportunity)
      : null,
  };
}

const INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND =
  "candidate_requested_connection";
const HARPER_INTERNAL_ROLE_COMPANY_NAME = "Harper";
const OPS_CAREER_URL = "https://matchharper.com/ops/career";

function formatKstDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(date);
  const partByType = new Map(parts.map((part) => [part.type, part.value]));
  const year = partByType.get("year");
  const month = partByType.get("month");
  const day = partByType.get("day");
  return year && month && day ? `${year}-${month}-${day} KST` : null;
}

function isHarperInternalRoleCompany(companyName: string | null | undefined) {
  return companyName === HARPER_INTERNAL_ROLE_COMPANY_NAME;
}

function getHiringSlackWebhookUrl() {
  return process.env.SLACK_HIRING_TOKEN?.trim() ?? "";
}

function normalizeSlackText(value: unknown) {
  return String(value ?? "").trim();
}

function escapeSlackText(value: unknown) {
  return normalizeSlackText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeSlackLinkUrl(value: unknown) {
  return normalizeSlackText(value)
    .replace(/\s/g, "%20")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\|/g, "%7C");
}

function formatSlackLink(url: unknown, text: unknown) {
  const label = normalizeSlackText(text);
  const safeUrl = escapeSlackLinkUrl(url);
  if (!safeUrl || !label) return escapeSlackText(label);
  return `<${safeUrl}|${escapeSlackText(label)}>`;
}

function buildOpsCareerUserUrl(userId: string) {
  const url = new URL(OPS_CAREER_URL);
  url.searchParams.set("userId", userId);
  return url.toString();
}

async function notifyHarperInternalRolePriorityReviewSlack(args: {
  admin: TalentAdminClient;
  roleId: string;
  roleTitle?: string | null;
  userId: string;
}) {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true") return false;

  const webhookUrl = getHiringSlackWebhookUrl();
  if (!webhookUrl) {
    console.warn("[internal-role-priority-review] SLACK_HIRING_TOKEN missing");
    return false;
  }

  const profile = await fetchTalentUserProfile({
    admin: args.admin,
    userId: args.userId,
  });
  const emailName = optionalToolString(profile?.email)?.split("@")[0] ?? null;
  const name = optionalToolString(profile?.name) ?? emailName ?? "Unknown";
  const headline = optionalToolString(profile?.headline) ?? "-";
  const roleTitle = optionalToolString(args.roleTitle) ?? args.roleId;

  const lines = [
    "*Harper internal role request*",
    `*Candidate*: ${formatSlackLink(buildOpsCareerUserUrl(args.userId), name)}`,
    `*Headline*: ${escapeSlackText(headline)}`,
    `*Role*: ${escapeSlackText(roleTitle)}`,
  ];

  const webhook = new IncomingWebhook(webhookUrl);
  await webhook.send({
    text: `Harper internal role request - ${name}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: lines.join("\n"),
        },
      },
    ],
  });

  return true;
}

async function requestInternalRolePriorityReview(args: {
  admin: any;
  conversationId?: string | null;
  roleId: string;
  userId: string;
  userMessageId?: number | string | null;
}) {
  const roleId = normalizePostingRoleId(args.roleId);
  if (!isPostingRoleId(roleId)) {
    throw new TalentToolError(
      "request_internal_role_priority_review requires a valid roleId."
    );
  }

  const { data: role, error: roleError } = await ((
    args.admin.from("company_roles" as any) as any
  )
    .select(
      `
        role_id,
        name,
        source_type,
        status,
        company_workspace:company_workspace (
          company_name
        )
      `
    )
    .eq("role_id", roleId)
    .maybeSingle() as any);

  if (roleError) {
    throw new TalentToolError(
      roleError.message ?? "Failed to verify the internal role."
    );
  }

  const roleRecord = asToolRecord(role);
  if (!roleRecord) {
    return {
      ok: false,
      status: "role_not_found",
      roleId,
      assistantInstruction:
        "Tell the user Harper could not verify the exact role yet. Ask for the company name, role title, or link so Harper can identify it. Do not say it was saved.",
    };
  }

  const sourceType = optionalToolString(roleRecord.source_type)?.toLowerCase();
  if (sourceType !== "internal") {
    return {
      ok: false,
      status: "not_internal_role",
      roleId,
      assistantInstruction:
        "Tell the user Harper could not save this as a priority internal-role review request because it is not verified as a Harper-connected role. Do not promise a connection, interview, referral, company introduction, or specific timeline.",
    };
  }

  const workspace = asToolRecord(roleRecord.company_workspace);
  const companyName = optionalToolString(workspace?.company_name);
  const roleTitle = optionalToolString(roleRecord.name);

  const { data: existingRows, error: existingError } = await ((
    args.admin.from("talent_progress" as any) as any
  )
    .select("id, created_at")
    .eq("talent_id", args.userId)
    .eq("role_id", roleId)
    .eq("kind", INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND)
    .order("created_at", { ascending: true })
    .limit(1) as any);

  if (existingError) {
    throw new TalentToolError(
      existingError.message ?? "Failed to check existing priority request."
    );
  }

  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  const existingCreatedAt = optionalToolString(existing?.created_at);
  if (existingCreatedAt) {
    const existingCreatedDate = formatKstDate(existingCreatedAt);
    return {
      ok: true,
      status: "already_exists",
      roleId,
      roleTitle,
      companyName,
      existingCreatedAt,
      existingCreatedDate,
      assistantInstruction: [
        `Tell the user this role was already saved for priority review on ${existingCreatedDate ?? existingCreatedAt}.`,
        "Say Harper will keep this preference reflected in review priority.",
        "Do not promise a connection, interview, referral, company introduction, or specific timeline.",
      ].join(" "),
    };
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await ((
    args.admin.from("talent_progress" as any) as any
  )
    .insert({
      kind: INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND,
      metadata: {
        conversationId: args.conversationId ?? null,
        priority: "high",
        source: "career_chat",
        status: "requested",
        userMessageId: args.userMessageId ?? null,
      },
      role_id: roleId,
      talent_id: args.userId,
      text: "User requested priority review for connection to this role.",
      user_id: args.userId,
    })
    .select("id, created_at")
    .single() as any);

  if (insertError) {
    throw new TalentToolError(
      insertError.message ?? "Failed to save priority review request."
    );
  }

  const createdAt = optionalToolString(inserted?.created_at) ?? now;

  if (isHarperInternalRoleCompany(companyName)) {
    try {
      await notifyHarperInternalRolePriorityReviewSlack({
        admin: args.admin as TalentAdminClient,
        roleId,
        roleTitle,
        userId: args.userId,
      });
    } catch (error) {
      console.error("[internal-role-priority-review] slack notify failed", {
        error: error instanceof Error ? error.message : String(error),
        roleId,
        userId: args.userId,
      });
    }
  }

  return {
    ok: true,
    status: "created",
    roleId,
    roleTitle,
    companyName,
    createdAt,
    createdDate: formatKstDate(createdAt),
    assistantInstruction: [
      "Tell the user Harper saved this role so it can be reviewed with highest priority in detail. 다음은 기다리면 핏이 맞는걸 찾아서 메일로 연결 제안이 간다는걸 자세히 안내해라.",
      "Do not promise a connection, interview, referral, company introduction, or specific timeline.",
    ].join(" "),
  };
}

const TALENT_TOOL_REGISTRY: Record<string, TalentToolDefinition> = {
  [TALENT_TOOL_NAMES.END_CALL]: {
    name: TALENT_TOOL_NAMES.END_CALL,
    description:
      "End the current live voice call. Use only after you have already spoken the final short closing message, or when the user clearly asks to end, stop, or hang up the call. This tool ends only the live call session and does not change recommendation, email, account, or profile settings.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    channels: ["voice"],
  },
  [TALENT_TOOL_NAMES.WEB_SEARCH]: {
    name: TALENT_TOOL_NAMES.WEB_SEARCH,
    description:
      "Search the web for current factual information. Use only when the answer depends on recent or external web information.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The exact search query to run on the web.",
        },
        maxResults: {
          type: "integer",
          description: "Maximum number of results to inspect.",
          minimum: 1,
          maximum: 5,
          default: 5,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    voicePreamble: "잠시만요. 한번 찾아볼게요.",
    async execute(input) {
      const query = String(input.query ?? "").trim();
      const maxResults =
        typeof input.maxResults === "number"
          ? input.maxResults
          : Number.parseInt(String(input.maxResults ?? ""), 10);

      if (!query) {
        throw new TalentToolError("web_search requires a non-empty query.");
      }

      const searchResponse = await runWebSearch({
        query,
        maxResults: Number.isFinite(maxResults) ? maxResults : 5,
      });

      return {
        query: searchResponse.query,
        resultCount: searchResponse.results.length,
        results: searchResponse.results.map((result, index) => ({
          rank: index + 1,
          title: result.title,
          url: result.url,
          snippet:
            result.snippet.length > 280
              ? `${result.snippet.slice(0, 280)}...`
              : result.snippet,
        })),
      };
    },
  },
  [TALENT_TOOL_NAMES.OPEN_URL]: {
    name: TALENT_TOOL_NAMES.OPEN_URL,
    description:
      "Open a specific website URL and return page markdown. Use when the user provides a URL or asks to read, inspect, summarize, or reason about a specific webpage.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The exact http(s) URL to open.",
        },
        maxMarkdownChars: {
          type: "integer",
          description:
            "Optional maximum markdown characters returned to the model.",
          minimum: 1000,
          maximum: 40000,
          default: 20000,
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const url = optionalToolString(input.url);
      if (!admin) {
        throw new TalentToolError("open_url requires service context.");
      }
      if (!url) {
        throw new TalentToolError("open_url requires a non-empty URL.");
      }

      return openUrlWithDocumentsCache({
        admin: admin as any,
        maxMarkdownChars: input.maxMarkdownChars,
        url,
      });
    },
  },
  [TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS]: {
    name: TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS,
    description:
      "Find, rerank, enrich, and save up to 5 current job postings for this user. Use when the user asks to find, recommend, or match new job postings, roles, positions, companies, or opportunities with specific requirements. Do not use first when the user's request includes a durable hard filter or future-matching command such as '~로만 찾아줘', '~만 보내줘', '앞으로 ~로 찾아줘', '다음부터 ~는 빼줘', or '~ 조건을 반영해줘'; call update_talent_profile first so the condition is saved, then let the fresh search run. Do not use immediately for clearly off-profile or aspirational role requests; first explain the mismatch and ask one clarifying question. If the user clarifies it is only curiosity/browsing, use this as a one-off exploratory search and do not update future matching memory.",
    parameters: {
      type: "object",
      properties: {
        request: {
          type: "string",
          description:
            "The user's full job-search request, including role, domain, location, work mode, company type, seniority, and any constraints they mentioned. If this is one-off curiosity/browsing rather than a durable preference, explicitly include that in the request so the search does not imply future matching criteria changed.",
        },
      },
      required: ["request"],
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const conversationId = context?.conversationId;
      const userId = context?.userId;
      const request = optionalToolString(input.request);

      if (!admin || !conversationId || !userId) {
        throw new TalentToolError(
          "recommend_job_postings requires user and conversation context."
        );
      }
      if (!request) {
        throw new TalentToolError("recommend_job_postings requires request.");
      }

      return runCareerJobPostingRecommendations({
        admin: admin as any,
        abortSignal: context?.abortSignal,
        conversationId,
        preferredLocale: context?.responseLocale ?? null,
        request,
        userId,
      });
    },
  },
  [TALENT_TOOL_NAMES.RESEARCH_COMPANY]: {
    name: TALENT_TOOL_NAMES.RESEARCH_COMPANY,
    description:
      "Use this tool when the user GENUINELY wants to learn about a specific company (asking about culture, funding, team, business model, hiring landscape, etc.). It returns a synthesized company answer with citations when available.\n\nDo NOT call when:\n- Company name appears in passing or anecdotally (e.g., '내 친구도 토스 다녔어')\n- Company name is part of a JD/role question\n- User is just sharing their own experience at a company\n- User asks for an opinion comparing companies without asking for info ('A vs B 어디가 좋을까')\n\nOnly invoke when the user clearly wants company-specific depth.",
    parameters: {
      type: "object",
      properties: {
        company_name: {
          type: "string",
          description: "Company name to investigate.",
        },
        reason: {
          type: "string",
          description:
            "Short reason from the user's request, such as concerns about culture, stability, funding, layoffs, or interview preparation.",
        },
      },
      required: ["company_name"],
      additionalProperties: false,
    },
    channels: ["chat"],
    stopAfterExecution: true,
  },
  [TALENT_TOOL_NAMES.LOOKUP_ANSWER_EXAMPLES]: {
    name: TALENT_TOOL_NAMES.LOOKUP_ANSWER_EXAMPLES,
    description:
      "Use when the current prompt and conversation context are not enough to answer well. Retrieves managed example user messages and answer examples.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description:
            "The user's latest question or message, in their own words.",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input) {
      const question = optionalToolString(input.question);
      if (!question) {
        throw new TalentToolError(
          "lookup_answer_examples requires a non-empty question."
        );
      }
      return lookupAnswerExamples(question);
    },
  },
  [TALENT_TOOL_NAMES.READ_TALENT_ACTIVITY_EVENTS]: {
    name: TALENT_TOOL_NAMES.READ_TALENT_ACTIVITY_EVENTS,
    description:
      "Read concise recent activity summaries for this talent user. Use when the answer depends on what the user recently changed or did in Career, such as profile preference changes, profile-row memo additions, onboarding completion, or Harper insight updates.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Maximum number of activity events to return.",
          minimum: 1,
          maximum: 20,
          default: 5,
        },
        since: {
          type: "string",
          description:
            "Optional ISO timestamp. If provided, return activity events on or after this time.",
        },
        sinceDays: {
          type: "integer",
          description:
            "Optional lookback window in days. Used only when since is omitted.",
          minimum: 1,
          maximum: 365,
        },
        eventTypes: {
          type: "array",
          description: "Optional event type filter.",
          items: {
            type: "string",
            enum: [
              "company_followed",
              "company_unfollowed",
              "preferences_changed",
              "row_memo_added",
              "insight_updated",
              "onboarding_completed",
            ],
          },
        },
      },
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "read_talent_activity_events requires user context."
        );
      }

      const limit = normalizeToolLimit(input.limit, 5);
      const since = normalizeSinceDate(input);
      const eventTypes = normalizeActivityEventTypes(input.eventTypes);
      const events = await fetchTalentActivityEvents({
        admin: admin as any,
        eventTypes,
        limit,
        since,
        userId,
      });

      return {
        count: events.length,
        eventTypes: eventTypes.length > 0 ? eventTypes : null,
        limit,
        since,
        summaries: events.map((event) => event.summary),
        events: events.map((event) => ({
          changedDomains: event.changed_domains,
          createdAt: event.created_at,
          eventType: event.event_type,
          impactLevel: event.impact_level,
          source: event.source,
          summary: event.summary,
        })),
      };
    },
  },
  [TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES]: {
    name: TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES,
    description:
      "Read the user's existing recommended opportunities so the assistant can answer questions about previously recommended companies, roles, links, reasons, user feedback, and connection/review status.",
    parameters: {
      type: "object",
      properties: {
        companyName: {
          type: "array",
          description:
            "Optional company name filters. When provided, returns opportunities whose company name includes at least one of these names.",
          items: {
            type: "string",
          },
        },
        limit: {
          type: "integer",
          description: "Maximum number of opportunities to return.",
          minimum: 1,
          maximum: 20,
          default: 8,
        },
        only_internal: {
          type: "boolean",
          description:
            "When true, return only previously recommended internal opportunities.",
          default: false,
        },
      },
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    voicePreamble: "추천해드린 기회를 잠깐 확인해볼게요.",
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "read_recommended_opportunities requires user context."
        );
      }

      const companyNames = (
        Array.isArray(input.companyName)
          ? input.companyName
          : [input.companyName]
      )
        .map(optionalToolString)
        .filter((name): name is string => Boolean(name));
      const limit = normalizeToolLimit(input.limit, 8);
      const onlyInternal = input.only_internal === true;
      const companyFilters = companyNames.map((name) =>
        name.toLocaleLowerCase("ko-KR")
      );
      const opportunities = await fetchTalentOpportunityHistory({
        admin: admin as any,
        sourceType: onlyInternal ? "internal" : undefined,
        userId,
      });
      const filtered = opportunities.filter((item) => {
        if (onlyInternal && item.sourceType !== "internal") {
          return false;
        }
        if (companyFilters.length > 0) {
          const itemCompanyName = item.companyName.toLocaleLowerCase("ko-KR");
          return companyFilters.some((companyFilter) =>
            itemCompanyName.includes(companyFilter)
          );
        }
        return true;
      });
      const displayedItems = filtered.slice(0, limit);
      const itemsToClose = displayedItems.filter(
        shouldCloseRecommendedOpportunityFromProgress
      );
      if (itemsToClose.length > 0) {
        await Promise.all(
          itemsToClose.map((item) =>
            updateTalentOpportunityHistoryItem({
              action: "saved_stage",
              admin: admin as any,
              opportunityId: item.id,
              savedStage: "closed",
              userId,
            })
          )
        );
      }
      const closedOpportunityIds = new Set(itemsToClose.map((item) => item.id));
      const assistantInstruction =
        itemsToClose.length > 0
          ? itemsToClose
              .map(
                (item) =>
                  `${formatRecommendedOpportunityName(item)} 기회에 대해 progress.message에 기반한 안내를 해라. 최대한 기분이 상하지 않도록 잘 전달해라. 해당 기회는 진행 종료 상태로 변경되었음을 자연스럽게 알려라.`
              )
              .join(" ")
          : undefined;

      return {
        ...(assistantInstruction ? { assistantInstruction } : {}),
        filters: {
          companyName: companyNames.length > 0 ? companyNames : null,
          limit,
          only_internal: onlyInternal,
        },
        returnedCount: Math.min(filtered.length, limit),
        totalMatchingCount: filtered.length,
        opportunities: displayedItems.map((item) => {
          const feedbackReason = optionalToolString(item.feedbackReason);
          const progress = formatRecommendedOpportunityProgress(item);
          const userMemo = optionalToolString(item.talentMemo);
          const savedStage = closedOpportunityIds.has(item.id)
            ? "closed"
            : item.savedStage;

          return {
            roleId: item.roleId,
            role: formatRecommendedOpportunityRole(item),
            opportunityType: item.opportunityType,
            jdURL: item.externalJdUrl,
            recommendedAt:
              formatCompactToolDate(item.recommendedAt) ?? item.recommendedAt,
            recommendationReasons: item.recommendationReasons.slice(0, 5),
            feedback: item.feedback,
            ...(userMemo ? { userMemo } : {}),
            ...(feedbackReason ? { feedbackReason } : {}),
            ...(progress ? { progress } : {}),
            savedStage,
            status: item.status,
            summary: item.recommendationSummary,
          };
        }),
      };
    },
  },
  [TALENT_TOOL_NAMES.GET_INTERNAL_ROLES]: {
    name: TALENT_TOOL_NAMES.GET_INTERNAL_ROLES,
    description:
      "Find current internal Harper-connected roles by direct role-title or company-name keywords. This is lookup, not personalized recommendation or fit ranking.",
    parameters: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          description:
            "One or two direct FTS keywords from the user's request, such as the distinctive role title term or company name. Split broad multi-word searches into separate key terms when exact AND matching is not intended; for example use ['CTO'] or ['Wonderful', 'CTO'] instead of ['Site CTO'] unless both words must appear.",
          items: {
            type: "string",
          },
          minItems: 1,
          maxItems: 2,
        },
      },
      required: ["keywords"],
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const userId = context?.userId;
      if (!userId) {
        throw new TalentToolError("get_internal_roles requires user context.");
      }

      return searchInternalRolesForCareerTool({
        keywords: input.keywords,
        userId,
      });
    },
  },
  [TALENT_TOOL_NAMES.REQUEST_INTERNAL_ROLE_PRIORITY_REVIEW]: {
    name: TALENT_TOOL_NAMES.REQUEST_INTERNAL_ROLE_PRIORITY_REVIEW,
    description:
      "Save the candidate's explicit request for priority review on a specific internal role. Requires roleId. If roleId is unknown, call get_internal_roles first to resolve it.",
    parameters: {
      type: "object",
      properties: {
        roleId: {
          type: "string",
          description:
            "Internal role id for the role the candidate wants Harper to prioritize.",
        },
      },
      required: ["roleId"],
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "request_internal_role_priority_review requires user context."
        );
      }

      const roleId = optionalToolString(input.roleId);
      if (!roleId) {
        throw new TalentToolError(
          "request_internal_role_priority_review requires roleId."
        );
      }

      return requestInternalRolePriorityReview({
        admin: admin as any,
        conversationId: context?.conversationId ?? null,
        roleId,
        userId,
        userMessageId: context?.userMessageId ?? null,
      });
    },
  },
  [TALENT_TOOL_NAMES.GET_ROLE_CONTEXT]: {
    name: TALENT_TOOL_NAMES.GET_ROLE_CONTEXT,
    description:
      "Get detailed context for up to 3 specific job posting roles by roleId. Use only when the user asks about, recalls, or gives feedback on specific already-shown posting cards/roles and the current context does not contain enough detail. Do not use while finding or presenting fresh recommendations; recommend_job_postings already returns the context needed for that answer. Includes role details, company context, and the latest user-specific recommendation context for each role. Set include_jd true only when the job description/JD text is needed; when false, role.description is omitted. Treat any private company-side notes in the result as reasoning-only context; never quote or expose them to the user.",
    parameters: {
      type: "object",
      properties: {
        include_jd: {
          type: "boolean",
          description:
            "Whether to include the job description text as role.description. Set true when the user needs JD/details/responsibilities/requirements; set false when role metadata and recommendation context are enough.",
        },
        roleIds: {
          type: "array",
          description:
            "Role ids from standalone [posting](roleId) lines or prior tool results. Provide 1 to 3 roleIds.",
          items: {
            type: "string",
          },
          maxItems: ROLE_CONTEXT_ROLE_ID_LIMIT,
        },
      },
      required: ["roleIds", "include_jd"],
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    voicePreamble: "포지션 상세 내용을 잠깐 확인해볼게요.",
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError("get_role_context requires user context.");
      }

      const roleIds = normalizeRoleContextRoleIds(input.roleIds);
      if (roleIds.length === 0) {
        throw new TalentToolError(
          "get_role_context requires 1-3 valid roleIds."
        );
      }

      return runGetRoleContext({
        admin: admin as any,
        includeJd: input.include_jd === true,
        roleIds,
        userId,
      });
    },
  },
  [TALENT_TOOL_NAMES.RECORD_INTERNAL_FIT_REEVALUATION_INFORMATION]: {
    name: TALENT_TOOL_NAMES.RECORD_INTERNAL_FIT_REEVALUATION_INFORMATION,
    description:
      "Private writer for one active hidden internal fit hold question. Use only when the user's latest message clearly answers that hidden question. It saves the new evidence for later reevaluation and does not reveal or recommend the internal role.",
    parameters: {
      type: "object",
      properties: {
        fitId: {
          type: "string",
          description:
            "The fitId from the current hidden hold question prompt block.",
        },
        newInformation: {
          type: "string",
          description:
            "A concise summary of the newly provided user evidence that answers the hidden hold question.",
        },
      },
      required: ["fitId", "newInformation"],
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "record_internal_fit_reevaluation_information requires user context."
        );
      }

      const fitId = optionalToolString(input.fitId);
      const newInformation = optionalToolString(input.newInformation);
      if (!fitId || !newInformation) {
        throw new TalentToolError(
          "record_internal_fit_reevaluation_information requires fitId and newInformation."
        );
      }

      return recordInternalFitReevaluationInformation({
        admin: admin as TalentAdminClient,
        conversationId: context?.conversationId ?? null,
        fitId,
        newInformation,
        source: "chat",
        userId,
        userMessageId: context?.userMessageId ?? null,
      });
    },
  },
  [TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK]: {
    name: TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
    description:
      "Set one recommended opportunity's feedback to like or dislike.",
    parameters: {
      type: "object",
      properties: {
        feedback: {
          type: "string",
          enum: ["like", "dislike"],
          description: "Use like for saved/positive, dislike for rejected.",
        },
        opportunityId: {
          type: "string",
          description:
            "Exact recommendation id when known. Prefer roleId from [posting](roleId) when available.",
        },
        roleId: {
          type: "string",
          description: "Role id from a [posting](roleId) card line.",
        },
        companyName: {
          type: "string",
          description:
            "Company name only when id/roleId is unavailable. Used to disambiguate.",
        },
        roleTitle: {
          type: "string",
          description:
            "Role title only when id/roleId is unavailable. Used to disambiguate.",
        },
        feedbackReason: {
          type: "string",
          description:
            "Optional short reason from the user's message, if they gave one.",
        },
      },
      required: ["feedback"],
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "update_recommended_opportunity_feedback requires user context."
        );
      }

      const feedback = normalizeRecommendedOpportunityToolFeedback(
        input.feedback
      );
      if (!feedback) {
        throw new TalentToolError(
          "update_recommended_opportunity_feedback requires a valid feedback."
        );
      }

      const opportunityId = optionalToolString(input.opportunityId);
      const roleId = normalizePostingRoleId(input.roleId);
      if (roleId && !isPostingRoleId(roleId)) {
        throw new TalentToolError(
          "update_recommended_opportunity_feedback received an invalid roleId."
        );
      }

      return updateRecommendedOpportunityFeedback({
        admin: admin as any,
        companyName: optionalToolString(input.companyName),
        conversationId: context?.conversationId ?? null,
        feedback,
        feedbackReason: optionalToolString(input.feedbackReason),
        opportunityId,
        roleId,
        roleTitle: optionalToolString(input.roleTitle),
        userId,
        isMobile: context?.isMobile,
      });
    },
  },
  [TALENT_TOOL_NAMES.UPDATE_SETTING]: {
    name: TALENT_TOOL_NAMES.UPDATE_SETTING,
    description:
      "Update Harper subscription scope from an explicit latest user request. stop_external stops good-fit external/public postings but keeps direct-connection opportunities; stop_all stops all Harper matching contact; resume restarts recommendations/contact. For generic stop/unsubscribe, ask one scope clarifier instead of calling. Not for batch size, cadence, profile facts, matching memory, or searches.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["stop_external", "stop_all", "resume"],
          description:
            "stop_external disables good-fit external/public postings. stop_all sets profile visibility to dont_share. resume sets profile visibility to exceptional_only and enables external/public postings.",
        },
        reasonText: {
          type: "string",
          description:
            "Brief explanation in the selected reply language of why this subscription update was made.",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin as any;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError("update_setting requires user context.");
      }

      const existingSetting = await fetchTalentSetting({ admin, userId });
      const updatePayload: Parameters<typeof upsertTalentSetting>[0] = {
        admin,
        userId,
      };
      const updatedSettingFields: string[] = [];
      const settingActivityChanges: TalentActivityChange[] = [];
      const action = optionalToolString(input.action);
      let summary: string | null = null;

      if (action === "stop_external") {
        const nextGetExternalRecommendation = false;
        updatePayload.getExternalRecommendation = false;
        updatedSettingFields.push("getExternalRecommendation");
        if (
          !isSameActivityValue(
            existingSetting?.get_external_recommendation ?? true,
            nextGetExternalRecommendation
          )
        ) {
          settingActivityChanges.push({
            field: "getExternalRecommendation",
            from: existingSetting?.get_external_recommendation ?? true,
            to: nextGetExternalRecommendation,
          });
        }
        summary =
          "사용자가 Career 채팅에서 외부 공개 포지션 추천 중단을 요청했습니다.";
      } else if (action === "stop_all") {
        const nextProfileVisibility = "dont_share";
        updatePayload.profileVisibility = nextProfileVisibility;
        updatedSettingFields.push("profileVisibility");
        if (
          !isSameActivityValue(
            existingSetting?.profile_visibility ?? "exceptional_only",
            nextProfileVisibility
          )
        ) {
          settingActivityChanges.push({
            field: "profileVisibility",
            from: existingSetting?.profile_visibility ?? "exceptional_only",
            to: nextProfileVisibility,
          });
        }
        summary =
          "사용자가 Career 채팅에서 모든 Harper 매칭 연락 중단을 요청했습니다.";
      } else if (action === "resume") {
        const nextGetExternalRecommendation = true;
        const nextProfileVisibility = "exceptional_only";
        updatePayload.getExternalRecommendation = nextGetExternalRecommendation;
        updatePayload.profileVisibility = nextProfileVisibility;
        updatedSettingFields.push(
          "getExternalRecommendation",
          "profileVisibility"
        );
        if (
          !isSameActivityValue(
            existingSetting?.get_external_recommendation ?? true,
            nextGetExternalRecommendation
          )
        ) {
          settingActivityChanges.push({
            field: "getExternalRecommendation",
            from: existingSetting?.get_external_recommendation ?? true,
            to: nextGetExternalRecommendation,
          });
        }
        if (
          !isSameActivityValue(
            existingSetting?.profile_visibility ?? "exceptional_only",
            nextProfileVisibility
          )
        ) {
          settingActivityChanges.push({
            field: "profileVisibility",
            from: existingSetting?.profile_visibility ?? "exceptional_only",
            to: nextProfileVisibility,
          });
        }
        summary =
          "사용자가 Career 채팅에서 Harper 추천 연락 재개를 요청했습니다.";
      } else {
        throw new TalentToolError("update_setting requires a valid action.");
      }

      await upsertTalentSetting(updatePayload);

      const settingChanges = compactActivityChanges(settingActivityChanges);
      const settingSummary =
        summary ?? buildPreferenceActivitySummary(settingChanges);
      if (settingSummary && settingChanges.length > 0) {
        await insertTalentActivityEvent({
          admin,
          changedDomains: [
            "preferences",
            "email_subscription",
            ...settingChanges.map((change) => change.field),
          ],
          conversationId: context?.conversationId ?? null,
          eventType: "preferences_changed",
          impactLevel: "high",
          messageId: context?.userMessageId ?? null,
          source: "chat",
          summary: settingSummary,
          userId,
        });
      }

      const responseLanguage = getTalentToolResponseLanguage(context);
      return {
        assistantInstruction: [
          `Continue the conversation naturally in ${responseLanguage} now.`,
          "If recommendation/contact subscription scope changed, explain the practical consequence in the user's language: which recommendations or matching contacts Harper will include or avoid from now on, and how the user can adjust it later.",
          "Do not make the saved-setting acknowledgement the whole answer; continue naturally from the user's intent.",
        ].join(" "),
        action,
        impactLevel: "high",
        ok: true,
        updatedSettingFields,
      };
    },
  },
  [TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE]: {
    name: TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
    description:
      "Update saved profile/matching state from the latest user statement: profile summary, current base, row memos, post-onboarding future matching memory, or recommendationBatchSize. Do not use for subscription/contact actions; use update_setting for stop_external, stop_all, or resume. Skip questions, one-off searches, hypotheticals, assistant statements, and already-saved information.",
    parameters: {
      type: "object",
      properties: {
        talentUser: {
          type: "object",
          description:
            "Profile-level fields. Supports bio and current primary location. Use bio when the user explicitly provides or corrects their profile summary/about text. Use location only when the user explicitly provides or corrects their current main base/residence. Do not infer location from a short-term stay, travel, past job, target job location, or work-location preference.",
          properties: {
            bio: {
              anyOf: [{ type: "string" }, { type: "null" }],
              description:
                "New profile summary. Use null or an empty string only when the user explicitly asks to clear/remove the summary.",
            },
            location: {
              anyOf: [{ type: "string" }, { type: "null" }],
              description:
                "The user's current main base/residence shown on talent_users.location. This is where they primarily live/are based now, not a temporary location or where they want to work. Use null or an empty string only when the user explicitly asks to clear/remove their current location.",
            },
          },
          additionalProperties: false,
        },
        rowMemos: {
          type: "array",
          description:
            "Memo additions for visible profile rows. Use only when the user's statement clearly maps to one specific row. rowId must be a verbatim RowID from the profile listing. Omit ambiguous or generic mentions.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["experience", "education", "extra"],
              },
              rowId: {
                type: "string",
                description: "Exact RowID visible in the profile listing.",
              },
              title: {
                type: "string",
                description:
                  "Optional exact Title visible for an extra row. Matching still uses rowId.",
              },
              memo: {
                type: "string",
                description:
                  "Memo text to add to this row, based on the user's latest statement.",
              },
            },
            required: ["type", "rowId", "memo"],
            additionalProperties: false,
          },
        },
        talentInsights: {
          type: "object",
          description:
            "Durable future recommendation/search-memory updates from the user's latest statement, such as desired next role, search intensity, compensation, must-haves, deal-breakers, team style, company/domain preference, company size/stage preference, resume/CV positioning context, or corrections to prior matching preferences, or external_delivery_selectivity. Explicit hard-filter search commands are durable memory too: for example, '미국 회사로만 찾아줘' should update must_haves with a value like '앞으로 미국 기반 회사만 추천받고 싶어합니다.' when intended as a hard requirement. If the user talks about what their resume/CV contains, leaves out, emphasizes, or should communicate for matching, preserve that resume-related context here unless it belongs on one visible profile row. Do not use this for facts that belong on a specific experience, education, or extra row; use rowMemos instead. Do not use this for one-off curiosity/browsing/search requests or aspirational/off-profile role mentions unless the user explicitly says Harper should remember the new direction for future matching. Values must be final integrated Korean complete sentences, not fragments. During onboarding, omit this entirely because insight extraction is handled separately.",
          properties: {
            content: {
              type: "object",
              description:
                "Partial future-matching memory patch. If the new information belongs to an existing/current insight or checklist axis, update that key with the final integrated value instead of creating a synonym key. Create a new descriptive English snake_case key when the information is genuinely distinct and does not fit existing keys.",
              additionalProperties: {
                type: "string",
                description: "Final integrated complete Korean sentence.",
              },
            },
            changeSummary: {
              type: "string",
              description: "Short one-line Korean summary of what changed.",
            },
            impactLevel: {
              type: "string",
              enum: ["low", "medium", "high"],
            },
          },
          required: ["content"],
          additionalProperties: false,
        },
        recommendationBatchSize: {
          type: "integer",
          minimum: TALENT_RECOMMENDATION_BATCH_SIZE_MIN,
          maximum: TALENT_RECOMMENDATION_BATCH_SIZE_MAX,
          description:
            "Recommendations per batch, 3-10. Exact count uses that value; vague more = current +2 capped at 10 or 5 if unknown; maximum = 10; vague fewer = current -2 floored at 3 or 3 if unknown.",
        },
      },
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin as any;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "update_talent_profile requires user context."
        );
      }

      const talentUserInput =
        input.talentUser &&
        typeof input.talentUser === "object" &&
        !Array.isArray(input.talentUser)
          ? (input.talentUser as Record<string, unknown>)
          : null;
      const rowMemosInput: unknown =
        input.rowMemos && typeof input.rowMemos === "object"
          ? input.rowMemos
          : null;
      const talentInsightsInput =
        input.talentInsights &&
        typeof input.talentInsights === "object" &&
        !Array.isArray(input.talentInsights)
          ? (input.talentInsights as Record<string, unknown>)
          : null;

      let existingSetting:
        | Awaited<ReturnType<typeof fetchTalentSetting>>
        | undefined;
      const loadExistingSetting = async () => {
        if (existingSetting === undefined) {
          existingSetting = await fetchTalentSetting({ admin, userId });
        }
        return existingSetting;
      };

      const updatedTalentUserFields: string[] = [];
      const talentUserActivityChanges: TalentActivityChange[] = [];
      const updatedRowMemos: {
        experiences: string[];
        educations: string[];
        extras: string[];
      } = { experiences: [], educations: [], extras: [] };
      const updatedTalentInsights: Record<
        string,
        { from: string | null; to: string }
      > = {};
      const rowMemoActivityItems: TalentRowMemoActivityItem[] = [];
      const skippedRowMemos: Array<{
        table: "experiences" | "educations" | "extras";
        key: string;
        reason: string;
      }> = [];
      const skippedTalentInsights: Array<{
        key?: string;
        reason: string;
      }> = [];
      const updatedRecommendationSettings: string[] = [];

      // talent_users — direct profile-level updates.
      const hasTalentUserBioUpdate = Boolean(
        talentUserInput &&
        Object.prototype.hasOwnProperty.call(talentUserInput, "bio")
      );
      const hasTalentUserLocationUpdate = Boolean(
        talentUserInput &&
        Object.prototype.hasOwnProperty.call(talentUserInput, "location")
      );
      if (
        talentUserInput &&
        (hasTalentUserBioUpdate || hasTalentUserLocationUpdate)
      ) {
        const nextBio = hasTalentUserBioUpdate
          ? normalizeToolBio(talentUserInput.bio)
          : undefined;
        const nextLocation = hasTalentUserLocationUpdate
          ? normalizeToolLocation(talentUserInput.location)
          : undefined;

        if (nextBio !== undefined || nextLocation !== undefined) {
          const { data: currentUser, error: currentUserError } = await admin
            .from("talent_users")
            .select("bio, location")
            .eq("user_id", userId)
            .maybeSingle();
          if (currentUserError) {
            throw new TalentToolError(
              currentUserError.message ?? "Failed to read talent_users."
            );
          }

          const talentUserPatch: Record<string, string | null> = {};
          if (nextBio !== undefined) {
            const previousBio = normalizeToolBio(currentUser?.bio) ?? null;
            if (previousBio !== nextBio) {
              talentUserPatch.bio = nextBio;
              updatedTalentUserFields.push("bio");
              talentUserActivityChanges.push({
                field: "bio",
                from: previousBio,
                to: nextBio,
              });
            }
          }

          if (nextLocation !== undefined) {
            const previousLocation =
              normalizeToolLocation(currentUser?.location) ?? null;
            if (previousLocation !== nextLocation) {
              talentUserPatch.location = nextLocation;
              updatedTalentUserFields.push("location");
              talentUserActivityChanges.push({
                field: "location",
                from: previousLocation,
                to: nextLocation,
              });
            }
          }

          if (Object.keys(talentUserPatch).length > 0) {
            const { error: talentUserUpdateError } = await admin
              .from("talent_users")
              .update({
                ...talentUserPatch,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
            if (talentUserUpdateError) {
              throw new TalentToolError(
                talentUserUpdateError.message ??
                  "Failed to update talent_users."
              );
            }
            if (
              Object.prototype.hasOwnProperty.call(talentUserPatch, "location")
            ) {
              await refreshTalentPreferredLocale({ admin, userId });
            }
          }
        }
      }

      // talent_insights — only after onboarding is complete. During onboarding,
      // the separate insight extraction pass owns this state.
      if (talentInsightsInput) {
        const setting = await loadExistingSetting();
        if (!setting?.is_onboarding_done) {
          skippedTalentInsights.push({ reason: "onboarding_active" });
        } else {
          const contentInput =
            talentInsightsInput.content &&
            typeof talentInsightsInput.content === "object" &&
            !Array.isArray(talentInsightsInput.content)
              ? talentInsightsInput.content
              : null;
          const normalizedPatch: Record<string, string> = {};

          if (contentInput) {
            for (const [rawKey, rawValue] of Object.entries(contentInput)) {
              const normalized = normalizeGeneratedTalentInsightEntry({
                rawKey,
                rawValue,
                rejectProfileRowFactKeys: true,
              });
              if (!normalized.ok) {
                skippedTalentInsights.push({
                  key: normalized.key ?? rawKey,
                  reason: normalized.reason,
                });
                continue;
              }
              normalizedPatch[normalized.key] = normalized.value;
            }
          }

          if (Object.keys(normalizedPatch).length === 0) {
            skippedTalentInsights.push({ reason: "empty_or_invalid_content" });
          } else {
            const existingInsights = await fetchTalentInsights({
              admin,
              userId,
            });
            const currentContent =
              normalizeTalentInsightContent(
                existingInsights?.content ?? null
              ) ?? {};
            const changedPatch: Record<string, string> = {};

            for (const [key, value] of Object.entries(normalizedPatch)) {
              const previous = currentContent[key]?.trim() || null;
              const next = value.trim();
              if (!next) continue;
              if (previous === next) {
                skippedTalentInsights.push({ key, reason: "unchanged" });
                continue;
              }
              changedPatch[key] = next;
              updatedTalentInsights[key] = {
                from: previous,
                to: next,
              };
            }

            if (Object.keys(changedPatch).length > 0) {
              await upsertTalentInsights({
                admin,
                userId,
                content: {
                  ...currentContent,
                  ...changedPatch,
                },
              });
            }
          }
        }
      }

      // talent_experiences/educations/extras row memos — silent per-row append.
      // Helpers enforce talent_id ownership and cap memo at 2000 chars.
      const groupedRowMemosInput = Array.isArray(rowMemosInput)
        ? {
            experiences: rowMemosInput.filter(
              (item) =>
                item &&
                typeof item === "object" &&
                optionalToolString((item as Record<string, unknown>).type) ===
                  "experience"
            ),
            educations: rowMemosInput.filter(
              (item) =>
                item &&
                typeof item === "object" &&
                optionalToolString((item as Record<string, unknown>).type) ===
                  "education"
            ),
            extras: rowMemosInput.filter(
              (item) =>
                item &&
                typeof item === "object" &&
                optionalToolString((item as Record<string, unknown>).type) ===
                  "extra"
            ),
          }
        : rowMemosInput && typeof rowMemosInput === "object"
          ? (rowMemosInput as Record<string, unknown>)
          : null;

      if (groupedRowMemosInput) {
        const experiencesEntries = Array.isArray(
          groupedRowMemosInput.experiences
        )
          ? (groupedRowMemosInput.experiences as unknown[])
          : [];
        for (const rawEntry of experiencesEntries) {
          if (!rawEntry || typeof rawEntry !== "object") continue;
          const entry = rawEntry as Record<string, unknown>;
          const rowId = optionalToolString(entry.rowId);
          const memo = optionalToolString(entry.memo);
          if (!rowId || !memo) continue;
          const outcome = await appendExperienceMemo({
            admin,
            userId,
            rowId,
            memo,
          });
          if (outcome.ok) {
            if (outcome.updated) {
              updatedRowMemos.experiences.push(rowId);
              if (outcome.target) {
                rowMemoActivityItems.push({
                  entityId: outcome.target.entityId,
                  entityLabel: outcome.target.entityLabel,
                  entityType: outcome.target.entityType,
                  memo,
                });
              }
            }
          } else {
            skippedRowMemos.push({
              table: "experiences",
              key: rowId,
              reason: outcome.reason,
            });
          }
        }

        const educationsEntries = Array.isArray(groupedRowMemosInput.educations)
          ? (groupedRowMemosInput.educations as unknown[])
          : [];
        for (const rawEntry of educationsEntries) {
          if (!rawEntry || typeof rawEntry !== "object") continue;
          const entry = rawEntry as Record<string, unknown>;
          const rowId = optionalToolString(entry.rowId);
          const memo = optionalToolString(entry.memo);
          if (!rowId || !memo) continue;
          const outcome = await appendEducationMemo({
            admin,
            userId,
            rowId,
            memo,
          });
          if (outcome.ok) {
            if (outcome.updated) {
              updatedRowMemos.educations.push(rowId);
              if (outcome.target) {
                rowMemoActivityItems.push({
                  entityId: outcome.target.entityId,
                  entityLabel: outcome.target.entityLabel,
                  entityType: outcome.target.entityType,
                  memo,
                });
              }
            }
          } else {
            skippedRowMemos.push({
              table: "educations",
              key: rowId,
              reason: outcome.reason,
            });
          }
        }

        const extrasEntries = Array.isArray(groupedRowMemosInput.extras)
          ? (groupedRowMemosInput.extras as unknown[])
          : [];
        for (const rawEntry of extrasEntries) {
          if (!rawEntry || typeof rawEntry !== "object") continue;
          const entry = rawEntry as Record<string, unknown>;
          const rowId = optionalToolString(entry.rowId);
          const memo = optionalToolString(entry.memo);
          if (!rowId || !memo) continue;
          const outcome = await appendExtraMemo({
            admin,
            userId,
            rowId,
            memo,
          });
          if (outcome.ok) {
            if (outcome.updated) {
              updatedRowMemos.extras.push(rowId);
              if (outcome.target) {
                rowMemoActivityItems.push({
                  entityId: outcome.target.entityId,
                  entityLabel: outcome.target.entityLabel,
                  entityType: outcome.target.entityType,
                  memo,
                });
              }
            }
          } else {
            skippedRowMemos.push({
              table: "extras",
              key: rowId,
              reason: outcome.reason,
            });
          }
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(
          input,
          "recommendationBatchSize"
        ) &&
        typeof input.recommendationBatchSize === "number" &&
        Number.isFinite(input.recommendationBatchSize)
      ) {
        const setting = await loadExistingSetting();
        const nextRecommendationBatchSize =
          normalizeTalentRecommendationBatchSize(input.recommendationBatchSize);
        const previousRecommendationBatchSize =
          setting?.recommendation_batch_size ?? null;
        if (
          !isSameActivityValue(
            previousRecommendationBatchSize,
            nextRecommendationBatchSize
          )
        ) {
          await upsertTalentSetting({
            admin,
            recommendationBatchSize: nextRecommendationBatchSize,
            userId,
          });
          updatedRecommendationSettings.push("recommendationBatchSize");
        }
      }

      const talentUserSummary =
        talentUserActivityChanges.length > 0
          ? talentUserActivityChanges
              .map((change) => {
                if (change.field === "bio") {
                  return change.to
                    ? "profile summary updated"
                    : "profile summary cleared";
                }
                if (change.field === "location") {
                  return change.to
                    ? "current location updated"
                    : "current location cleared";
                }
                return `${change.field} updated`;
              })
              .join("; ")
          : null;
      if (talentUserSummary) {
        await insertTalentActivityEvent({
          admin,
          changedDomains: ["profile", ...updatedTalentUserFields],
          conversationId: context?.conversationId ?? null,
          eventType: "profile_updated",
          impactLevel: "low",
          messageId: context?.userMessageId ?? null,
          source: "chat",
          summary: `User ${talentUserSummary}.`,
          userId,
        });
      }

      const rowMemoSummary = buildRowMemoActivitySummary(rowMemoActivityItems);
      if (rowMemoSummary) {
        await insertTalentActivityEvent({
          admin,
          changedDomains: [
            "profile_memo",
            ...Array.from(
              new Set(
                rowMemoActivityItems.map((item) => `${item.entityType}_memo`)
              )
            ),
          ],
          conversationId: context?.conversationId ?? null,
          eventType: "row_memo_added",
          impactLevel: "medium",
          messageId: context?.userMessageId ?? null,
          source: "chat",
          summary: rowMemoSummary,
          userId,
        });
      }

      const talentInsightKeys = Object.keys(updatedTalentInsights);
      const insightSummary = buildInsightActivitySummary(talentInsightKeys);
      const insightChangeSummary = optionalToolString(
        talentInsightsInput?.changeSummary
      );
      const insightImpactLevel = insightSummary
        ? (normalizeToolImpactLevel(talentInsightsInput?.impactLevel) ?? "high")
        : null;
      if (insightSummary) {
        await insertTalentActivityEvent({
          admin,
          changedDomains: ["insights", ...talentInsightKeys],
          conversationId: context?.conversationId ?? null,
          eventType: "insight_updated",
          impactLevel: insightImpactLevel ?? "high",
          messageId: context?.userMessageId ?? null,
          source: "chat",
          summary: insightChangeSummary
            ? `${insightSummary} Change summary: ${insightChangeSummary}`
            : insightSummary,
          userId,
        });
      }

      if (updatedRecommendationSettings.includes("recommendationBatchSize")) {
        const nextRecommendationBatchSize =
          normalizeTalentRecommendationBatchSize(input.recommendationBatchSize);
        await insertTalentActivityEvent({
          admin,
          changedDomains: [
            "recommendation_settings",
            "recommendation_batch_size",
          ],
          conversationId: context?.conversationId ?? null,
          eventType: "preferences_changed",
          impactLevel: "high",
          messageId: context?.userMessageId ?? null,
          source: "chat",
          summary: `사용자가 Career 채팅에서 Harper 추천을 한 번에 ${nextRecommendationBatchSize}개씩 받고 싶다고 요청했습니다.`,
          userId,
        });
      }

      const impactLevel = maxImpactLevel([
        talentUserActivityChanges.length > 0 ? "low" : null,
        rowMemoActivityItems.length > 0 ? "medium" : null,
        insightImpactLevel,
        updatedRecommendationSettings.length > 0 ? "high" : null,
      ]);
      const responseLanguage = getTalentToolResponseLanguage(context);
      const replyInstructions = [
        `Continue the conversation naturally in ${responseLanguage} now.`,
        "If saved profile or future-matching memory changed, do not make the saved-memory acknowledgement the whole answer. Explain the user-facing consequence in the context of what the user just asked, then continue naturally.",
        "Use other tools only if independently required by the user's latest explicit request.",
        "If onboarding is still active, ask at most one relevant next question, or close naturally with the required marker when appropriate. Do not return an empty assistant message.",
      ];

      const result = {
        assistantInstruction: replyInstructions.join(" "),
        impactLevel,
        ok: true,
        updatedTalentUserFields,
        updatedRowMemos,
        updatedTalentInsightKeys: talentInsightKeys,
        updatedRecommendationSettings,
        skippedRowMemos,
        skippedTalentInsights,
      };

      return result;
    },
  },
};

export function getEnabledTalentTools(channel: TalentToolChannel) {
  const configured = new Set<string>([...DEFAULT_ENABLED_TALENT_TOOL_NAMES]);

  return Object.values(TALENT_TOOL_REGISTRY).filter(
    (tool) => configured.has(tool.name) && tool.channels.includes(channel)
  );
}

const UI_STATUS_MESSAGE_PARAMETER = {
  type: "string",
};

function withUiStatusMessageParameter(parameters: Record<string, unknown>) {
  const properties =
    parameters.properties &&
    typeof parameters.properties === "object" &&
    !Array.isArray(parameters.properties)
      ? (parameters.properties as Record<string, unknown>)
      : {};

  return {
    ...parameters,
    properties: {
      ...properties,
      _uiStatusMessage: UI_STATUS_MESSAGE_PARAMETER,
    },
  };
}

function localizeTalentToolPromptValue(
  value: unknown,
  responseLocale?: string | null
): unknown {
  const outputLanguage = getCareerPromptLanguageName(responseLocale);

  if (typeof value === "string") {
    return value.replace(/\bKorean\b/g, outputLanguage);
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      localizeTalentToolPromptValue(item, responseLocale)
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        localizeTalentToolPromptValue(item, responseLocale),
      ])
    );
  }

  return value;
}

export function getOpenAIChatTools(
  channel: TalentToolChannel,
  options?: { responseLocale?: string | null }
) {
  return getEnabledTalentTools(channel).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: localizeTalentToolPromptValue(
        tool.description,
        options?.responseLocale
      ) as string,
      parameters: localizeTalentToolPromptValue(
        withUiStatusMessageParameter(tool.parameters),
        options?.responseLocale
      ) as Record<string, unknown>,
    },
  }));
}

export function getStopAfterTalentToolNames(channel: TalentToolChannel) {
  return getEnabledTalentTools(channel)
    .filter((tool) => tool.stopAfterExecution)
    .map((tool) => tool.name);
}

export function getRealtimeTools(
  channel: TalentToolChannel,
  options?: { responseLocale?: string | null }
) {
  return getEnabledTalentTools(channel).map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: localizeTalentToolPromptValue(
      tool.description,
      options?.responseLocale
    ) as string,
    parameters: localizeTalentToolPromptValue(
      tool.name === TALENT_TOOL_NAMES.END_CALL
        ? tool.parameters
        : withUiStatusMessageParameter(tool.parameters),
      options?.responseLocale
    ) as Record<string, unknown>,
  }));
}

export async function executeTalentTool(args: {
  channel?: TalentToolChannel;
  context?: TalentToolExecutionContext;
  input: Record<string, unknown>;
  logging?: boolean;
  name: string;
}) {
  const tool = TALENT_TOOL_REGISTRY[args.name];

  if (!tool) {
    throw new TalentToolError(`Unknown talent tool: ${args.name}`);
  }

  if (args.channel && !tool.channels.includes(args.channel)) {
    throw new TalentToolError(
      `Tool is disabled for ${args.channel}: ${args.name}`
    );
  }

  const enabledNames = new Set(
    getEnabledTalentTools("chat")
      .concat(getEnabledTalentTools("voice"))
      .map((entry) => entry.name)
  );

  if (!enabledNames.has(tool.name)) {
    throw new TalentToolError(`Disabled talent tool: ${args.name}`);
  }

  if (!tool.execute) {
    throw new TalentToolError(
      `Tool requires a route-local executor: ${args.name}`
    );
  }

  const shouldLog = args.logging !== false;

  await insertToolUsageLogFromContext({
    context: args.context,
    name: tool.name,
  });

  if (shouldLog) {
    logTalentToolCall({
      input: {
        ...args.input,
        _context: {
          conversationId: args.context?.conversationId,
          userMessageId: args.context?.userMessageId,
          userId: args.context?.userId,
        },
      },
      name: tool.name,
      source: "talent-tool-registry",
    });
  }
  const startedAt = Date.now();
  try {
    const result = withTalentToolAssistantInstruction(
      await tool.execute(args.input, args.context)
    );
    if (shouldLog) {
      logTalentToolResult({
        durationMs: Date.now() - startedAt,
        name: tool.name,
        result,
        source: "talent-tool-registry",
      });
    }
    return result;
  } catch (error) {
    await insertToolFailureLogFromContext({
      context: args.context,
      name: tool.name,
    });
    if (shouldLog) {
      logTalentToolError({
        durationMs: Date.now() - startedAt,
        error,
        name: tool.name,
        source: "talent-tool-registry",
      });
    }
    throw error;
  }
}

export function getTalentToolVoicePreambles(channel: TalentToolChannel) {
  return Object.fromEntries(
    getEnabledTalentTools(channel)
      .filter((tool) => typeof tool.voicePreamble === "string")
      .map((tool) => [tool.name, tool.voicePreamble as string])
  );
}
