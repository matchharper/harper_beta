import { runWebSearch } from "@/lib/tools/webSearch";
import { fetchTalentOpportunityHistory } from "@/lib/talentOpportunity";
import { runCareerJobPostingRecommendations } from "./jobPostingRecommendations";
import { lookupServiceHelp } from "@/lib/serviceHelpRag";
import { normalizeCompanySnapshotName, escapeLikePattern } from "@/lib/career/companySnapshot";
import { INSIGHT_CHECKLIST } from "./insightChecklist";
import {
  appendEducationMemo,
  appendExperienceMemo,
  appendExtraMemo,
} from "./profileStore";
import {
  fetchTalentInsights,
  fetchTalentSetting,
  normalizeTalentEngagementTypes,
  normalizeTalentPreferredLocations,
  upsertTalentInsights,
  upsertTalentSetting,
} from "./server";

export type TalentToolChannel = "chat" | "voice";

export type TalentToolExecutionContext = {
  admin?: unknown;
  conversationId?: string;
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
  RECOMMEND_JOB_POSTINGS: "recommend_job_postings",
  PREPARE_COMPANY_SNAPSHOT: "prepare_company_snapshot",
  READ_RECOMMENDED_OPPORTUNITIES: "read_recommended_opportunities",
  WEB_SEARCH: "web_search",
  RESEARCH_COMPANY: "research_company",
  LOOKUP_SERVICE_HELP: "lookup_service_help",
  GET_RECOMMENDED_JD: "get_recommended_jd",
  ADD_TO_RECOMMENDATIONS: "add_to_recommendations",
  UPDATE_TALENT_PROFILE: "update_talent_profile",
} as const;

export type TalentToolName =
  (typeof TALENT_TOOL_NAMES)[keyof typeof TALENT_TOOL_NAMES];

export const DEFAULT_ENABLED_TALENT_TOOL_NAMES = [
  TALENT_TOOL_NAMES.WEB_SEARCH,
  TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS,
  TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES,
  TALENT_TOOL_NAMES.RESEARCH_COMPANY,
  TALENT_TOOL_NAMES.LOOKUP_SERVICE_HELP,
  TALENT_TOOL_NAMES.GET_RECOMMENDED_JD,
  TALENT_TOOL_NAMES.ADD_TO_RECOMMENDATIONS,
  TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
] as const;

const optionalToolString = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

const normalizeToolLimit = (value: unknown, fallback: number) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
};

const TALENT_TOOL_REGISTRY: Record<string, TalentToolDefinition> = {
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
      "Find and rerank current job postings from Harper's company_roles/company_workspace/company_db database for this user. Use when the user asks to find, recommend, or match new job postings, roles, positions, companies, or opportunities with specific requirements.",
    parameters: {
      type: "object",
      properties: {
        request: {
          type: "string",
          description:
            "The user's full job-search request, including role, domain, location, work mode, company type, seniority, and any constraints they mentioned.",
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
  [TALENT_TOOL_NAMES.PREPARE_COMPANY_SNAPSHOT]: {
    name: TALENT_TOOL_NAMES.PREPARE_COMPANY_SNAPSHOT,
    description:
      "Prepare the company snapshot setup UI when the user clearly wants company research or confirms they want help checking whether a company is good. This does not run the research; it only creates a setup card with a start button.",
    parameters: {
      type: "object",
      properties: {
        companyName: {
          type: "string",
          description:
            "Company name to investigate. Ask a follow-up instead of calling this tool if the company is unknown.",
        },
        reason: {
          type: "string",
          description:
            "Short reason from the user's request, such as concerns about culture, stability, funding, layoffs, or interview preparation.",
        },
      },
      required: ["companyName"],
      additionalProperties: false,
    },
    channels: ["chat"],
    stopAfterExecution: true,
  },
  [TALENT_TOOL_NAMES.RESEARCH_COMPANY]: {
    name: TALENT_TOOL_NAMES.RESEARCH_COMPANY,
    description:
      "Use this tool when the user GENUINELY wants to learn about a specific company (asking about culture, funding, team, business model, hiring landscape, etc.). On cache hit, returns the saved snapshot instantly; on cache miss, runs real-time web research (5-15 second delay) and returns a synthesized answer with citations.\n\nDo NOT call when:\n- Company name appears in passing or anecdotally (e.g., '내 친구도 토스 다녔어')\n- Company name is part of a JD/role question (use get_recommended_jd instead)\n- User is just sharing their own experience at a company\n- User asks for an opinion comparing companies without asking for info ('A vs B 어디가 좋을까')\n\nFresh research takes 5-15 seconds — only invoke when the user clearly wants the depth.",
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
      "Use when the user asks about Harper's UI buttons, panels, features, or how to use the product (e.g., '우측 별 모양 버튼 뭐야?', '이 버튼 뭐하는 거야?'). Searches the in-app help corpus and returns relevant help chunks with source attribution.",
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
  [TALENT_TOOL_NAMES.GET_RECOMMENDED_JD]: {
    name: TALENT_TOOL_NAMES.GET_RECOMMENDED_JD,
    description:
      "Use when the user asks about job postings, positions, or roles. Returns recommended roles when no company is specified, or roles matching a given company name. Each role includes an `is_recommended` flag so the assistant can naturally offer to add non-recommended roles.",
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
          description:
            "Optional filters applied on top of the company filter.",
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
        throw new TalentToolError(
          "get_recommended_jd requires user context."
        );
      }
      return runGetRecommendedJd({
        admin: admin as any,
        userId,
        companyName: optionalToolString(input.company_name),
        roleFilter: normalizeRoleFilter(input.role_filter),
      });
    },
  },
  [TALENT_TOOL_NAMES.ADD_TO_RECOMMENDATIONS]: {
    name: TALENT_TOOL_NAMES.ADD_TO_RECOMMENDATIONS,
    description:
      "Use ONLY when the user explicitly confirms in chat to add a specific role to their recommendations (e.g., '응 추가해줘', '맞아', '그거 넣어줘'). Do NOT use on weak signals like '관심 있어' alone — ask for confirmation first.",
    parameters: {
      type: "object",
      properties: {
        role_id: {
          type: "string",
          description:
            "The role_id from a prior get_recommended_jd result that the user confirmed adding.",
        },
      },
      required: ["role_id"],
      additionalProperties: false,
    },
    channels: ["chat"],
    async execute(input, context) {
      const admin = context?.admin;
      const userId = context?.userId;
      if (!admin || !userId) {
        throw new TalentToolError(
          "add_to_recommendations requires user context."
        );
      }
      const roleId = optionalToolString(input.role_id);
      if (!roleId) {
        throw new TalentToolError(
          "add_to_recommendations requires role_id."
        );
      }
      return runAddToRecommendations({ admin: admin as any, userId, roleId });
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
      "Silently merge new information about the user into talent_insights, talent_preferences, and per-row memos on talent_experiences/educations/extras. Call when the user makes a declarative statement about themselves (e.g., '저는 서울이 좋아요'), OR provides a short answer to your immediately preceding question (e.g., assistant: '이직 생각 있으세요?' → user: '네, 6개월 내'). Do NOT call for: user questions, hypotheticals/conditional speech ('만약 ~라면'), assistant statements, or info already saved in current insights/preferences/memos (shown in system prompt). For per-row memos use the rowMemos field — only when the user's statement clearly maps to ONE specific row visible in the profile listing (matched by RowID for experiences/educations or by exact Title for extras); OMIT entirely if the mention is ambiguous. NEVER tell the user that you called this tool — silent auto-write only. The chat reply must not include phrases like 'OO에 추가했어요', 'I noted that.', or any reference to memo updates.",
    parameters: {
      type: "object",
      properties: {
        insights: {
          type: "object",
          description:
            "Free-text talent_insights values to merge. For each key you include, provide the FULL merged Korean text (existing value + new info, integrated). Existing values are visible in the system prompt under '이미 알고 있는 정보'. Omit keys that have no update. Each value overwrites the entire key on save.",
          properties: {
            search_intensity: {
              type: "string",
              description:
                "이직 적극도. How actively the user is exploring a move (e.g., '아직 둘러보는 정도', '6개월 내 이직 희망', '바로 이직 의향').",
            },
            signature_story: {
              type: "string",
              description:
                "대표 경험 하나. The one career achievement, project, or experience the user most wants to discuss in detail.",
            },
            location: {
              type: "string",
              description:
                "선호 근무 지역. Preferred work location/region. Note whether the user is open to overseas/remote.",
            },
            next_scope: {
              type: "string",
              description:
                "다음 역할. The role the user wants next (IC, team manager, C-level, open).",
            },
            compensation: {
              type: "string",
              description:
                "기대 보상 조건. Minimum acceptable compensation or 'this much would make sense' expectation.",
            },
            must_haves: {
              type: "string",
              description:
                "꼭 있어야 하는 조건. Non-negotiable must-haves for the next opportunity (team quality, resources, impact, comp, visa, remote, etc).",
            },
            deal_breakers: {
              type: "string",
              description:
                "피하고 싶은 조건. Clear deal-breakers that would make the user reject an opportunity.",
            },
            team_style_fit: {
              type: "string",
              description:
                "잘 맞는 팀/협업 방식. Team, manager, and collaboration styles that fit; styles that frustrate.",
            },
            environment_preference: {
              type: "string",
              description:
                "선호하는 회사 단계/환경. Company stage/environment (early startup, growth, large org, research-heavy, product-driven, etc).",
            },
          },
          additionalProperties: false,
        },
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
                "Number of opportunities per batch (1-20). Set only when user states a clear preferred batch size.",
              minimum: 1,
              maximum: 20,
            },
          },
          additionalProperties: false,
        },
        rowMemos: {
          type: "object",
          description:
            "Per-row memo additions. Use ONLY when the user's declarative statement clearly maps to ONE specific row visible in the system prompt's [Structured Talent Profile] block. Provide newInfo (one short Korean fact, plain prose, no preamble like '저는') — the server appends it to the existing memo automatically. NEVER invent rowIds or titles; use only those visible in the prompt's RowID lines (experiences/educations) or Title lines (extras). OMIT a table or entry entirely if the mention is ambiguous (multiple candidate rows) or no row matches. The non-row-mention case (generic skill/preference) is already handled by insights/preferences in this same tool call — do not duplicate.",
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

      const insightsInput =
        input.insights && typeof input.insights === "object" && !Array.isArray(input.insights)
          ? (input.insights as Record<string, unknown>)
          : null;
      const preferencesInput =
        input.preferences && typeof input.preferences === "object" && !Array.isArray(input.preferences)
          ? (input.preferences as Record<string, unknown>)
          : null;
      const rowMemosInput =
        input.rowMemos && typeof input.rowMemos === "object" && !Array.isArray(input.rowMemos)
          ? (input.rowMemos as Record<string, unknown>)
          : null;

      const allowedInsightKeys = new Set(INSIGHT_CHECKLIST.map((item) => item.key));
      const updatedInsightKeys: string[] = [];
      const updatedPreferenceFields: string[] = [];
      const updatedRowMemos: {
        experiences: string[];
        educations: string[];
        extras: string[];
      } = { experiences: [], educations: [], extras: [] };
      const skippedRowMemos: Array<{
        table: "experiences" | "educations" | "extras";
        key: string;
        reason: string;
      }> = [];

      // talent_insights — read-merge-write per key (prompt is responsible for full
      // merged text; we just persist whatever the model produced for each key).
      if (insightsInput) {
        const existing = await fetchTalentInsights({ admin, userId });
        const mergedContent: Record<string, string> = {
          ...((existing?.content as Record<string, string> | null) ?? {}),
        };
        for (const [key, value] of Object.entries(insightsInput)) {
          if (!allowedInsightKeys.has(key)) continue;
          if (typeof value !== "string") continue;
          const trimmed = value.trim();
          if (!trimmed) continue;
          mergedContent[key] = trimmed;
          updatedInsightKeys.push(key);
        }
        if (updatedInsightKeys.length > 0) {
          await upsertTalentInsights({
            admin,
            userId,
            content: mergedContent,
          });
        }
      }

      // talent_preferences — server-side union for arrays, overwrite for numbers.
      // careerMoveIntent is intentionally NEVER passed so upsertTalentSetting
      // falls back to the existing value (avoids triggering opportunity discovery).
      if (preferencesInput) {
        const existingSetting = await fetchTalentSetting({ admin, userId });
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
          updatePayload.engagementTypes = normalizeTalentEngagementTypes(merged);
          didUpdate = true;
          updatedPreferenceFields.push("engagementTypes");
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
          updatePayload.preferredLocations =
            normalizeTalentPreferredLocations(merged);
          didUpdate = true;
          updatedPreferenceFields.push("preferredLocations");
        }
        if (
          typeof preferencesInput.periodicIntervalDays === "number" &&
          Number.isFinite(preferencesInput.periodicIntervalDays)
        ) {
          updatePayload.periodicIntervalDays =
            preferencesInput.periodicIntervalDays;
          didUpdate = true;
          updatedPreferenceFields.push("periodicIntervalDays");
        }
        if (
          typeof preferencesInput.recommendationBatchSize === "number" &&
          Number.isFinite(preferencesInput.recommendationBatchSize)
        ) {
          updatePayload.recommendationBatchSize =
            preferencesInput.recommendationBatchSize;
          didUpdate = true;
          updatedPreferenceFields.push("recommendationBatchSize");
        }

        if (didUpdate) {
          await upsertTalentSetting(updatePayload);
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
            if (outcome.updated) updatedRowMemos.experiences.push(rowId);
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
            if (outcome.updated) updatedRowMemos.educations.push(rowId);
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
            if (outcome.updated) updatedRowMemos.extras.push(title);
          } else {
            skippedRowMemos.push({
              table: "extras",
              key: title,
              reason: outcome.reason,
            });
          }
        }
      }

      return {
        ok: true,
        updatedInsightKeys,
        updatedPreferenceFields,
        updatedRowMemos,
        skippedRowMemos,
      };
    },
  },
};

export function getEnabledTalentTools(channel: TalentToolChannel) {
  const configured = new Set<string>([...DEFAULT_ENABLED_TALENT_TOOL_NAMES]);

  return Object.values(TALENT_TOOL_REGISTRY).filter(
    (tool) => configured.has(tool.name) && tool.channels.includes(channel)
  );
}

export function getOpenAIChatTools(channel: TalentToolChannel) {
  return getEnabledTalentTools(channel).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
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
    parameters: tool.parameters,
  }));
}

export async function executeTalentTool(args: {
  context?: TalentToolExecutionContext;
  input: Record<string, unknown>;
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

  return tool.execute(args.input, args.context);
}

export function getTalentToolVoicePreambles(channel: TalentToolChannel) {
  return Object.fromEntries(
    getEnabledTalentTools(channel)
      .filter((tool) => typeof tool.voicePreamble === "string")
      .map((tool) => [tool.name, tool.voicePreamble as string])
  );
}

// ---------------------------------------------------------------------------
// get_recommended_jd / add_to_recommendations helpers
// ---------------------------------------------------------------------------

type GetRecommendedJdRoleFilter = {
  role_name?: string | null;
  type?: string | null;
  seniority?: string | null;
  work_mode?: string | null;
};

function normalizeRoleFilter(value: unknown): GetRecommendedJdRoleFilter {
  if (!value || typeof value !== "object") return {};
  const filter = value as Record<string, unknown>;
  return {
    role_name: optionalToolString(filter.role_name),
    type: optionalToolString(filter.type),
    seniority: optionalToolString(filter.seniority),
    work_mode: optionalToolString(filter.work_mode),
  };
}

type RecommendedJdRow = {
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

async function runGetRecommendedJd(args: {
  admin: any;
  userId: string;
  companyName: string | null;
  roleFilter: GetRecommendedJdRoleFilter;
}) {
  const { admin, userId, companyName, roleFilter } = args;

  let rows: RecommendedJdRow[];

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
      recQuery = recQuery.eq("company_roles.seniority_level", roleFilter.seniority);
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
        company_roles: RecommendedJdRow;
      }> | null;
      error: { message?: string } | null;
    };

    if (recError) {
      throw new TalentToolError(
        recError.message ?? "Failed to read talent_opportunity_recommendation."
      );
    }

    // Reshape to match RecommendedJdRow shape (embed the rec row back in).
    rows = (recData ?? []).map((rec) => ({
      ...rec.company_roles,
      talent_opportunity_recommendation: [
        { id: rec.id, talent_id: rec.talent_id, dismissed_at: rec.dismissed_at },
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
      query = query.ilike("name", `%${escapeLikePattern(roleFilter.role_name)}%`);
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
      data: RecommendedJdRow[] | null;
      error: { message?: string } | null;
    };

    if (error) {
      throw new TalentToolError(
        error.message ?? "Failed to read company_roles."
      );
    }

    rows = (data ?? []) as RecommendedJdRow[];
  }

  const normalizedTarget = companyName
    ? normalizeCompanySnapshotName(companyName)
    : null;

  const filtered = companyName
    ? rows.filter((row) => {
        const dbName = row.company_workspace?.company_db?.name ?? null;
        const wsName = row.company_workspace?.company_name ?? null;
        const candidateNames = [dbName, wsName].filter(
          (value): value is string => typeof value === "string" && value.length > 0
        );

        return candidateNames.some((name) => {
          if (
            name.toLocaleLowerCase("ko-KR").includes(companyName.toLocaleLowerCase("ko-KR"))
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

async function runAddToRecommendations(args: {
  admin: any;
  userId: string;
  roleId: string;
}) {
  const { admin, userId, roleId } = args;

  // Fetch the role + company name for the response payload.
  const { data: roleRow, error: roleError } = (await admin
    .from("company_roles")
    .select(
      `role_id,
       name,
       company_workspace:company_workspace_id (
         company_name,
         company_db:company_db_id (name)
       )`
    )
    .eq("role_id", roleId)
    .maybeSingle()) as {
    data:
      | {
          role_id: string;
          name: string;
          company_workspace: {
            company_name: string | null;
            company_db: { name: string | null } | null;
          } | null;
        }
      | null;
    error: { message?: string } | null;
  };

  if (roleError) {
    throw new TalentToolError(
      roleError.message ?? "Failed to read role for add_to_recommendations."
    );
  }
  if (!roleRow) {
    throw new TalentToolError(`Unknown role_id: ${roleId}`);
  }

  // Check existing recommendation row.
  const { data: existing, error: existingError } = (await admin
    .from("talent_opportunity_recommendation")
    .select("id, dismissed_at")
    .eq("talent_id", userId)
    .eq("role_id", roleId)
    .maybeSingle()) as {
    data: { id: string; dismissed_at: string | null } | null;
    error: { message?: string } | null;
  };

  if (existingError) {
    throw new TalentToolError(
      existingError.message ?? "Failed to read existing recommendation."
    );
  }

  if (existing) {
    if (existing.dismissed_at) {
      // Un-dismiss instead of inserting a duplicate.
      const { error: updateError } = await admin
        .from("talent_opportunity_recommendation")
        .update({ dismissed_at: null })
        .eq("id", existing.id);
      if (updateError) {
        throw new TalentToolError(
          updateError.message ?? "Failed to un-dismiss recommendation."
        );
      }
    }

    return {
      ok: true,
      already_exists: true,
      role_id: roleId,
      role_name: roleRow.name,
      company_name:
        roleRow.company_workspace?.company_db?.name ??
        roleRow.company_workspace?.company_name ??
        null,
    };
  }

  const { error: insertError } = await admin
    .from("talent_opportunity_recommendation")
    .insert({
      talent_id: userId,
      role_id: roleId,
      kind: "recommendation",
      opportunity_type: "external_jd",
      recommendation_reasons: ["chat_request"],
      feedback: null,
    });

  if (insertError) {
    throw new TalentToolError(
      insertError.message ?? "Failed to insert recommendation."
    );
  }

  return {
    ok: true,
    role_id: roleId,
    role_name: roleRow.name,
    company_name:
      roleRow.company_workspace?.company_db?.name ??
      roleRow.company_workspace?.company_name ??
      null,
  };
}
