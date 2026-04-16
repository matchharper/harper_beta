import { runWebSearch } from "@/lib/tools/webSearch";

export type TalentToolChannel = "chat" | "voice";

export type TalentToolDefinition = {
  channels: TalentToolChannel[];
  description: string;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
  name: string;
  parameters: Record<string, unknown>;
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

export const DEFAULT_ENABLED_TALENT_TOOL_NAMES = ["web_search"] as const;

const TALENT_TOOL_REGISTRY: Record<string, TalentToolDefinition> = {
  web_search: {
    name: "web_search",
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
};

function parseConfiguredToolNames() {
  const raw = process.env.TALENT_ENABLED_TOOLS;
  if (typeof raw !== "string") {
    return [...DEFAULT_ENABLED_TALENT_TOOL_NAMES];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function getEnabledTalentTools(channel: TalentToolChannel) {
  const configured = new Set(parseConfiguredToolNames());

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
  const channelRule =
    channel === "voice"
      ? "- Voice mode: if a tool is needed, call it directly. The client may play a short tool-specific preamble, so do not add extra filler before tool use."
      : "- Chat mode: if a tool is needed, call it directly and then answer naturally in Korean using only the relevant findings.";

  return [
    "## Tool Use Policy",
    `Available tools: ${toolNames}`,
    "- Use tools only when the user needs current, factual, or web-dependent information.",
    "- Do not use tools for the normal onboarding interview flow if you can continue from the existing conversation context.",
    "- After tool use, summarize only the useful findings. Do not dump raw JSON.",
    "- Mention source names or URLs only when they materially help the user.",
    channelRule,
  ].join("\n");
}

export async function executeTalentTool(args: {
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

  return tool.execute(args.input);
}

export function getTalentToolVoicePreambles(channel: TalentToolChannel) {
  return Object.fromEntries(
    getEnabledTalentTools(channel)
      .filter((tool) => typeof tool.voicePreamble === "string")
      .map((tool) => [tool.name, tool.voicePreamble as string])
  );
}
