import { formatToolError, throwIfToolControlError } from "@/lib/llm/toolError";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { parseWebSearchOptions, runWebSearch } from "@/lib/tools/webSearch";
import type { ExaSearchClient } from "@/lib/tools/exaClient";
import type { WebSearchLogging } from "@/lib/tools/webSearchLog";
import { openUrlWithDocumentsCache, openUrlsWithDocumentsCache } from "@/lib/talentOnboarding/openUrlTool";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

type SharedToolInputErrorFactory = (message: string) => Error;

export { WEB_SEARCH_TOOL_DEFINITION, OPEN_URL_TOOL_DEFINITION } from "./webDefinitions";

export async function executeSharedWebSearch(
  input: Record<string, unknown>,
  options: {
    admin: TalentAdminClient;
    exa?: ExaSearchClient;
    logging?: WebSearchLogging;
    searchPurpose?: "mock_interview";
    /** Career can read and cite versioned public resources directly. */
    resourceRefs?: boolean;
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
  const structuredText =
    typeof input.structured_text === "string" ? input.structured_text : undefined;
  const response = await runWebSearch({
    admin: options.admin,
    exa: options.exa,
    logging: options.logging,
    searchPurpose: options.searchPurpose,
    maxResults: Number.isFinite(parsed) ? parsed : 10,
    query,
    structuredText,
    options: parseWebSearchOptions(input),
  });
  return {
    query: response.query,
    coverage: response.coverage,
    modelOutput: [response.coverage, `Query: ${response.query}; results: ${response.results.length}`,
      ...(response.structuredText ? [`Provider synthesis (not an original source):\n${response.structuredText}`] : []),
      ...(structuredText && !response.structuredText ? ["No synthesized answer returned."] : []),
      ...response.results.map((result, index) => [
        `${index + 1}. ${result.title}\n${result.url}`, result.author ? `Author: ${result.author}` : "",
        options.resourceRefs && result.resourceRef ? formatPublicResourceRef(result.resourceRef) : "",
        result.publishedDate ? `Published: ${formatLlmDateTime(result.publishedDate)}` : "Publication time unavailable.",
        ...result.highlights,
      ].filter(Boolean).join("\n"))].join("\n\n"),
    ...(structuredText
      ? { structured_text: response.structuredText ?? null }
      : {}),
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
      ...(options.resourceRefs && result.resourceRef ? { resourceRef: result.resourceRef } : {}),
    })),
  };
}

type OpenUrlArgs = {
  admin: TalentAdminClient;
  input: Record<string, unknown>;
  inputError?: SharedToolInputErrorFactory;
  resourceRefs?: boolean;
};
type OpenUrlPage = Awaited<ReturnType<typeof openUrlWithDocumentsCache>> & { modelOutput?: string };
type OpenUrlBatch = {
  ok: boolean;
  status: "completed" | "partial" | "failed";
  pages: Array<OpenUrlPage | { ok: false; url: string; error: string }>;
  modelOutput: string;
};
function formatPublicResourceRef(ref: { id: string; revision: string }) {
  return `Public source reference: kind=web_resource; id=${ref.id}; revision=${ref.revision}.`;
}
export function formatOpenUrlPage(page: OpenUrlPage, includeResourceRef = false) {
  return [
    `URL: ${page.url}`,
    "resolvedUrl" in page ? `Resolved URL: ${page.resolvedUrl}` : "",
    `Title: ${page.title}`,
    page.sourceScope === "public"
      ? `Source: ${page.cached ? "saved page" : "page reader"}; saved ${formatLlmDateTime(page.createdAt)} (Asia/Seoul).`
      : `Source: page reader; read ${formatLlmDateTime(page.createdAt)} (Asia/Seoul). No shared source was saved.`,
    includeResourceRef && page.sourceScope === "public" && page.documentId && page.observationId
      ? formatPublicResourceRef({ id: String(page.documentId), revision: page.observationId }) : "",
    `Content truncated: ${page.truncated}; source characters: ${page.markdownCharCount}.`,
    `Offset ${page.offset}; next offset ${page.nextOffset ?? "none"}. ${page.coverage}`,
    `Provider source fetched: ${page.sourceFetchedAt ? formatLlmDateTime(page.sourceFetchedAt) : "unknown"}.`,
    page.markdown,
  ].filter(Boolean).join("\n");
}
export function executeSharedOpenUrl(args: OpenUrlArgs & { input: Record<string, unknown> & { url: string } }): Promise<OpenUrlPage>;
export function executeSharedOpenUrl(args: OpenUrlArgs): Promise<OpenUrlPage | OpenUrlBatch>;
export async function executeSharedOpenUrl(args: OpenUrlArgs): Promise<OpenUrlPage | OpenUrlBatch> {
  const input = args.input.url;
  const urls = Array.isArray(input) ? input : [input];
  if (!urls.length || urls.some(url => typeof url !== "string" || !url.trim())) {
    const message = "open_url requires a non-empty URL or list of URLs.";
    throw args.inputError?.(message) ?? new Error(message);
  }
  const options = {
    admin: args.admin, maxMarkdownChars: args.input.maxMarkdownChars,
    offset: args.input.offset, maxAgeHours: args.input.maxAgeHours,
  };
  // Preserve the existing single-page contract for callers and saved calls.
  if (!Array.isArray(input)) {
    const page = await openUrlWithDocumentsCache({ ...options, url: String(input).trim() });
    return args.resourceRefs ? { ...page, modelOutput: formatOpenUrlPage(page, true) } : page;
  }
  const results = await openUrlsWithDocumentsCache({ ...options, urls: urls.map(url => String(url).trim()) });
  const pages = results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    throwIfToolControlError(result.reason);
    if (result.reason instanceof Error && result.reason.name === "AbortError") throw result.reason;
    return { ok: false as const, url: String(urls[index]).trim(), error: formatToolError(result.reason) };
  });
  const successful = pages.filter(page => page.ok).length;
  return {
    ok: successful > 0,
    status: successful === pages.length ? "completed" : successful ? "partial" : "failed",
    pages,
    modelOutput: pages.map(page => {
      if ("error" in page) return `URL: ${page.url}\nRead failed: ${page.error}`;
      return formatOpenUrlPage(page, args.resourceRefs);
    }).join("\n\n"),
  };
}
