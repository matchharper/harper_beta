import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { BaseSearchOptions } from "exa-js";
import {
  normalizeOpenUrl,
  saveDocumentCaches,
} from "@/lib/tools/documentCache";
import {
  getExaClient,
  type ExaSearchClient,
} from "@/lib/tools/exaClient";
import {
  captureWebSearchAttribution,
  recordWebSearchLog,
  type WebSearchLogging,
} from "@/lib/tools/webSearchLog";

export type WebSearchResult = {
  author?: string;
  highlights: string[];
  publishedDate?: string;
  title: string;
  url: string;
  resourceRef?: { kind: "web_resource"; id: string; revision: string };
};

export type WebSearchResponse = {
  query: string;
  results: WebSearchResult[];
  structuredText?: string;
  coverage: string;
};

const DEFAULT_RESULT_COUNT = 10;
// Exa's public Search API per-request limit; further searches remain possible.
const MAX_RESULT_COUNT = 100;
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

export type WebSearchOptions = Pick<BaseSearchOptions, "startPublishedDate" | "endPublishedDate" | "includeDomains" | "excludeDomains" | "category"> & {
  mode?: "auto" | "fast" | "deep" | "deep-reasoning";
};

export function parseWebSearchOptions(input: Record<string, unknown>): WebSearchOptions {
  const result: WebSearchOptions = {};
  for (const key of ["startPublishedDate", "endPublishedDate"] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "string" || !Number.isFinite(Date.parse(input[key]))) throw new Error(`${key} must be an ISO date.`);
    result[key] = new Date(input[key]).toISOString();
  }
  if (result.startPublishedDate && result.endPublishedDate && result.startPublishedDate > result.endPublishedDate) throw new Error("Published date window is reversed.");
  for (const key of ["includeDomains", "excludeDomains"] as const) {
    if (input[key] === undefined) continue;
    if (!Array.isArray(input[key]) || input[key].some(value => typeof value !== "string" || !value.trim())) throw new Error(`${key} must be domains.`);
    result[key] = input[key] as string[];
  }
  if (input.category !== undefined) {
    if (!["company", "publication", "news", "personal site", "financial report", "people"].includes(String(input.category))) throw new Error("Unsupported search category.");
    result.category = input.category as WebSearchOptions["category"];
  }
  if (["company", "people"].includes(result.category ?? "") && (result.startPublishedDate || result.endPublishedDate)) throw new Error("Exa company/people searches do not support published date filters. Search dated posts separately.");
  if (result.category === "people" && result.excludeDomains?.length) throw new Error("Exa people search does not support excludeDomains.");
  if (input.mode !== undefined) {
    if (!["auto", "fast", "deep", "deep-reasoning"].includes(String(input.mode))) throw new Error("Unsupported search mode.");
    result.mode = input.mode as WebSearchOptions["mode"];
  }
  return result;
}

export async function runWebSearch(args: {
  admin: TalentAdminClient;
  exa?: ExaSearchClient;
  searchPurpose?: "mock_interview";
  maxResults?: number;
  query: string;
  structuredText?: string;
  logging?: WebSearchLogging;
  options?: WebSearchOptions;
}): Promise<WebSearchResponse> {
  const query = String(args.query ?? "").trim();
  const maxResults = clampCount(args.maxResults, DEFAULT_RESULT_COUNT);

  if (!query) {
    throw new Error("query is required");
  }

  const { mode, ...filters } = parseWebSearchOptions(args.options ?? {});
  const parameters = {
    ...filters,
    numResults: maxResults,
    type: mode ?? "auto" as const,
    ...(args.structuredText
      ? { outputSchema: { type: "text" as const, description: args.structuredText } }
      : {}),
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
  };
  const attribution = captureWebSearchAttribution(args.logging?.attribution);
  const executionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let response;
  let searchError: unknown;
  try {
    response = await (args.exa ?? getExaClient()).search(query, parameters);
  } catch (error) {
    searchError = error;
    throw error;
  } finally {
    const cost = response?.costDollars;
    const costUsd = typeof cost?.total === "number" && Number.isFinite(cost.total)
      ? cost.total : null;
    const error = searchError as { name?: string; message?: string; statusCode?: number } | undefined;
    recordWebSearchLog({
      admin: args.logging?.admin ?? args.admin,
      userId: attribution.userId,
      scheduleAfter: args.logging?.scheduleAfter,
      metadata: {
        version: 1,
        executionId,
        provider: "exa",
        endpoint: "/search",
        // The SDK sends query + these options as its JSON body. Explicit
        // contents above prevent the SDK from injecting different defaults.
        parameters: { query, ...parameters },
        attribution,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
        deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: performance.now() - started,
        status: response ? "succeeded" : "failed",
        providerRequestId: response?.requestId ?? null,
        resultCount: response?.results.length ?? null,
        resolvedSearchType: response?.resolvedSearchType ?? null,
        costUsd,
        costStatus: costUsd === null ? "unknown" : "provider_reported",
        costDollars: cost ?? null,
        error: response ? null : {
          name: error?.name ?? "Error",
          message: error?.message ?? String(searchError),
          statusCode: error?.statusCode ?? null,
        },
      },
    });
  }

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
        searchTextLimitReached: (result.text?.length ?? 0) >= SEARCH_TEXT_MAX_CHARACTERS,
        text,
        title,
        url,
      },
    ];
  });

  const saved = await saveDocumentCaches({
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
              publicSource: { provider: "exa_search" as const, contract: "exa-search-text-v1", publishedAt: result.publishedDate, requestedAt: startedAt,
                searchTextLimitReached: result.searchTextLimitReached,
                coverage: `Search text requested up to ${SEARCH_TEXT_MAX_CHARACTERS} characters; publication and provider fetch dates may be unavailable.` },
            },
          ]
        : []
    ),
  });

  const sourceRefs = new Map(saved.publicResources.map(source => [source.url, source.ref]));
  return {
    query,
    coverage: "Results from the provider's searchable web index, not a complete market or social feed. Publication dates and source completeness may be unavailable.",
    results: resultsWithText.map(({ text: _text, searchTextLimitReached: _limit, ...result }) => ({ ...result,
      ...(sourceRefs.has(result.url) ? { resourceRef: sourceRefs.get(result.url)! } : {}),
    })),
    ...(args.structuredText && typeof response.output?.content === "string"
      ? {
          structuredText: [
            response.output.content,
            ...(response.output.grounding ?? []).map((entry) =>
              `${entry.field} (confidence: ${entry.confidence}): ${entry.citations
                .map((citation) => `${citation.title} — ${citation.url}`)
                .join("; ")}`
            ),
          ].join("\n\n"),
        }
      : {}),
  };
}
