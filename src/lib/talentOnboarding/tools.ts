import { runWebSearch } from "@/lib/tools/webSearch";
import { fetchTalentOpportunityHistory } from "@/lib/talentOpportunity";
import { runCareerJobPostingRecommendations } from "./jobPostingRecommendations";
import { lookupServiceHelp } from "@/lib/serviceHelpRag";
import { normalizeGeneratedTalentInsightEntry } from "./insights";
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
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
  normalizeTalentPreferredLocations,
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
  RECOMMEND_JOB_POSTINGS: "recommend_job_postings",
  READ_RECOMMENDED_OPPORTUNITIES: "read_recommended_opportunities",
  WEB_SEARCH: "web_search",
  RESEARCH_COMPANY: "research_company",
  LOOKUP_SERVICE_HELP: "lookup_service_help",
  GET_OPEN_ROLES: "get_open_roles",
  READ_TALENT_ACTIVITY_EVENTS: "read_talent_activity_events",
  UPDATE_TALENT_PROFILE: "update_talent_profile",
} as const;

export type TalentToolName =
  (typeof TALENT_TOOL_NAMES)[keyof typeof TALENT_TOOL_NAMES];

export const DEFAULT_ENABLED_TALENT_TOOL_NAMES = [
  TALENT_TOOL_NAMES.SELECT_ADDITIONAL_ONBOARDING_QUESTION,
  TALENT_TOOL_NAMES.WEB_SEARCH,
  TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS,
  TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES,
  TALENT_TOOL_NAMES.RESEARCH_COMPANY,
  TALENT_TOOL_NAMES.LOOKUP_SERVICE_HELP,
  TALENT_TOOL_NAMES.GET_OPEN_ROLES,
  TALENT_TOOL_NAMES.READ_TALENT_ACTIVITY_EVENTS,
  TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
] as const;

const optionalToolString = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
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
  "insight_updated",
  "onboarding_completed",
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
  return new Date(Date.now() - normalizedDays * 24 * 60 * 60 * 1000).toISOString();
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
          description:
            "Optional latest user message from the current turn.",
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
  [TALENT_TOOL_NAMES.LOOKUP_SERVICE_HELP]: {
    name: TALENT_TOOL_NAMES.LOOKUP_SERVICE_HELP,
    description:
      "Use when the user asks about Harper's UI buttons, panels, features, opportunity flows, or how to use the product (e.g., '우측 별 모양 버튼 뭐야?', '이 버튼 뭐하는 거야?', '내부 기회 연결 수락하면 어떻게 돼?', 'Open to matches가 뭐야?'). Searches the in-app help corpus and returns relevant help chunks with source attribution.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description:
            "The user's question about Harper UI/features, in their own words.",
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
          "lookup_service_help requires a non-empty question."
        );
      }
      return lookupServiceHelp(question);
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
      "Read the user's existing recommended opportunities so the assistant can answer questions about previously recommended companies, roles, links, reasons, and user feedback.",
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
          savedStage: item.savedStage,
          dismissedAt: item.dismissedAt,
          status: item.status,
          summary: item.description ?? item.companyDescription ?? null,
        })),
      };
    },
  },
  [TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE]: {
    name: TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
    description:
      "Update internal profile state with new information about the user. It can update talent_preferences and row memos during onboarding and after onboarding. It can update talent_insights only after onboarding is already complete, and only for future recommendation/search memory, not profile-row facts that belong in experiences, educations, or extras. Call when the user's latest statement directly maps to writable state, including explicit durable hard-filter search commands such as '미국 회사로만 찾아줘', '앞으로 리모트만 보내줘', '대기업은 빼고 찾아줘', or '다음부터 Series B 이상만 봐줘'. Do not call for user questions, one-off browsing/curiosity/search requests, hypotheticals/conditional speech ('만약 ~라면'), assistant statements, aspirational/off-profile role mentions without explicit future intent, or information already saved in current state. If a post-onboarding update is marked high-impact and actually changes recommendation-relevant state, Harper will automatically run a fresh job-posting recommendation search after this tool, so reserve high impact for material changes. After the tool result, produce a normal user-facing chat reply in Korean; do not return an empty assistant message or only an onboarding marker.",
    parameters: {
      type: "object",
      properties: {
        preferences: {
          type: "object",
          description:
            "Structured talent_preferences fields. Provide ONLY fields the user newly disclosed. Arrays are unioned with existing values server-side; numbers overwrite. The careerMoveIntent field is intentionally not part of this tool — never attempt to write it.",
          properties: {
            engagementTypes: {
              type: "array",
              description:
                "Engagement types to add (server unions with existing). Use only when the user clearly states the form of engagement they want.",
              items: {
                type: "string",
                enum: ["full_time", "fractional", "advisor"],
              },
            },
            preferredLocations: {
              type: "array",
              description:
                "Preferred location categories to add (server unions with existing). Use only when the user clearly states the work-location category.",
              items: {
                type: "string",
                enum: ["korea_based", "global_remote", "relocation"],
              },
            },
            periodicIntervalDays: {
              type: "integer",
              description:
                "How often (in days, 1-30) the user wants opportunity batches. Set only when user states a clear cadence.",
              minimum: 1,
              maximum: 30,
            },
            recommendationBatchSize: {
              type: "integer",
              description:
                "Number of opportunities per batch (1-10). Set only when user states a clear preferred batch size.",
              minimum: 1,
              maximum: 10,
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
            "Post-onboarding only. Durable future recommendation/search-memory updates from the user's latest statement, such as desired next role, search intensity, compensation, must-haves, deal-breakers, team style, company/domain preference, company size/stage preference, or corrections to prior recommendation preferences. Explicit hard-filter search commands are durable memory too: for example, '미국 회사로만 찾아줘' should update must_haves with a value like '앞으로 미국 기반 회사만 추천받고 싶어합니다.' when intended as a hard requirement. Do not use this for facts that belong on a specific experience, education, or extra row; use rowMemos instead. Do not use this for one-off curiosity/browsing/search requests or aspirational/off-profile role mentions unless the user explicitly says Harper should remember the new direction for future matching. Keys must be English snake_case. Values must be final integrated Korean complete sentences, not fragments. During onboarding, omit this entirely because insight extraction is handled separately.",
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

      // talent_preferences — server-side union for arrays, overwrite for numbers.
      // careerMoveIntent is intentionally NEVER passed so upsertTalentSetting
      // falls back to the existing value (avoids triggering opportunity discovery).
      if (preferencesInput) {
        const existingSetting = await loadExistingSetting();
        const updatePayload: Parameters<typeof upsertTalentSetting>[0] = {
          admin,
          userId,
          recommendationSettingsUpdatedBy: "conversation",
        };
        let didUpdate = false;

        if (Array.isArray(preferencesInput.engagementTypes)) {
          const merged = Array.from(
            new Set<string>([
              ...((existingSetting?.engagement_types ?? []) as string[]),
              ...(preferencesInput.engagementTypes as unknown[]).map((entry) =>
                String(entry ?? "").trim()
              ),
            ])
          ).filter((entry) => entry.length > 0);
          const nextEngagementTypes = normalizeTalentEngagementTypes(merged);
          updatePayload.engagementTypes = nextEngagementTypes;
          didUpdate = true;
          updatedPreferenceFields.push("engagementTypes");
          if (
            !isSameActivityValue(
              existingSetting?.engagement_types ?? [],
              nextEngagementTypes
            )
          ) {
            preferenceActivityChanges.push({
              field: "engagementTypes",
              from: normalizeTalentEngagementTypes(
                existingSetting?.engagement_types ?? []
              ),
              to: nextEngagementTypes,
            });
          }
        }
        if (Array.isArray(preferencesInput.preferredLocations)) {
          const merged = Array.from(
            new Set<string>([
              ...((existingSetting?.preferred_locations ?? []) as string[]),
              ...(preferencesInput.preferredLocations as unknown[]).map(
                (entry) => String(entry ?? "").trim()
              ),
            ])
          ).filter((entry) => entry.length > 0);
          const nextPreferredLocations =
            normalizeTalentPreferredLocations(merged);
          updatePayload.preferredLocations = nextPreferredLocations;
          didUpdate = true;
          updatedPreferenceFields.push("preferredLocations");
          if (
            !isSameActivityValue(
              existingSetting?.preferred_locations ?? [],
              nextPreferredLocations
            )
          ) {
            preferenceActivityChanges.push({
              field: "preferredLocations",
              from: normalizeTalentPreferredLocations(
                existingSetting?.preferred_locations ?? []
              ),
              to: nextPreferredLocations,
            });
          }
        }
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
              normalizeTalentInsightContent(existingInsights?.content ?? null) ??
              {};
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
        ? normalizeToolImpactLevel(talentInsightsInput?.impactLevel) ?? "high"
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
        preferenceImpactLevel,
        rowMemoActivityItems.length > 0 ? "medium" : null,
        insightImpactLevel,
      ]);
      const hasRecommendationChangingUpdate =
        preferenceChanges.length > 0 || talentInsightKeys.length > 0;
      const shouldRecommendJobPostings =
        impactLevel === "high" &&
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
  context?: TalentToolExecutionContext;
  input: Record<string, unknown>;
  logging?: boolean;
  name: string;
}) {
  const tool = TALENT_TOOL_REGISTRY[args.name];

  if (!tool) {
    throw new TalentToolError(`Unknown talent tool: ${args.name}`);
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
