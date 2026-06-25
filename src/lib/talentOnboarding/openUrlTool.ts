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

function getLinkedinUrlKind(normalizedUrl: string) {
  let url: URL;
  try {
    url = new URL(normalizedUrl);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com")) {
    return null;
  }

  const firstPathSegment = url.pathname
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .find(Boolean);

  if (firstPathSegment === "in" || firstPathSegment === "pub") {
    return "profile";
  }
  if (firstPathSegment === "jobs") {
    return "job";
  }
  if (firstPathSegment === "company") {
    return "company";
  }
  return "generic";
}

function formatLinkedinUnsupportedResult(args: {
  kind: NonNullable<ReturnType<typeof getLinkedinUrlKind>>;
  url: string;
}) {
  const guidanceByKind = {
    profile:
      "LinkedIn 프로필 링크는 직접 열람할 수 없습니다. 본인 프로필 정보라면 프로필 탭의 이력서/링크에 LinkedIn 링크를 등록하거나 이력서를 업로드해 주세요. 다른 사람의 프로필을 확인하려는 용도라면 핵심 경력이나 프로필 내용을 붙여주시면 그 내용을 기준으로 도와드릴게요.",
    job: "LinkedIn 채용공고 링크는 직접 열람할 수 없습니다. 어떤 회사의 어떤 포지션인지 설명해주시거나, 공고 내용/JD를 붙여주시면 그 내용을 기준으로 핏 분석이나 지원 전략을 도와드릴게요.",
    company:
      "LinkedIn 회사 페이지는 직접 열람할 수 없습니다. 어떤 회사에 대해 무엇을 확인하고 싶은지 알려주시거나, 회사명/홈페이지/채용 페이지 링크를 보내주시면 확인 가능한 자료를 기준으로 도와드릴게요.",
    generic:
      "LinkedIn 링크는 직접 열람할 수 없습니다. 어떤 용도로 확인하려는 링크인지 알려주시고, 확인해야 할 핵심 내용이나 다른 공개 링크를 보내주시면 그 내용을 기준으로 도와드릴게요.",
  } satisfies Record<
    NonNullable<ReturnType<typeof getLinkedinUrlKind>>,
    string
  >;
  const markdown = guidanceByKind[args.kind];

  return {
    ok: false,
    blocked: true,
    blockedReason: "linkedin_unsupported",
    cached: false,
    excerpt: markdown,
    markdown,
    markdownCharCount: markdown.length,
    provider: "linkedin",
    title: "LinkedIn links cannot be opened directly",
    truncated: false,
    url: args.url,
    urlKind: args.kind,
  };
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
    scrape?: (
      url: string,
      params?: Record<string, unknown>
    ) => Promise<unknown>;
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
  const maxMarkdownChars = normalizeMaxMarkdownChars(args.maxMarkdownChars);
  const linkedinUrlKind = getLinkedinUrlKind(normalizedUrl);
  if (linkedinUrlKind) {
    return formatLinkedinUnsupportedResult({
      kind: linkedinUrlKind,
      url: normalizedUrl,
    });
  }

  const urlVariants = getUrlCacheVariants(args.url, normalizedUrl);
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
