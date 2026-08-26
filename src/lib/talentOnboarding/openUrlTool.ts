import type { TalentAdminClient } from "./admin";
import TurndownService from "turndown";
import {
  documentExcerpt,
  fetchCachedDocument,
  getUrlCacheVariants,
  normalizeDocumentText,
  normalizeOpenUrl,
  saveDocumentCache,
} from "@/lib/tools/documentCache";
import { getExaClient, type ExaContentsClient } from "@/lib/tools/exaClient";

const DEFAULT_MAX_MARKDOWN_CHARS = 20_000;
const MAX_MARKDOWN_CHARS = 40_000;
const EXA_CONTENT_MAX_CHARACTERS = 20_000;
const DIRECT_FETCH_MAX_CHARACTERS = 2_000_000;
const DIRECT_FETCH_TIMEOUT_MS = 8_000;

const directJobPostingTurndown = new TurndownService({
  bulletListMarker: "-",
  headingStyle: "atx",
});

directJobPostingTurndown.remove(["script", "style"]);

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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isJobPostingType(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return values.some(
    (item) =>
      String(item ?? "")
        .trim()
        .toLowerCase() === "jobposting"
  );
}

function findJobPosting(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const posting = findJobPosting(item);
      if (posting) return posting;
    }
    return null;
  }

  const candidate = record(value);
  if (!candidate) return null;
  if (isJobPostingType(candidate["@type"])) return candidate;

  return findJobPosting(candidate["@graph"]);
}

function extractJsonLdJobPosting(html: string) {
  for (const match of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  )) {
    if (
      !/\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)/i.test(
        match[1]
      )
    ) {
      continue;
    }

    try {
      const posting = findJobPosting(JSON.parse(match[2].trim()));
      if (posting) return posting;
    } catch {
      // Ignore malformed JSON-LD blocks and keep looking for a valid posting.
    }
  }

  return null;
}

function isDirectlyReadableJobPostingHost(url: string) {
  return new URL(url).hostname.toLowerCase() === "jobs.ashbyhq.com";
}

async function fetchDirectJobPosting(args: {
  fetcher: typeof fetch;
  url: string;
}) {
  if (!isDirectlyReadableJobPostingHost(args.url)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIRECT_FETCH_TIMEOUT_MS);

  try {
    const response = await args.fetcher(args.url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "HarperJobPostingReader/1.0",
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Job posting fetch failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error("Job posting URL did not return HTML.");
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > DIRECT_FETCH_MAX_CHARACTERS
    ) {
      throw new Error("Job posting page is too large to read.");
    }

    const html = await response.text();
    if (html.length > DIRECT_FETCH_MAX_CHARACTERS) {
      throw new Error("Job posting page is too large to read.");
    }

    const posting = extractJsonLdJobPosting(html);
    const title = String(posting?.title ?? "").trim();
    if (!posting || !title) {
      throw new Error("Job posting page has no clear official title.");
    }

    const descriptionHtml = String(posting.description ?? "").trim();
    const description = descriptionHtml
      ? directJobPostingTurndown.turndown(descriptionHtml).trim()
      : "";
    const company = String(
      record(posting.hiringOrganization)?.name ?? ""
    ).trim();
    const markdown = normalizeDocumentText(
      [`# ${title}`, company ? `Company: ${company}` : "", description]
        .filter(Boolean)
        .join("\n\n")
    );

    return {
      markdown,
      resolvedUrl: args.url,
      title,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function openUrlWithDocumentsCache(args: {
  admin: TalentAdminClient;
  exa?: ExaContentsClient;
  fetcher?: typeof fetch;
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

  let source: {
    markdown: string;
    resolvedUrl: string;
    title: string;
  } | null = null;

  try {
    source = await fetchDirectJobPosting({
      fetcher: args.fetcher ?? fetch,
      url: normalizedUrl,
    });
  } catch {
    // The existing Exa path remains the fallback when a supported job board's
    // direct page is temporarily unavailable or changes its markup.
  }

  if (!source) {
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

    source = {
      markdown: text,
      resolvedUrl: normalizeOpenUrl(result.url || normalizedUrl),
      title: String(result.title ?? "").trim() || normalizedUrl,
    };
  }

  const excerpt = documentExcerpt(source.markdown);
  const saved = await saveDocumentCache({
    admin: args.admin,
    document: {
      excerpt,
      markdown: source.markdown,
      title: source.title,
      url: normalizedUrl,
    },
  });
  const clamped = clampMarkdown(source.markdown, maxMarkdownChars);

  return {
    ok: true,
    cached: false,
    createdAt: saved.createdAt,
    documentId: saved.documentId,
    excerpt,
    markdown: clamped.markdown,
    markdownCharCount: source.markdown.length,
    resolvedUrl: source.resolvedUrl,
    title: source.title,
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
