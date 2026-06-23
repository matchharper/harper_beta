import { runWebSearch } from "@/lib/tools/webSearch";
import {
  fetchTalentOpportunityHistory,
  fetchTalentOpportunityHistoryByIds,
  updateTalentOpportunityHistoryItem,
  type TalentOpportunityFeedback,
  type TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import { runCareerCompanyRecommendations } from "@/lib/career/companyWatchlist";
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
} from "./profileStore";
import {
  fetchTalentInsights,
  fetchTalentSetting,
  normalizeTalentInsightContent,
  upsertTalentInsights,
  upsertTalentSetting,
} from "./server";
import { selectAdditionalOnboardingQuestion } from "./additionalQuestionSelector";
import {
  TALENT_PERIODIC_INTERVAL_DAYS_MAX,
  TALENT_PERIODIC_INTERVAL_DAYS_MIN,
  TALENT_RECOMMENDATION_BATCH_SIZE_MAX,
  TALENT_RECOMMENDATION_BATCH_SIZE_MIN,
} from "./recommendationSettings";
import {
  buildInsightActivitySummary,
  buildPreferenceActivitySummary,
  buildRowMemoActivitySummary,
  compactActivityChanges,
  fetchTalentActivityEvents,
  getPreferenceActivityImpact,
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
import type { TalentAdminClient } from "./admin";
import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";

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
  SELECT_ADDITIONAL_ONBOARDING_QUESTION:
    "select_additional_onboarding_question",
  RECOMMEND_COMPANIES: "recommend_companies",
  RECOMMEND_JOB_POSTINGS: "recommend_job_postings",
  READ_RECOMMENDED_OPPORTUNITIES: "read_recommended_opportunities",
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
} as const;

export type TalentToolName =
  (typeof TALENT_TOOL_NAMES)[keyof typeof TALENT_TOOL_NAMES];

export const DEFAULT_ENABLED_TALENT_TOOL_NAMES = [
  TALENT_TOOL_NAMES.SELECT_ADDITIONAL_ONBOARDING_QUESTION,
  TALENT_TOOL_NAMES.WEB_SEARCH,
  TALENT_TOOL_NAMES.OPEN_URL,
  // Company recommendations are temporarily disabled while Watchlist is hidden.
  // TALENT_TOOL_NAMES.RECOMMEND_COMPANIES,
  TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS,
  TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES,
  TALENT_TOOL_NAMES.GET_ROLE_CONTEXT,
  TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
  TALENT_TOOL_NAMES.RESEARCH_COMPANY,
  TALENT_TOOL_NAMES.LOOKUP_ANSWER_EXAMPLES,
  TALENT_TOOL_NAMES.READ_TALENT_ACTIVITY_EVENTS,
  TALENT_TOOL_NAMES.UPDATE_SETTING,
  TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
] as const;

const optionalToolString = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

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
    dismissedAt: item.dismissedAt,
    href: item.href,
  };
}

function includesLoose(haystack: string, needle: string) {
  return haystack
    .toLocaleLowerCase("ko-KR")
    .includes(needle.toLocaleLowerCase("ko-KR"));
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
  kind,
  fit_summary,
  fit_reasons,
  tradeoffs,
  preference_fit,
  recommended_at,
  feedback,
  feedback_reason,
  saved_stage,
  processed_stage
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
    const leftTime = Date.parse(String(left.recommended_at ?? ""));
    const rightTime = Date.parse(String(right.recommended_at ?? ""));
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
      .order("recommended_at", { ascending: false }),
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
            kind: optionalToolString(latestRecommendation.kind),
            fitSummary: optionalToolString(latestRecommendation.fit_summary),
            fitReasons: latestRecommendation.fit_reasons ?? [],
            tradeoffs: latestRecommendation.tradeoffs ?? [],
            preferenceFit: latestRecommendation.preference_fit ?? null,
            recommendedAt: optionalToolString(
              latestRecommendation.recommended_at
            ),
            feedback: optionalToolString(latestRecommendation.feedback),
            feedbackReason: optionalToolString(
              latestRecommendation.feedback_reason
            ),
            savedStage: optionalToolString(latestRecommendation.saved_stage),
            processedStage: optionalToolString(
              latestRecommendation.processed_stage
            ),
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
      return {
        ok: true as const,
        opportunity: null,
        updateOpportunityId: args.opportunityId,
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
    return {
      ok: true as const,
      opportunity: null,
      updateOpportunityId: toPostingOpportunityId(roleId),
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
  const result = await updateTalentOpportunityHistoryItem({
    action: "feedback",
    admin: args.admin,
    feedback,
    feedbackReason: args.feedbackReason,
    opportunityId: resolved.updateOpportunityId,
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

const TALENT_TOOL_REGISTRY: Record<string, TalentToolDefinition> = {
  [TALENT_TOOL_NAMES.SELECT_ADDITIONAL_ONBOARDING_QUESTION]: {
    name: TALENT_TOOL_NAMES.SELECT_ADDITIONAL_ONBOARDING_QUESTION,
    description:
      "Internal onboarding selector. Use only during career onboarding Additional questions phase. It reads the user's profile, recent conversation, current insights, and optional latestUserMessage, then selects the single best next additional onboarding question. Prefer concrete profile gaps, especially substantial experience rows with empty description/memo; do not repeatedly ask broad desired role/tech-stack preference questions. If shouldAsk is true, ask exactly the returned assistantMessage naturally. If shouldAsk is false, use assistantMessage as the final priority confirmation. Do not close onboarding in the same response.",
    parameters: {
      type: "object",
      properties: {
        latestUserMessage: {
          type: "string",
          description: "Optional latest user message from the current turn.",
        },
      },
      additionalProperties: false,
    },
    channels: ["chat"],
    stopAfterExecution: true,
    async execute(input, context) {
      const admin = context?.admin;
      const conversationId = context?.conversationId;
      const userId = context?.userId;
      if (!admin || !conversationId || !userId) {
        throw new TalentToolError(
          "select_additional_onboarding_question requires user and conversation context."
        );
      }

      return selectAdditionalOnboardingQuestion({
        admin: admin as any,
        conversationId,
        isMobile: context?.isMobile,
        latestUserMessage: optionalToolString(input.latestUserMessage),
        userId,
      });
    },
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
  [TALENT_TOOL_NAMES.RECOMMEND_COMPANIES]: {
    name: TALENT_TOOL_NAMES.RECOMMEND_COMPANIES,
    description:
      "Find, rank, and save companies for the user's Career Watchlist. Use when the user asks for companies to follow, company recommendations, startup/company discovery, or watchlist suggestions independent of a specific role.",
    parameters: {
      type: "object",
      properties: {
        request: {
          type: "string",
          description:
            "The user's company-discovery request, including domains, company stage, location, role direction, or any constraints. If the user asks broadly, summarize the durable company signals Harper should use.",
        },
        limit: {
          type: "integer",
          description: "Number of companies to save to the Watchlist.",
          minimum: 1,
          maximum: 40,
          default: 24,
        },
      },
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const conversationId = context?.conversationId;
      const userId = context?.userId;
      if (!admin || !conversationId || !userId) {
        throw new TalentToolError(
          "recommend_companies requires user and conversation context."
        );
      }

      return runCareerCompanyRecommendations({
        admin: admin as any,
        conversationId,
        limit:
          typeof input.limit === "number"
            ? input.limit
            : Number.parseInt(String(input.limit ?? ""), 10),
        request: optionalToolString(input.request),
        source: "tool",
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
      const companyFilters = companyNames.map((name) =>
        name.toLocaleLowerCase("ko-KR")
      );
      const opportunities = await fetchTalentOpportunityHistory({
        admin: admin as any,
        userId,
      });
      const filtered = opportunities.filter((item) => {
        if (companyFilters.length > 0) {
          const itemCompanyName = item.companyName.toLocaleLowerCase("ko-KR");
          return companyFilters.some((companyFilter) =>
            itemCompanyName.includes(companyFilter)
          );
        }
        return true;
      });

      return {
        filters: {
          companyName: companyNames.length > 0 ? companyNames : null,
          limit,
        },
        returnedCount: Math.min(filtered.length, limit),
        totalMatchingCount: filtered.length,
        opportunities: filtered.slice(0, limit).map((item) => ({
          id: item.id,
          roleId: item.roleId,
          companyName: item.companyName,
          title: item.title,
          opportunityType: item.opportunityType,
          sourceType: item.sourceType,
          location: item.location,
          workMode: item.workMode,
          employmentTypes: item.employmentTypes,
          externalJdUrl: item.externalJdUrl,
          recommendedAt: item.recommendedAt,
          recommendationReasons: item.recommendationReasons.slice(0, 5),
          feedback: item.feedback,
          feedbackReason: item.feedbackReason,
          processedStage: item.processedStage,
          savedStage: item.savedStage,
          dismissedAt: item.dismissedAt,
          status: item.status,
          summary: item.description ?? item.companyDescription ?? null,
        })),
      };
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
          minItems: 1,
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
      });
    },
  },
  [TALENT_TOOL_NAMES.UPDATE_SETTING]: {
    name: TALENT_TOOL_NAMES.UPDATE_SETTING,
    description:
      "Update recommendation delivery settings only. Use when the user's latest statement directly asks to change how often Harper sends opportunity recommendations, how many opportunities are in each batch, or whether Harper should include external/public job postings and/or internal Harper-connected opportunities. Do not use for profile facts, row memos, future matching criteria such as role/company/location preferences, one-off browsing/search requests, hypotheticals, or information already saved in current state. If the user wants to stop all opportunity recommendations, set both getExternalRecommendation=false and getInternalRecommendation=false. If the user wants no public/external job-posting recommendations or wants only internal Harper-connected opportunities, set getExternalRecommendation=false and keep cadence fields unchanged. After the tool result, produce a normal user-facing chat reply in Korean; do not expose internal setting names.",
    parameters: {
      type: "object",
      properties: {
        getExternalRecommendation: {
          type: "boolean",
          description:
            "Whether Harper may recommend external/public job postings. Set false when the user says not to recommend public/external/open job postings, or says they only want internal Harper-connected opportunities. Default is true.",
        },
        getInternalRecommendation: {
          type: "boolean",
          description:
            "Whether Harper may recommend internal Harper-connected opportunities. Set true when the user says they still want internal/connected opportunities; set false only when they explicitly do not want these. Default is true.",
        },
        periodicIntervalDays: {
          type: "integer",
          minimum: TALENT_PERIODIC_INTERVAL_DAYS_MIN,
          maximum: TALENT_PERIODIC_INTERVAL_DAYS_MAX,
          description:
            "How often (in days) the user wants opportunity batches. Values must be 1-7.",
        },
        recommendationBatchSize: {
          type: "integer",
          minimum: TALENT_RECOMMENDATION_BATCH_SIZE_MIN,
          maximum: TALENT_RECOMMENDATION_BATCH_SIZE_MAX,
          description:
            "Number of opportunities per batch. Values must be 3-10. Use when the user gives an exact count or clearly asks for more/fewer recommendations at a time. For vague larger requests, choose current +2 capped at 10, or 5 when there is no active/current value. For maximum requests, use 10. For vague smaller requests, choose current -2 floored at 3, or 3 when there is no active/current value.",
        },
      },
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
      let didUpdate = false;

      if (typeof input.getExternalRecommendation === "boolean") {
        const nextGetExternalRecommendation = input.getExternalRecommendation;
        updatePayload.getExternalRecommendation = nextGetExternalRecommendation;
        didUpdate = true;
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
      }
      if (typeof input.getInternalRecommendation === "boolean") {
        const nextGetInternalRecommendation = input.getInternalRecommendation;
        updatePayload.getInternalRecommendation = nextGetInternalRecommendation;
        didUpdate = true;
        updatedSettingFields.push("getInternalRecommendation");
        if (
          !isSameActivityValue(
            existingSetting?.get_internal_recommendation ?? true,
            nextGetInternalRecommendation
          )
        ) {
          settingActivityChanges.push({
            field: "getInternalRecommendation",
            from: existingSetting?.get_internal_recommendation ?? true,
            to: nextGetInternalRecommendation,
          });
        }
      }
      if (
        typeof input.periodicIntervalDays === "number" &&
        Number.isFinite(input.periodicIntervalDays)
      ) {
        const nextPeriodicIntervalDays = input.periodicIntervalDays;
        updatePayload.periodicIntervalDays = nextPeriodicIntervalDays;
        didUpdate = true;
        updatedSettingFields.push("periodicIntervalDays");
        if (
          !isSameActivityValue(
            existingSetting?.periodic_interval_days ?? null,
            nextPeriodicIntervalDays
          )
        ) {
          settingActivityChanges.push({
            field: "periodicIntervalDays",
            from: existingSetting?.periodic_interval_days ?? null,
            to: nextPeriodicIntervalDays,
          });
        }
      }
      if (
        typeof input.recommendationBatchSize === "number" &&
        Number.isFinite(input.recommendationBatchSize)
      ) {
        const nextRecommendationBatchSize = input.recommendationBatchSize;
        updatePayload.recommendationBatchSize = nextRecommendationBatchSize;
        didUpdate = true;
        updatedSettingFields.push("recommendationBatchSize");
        if (
          !isSameActivityValue(
            existingSetting?.recommendation_batch_size ?? null,
            nextRecommendationBatchSize
          )
        ) {
          settingActivityChanges.push({
            field: "recommendationBatchSize",
            from: existingSetting?.recommendation_batch_size ?? null,
            to: nextRecommendationBatchSize,
          });
        }
      }

      if (didUpdate) {
        await upsertTalentSetting(updatePayload);
      }

      const settingChanges = compactActivityChanges(settingActivityChanges);
      const settingSummary = buildPreferenceActivitySummary(settingChanges);
      const settingImpactLevel =
        settingChanges.length > 0
          ? getPreferenceActivityImpact(settingChanges)
          : null;
      if (settingSummary) {
        await insertTalentActivityEvent({
          admin,
          changedDomains: [
            "preferences",
            ...settingChanges.map((change) => change.field),
          ],
          conversationId: context?.conversationId ?? null,
          eventType: "preferences_changed",
          impactLevel: settingImpactLevel ?? "low",
          messageId: context?.userMessageId ?? null,
          source: "chat",
          summary: settingSummary,
          userId,
        });
      }

      const responseLanguage = getTalentToolResponseLanguage(context);
      return {
        assistantInstruction: [
          `Continue the conversation naturally in ${responseLanguage} now. Do not mention internal tool names, JSON, or internal field names.`,
          "If recommendation delivery settings changed, explain the practical consequence in the user's language: how often Harper will send opportunities, how many, and which opportunity channels will be included or avoided.",
          "Do not make the saved-setting acknowledgement the whole answer; continue naturally from the user's intent.",
        ].join(" "),
        impactLevel: settingImpactLevel ?? "low",
        ok: true,
        updatedSettingFields,
      };
    },
  },
  [TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE]: {
    name: TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
    description:
      "Update saved profile state with new information about the user. It can update the user's profile summary, current primary location/base, and row memos during onboarding and after onboarding. It can update future recommendation/search memory only after onboarding is already complete, and only for matching memory, not facts that belong in profile rows. Call when the user's latest statement directly maps to writable profile or future-matching memory, including explicit durable hard-filter search commands such as '미국 회사로만 찾아줘', '앞으로 리모트만 보내줘', '대기업은 빼고 찾아줘', or '다음부터 Series B 이상만 봐줘'. If the user discusses resume/CV context that matters for future matching, such as what their resume says, omits, emphasizes, or should signal, record that as future matching memory when it is not a direct resume-file/profile-row update. Do not call this tool for recommendation delivery settings such as cadence, batch size, external recommendations, or internal recommendations; use update_setting for those. Do not call for user questions, one-off browsing/curiosity/search requests, hypotheticals/conditional speech ('만약 ~라면'), assistant statements, aspirational/off-profile role mentions without explicit future intent, or information already saved in current state. After the tool result, produce a normal user-facing chat reply in Korean; do not return an empty assistant message or only an onboarding marker.",
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
          type: "object",
          description:
            "Per-row memo additions. Use ONLY when the user's declarative statement clearly maps to ONE specific row visible in the system prompt's [Structured Talent Profile] block. Provide newInfo (one short Korean fact, plain prose, no preamble like '저는'). NEVER invent rowIds or titles; use only those visible in the prompt's RowID lines (experiences/educations) or Title lines (extras). OMIT a table or entry entirely if the mention is ambiguous (multiple candidate rows), no row matches, or the statement is generic and not tied to a specific profile row.",
          properties: {
            experiences: {
              type: "array",
              description:
                "Memo additions for experience rows. Match a row by its RowID line in the prompt.",
              items: {
                type: "object",
                properties: {
                  rowId: {
                    type: "string",
                    description:
                      "Experience RowID from the profile listing. Must be a verbatim match.",
                  },
                  newInfo: {
                    type: "string",
                    description:
                      "Single short Korean fact to add to this row's memo.",
                  },
                },
                required: ["rowId", "newInfo"],
                additionalProperties: false,
              },
            },
            educations: {
              type: "array",
              description:
                "Memo additions for education rows. Match a row by its RowID line in the prompt.",
              items: {
                type: "object",
                properties: {
                  rowId: {
                    type: "string",
                    description:
                      "Education RowID from the profile listing. Must be a verbatim match.",
                  },
                  newInfo: { type: "string" },
                },
                required: ["rowId", "newInfo"],
                additionalProperties: false,
              },
            },
            extras: {
              type: "array",
              description:
                "Memo additions for extra profile items. Match an item by its exact Title from the profile listing. If two items share a title, omit the entry instead of guessing.",
              items: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description:
                      "Exact Title visible in the profile listing's Extras block.",
                  },
                  newInfo: { type: "string" },
                },
                required: ["title", "newInfo"],
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
        talentInsights: {
          type: "object",
          description:
            "Post-onboarding only. Durable future recommendation/search-memory updates from the user's latest statement, such as desired next role, search intensity, compensation, must-haves, deal-breakers, team style, company/domain preference, company size/stage preference, resume/CV positioning context, or corrections to prior matching preferences. Explicit hard-filter search commands are durable memory too: for example, '미국 회사로만 찾아줘' should update must_haves with a value like '앞으로 미국 기반 회사만 추천받고 싶어합니다.' when intended as a hard requirement. If the user talks about what their resume/CV contains, leaves out, emphasizes, or should communicate for matching, preserve that resume-related context here unless it belongs on one visible profile row. Do not use this for facts that belong on a specific experience, education, or extra row; use rowMemos instead. Do not use this for one-off curiosity/browsing/search requests or aspirational/off-profile role mentions unless the user explicitly says Harper should remember the new direction for future matching. Keys must be English snake_case. Values must be final integrated Korean complete sentences, not fragments. During onboarding, omit this entirely because insight extraction is handled separately.",
          properties: {
            content: {
              type: "object",
              description:
                "Partial future-matching memory patch. If the new information belongs to an existing/current insight or checklist axis, update that key with the final integrated value instead of creating a synonym key. Create a new descriptive English snake_case key when the information is genuinely distinct and does not fit existing keys. Do not create profile-row keys like representative_experience or recent_experience.",
              additionalProperties: {
                type: "string",
                description:
                  "Final integrated Korean complete sentence. Write '규모를 선호합니다.' rather than '규모 선호.'",
              },
            },
            changeSummary: {
              type: "string",
              description:
                "Short Korean summary of what changed and why it matters for future recommendations.",
            },
            impactLevel: {
              type: "string",
              enum: ["low", "medium", "high"],
              description:
                "Estimated impact on future recommendations. Use high only for core preference, hard constraint, or recommendation-changing updates; do not mark minor notes as high.",
            },
          },
          required: ["content"],
          additionalProperties: false,
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
      const rowMemosInput =
        input.rowMemos &&
        typeof input.rowMemos === "object" &&
        !Array.isArray(input.rowMemos)
          ? (input.rowMemos as Record<string, unknown>)
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
      if (rowMemosInput) {
        const experiencesEntries = Array.isArray(rowMemosInput.experiences)
          ? (rowMemosInput.experiences as unknown[])
          : [];
        for (const rawEntry of experiencesEntries) {
          if (!rawEntry || typeof rawEntry !== "object") continue;
          const entry = rawEntry as Record<string, unknown>;
          const rowId = optionalToolString(entry.rowId);
          const newInfo = optionalToolString(entry.newInfo);
          if (!rowId || !newInfo) continue;
          const outcome = await appendExperienceMemo({
            admin,
            userId,
            rowId,
            newInfo,
          });
          if (outcome.ok) {
            if (outcome.updated) {
              updatedRowMemos.experiences.push(rowId);
              if (outcome.target) {
                rowMemoActivityItems.push({
                  entityId: outcome.target.entityId,
                  entityLabel: outcome.target.entityLabel,
                  entityType: outcome.target.entityType,
                  newInfo,
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

        const educationsEntries = Array.isArray(rowMemosInput.educations)
          ? (rowMemosInput.educations as unknown[])
          : [];
        for (const rawEntry of educationsEntries) {
          if (!rawEntry || typeof rawEntry !== "object") continue;
          const entry = rawEntry as Record<string, unknown>;
          const rowId = optionalToolString(entry.rowId);
          const newInfo = optionalToolString(entry.newInfo);
          if (!rowId || !newInfo) continue;
          const outcome = await appendEducationMemo({
            admin,
            userId,
            rowId,
            newInfo,
          });
          if (outcome.ok) {
            if (outcome.updated) {
              updatedRowMemos.educations.push(rowId);
              if (outcome.target) {
                rowMemoActivityItems.push({
                  entityId: outcome.target.entityId,
                  entityLabel: outcome.target.entityLabel,
                  entityType: outcome.target.entityType,
                  newInfo,
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

        const extrasEntries = Array.isArray(rowMemosInput.extras)
          ? (rowMemosInput.extras as unknown[])
          : [];
        for (const rawEntry of extrasEntries) {
          if (!rawEntry || typeof rawEntry !== "object") continue;
          const entry = rawEntry as Record<string, unknown>;
          const title = optionalToolString(entry.title);
          const newInfo = optionalToolString(entry.newInfo);
          if (!title || !newInfo) continue;
          const outcome = await appendExtraMemo({
            admin,
            userId,
            title,
            newInfo,
          });
          if (outcome.ok) {
            if (outcome.updated) {
              updatedRowMemos.extras.push(title);
              if (outcome.target) {
                rowMemoActivityItems.push({
                  entityId: outcome.target.entityId,
                  entityLabel: outcome.target.entityLabel,
                  entityType: outcome.target.entityType,
                  newInfo,
                });
              }
            }
          } else {
            skippedRowMemos.push({
              table: "extras",
              key: title,
              reason: outcome.reason,
            });
          }
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

      const impactLevel = maxImpactLevel([
        talentUserActivityChanges.length > 0 ? "low" : null,
        rowMemoActivityItems.length > 0 ? "medium" : null,
        insightImpactLevel,
      ]);
      const responseLanguage = getTalentToolResponseLanguage(context);
      const replyInstructions = [
        `Continue the conversation naturally in ${responseLanguage} now. Do not mention internal tool names, JSON, or internal field names.`,
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
  description:
    "Specific user-facing Thinking log sentence in the current response language for this exact tool call. Say what is being changed, checked, searched, or prepared. If searching jobs, describe the kind of opportunities being searched for. If changing saved information, mention the concrete field/value being adjusted; old-to-new is optional only when it is naturally available. Do not use vague text like 'updating', 'checking', or 'searching' by itself. Do not mention internal tool names. Keep it under 160 characters.",
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
      withUiStatusMessageParameter(tool.parameters),
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
    const result = await tool.execute(args.input, args.context);
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
