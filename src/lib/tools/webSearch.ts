import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  normalizeOpenUrl,
  saveDocumentCaches,
} from "@/lib/tools/documentCache";
import {
  getExaClient,
  type ExaSearchClient,
} from "@/lib/tools/exaClient";

export type WebSearchResult = {
  author?: string;
  highlights: string[];
  publishedDate?: string;
  title: string;
  url: string;
};

export type WebSearchResponse = {
  query: string;
  results: WebSearchResult[];
};

const DEFAULT_RESULT_COUNT = 10;
const MAX_RESULT_COUNT = 10;
const SEARCH_TEXT_MAX_CHARACTERS = 15_000;
const SEARCH_HIGHLIGHTS_MAX_CHARACTERS = 500;

function clampCount(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_RESULT_COUNT, Math.floor(parsed)));
}

function optionalString(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

export async function runWebSearch(args: {
  admin: TalentAdminClient;
  exa?: ExaSearchClient;
  searchPurpose?: "mock_interview";
  maxResults?: number;
  query: string;
}): Promise<WebSearchResponse> {
  const query = String(args.query ?? "").trim();
  const maxResults = clampCount(args.maxResults, DEFAULT_RESULT_COUNT);

  if (!query) {
    throw new Error("query is required");
  }

  const response = await (args.exa ?? getExaClient()).search(query, {
    numResults: maxResults,
    type: "auto",
    contents: {
      text: { maxCharacters: SEARCH_TEXT_MAX_CHARACTERS },
      highlights:
        args.searchPurpose === "mock_interview"
          ? {
              query: [
                "Concrete interview questions and practical assessment tasks.",
                "Prioritize technical questions, coding problems, system design",
                "and take-home requirements when relevant to the role.",
                "Favor questions requiring specific domain knowledge, underlying",
                "mechanisms, and applied problem solving over behavioral or motivation questions.",
                "Include problem statements, constraints, interviewer follow-up",
                "questions, and technical trade-offs over recruiter calls and hiring timelines.",
              ].join(" "),
              maxCharacters: 2500,
            }
          : { maxCharacters: SEARCH_HIGHLIGHTS_MAX_CHARACTERS },
    },
  });

  const resultsWithText = response.results.flatMap((result) => {
    let url: string;
    try {
      url = normalizeOpenUrl(result.url);
    } catch {
      return [];
    }

    const title = optionalString(result.title) ?? url;
    const text = optionalString(result.text);
    const highlights = Array.isArray(result.highlights)
      ? result.highlights
          .map((highlight) => optionalString(highlight))
          .filter((highlight): highlight is string => Boolean(highlight))
      : [];

    return [
      {
        author: optionalString(result.author),
        highlights,
        publishedDate: optionalString(result.publishedDate),
        text,
        title,
        url,
      },
    ];
  });

  await saveDocumentCaches({
    admin: args.admin,
    documents: resultsWithText.flatMap((result) =>
      result.text
        ? [
            {
              excerpt:
                result.highlights.length > 0
                  ? result.highlights.join("\n...\n")
                  : null,
              markdown: result.text,
              title: result.title,
              url: result.url,
            },
          ]
        : []
    ),
  });

  return {
    query,
    results: resultsWithText.map(({ text: _text, ...result }) => result),
  };
}
