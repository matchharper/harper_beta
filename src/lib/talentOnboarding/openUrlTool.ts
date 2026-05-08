import Firecrawl from "@mendable/firecrawl-js";

import type { TalentAdminClient } from "./admin";

const DEFAULT_MAX_MARKDOWN_CHARS = 20_000;
const MAX_MARKDOWN_CHARS = 40_000;

function optionalString(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOpenUrl(rawUrl: string) {
  const input = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withProtocol);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs can be opened.");
  }

  url.hash = "";
  return url.toString();
}

function getUrlCacheVariants(rawUrl: string, normalizedUrl: string) {
  return Array.from(
    new Set(
      [
        rawUrl.trim(),
        normalizedUrl,
        normalizedUrl.endsWith("/") ? normalizedUrl.slice(0, -1) : null,
      ].filter((value): value is string => Boolean(value))
    )
  );
}

function normalizeMarkdown(markdown: string) {
  return markdown
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function markdownExcerpt(markdown: string) {
  return normalizeMarkdown(
    markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/[#>*_\-[\]()]/g, " ")
      .replace(/\s+/g, " ")
  ).slice(0, 2500);
}

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

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key value violates unique constraint/i.test(error.message ?? "")
  );
}

async function fetchCachedDocument(args: {
  admin: TalentAdminClient;
  urlVariants: string[];
}) {
  const { data, error } = await args.admin
    .from("documents")
    .select("id, url, title, markdown, excerpt, created_at")
    .in("url", args.urlVariants)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read document cache.");
  }

  const markdown = normalizeMarkdown(String(data?.markdown ?? ""));
  if (!data || !markdown) return null;

  return {
    createdAt: data.created_at,
    documentId: data.id,
    excerpt: optionalString(data.excerpt) ?? markdownExcerpt(markdown),
    markdown,
    title: optionalString(data.title) ?? optionalString(data.url) ?? "Untitled",
    url: optionalString(data.url) ?? args.urlVariants[0],
  };
}

async function scrapeUrlWithFirecrawl(url: string) {
  const apiKey = String(process.env.FIRECRAWL_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY is not configured.");
  }

  const app = new Firecrawl({ apiKey }) as Firecrawl & {
    scrape?: (url: string, params?: Record<string, unknown>) => Promise<unknown>;
  };
  const scrape =
    typeof app.scrape === "function"
      ? app.scrape.bind(app)
      : app.scrapeUrl.bind(app);
  const response = await scrape(url, {
    formats: ["markdown"],
    onlyMainContent: true,
    timeout: 45_000,
  });
  const result = isRecord(response) ? response : {};

  if (result.success === false) {
    throw new Error(
      optionalString(result.error) ?? "Firecrawl failed to scrape the URL."
    );
  }

  const metadata = isRecord(result.metadata) ? result.metadata : {};
  const markdown = normalizeMarkdown(
    optionalString(result.markdown) ??
      optionalString(result.content) ??
      optionalString(result.html) ??
      ""
  );

  if (!markdown) {
    throw new Error("Firecrawl returned no markdown for the URL.");
  }

  return {
    excerpt:
      optionalString(result.description) ??
      optionalString(metadata.description) ??
      markdownExcerpt(markdown),
    markdown,
    resolvedUrl:
      optionalString(result.url) ?? optionalString(metadata.sourceURL) ?? url,
    title:
      optionalString(result.title) ??
      optionalString(metadata.title) ??
      optionalString(metadata.ogTitle) ??
      url,
  };
}

export async function openUrlWithDocumentsCache(args: {
  admin: TalentAdminClient;
  maxMarkdownChars?: unknown;
  url: string;
}) {
  const normalizedUrl = normalizeOpenUrl(args.url);
  const urlVariants = getUrlCacheVariants(args.url, normalizedUrl);
  const maxMarkdownChars = normalizeMaxMarkdownChars(args.maxMarkdownChars);
  const cached = await fetchCachedDocument({
    admin: args.admin,
    urlVariants,
  });

  if (cached) {
    return formatCachedOpenUrlResult(cached, maxMarkdownChars);
  }

  const scraped = await scrapeUrlWithFirecrawl(normalizedUrl);
  const { data, error } = await args.admin
    .from("documents")
    .insert({
      url: normalizedUrl,
      title: scraped.title,
      markdown: scraped.markdown,
      excerpt: scraped.excerpt,
    })
    .select("id, created_at")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const latestCached = await fetchCachedDocument({
        admin: args.admin,
        urlVariants,
      });
      if (latestCached) {
        return formatCachedOpenUrlResult(latestCached, maxMarkdownChars);
      }
    }

    throw new Error(error.message ?? "Failed to save scraped document.");
  }

  const clamped = clampMarkdown(scraped.markdown, maxMarkdownChars);
  return {
    ok: true,
    cached: false,
    createdAt: data.created_at,
    documentId: data.id,
    excerpt: scraped.excerpt,
    markdown: clamped.markdown,
    markdownCharCount: scraped.markdown.length,
    resolvedUrl: scraped.resolvedUrl,
    title: scraped.title,
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
