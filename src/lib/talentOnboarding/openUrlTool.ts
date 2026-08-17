import type { TalentAdminClient } from "./admin";
import {
  documentExcerpt,
  fetchCachedDocument,
  getUrlCacheVariants,
  normalizeDocumentText,
  normalizeOpenUrl,
  saveDocumentCache,
} from "@/lib/tools/documentCache";
import {
  getExaClient,
  type ExaContentsClient,
} from "@/lib/tools/exaClient";

const DEFAULT_MAX_MARKDOWN_CHARS = 20_000;
const MAX_MARKDOWN_CHARS = 40_000;
const EXA_CONTENT_MAX_CHARACTERS = 20_000;

export { normalizeOpenUrl } from "@/lib/tools/documentCache";

function clampMarkdown(markdown: string, maxChars: number) {
  if (markdown.length <= maxChars) {
    return { markdown, truncated: false };
  }

  return {
    markdown: `${markdown.slice(0, maxChars)}\n\n[Content truncated]`,
    truncated: true,
  };
}

function normalizeMaxMarkdownChars(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) return DEFAULT_MAX_MARKDOWN_CHARS;
  return Math.max(1000, Math.min(MAX_MARKDOWN_CHARS, Math.floor(parsed)));
}

export async function openUrlWithDocumentsCache(args: {
  admin: TalentAdminClient;
  exa?: ExaContentsClient;
  maxMarkdownChars?: unknown;
  url: string;
}) {
  const normalizedUrl = normalizeOpenUrl(args.url);
  const maxMarkdownChars = normalizeMaxMarkdownChars(args.maxMarkdownChars);
  const cached = await fetchCachedDocument({
    admin: args.admin,
    urlVariants: getUrlCacheVariants(args.url, normalizedUrl),
  });

  if (cached) {
    return formatCachedOpenUrlResult(cached, maxMarkdownChars);
  }

  const response = await (args.exa ?? getExaClient()).getContents(
    [normalizedUrl],
    {
      text: { maxCharacters: EXA_CONTENT_MAX_CHARACTERS },
    }
  );
  const result = response.results[0];
  const text = normalizeDocumentText(String(result?.text ?? ""));

  if (!result || !text) {
    throw new Error("Exa returned no text for the URL.");
  }

  const title = String(result.title ?? "").trim() || normalizedUrl;
  const excerpt = documentExcerpt(text);
  const saved = await saveDocumentCache({
    admin: args.admin,
    document: {
      excerpt,
      markdown: text,
      title,
      url: normalizedUrl,
    },
  });
  const clamped = clampMarkdown(text, maxMarkdownChars);

  return {
    ok: true,
    cached: false,
    createdAt: saved.createdAt,
    documentId: saved.documentId,
    excerpt,
    markdown: clamped.markdown,
    markdownCharCount: text.length,
    resolvedUrl: normalizeOpenUrl(result.url || normalizedUrl),
    title,
    truncated: clamped.truncated,
    url: normalizedUrl,
  };
}

function formatCachedOpenUrlResult(
  cached: NonNullable<Awaited<ReturnType<typeof fetchCachedDocument>>>,
  maxMarkdownChars: number
) {
  const clamped = clampMarkdown(cached.markdown, maxMarkdownChars);
  return {
    ok: true,
    cached: true,
    createdAt: cached.createdAt,
    documentId: cached.documentId,
    excerpt: cached.excerpt,
    markdown: clamped.markdown,
    markdownCharCount: cached.markdown.length,
    title: cached.title,
    truncated: clamped.truncated,
    url: cached.url,
  };
}
