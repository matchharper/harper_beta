import { runWebSearch } from "@/lib/tools/webSearch";
import { buildCareerToolPolicyPrompt } from "@/lib/career/prompts";
import { fetchTalentOpportunityHistory } from "@/lib/talentOpportunity";
import { runCareerJobPostingRecommendations } from "./jobPostingRecommendations";

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
  PREPARE_MOCK_INTERVIEW: "prepare_mock_interview",
  READ_RECOMMENDED_OPPORTUNITIES: "read_recommended_opportunities",
  WEB_SEARCH: "web_search",
} as const;

export type TalentToolName =
  (typeof TALENT_TOOL_NAMES)[keyof typeof TALENT_TOOL_NAMES];

export const DEFAULT_ENABLED_TALENT_TOOL_NAMES = [
  TALENT_TOOL_NAMES.WEB_SEARCH,
  TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS,
  TALENT_TOOL_NAMES.PREPARE_MOCK_INTERVIEW,
  TALENT_TOOL_NAMES.PREPARE_COMPANY_SNAPSHOT,
  TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES,
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
  [TALENT_TOOL_NAMES.PREPARE_MOCK_INTERVIEW]: {
    name: TALENT_TOOL_NAMES.PREPARE_MOCK_INTERVIEW,
    description:
      "Prepare the mock interview setup UI when the user asks to practice or start a mock interview. This does not start the interview; it only creates the setup card with call/chat start buttons.",
    parameters: {
      type: "object",
      properties: {
        companyName: {
          type: "string",
          description:
            "Company name explicitly requested by the user, if any. Omit if the user did not specify one.",
        },
        roleTitle: {
          type: "string",
          description:
            "Role title explicitly requested by the user, if any. Omit if unknown.",
        },
      },
      additionalProperties: false,
    },
    channels: ["chat"],
    stopAfterExecution: true,
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

export function buildTalentToolPolicy(channel: TalentToolChannel) {
  const tools = getEnabledTalentTools(channel);
  if (tools.length === 0) return "";

  const toolNames = tools.map((tool) => tool.name).join(", ");
  return buildCareerToolPolicyPrompt({ channel, toolNames });
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
