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
  normalizeCompanySnapshotName,
  escapeLikePattern,
} from "@/lib/career/companySnapshot";
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
  buildInsightActivitySummary,
  buildPreferenceActivitySummary,
  buildRowMemoActivitySummary,
  compactActivityChanges,
  fetchTalentActivityEvents,
  getPreferenceActivityImpact,
  insertTalentActivityEvent,
  insertTalentOpportunityFeedbackActivityEvent,
  isSameActivityValue,
  toPreferenceActivityDisplayChanges,
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

export type TalentToolChannel = "chat" | "voice";

export type TalentToolExecutionContext = {
  admin?: unknown;
  conversationId?: string;
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
  UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK:
    "update_recommended_opportunity_feedback",
  WEB_SEARCH: "web_search",
  OPEN_URL: "open_url",
  RESEARCH_COMPANY: "research_company",
  LOOKUP_ANSWER_EXAMPLES: "lookup_answer_examples",
  GET_OPEN_ROLES: "get_open_roles",
  READ_TALENT_ACTIVITY_EVENTS: "read_talent_activity_events",
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
  TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
  TALENT_TOOL_NAMES.RESEARCH_COMPANY,
  TALENT_TOOL_NAMES.LOOKUP_ANSWER_EXAMPLES,
  TALENT_TOOL_NAMES.GET_OPEN_ROLES,
  TALENT_TOOL_NAMES.READ_TALENT_ACTIVITY_EVENTS,
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
      "Open a specific website URL and return its page markdown. Use when the user provides a URL or asks to read, inspect, summarize, or reason about a specific webpage. This first checks Harper's cached documents table by URL; on cache miss, it scrapes the URL with Firecrawl and saves the markdown to documents.",
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
            "Optional maximum markdown characters returned to the model. The full markdown is still saved in the documents cache.",
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
        throw new TalentToolError("open_url requires database context.");
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
      "Find, rerank, enrich, and save up to 5 current job postings from Harper's company_roles/company_workspace/company_db database for this user. Use when the user asks to find, recommend, or match new job postings, roles, positions, companies, or opportunities with specific requirements. Do not use first when the user's request includes a durable hard filter or future-matching command such as '~로만 찾아줘', '~만 보내줘', '앞으로 ~로 찾아줘', '다음부터 ~는 빼줘', or '~ 조건을 반영해줘'; call update_talent_profile first so the condition is saved, then let the fresh search run. Do not use immediately for clearly off-profile or aspirational role requests; first explain the mismatch and ask one clarifying question. If the user clarifies it is only curiosity/browsing, use this as a one-off exploratory search and do not update future matching memory.",
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
        conversationId,
        request,
        userId,
      });
    },
  },
  [TALENT_TOOL_NAMES.RECOMMEND_COMPANIES]: {
    name: TALENT_TOOL_NAMES.RECOMMEND_COMPANIES,
    description:
      "Find, rank, and save companies for the user's Career Watchlist. Use when the user asks for companies to follow, company recommendations, startup/company discovery, or watchlist suggestions independent of a specific role. The server only considers companies with at least one active company_roles row in the last 6 months and a connected company_db record with a LinkedIn URL.",
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
      "Use this tool when the user GENUINELY wants to learn about a specific company (asking about culture, funding, team, business model, hiring landscape, etc.). On cache hit, returns the saved snapshot instantly; on cache miss, runs real-time web research (5-15 second delay) and returns a synthesized answer with citations.\n\nDo NOT call when:\n- Company name appears in passing or anecdotally (e.g., '내 친구도 토스 다녔어')\n- Company name is part of a JD/role question (use get_open_roles instead)\n- User is just sharing their own experience at a company\n- User asks for an opinion comparing companies without asking for info ('A vs B 어디가 좋을까')\n\nFresh research takes 5-15 seconds — only invoke when the user clearly wants the depth.",
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
      "Use when the current prompt and conversation context are not enough to answer well. Retrieves ops-managed example user messages and answer examples.",
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
  [TALENT_TOOL_NAMES.GET_OPEN_ROLES]: {
    name: TALENT_TOOL_NAMES.GET_OPEN_ROLES,
    description:
      "Use when the user asks about job postings, positions, or roles. Returns recommended roles when no company is specified, or roles matching a given company name. Each role includes an `is_recommended` flag.",
    parameters: {
      type: "object",
      properties: {
        company_name: {
          type: "string",
          description:
            "Optional company name. If provided, returns roles for that company (recommended or not). If omitted, returns only roles already recommended to this user.",
        },
        role_filter: {
          type: "object",
          description: "Optional filters applied on top of the company filter.",
          properties: {
            role_name: {
              type: "string",
              description:
                "Substring to match against the role name (e.g., '백엔드').",
            },
            type: {
              type: "string",
              description: "Employment type (e.g., 'full_time').",
            },
            seniority: {
              type: "string",
              description:
                "Seniority filter exact-match (e.g., 'senior', 'mid').",
            },
            work_mode: {
              type: "string",
              description: "Work mode filter (e.g., 'remote', 'hybrid').",
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError("get_open_roles requires user context.");
      }
      return runGetOpenRoles({
        admin: admin as any,
        userId,
        companyName: optionalToolString(input.company_name),
        roleFilter: normalizeRoleFilter(input.role_filter),
      });
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
          eventType: event.event_type,
          impactLevel: event.impact_level,
          occurredAt: event.occurred_at,
          source: event.source,
          summary: event.summary,
        })),
      };
    },
  },
  [TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES]: {
    name: TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES,
    description:
      "Read the user's existing recommended opportunities so the assistant can answer questions about previously recommended companies, roles, links, reasons, user feedback, and internal process stages.",
    parameters: {
      type: "object",
      properties: {
        companyName: {
          type: "string",
          description:
            "Optional company name filter when the user asks about one company.",
        },
        includeDismissed: {
          type: "boolean",
          description:
            "Whether to include opportunities the user already dismissed.",
          default: false,
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

      const companyName = optionalToolString(input.companyName);
      const includeDismissed = input.includeDismissed === true;
      const limit = normalizeToolLimit(input.limit, 8);
      const companyFilter = companyName?.toLocaleLowerCase("ko-KR") ?? null;
      const opportunities = await fetchTalentOpportunityHistory({
        admin: admin as any,
        userId,
      });
      const filtered = opportunities.filter((item) => {
        if (
          !includeDismissed &&
          (item.dismissedAt || item.feedback === "negative")
        ) {
          return false;
        }
        if (companyFilter) {
          return item.companyName
            .toLocaleLowerCase("ko-KR")
            .includes(companyFilter);
        }
        return true;
      });

      return {
        filters: {
          companyName,
          includeDismissed,
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
          href: item.href,
          externalJdUrl: item.externalJdUrl,
          companyHomepageUrl: item.companyHomepageUrl,
          companyLinkedinUrl: item.companyLinkedinUrl,
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
  [TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE]: {
    name: TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
    description:
      "Update internal profile state with new information about the user. It can update talent_users.bio, talent_preferences, and row memos during onboarding and after onboarding. It can update talent_insights only after onboarding is already complete, and only for future recommendation/search memory, not profile-row facts that belong in experiences, educations, or extras. Call when the user's latest statement directly maps to writable state, including explicit durable hard-filter search commands such as '미국 회사로만 찾아줘', '앞으로 리모트만 보내줘', '대기업은 빼고 찾아줘', or '다음부터 Series B 이상만 봐줘'. If the user discusses resume/CV context that matters for future matching, such as what their resume says, omits, emphasizes, or should signal, record that as talentInsights content when it is not a direct resume-file/profile-row update. For recommendation cadence, normal periodicIntervalDays values are 2-7. If the user says to stop recommendations entirely, set preferences.periodicIntervalDays=-1 and preferences.recommendationBatchSize=-1. If the user wants only internal Harper-connected recommendations, set preferences.periodicIntervalDays=-1 and preferences.recommendationBatchSize=1. Do not call for user questions, one-off browsing/curiosity/search requests, hypotheticals/conditional speech ('만약 ~라면'), assistant statements, aspirational/off-profile role mentions without explicit future intent, or information already saved in current state. If a post-onboarding update is marked high-impact and actually changes recommendation-relevant state, Harper will automatically run a fresh job-posting recommendation search after this tool, so reserve high impact for material changes. After the tool result, produce a normal user-facing chat reply in Korean; do not return an empty assistant message or only an onboarding marker.",
    parameters: {
      type: "object",
      properties: {
        talentUser: {
          type: "object",
          description:
            "Profile-level talent_users fields. Currently supports bio only. Use when the user explicitly provides or corrects their profile summary/about text. Do not invent a bio from assistant-only summaries; write the user's intended updated summary.",
          properties: {
            bio: {
              anyOf: [{ type: "string" }, { type: "null" }],
              description:
                "New talent_users.bio profile summary. Use null or an empty string only when the user explicitly asks to clear/remove the summary. Server trims and caps at 8000 chars.",
            },
          },
          additionalProperties: false,
        },
        preferences: {
          type: "object",
          description:
            "Structured talent_preferences fields. Provide ONLY fields the user newly disclosed. Only numeric recommendation cadence fields are writable here. Special paired values: stop all recommendations = periodicIntervalDays -1 and recommendationBatchSize -1; internal-only recommendations = periodicIntervalDays -1 and recommendationBatchSize 1.",
          properties: {
            periodicIntervalDays: {
              anyOf: [
                { type: "integer", enum: [-1] },
                { type: "integer", minimum: 2, maximum: 7 },
              ],
              description:
                "How often (in days) the user wants opportunity batches. Normal values must be 2-7. Use -1 only as part of the special stop-all or internal-only paired values.",
            },
            recommendationBatchSize: {
              anyOf: [
                { type: "integer", enum: [-1] },
                { type: "integer", minimum: 1, maximum: 10 },
              ],
              description:
                "Number of opportunities per batch (1-10). Use -1 only with periodicIntervalDays -1 when the user wants to stop recommendations entirely; use 1 with periodicIntervalDays -1 when the user wants only internal Harper-connected recommendations.",
            },
          },
          additionalProperties: false,
        },
        rowMemos: {
          type: "object",
          description:
            "Per-row memo additions. Use ONLY when the user's declarative statement clearly maps to ONE specific row visible in the system prompt's [Structured Talent Profile] block. Provide newInfo (one short Korean fact, plain prose, no preamble like '저는') — the server appends it to the existing memo automatically. NEVER invent rowIds or titles; use only those visible in the prompt's RowID lines (experiences/educations) or Title lines (extras). OMIT a table or entry entirely if the mention is ambiguous (multiple candidate rows), no row matches, or the statement is generic and not tied to a specific profile row.",
          properties: {
            experiences: {
              type: "array",
              description:
                "Memo additions for talent_experiences rows. Match a row by its RowID line in the prompt.",
              items: {
                type: "object",
                properties: {
                  rowId: {
                    type: "string",
                    description:
                      "talent_experiences.id from the profile listing's RowID line. Must be a verbatim match.",
                  },
                  newInfo: {
                    type: "string",
                    description:
                      "Single short Korean fact to add to this row's memo. The server will append it to the existing memo and cap at 2000 chars.",
                  },
                },
                required: ["rowId", "newInfo"],
                additionalProperties: false,
              },
            },
            educations: {
              type: "array",
              description:
                "Memo additions for talent_educations rows. Match a row by its RowID line in the prompt.",
              items: {
                type: "object",
                properties: {
                  rowId: {
                    type: "string",
                    description:
                      "talent_educations.id from the profile listing's RowID line. Must be a verbatim match.",
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
                "Memo additions for talent_extras items. Match an item by its exact Title from the profile listing (case-insensitive trim match server-side). If two items share a title, the server skips silently.",
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
            "Post-onboarding only. Durable future recommendation/search-memory updates from the user's latest statement, such as desired next role, search intensity, compensation, must-haves, deal-breakers, team style, company/domain preference, company size/stage preference, resume/CV positioning context, or corrections to prior recommendation preferences. Explicit hard-filter search commands are durable memory too: for example, '미국 회사로만 찾아줘' should update must_haves with a value like '앞으로 미국 기반 회사만 추천받고 싶어합니다.' when intended as a hard requirement. If the user talks about what their resume/CV contains, leaves out, emphasizes, or should communicate for matching, preserve that resume-related context here unless it belongs on one visible profile row. Do not use this for facts that belong on a specific experience, education, or extra row; use rowMemos instead. Do not use this for one-off curiosity/browsing/search requests or aspirational/off-profile role mentions unless the user explicitly says Harper should remember the new direction for future matching. Keys must be English snake_case. Values must be final integrated Korean complete sentences, not fragments. During onboarding, omit this entirely because insight extraction is handled separately.",
          properties: {
            content: {
              type: "object",
              description:
                "Partial talent_insights.content patch. If the new information belongs to an existing/current insight or checklist axis, update that key with the final integrated value instead of creating a synonym key. Examples: next_scope for target role, deal_breakers for deal-breakers, must_haves for must-have conditions, team_style_fit for team style, compensation for compensation floor, location for location preference. Create a new descriptive English snake_case key when the information is genuinely distinct and does not fit existing keys. Do not create profile-row keys like representative_experience or recent_experience.",
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
                "Estimated impact on future recommendations. Use high only for core preference, hard constraint, or recommendation-changing updates. After onboarding is complete, high-impact changes automatically trigger a fresh job-posting recommendation search, so do not mark minor notes as high.",
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
      const preferencesInput =
        input.preferences &&
        typeof input.preferences === "object" &&
        !Array.isArray(input.preferences)
          ? (input.preferences as Record<string, unknown>)
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
      const updatedPreferenceFields: string[] = [];
      const updatedRowMemos: {
        experiences: string[];
        educations: string[];
        extras: string[];
      } = { experiences: [], educations: [], extras: [] };
      const updatedTalentInsights: Record<
        string,
        { from: string | null; to: string }
      > = {};
      const preferenceActivityChanges: TalentActivityChange[] = [];
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
      if (
        talentUserInput &&
        Object.prototype.hasOwnProperty.call(talentUserInput, "bio")
      ) {
        const nextBio = normalizeToolBio(talentUserInput.bio);
        if (nextBio !== undefined) {
          const { data: currentUser, error: currentUserError } = await admin
            .from("talent_users")
            .select("bio")
            .eq("user_id", userId)
            .maybeSingle();
          if (currentUserError) {
            throw new TalentToolError(
              currentUserError.message ?? "Failed to read talent_users."
            );
          }

          const previousBio = normalizeToolBio(currentUser?.bio) ?? null;
          if (previousBio !== nextBio) {
            const { error: talentUserUpdateError } = await admin
              .from("talent_users")
              .update({
                bio: nextBio,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
            if (talentUserUpdateError) {
              throw new TalentToolError(
                talentUserUpdateError.message ??
                  "Failed to update talent_users."
              );
            }

            updatedTalentUserFields.push("bio");
            talentUserActivityChanges.push({
              field: "bio",
              from: previousBio,
              to: nextBio,
            });
          }
        }
      }

      // talent_preferences — overwrite numeric recommendation settings only.
      // Hidden talent_setting fields are intentionally NEVER passed so
      // upsertTalentSetting falls back to existing values.
      if (preferencesInput) {
        const existingSetting = await loadExistingSetting();
        const updatePayload: Parameters<typeof upsertTalentSetting>[0] = {
          admin,
          userId,
          recommendationSettingsUpdatedBy: "conversation",
        };
        let didUpdate = false;

        if (
          typeof preferencesInput.periodicIntervalDays === "number" &&
          Number.isFinite(preferencesInput.periodicIntervalDays)
        ) {
          const nextPeriodicIntervalDays =
            preferencesInput.periodicIntervalDays;
          updatePayload.periodicIntervalDays = nextPeriodicIntervalDays;
          didUpdate = true;
          updatedPreferenceFields.push("periodicIntervalDays");
          if (
            !isSameActivityValue(
              existingSetting?.periodic_interval_days ?? null,
              nextPeriodicIntervalDays
            )
          ) {
            preferenceActivityChanges.push({
              field: "periodicIntervalDays",
              from: existingSetting?.periodic_interval_days ?? null,
              to: nextPeriodicIntervalDays,
            });
          }
        }
        if (
          typeof preferencesInput.recommendationBatchSize === "number" &&
          Number.isFinite(preferencesInput.recommendationBatchSize)
        ) {
          const nextRecommendationBatchSize =
            preferencesInput.recommendationBatchSize;
          updatePayload.recommendationBatchSize = nextRecommendationBatchSize;
          didUpdate = true;
          updatedPreferenceFields.push("recommendationBatchSize");
          if (
            !isSameActivityValue(
              existingSetting?.recommendation_batch_size ?? null,
              nextRecommendationBatchSize
            )
          ) {
            preferenceActivityChanges.push({
              field: "recommendationBatchSize",
              from: existingSetting?.recommendation_batch_size ?? null,
              to: nextRecommendationBatchSize,
            });
          }
        }

        if (didUpdate) {
          await upsertTalentSetting(updatePayload);
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
          ? talentUserActivityChanges.some((change) => change.to)
            ? "Profile summary updated."
            : "Profile summary cleared."
          : null;
      if (talentUserSummary) {
        await insertTalentActivityEvent({
          admin,
          changedDomains: ["profile", "bio"],
          conversationId: context?.conversationId ?? null,
          eventType: "profile_updated",
          impactLevel: "low",
          messageId: context?.userMessageId ?? null,
          metadata: {
            changes: talentUserActivityChanges,
          },
          relatedEntityType: "talent_users",
          source: "chat",
          summary: talentUserSummary,
          userId,
        });
      }

      const preferenceChanges = compactActivityChanges(
        preferenceActivityChanges
      );
      const preferenceSummary =
        buildPreferenceActivitySummary(preferenceChanges);
      const preferenceImpactLevel =
        preferenceChanges.length > 0
          ? getPreferenceActivityImpact(preferenceChanges)
          : null;
      if (preferenceSummary) {
        await insertTalentActivityEvent({
          admin,
          changedDomains: [
            "preferences",
            ...preferenceChanges.map((change) => change.field),
          ],
          conversationId: context?.conversationId ?? null,
          eventType: "preferences_changed",
          impactLevel: preferenceImpactLevel ?? "low",
          messageId: context?.userMessageId ?? null,
          metadata: {
            changes: toPreferenceActivityDisplayChanges(preferenceChanges),
          },
          relatedEntityType: "talent_setting",
          source: "chat",
          summary: preferenceSummary,
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
          metadata: { items: rowMemoActivityItems },
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
          metadata: {
            changeSummary: insightChangeSummary,
            changes: updatedTalentInsights,
          },
          relatedEntityType: "talent_insights",
          source: "chat",
          summary: insightChangeSummary
            ? `${insightSummary} Change summary: ${insightChangeSummary}`
            : insightSummary,
          userId,
        });
      }

      const impactLevel = maxImpactLevel([
        talentUserActivityChanges.length > 0 ? "low" : null,
        preferenceImpactLevel,
        rowMemoActivityItems.length > 0 ? "medium" : null,
        insightImpactLevel,
      ]);
      const hasRecommendationChangingUpdate =
        preferenceChanges.length > 0 || talentInsightKeys.length > 0;
      const shouldRecommendJobPostings =
        // impactLevel === "high" &&
        hasRecommendationChangingUpdate &&
        Boolean((await loadExistingSetting())?.is_onboarding_done);
      const recommendationTrigger = shouldRecommendJobPostings
        ? {
            changeSummary:
              insightChangeSummary ??
              preferenceSummary ??
              insightSummary ??
              "사용자의 추천 조건에 큰 변경이 생겼습니다.",
            changedPreferenceFields: preferenceChanges.map(
              (change) => change.field
            ),
            updatedTalentInsightKeys: talentInsightKeys,
          }
        : null;

      const result = {
        assistantInstruction: shouldRecommendJobPostings
          ? "This profile update is high-impact and onboarding is complete. A fresh job-posting recommendation search should be run immediately before the final Korean reply."
          : "Continue the conversation naturally in Korean now. If onboarding is still active, ask the next relevant short question or close naturally with the required marker when appropriate. Do not return an empty assistant message.",
        impactLevel,
        ok: true,
        recommendationTrigger,
        shouldRecommendJobPostings,
        updatedTalentUserFields,
        updatedPreferenceFields,
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
    "Specific English user-facing Thinking log sentence for this exact tool call. Say what is being changed, checked, searched, or prepared. If searching jobs, describe the kind of opportunities being searched for. If changing saved information, mention the concrete field/value being adjusted; old-to-new is optional only when it is naturally available. Do not use vague text like 'updating', 'checking', or 'searching' by itself. Do not mention internal tool names. Keep it under 160 characters.",
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

export function getOpenAIChatTools(channel: TalentToolChannel) {
  return getEnabledTalentTools(channel).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: withUiStatusMessageParameter(tool.parameters),
    },
  }));
}

export function getStopAfterTalentToolNames(channel: TalentToolChannel) {
  return getEnabledTalentTools(channel)
    .filter((tool) => tool.stopAfterExecution)
    .map((tool) => tool.name);
}

export function getRealtimeTools(channel: TalentToolChannel) {
  return getEnabledTalentTools(channel).map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: withUiStatusMessageParameter(tool.parameters),
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

// ---------------------------------------------------------------------------
// get_open_roles helpers
// ---------------------------------------------------------------------------

type GetOpenRolesRoleFilter = {
  role_name?: string | null;
  type?: string | null;
  seniority?: string | null;
  work_mode?: string | null;
};

function normalizeRoleFilter(value: unknown): GetOpenRolesRoleFilter {
  if (!value || typeof value !== "object") return {};
  const filter = value as Record<string, unknown>;
  return {
    role_name: optionalToolString(filter.role_name),
    type: optionalToolString(filter.type),
    seniority: optionalToolString(filter.seniority),
    work_mode: optionalToolString(filter.work_mode),
  };
}

type OpenRoleRow = {
  role_id: string;
  name: string;
  description_summary: string | null;
  location_text: string | null;
  work_mode: string | null;
  salary_range: string | null;
  posted_at: string | null;
  external_jd_url: string | null;
  is_expired: boolean;
  type: string[] | null;
  seniority_level: string | null;
  company_workspace_id: string;
  company_workspace: {
    company_workspace_id: string;
    company_db_id: number | null;
    company_name: string | null;
    company_db: { id: number; name: string | null } | null;
  } | null;
  talent_opportunity_recommendation: Array<{
    id: string;
    talent_id: string;
    dismissed_at: string | null;
  }>;
};

async function runGetOpenRoles(args: {
  admin: any;
  userId: string;
  companyName: string | null;
  roleFilter: GetOpenRolesRoleFilter;
}) {
  const { admin, userId, companyName, roleFilter } = args;

  let rows: OpenRoleRow[];

  if (!companyName) {
    // No-company path: start FROM talent_opportunity_recommendation so we
    // never miss recommendations that fall outside the top-N company_roles
    // rows. This prevents silently dropping recommendations past position 60.
    let recQuery = admin
      .from("talent_opportunity_recommendation")
      .select(
        `id,
         talent_id,
         dismissed_at,
         company_roles!inner(
           role_id,
           name,
           description_summary,
           location_text,
           work_mode,
           salary_range,
           posted_at,
           external_jd_url,
           is_expired,
           type,
           seniority_level,
           company_workspace_id,
           company_workspace:company_workspace_id (
             company_workspace_id,
             company_db_id,
             company_name,
             company_db:company_db_id (id, name)
           )
         )`
      )
      .eq("talent_id", userId)
      .is("dismissed_at", null)
      .eq("company_roles.is_expired", false)
      .order("recommended_at", { ascending: false, nullsFirst: false })
      .limit(20);

    if (roleFilter.role_name) {
      recQuery = recQuery.ilike(
        "company_roles.name",
        `%${escapeLikePattern(roleFilter.role_name)}%`
      );
    }
    if (roleFilter.seniority) {
      recQuery = recQuery.eq(
        "company_roles.seniority_level",
        roleFilter.seniority
      );
    }
    if (roleFilter.work_mode) {
      recQuery = recQuery.eq("company_roles.work_mode", roleFilter.work_mode);
    }
    if (roleFilter.type) {
      recQuery = recQuery.contains("company_roles.type", [roleFilter.type]);
    }

    const { data: recData, error: recError } = (await recQuery) as {
      data: Array<{
        id: string;
        talent_id: string;
        dismissed_at: string | null;
        company_roles: OpenRoleRow;
      }> | null;
      error: { message?: string } | null;
    };

    if (recError) {
      throw new TalentToolError(
        recError.message ?? "Failed to read talent_opportunity_recommendation."
      );
    }

    // Reshape to match OpenRoleRow shape (embed the rec row back in).
    rows = (recData ?? []).map((rec) => ({
      ...rec.company_roles,
      talent_opportunity_recommendation: [
        {
          id: rec.id,
          talent_id: rec.talent_id,
          dismissed_at: rec.dismissed_at,
        },
      ],
    }));
  } else {
    // With-company path: query company_roles with embedded recommendation.
    // Company filter narrows scope enough that limit 60 is safe.
    let query = admin
      .from("company_roles")
      .select(
        `role_id,
         name,
         description_summary,
         location_text,
         work_mode,
         salary_range,
         posted_at,
         external_jd_url,
         is_expired,
         type,
         seniority_level,
         company_workspace_id,
         company_workspace:company_workspace_id (
           company_workspace_id,
           company_db_id,
           company_name,
           company_db:company_db_id (id, name)
         ),
         talent_opportunity_recommendation:talent_opportunity_recommendation!role_id (
           id,
           talent_id,
           dismissed_at
         )`
      )
      .eq("is_expired", false)
      .eq("talent_opportunity_recommendation.talent_id", userId)
      .is("talent_opportunity_recommendation.dismissed_at", null)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(60);

    if (roleFilter.role_name) {
      query = query.ilike(
        "name",
        `%${escapeLikePattern(roleFilter.role_name)}%`
      );
    }
    if (roleFilter.seniority) {
      query = query.eq("seniority_level", roleFilter.seniority);
    }
    if (roleFilter.work_mode) {
      query = query.eq("work_mode", roleFilter.work_mode);
    }
    if (roleFilter.type) {
      query = query.contains("type", [roleFilter.type]);
    }

    const { data, error } = (await query) as {
      data: OpenRoleRow[] | null;
      error: { message?: string } | null;
    };

    if (error) {
      throw new TalentToolError(
        error.message ?? "Failed to read company_roles."
      );
    }

    rows = (data ?? []) as OpenRoleRow[];
  }

  const normalizedTarget = companyName
    ? normalizeCompanySnapshotName(companyName)
    : null;

  const filtered = companyName
    ? rows.filter((row) => {
        const dbName = row.company_workspace?.company_db?.name ?? null;
        const wsName = row.company_workspace?.company_name ?? null;
        const candidateNames = [dbName, wsName].filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0
        );

        return candidateNames.some((name) => {
          if (
            name
              .toLocaleLowerCase("ko-KR")
              .includes(companyName.toLocaleLowerCase("ko-KR"))
          ) {
            return true;
          }
          if (
            normalizedTarget &&
            normalizeCompanySnapshotName(name) === normalizedTarget
          ) {
            return true;
          }
          return false;
        });
      })
    : rows; // No-company path: all rows already come pre-filtered from the DB.

  // Sort: recommended first, then by posted_at desc (nulls last).
  filtered.sort((a, b) => {
    const aRec = (a.talent_opportunity_recommendation ?? []).some(
      (entry) => entry.talent_id === userId && !entry.dismissed_at
    );
    const bRec = (b.talent_opportunity_recommendation ?? []).some(
      (entry) => entry.talent_id === userId && !entry.dismissed_at
    );
    if (aRec !== bRec) return aRec ? -1 : 1;
    const aPosted = a.posted_at ?? "";
    const bPosted = b.posted_at ?? "";
    if (!aPosted && !bPosted) return 0;
    if (!aPosted) return 1;
    if (!bPosted) return -1;
    return aPosted < bPosted ? 1 : aPosted > bPosted ? -1 : 0;
  });

  const limited = filtered.slice(0, 20);

  const roles = limited.map((row) => {
    const isRecommended = (row.talent_opportunity_recommendation ?? []).some(
      (entry) => entry.talent_id === userId && !entry.dismissed_at
    );
    const companyDbName = row.company_workspace?.company_db?.name ?? null;
    const workspaceCompanyName = row.company_workspace?.company_name ?? null;
    return {
      role_id: row.role_id,
      role_name: row.name,
      description_summary: row.description_summary,
      location_text: row.location_text,
      work_mode: row.work_mode,
      salary_range: row.salary_range,
      posted_at: row.posted_at,
      external_jd_url: row.external_jd_url,
      type: row.type,
      seniority_level: row.seniority_level,
      company_name: companyDbName ?? workspaceCompanyName,
      company_workspace_id: row.company_workspace_id,
      is_recommended: isRecommended,
    };
  });

  return {
    roles,
    total: roles.length,
  };
}
