import { runWebSearch } from "@/lib/tools/webSearch";
import type { ExaSearchClient } from "@/lib/tools/exaClient";
import { openUrlWithDocumentsCache } from "@/lib/talentOnboarding/openUrlTool";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

type SharedToolInputErrorFactory = (message: string) => Error;

export const WEB_SEARCH_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
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
          minimum: 1,
          maximum: 10,
          default: 10,
          description: "Maximum number of results to inspect.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

export const OPEN_URL_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: "open_url",
    description:
      "Open a specific website URL and return page markdown. Use when the user provides a URL or asks to read, inspect, summarize, or reason about a specific webpage.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The exact http(s) URL to open." },
        maxMarkdownChars: {
          type: "integer",
          minimum: 1000,
          maximum: 40000,
          default: 20000,
          description:
            "Optional maximum markdown characters returned to the model.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
};

export async function executeSharedWebSearch(
  input: Record<string, unknown>,
  options: {
    admin: TalentAdminClient;
    exa?: ExaSearchClient;
    inputError?: SharedToolInputErrorFactory;
  }
) {
  const query = String(input.query ?? "").trim();
  if (!query) {
    const message = "web_search requires a non-empty query.";
    throw options?.inputError?.(message) ?? new Error(message);
  }
  const parsed =
    typeof input.maxResults === "number"
      ? input.maxResults
      : Number.parseInt(String(input.maxResults ?? ""), 10);
  const response = await runWebSearch({
    admin: options.admin,
    exa: options.exa,
    maxResults: Number.isFinite(parsed) ? parsed : 10,
    query,
  });
  return {
    query: response.query,
    resultCount: response.results.length,
    results: response.results.map((result, index) => ({
      ...(result.author ? { author: result.author } : {}),
      highlights: result.highlights,
      ...(result.publishedDate
        ? { publishedDate: result.publishedDate }
        : {}),
      rank: index + 1,
      title: result.title,
      url: result.url,
    })),
  };
}

export async function executeSharedOpenUrl(args: {
  admin: TalentAdminClient;
  input: Record<string, unknown>;
  inputError?: SharedToolInputErrorFactory;
}) {
  const url = String(args.input.url ?? "").trim();
  if (!url) {
    const message = "open_url requires a non-empty URL.";
    throw args.inputError?.(message) ?? new Error(message);
  }
  return openUrlWithDocumentsCache({
    admin: args.admin,
    maxMarkdownChars: args.input.maxMarkdownChars,
    url,
  });
}
