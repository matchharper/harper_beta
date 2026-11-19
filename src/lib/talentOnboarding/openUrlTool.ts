import type { TalentAdminClient } from "./admin";
import { throwIfToolControlError } from "@/lib/llm/toolError";
import TurndownService from "turndown";
import {
  documentExcerpt,
  fetchCachedDocument,
  getUrlCacheVariants,
  normalizeDocumentText,
  normalizeOpenUrl,
} from "@/lib/tools/documentCache";
import { getExaClient, type ExaContentsClient } from "@/lib/tools/exaClient";
import { capturePublicSource, publicResourceKey } from "@/lib/career/resources/capture";
import { databaseError, resourceDb } from "@/lib/career/resources/types";
import {withProviderUsage} from "@/lib/career/resources/providerUsage";
import { JobPostingGoneError, readAtsPosting } from "@/lib/career/atsPostings";

const DEFAULT_MAX_MARKDOWN_CHARS = 20_000;
const MAX_MARKDOWN_CHARS = 40_000;
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

function directJobPostingUrl(url: string) {
  const { hostname, pathname } = new URL(url);
  if (hostname === "jobs.ashbyhq.com") return url;
  if (hostname === "www.wanted.co.kr" || hostname === "wanted.co.kr") {
    const match = /^\/wd\/(\d+)\/?$/.exec(pathname);
    if (match) return `https://www.wanted.co.kr/wd/${match[1]}`;
  }
  return null;
}

async function fetchDirectJobPosting(args: {
  fetcher: typeof fetch;
  url: string;
}) {
  const ats = await readAtsPosting(args.url, args.fetcher);
  if (ats) {
    const markdown = normalizeDocumentText([`# ${ats.title}`, ats.companyName ? `Company: ${ats.companyName}` : "",
      ats.location ? `Location: ${ats.location}` : "", ats.postedAt ? `Posted: ${ats.postedAt}` : "",
      directJobPostingTurndown.turndown(ats.descriptionHtml).trim()].filter(Boolean).join("\n\n"));
    return { markdown, resolvedUrl: normalizeOpenUrl(ats.url), title: ats.title };
  }
  const url = directJobPostingUrl(args.url);
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIRECT_FETCH_TIMEOUT_MS);

  try {
    const response = await withProviderUsage("public_job_page","GET",()=>args.fetcher(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "HarperJobPostingReader/1.0",
      },
      redirect: "error",
      signal: controller.signal,
    }));
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
      resolvedUrl: url,
      title,
    };
  } finally {
    clearTimeout(timeout);
  }
}

type OpenUrlOptions = {
  admin: TalentAdminClient;
  exa?: ExaContentsClient;
  fetcher?: typeof fetch;
  maxMarkdownChars?: unknown;
  offset?: unknown;
  maxAgeHours?: unknown;
};
type PageSource = { markdown: string; resolvedUrl: string; title: string };
type ProviderPage = { source: PageSource; crawled: boolean };

async function prepareOpenUrl(args: OpenUrlOptions & { url: string }) {
  const normalizedUrl = normalizeOpenUrl(args.url);
  const maxMarkdownChars = normalizeMaxMarkdownChars(args.maxMarkdownChars);
  const offset = args.offset === undefined ? 0 : Number(args.offset);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("offset must be a nonnegative integer.");
  const maxAgeHours = args.maxAgeHours === undefined ? undefined : Number(args.maxAgeHours);
  if (maxAgeHours !== undefined && (!Number.isInteger(maxAgeHours) || maxAgeHours < -1 || maxAgeHours > 720)) throw new Error("maxAgeHours must be -1 through 720, following the provider contract.");
  const cached = await fetchCachedDocument({
    admin: args.admin,
    urlVariants: getUrlCacheVariants(args.url, normalizedUrl),
  });

  if (cached) {
    const { contract, searchTextLimitReached } = cached.provenance;
    const needsPageBody = contract === "exa-search-metadata-v1" ||
      (contract === "exa-search-text-v1" && (searchTextLimitReached !== false || offset >= cached.markdown.length));
    const freshEnough = maxAgeHours === undefined || maxAgeHours === -1 ||
      (maxAgeHours > 0 && cached.sourceFetchedAt && Date.parse(cached.sourceFetchedAt) >= Date.now() - maxAgeHours * 3600000);
    if (!needsPageBody && freshEnough)
      return { page: formatCachedOpenUrlResult(cached, maxMarkdownChars, offset) };
  }
  const requestedAt = new Date().toISOString();
  const leaseOwner = cached ? crypto.randomUUID() : undefined;
  if (leaseOwner) {
    const claimed = await resourceDb(args.admin).rpc("career_claim_public_fetch_v1", { p_key: publicResourceKey(normalizedUrl), p_owner: leaseOwner });
    databaseError(claimed.error);
    if (!claimed.data && cached) {
      const saved = formatCachedOpenUrlResult(cached, maxMarkdownChars, offset);
      return { page: { ...saved, refreshPending: true,
        coverage: `${saved.coverage} Another request is fetching this page. Requested freshness is not established.` } };
    }
  }

  let directSource: PageSource | null = null;
  try {
    directSource = await fetchDirectJobPosting({ fetcher: args.fetcher ?? fetch, url: normalizedUrl });
  } catch (error) {
    throwIfToolControlError(error);
    // The employer's own job site said the posting is closed; another reader cannot say more.
    if (error instanceof JobPostingGoneError) throw error;
    // A job board may change its markup or time out. Exa is the fallback.
  }
  return { read: { normalizedUrl, maxMarkdownChars, offset, cached, requestedAt, leaseOwner, directSource } };
}

type PreparedRead = NonNullable<Awaited<ReturnType<typeof prepareOpenUrl>>["read"]>;

async function finishOpenUrl(
  admin: TalentAdminClient,
  read: PreparedRead,
  source: PageSource,
  confirmedCrawl: boolean
) {
  const { normalizedUrl, cached, requestedAt, leaseOwner, maxMarkdownChars, offset } = read;
  const direct = Boolean(read.directSource);
  const excerpt = documentExcerpt(source.markdown);
  const fetchedAt = direct || confirmedCrawl ? requestedAt : undefined;
  const coverage = direct
    ? "Public job-page extraction."
    : confirmedCrawl
      ? "Provider confirmed a successful crawl during this request; source fetch time records the request start."
      : "Provider page text; provider source-fetch time unavailable. Fresh fetch failures may return cached content.";
  // Arbitrary user-supplied URLs are not made public by a successful read.
  // Previously public sources and dedicated public job adapters establish scope.
  const captured = direct || cached ? await capturePublicSource({ admin, url: normalizedUrl,
    title: source.title, content: source.markdown, leaseOwner,
    source: { provider: direct ? "public_job_page" : "exa_public_contents", contract: direct ? "public-job-page-v1" : "exa-public-contents-v1",
      requestedAt, fetchedAt, coverage } }) : null;
  const clamped = clampMarkdown(source.markdown.slice(offset), maxMarkdownChars);

  return {
    ok: true,
    cached: false,
    createdAt: captured?.observedAt ?? requestedAt,
    documentId: captured?.documentId ?? null,
    observationId: captured?.observationId ?? null,
    sourceFetchedAt: captured?.sourceFetchedAt ?? fetchedAt ?? null,
    lastSuccessfulCheckAt: captured?.lastSuccessfulCheckAt ?? requestedAt,
    coverage,
    sourceScope: captured ? "public" : "unclassified_not_shared",
    offset, nextOffset: clamped.truncated ? offset + maxMarkdownChars : null,
    excerpt,
    markdown: clamped.markdown,
    markdownCharCount: source.markdown.length,
    resolvedUrl: source.resolvedUrl,
    title: source.title,
    truncated: clamped.truncated,
    url: normalizedUrl,
  };
}

// Exa accepts up to 100 URLs per Contents request (Get Contents API).
const MAX_EXA_CONTENT_URLS = 100;

async function readExaContents(urls: string[], options: OpenUrlOptions, maxAgeHours: number | undefined) {
  const pages = new Map<string, PromiseSettledResult<ProviderPage>>();
  for (let start = 0; start < urls.length; start += MAX_EXA_CONTENT_URLS) {
    const batch = urls.slice(start, start + MAX_EXA_CONTENT_URLS);
    let response;
    try {
      response = await withProviderUsage("exa", "contents", () =>
        (options.exa ?? getExaClient()).getContents(batch, { text: true, ...(maxAgeHours === undefined ? {} : { maxAgeHours }) }),
        result => ({ itemCount: result.results.length, reportedCostUsd: result.costDollars?.total })
      );
    } catch (cause) {
      throwIfToolControlError(cause);
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      const error = Object.assign(new Error("The page reader could not retrieve this URL.", { cause }), {
        recovery: "No page content was read. This does not establish that the URL is invalid or the page was removed. Use web search to find another accessible source, or ask for the relevant text. Do not invent details from this page or repeatedly call the same reader without new information.",
      });
      for (const url of batch) pages.set(url, { status: "rejected", reason: error });
      continue;
    }
    for (const url of batch) {
      // A failed URL can be absent from results. Redirects may change result.url
      // while result.id still identifies the submitted URL. Never zip by position.
      const status = response.statuses?.find(entry => entry.id === url) as
        | { status: string; source?: string; error?: { httpStatusCode?: number } }
        | undefined;
      const result = response.results.find(entry => entry.id === url)
        ?? response.results.find(entry => entry.url === url && !batch.includes(entry.id))
        ?? (batch.length === 1 ? response.results[0] : undefined);
      const markdown = normalizeDocumentText(result?.text ?? "");
      if (!result || !markdown) {
        const httpStatus = status?.error?.httpStatusCode;
        const reason = httpStatus ? ` The provider reported HTTP ${httpStatus} for this page.` : "";
        const error = Object.assign(new Error(`Exa returned no text for the URL.${reason}`), {
          recovery: "The reader returned no usable page text, so the page contents are unverified. This is not proof that the page is missing. Use another accessible source from web search or the text supplied by the user instead of repeating the same empty read.",
        });
        pages.set(url, { status: "rejected", reason: error });
        continue;
      }
      try {
        const source = { markdown, resolvedUrl: normalizeOpenUrl(result.url || url), title: result.title?.trim() || url };
        pages.set(url, { status: "fulfilled", value: { source, crawled: status?.status === "success" && status.source === "crawled" } });
      } catch (reason) {
        pages.set(url, { status: "rejected", reason });
      }
    }
  }
  return pages;
}

export async function openUrlsWithDocumentsCache(args: OpenUrlOptions & { urls: string[] }) {
  const urls = [...new Set(args.urls)];
  const prepared = await Promise.allSettled(urls.map(url => prepareOpenUrl({ ...args, url })));
  const misses = prepared.flatMap(entry =>
    entry.status === "fulfilled" && entry.value.read && !entry.value.read.directSource ? [entry.value.read.normalizedUrl] : []
  );
  const contents = await readExaContents([...new Set(misses)], args, args.maxAgeHours === undefined ? undefined : Number(args.maxAgeHours));
  const pages = await Promise.allSettled(prepared.map(async entry => {
    if (entry.status === "rejected") throw entry.reason;
    if (entry.value.page) return entry.value.page;
    const read = entry.value.read;
    if (read.directSource) return finishOpenUrl(args.admin, read, read.directSource, false);
    const page = contents.get(read.normalizedUrl)!;
    if (page.status === "rejected") throw page.reason;
    return finishOpenUrl(args.admin, read, page.value.source, page.value.crawled);
  }));
  const byUrl = new Map(urls.map((url, index) => [url, pages[index]]));
  return args.urls.map(url => byUrl.get(url)!);
}

export async function openUrlWithDocumentsCache(args: OpenUrlOptions & { url: string }) {
  const [page] = await openUrlsWithDocumentsCache({ ...args, urls: [args.url] });
  if (page.status === "rejected") throw page.reason;
  return page.value;
}

function formatCachedOpenUrlResult(
  cached: NonNullable<Awaited<ReturnType<typeof fetchCachedDocument>>>,
  maxMarkdownChars: number,
  offset = 0
) {
  const clamped = clampMarkdown(cached.markdown.slice(offset), maxMarkdownChars);
  return {
    ok: true,
    cached: true,
    observationId: cached.observationId,
    sourceFetchedAt: cached.sourceFetchedAt,
    lastSuccessfulCheckAt: cached.lastSuccessfulCheckAt,
    coverage: cached.provenance.contract === "exa-search-text-v1"
      ? "Saved provider search text. Offsets describe the indexed text; source completeness and live freshness are unverified."
      : "Saved public observation; read time is not proof of live source freshness.",
    sourceScope: "public",
    offset, nextOffset: clamped.truncated ? offset + maxMarkdownChars : null,
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
