import { formatToolError, throwIfToolControlError } from "@/lib/llm/toolError";
import { formatLlmDateTime, formatLlmElapsed } from "@/lib/llm/promptDateTime";
import { parseWebSearchOptions, runWebSearch } from "@/lib/tools/webSearch";
import type { ExaSearchClient } from "@/lib/tools/exaClient";
import type { WebSearchLogging } from "@/lib/tools/webSearchLog";
import { openUrlWithDocumentsCache, openUrlsWithDocumentsCache } from "@/lib/talentOnboarding/openUrlTool";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

/** A publication time with how long ago it was, so the model need not work out the year. */
const published = (value: string) => {
  const ago = formatLlmElapsed(value);
  return `${formatLlmDateTime(value)}${ago ? ` (${ago})` : ""}`;
};

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
        result.publishedDate ? `Published: ${published(result.publishedDate)}` : "Publication time unavailable.",
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
  pages: Array<OpenUrlPage | { ok: false; url: string; error: string; reason?: string }>;
  modelOutput: string;
};
function formatPublicResourceRef(ref: { id: string; revision: string }) {
  return `Public source reference: kind=web_resource; id=${ref.id}; revision=${ref.revision}.`;
}
/** Paragraphs that contain any of the words (alternatives separated by |), with their character offsets. */
function findPassages(markdown: string, find: string) {
  const terms = find.split("|").map(term => term.trim().toLowerCase()).filter(Boolean);
  const passages: string[] = [];
  let offset = 0, total = 0, matched = 0;
  for (const paragraph of markdown.split(/\n\s*\n/)) {
    const at = markdown.indexOf(paragraph, offset);
    offset = at >= 0 ? at + paragraph.length : offset;
    if (!paragraph.trim()) continue;
    total++;
    if (!terms.some(term => paragraph.toLowerCase().includes(term))) continue;
    matched++;
    if (passages.join("\n\n").length < 4000) passages.push(`@${at} ${paragraph.trim().slice(0, 1200)}`);
  }
  return [`Passages containing "${find}": ${matched} of ${total} paragraphs${passages.length < matched ? ` (first ${passages.length} shown)` : ""}. Read around a passage with offset.`,
    ...passages].join("\n\n");
}
export function formatOpenUrlPage(page: OpenUrlPage, includeResourceRef = false, find?: string) {
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
    page.sourceFetchedAt ? `Provider source fetched: ${formatLlmDateTime(page.sourceFetchedAt)}.` : "",
    find ? findPassages(page.markdown ?? "", find) : page.markdown,
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
  const find = typeof args.input.find === "string" && args.input.find.trim() ? args.input.find.trim() : undefined;
  const options = {
    // Passages are found in the whole page, so read it all when searching it.
    admin: args.admin, maxMarkdownChars: find ? 200_000 : args.input.maxMarkdownChars,
    offset: args.input.offset, maxAgeHours: args.input.maxAgeHours,
  };
  // Preserve the existing single-page contract for callers and saved calls.
  if (!Array.isArray(input)) {
    const page = await openUrlWithDocumentsCache({ ...options, url: String(input).trim() });
    return args.resourceRefs || find ? { ...page, modelOutput: formatOpenUrlPage(page, Boolean(args.resourceRefs), find) } : page;
  }
  const results = await openUrlsWithDocumentsCache({ ...options, urls: urls.map(url => String(url).trim()) });
  const pages = results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    throwIfToolControlError(result.reason);
    if (result.reason instanceof Error && result.reason.name === "AbortError") throw result.reason;
    const reason = result.reason as { message?: unknown; recovery?: unknown } | undefined;
    const readable = [reason?.message, reason?.recovery].filter(part => typeof part === "string" && part).join(" ");
    return { ok: false as const, url: String(urls[index]).trim(), error: formatToolError(result.reason), ...(readable ? { reason: readable } : {}) };
  });
  const successful = pages.filter(page => page.ok).length;
  return {
    ok: successful > 0,
    status: successful === pages.length ? "completed" : successful ? "partial" : "failed",
    pages,
    modelOutput: pages.map(page => {
      if ("error" in page) return `URL: ${page.url}\nRead failed: ${"reason" in page && page.reason ? page.reason : page.error}`;
      return formatOpenUrlPage(page, args.resourceRefs, find);
    }).join("\n\n"),
  };
}
