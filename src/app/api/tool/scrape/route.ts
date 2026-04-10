import { NextRequest, NextResponse } from "next/server";
// @ts-ignore: pdf-parse-fork 타입이 불완전할 수 있어 ignore
import pdf from "pdf-parse-fork";

import { htmlToReadableMarkdown } from "../utils";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { logger } from "@/utils/logger";
import { ApifyClient } from "apify-client";

// (선택) 혹시 런타임이 Edge로 잡히는 환경이면 강제로 Node로
export const runtime = "nodejs";

const DEFAULT_APIFY_WEBSITE_CONTENT_CRAWLER_ACTOR_ID =
  "apify/website-content-crawler";

function isPdfUrl(url: string) {
  try {
    const u = new URL(url);
    return u.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    // URL 파싱 실패 시 fallback
    return url.toLowerCase().split("?")[0].endsWith(".pdf");
  }
}
const isTwitterUrl = (url: string): boolean => {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, "");

    if (host !== "twitter.com" && host !== "x.com") return false;

    const parts = u.pathname.split("/").filter(Boolean);

    // profile URL = exactly one path segment
    return parts.length === 1;
  } catch {
    return false;
  }
};

const isGithubProfile = (url: string): boolean => {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, "");

    if (host !== "github.com") return false;

    const parts = u.pathname.split("/").filter(Boolean);

    // profile URL = exactly one path segment
    return parts.length === 1;
  } catch {
    return false;
  }
};

function normalizeText(s: string) {
  return s
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMeaningfulTextLength(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/[#>*_\-\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function isReadableMarkdown(markdown: string) {
  return extractMeaningfulTextLength(markdown) >= 180;
}

async function saveDocumentCache(args: {
  excerpt?: string | null;
  markdown: string;
  title: string;
  url: string;
}) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert({
        url: args.url,
        title: args.title,
        markdown: args.markdown,
        excerpt: args.excerpt ?? null,
      })
      .select("id")
      .single();

    if (error) {
      logger.log("Failed to save scraped document cache", {
        error: error.message,
        url: args.url,
      });
      return null;
    }

    return data?.id ?? null;
  } catch (error) {
    logger.log("Unexpected cache save failure", {
      error: error instanceof Error ? error.message : String(error),
      url: args.url,
    });
    return null;
  }
}

async function fetchHtmlDirect(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,ko-KR;q=0.8,ko;q=0.7",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Direct fetch error: ${response.status}`);
  }

  return response.text();
}

async function fetchWebsiteContentWithApify(url: string) {
  const token = String(process.env.APIFY_CLIENT_KEY ?? "").trim();
  if (!token) {
    throw new Error("APIFY_CLIENT_KEY is not configured");
  }

  const actorId =
    String(process.env.APIFY_WEBSITE_CONTENT_CRAWLER_ACTOR_ID ?? "").trim() ||
    DEFAULT_APIFY_WEBSITE_CONTENT_CRAWLER_ACTOR_ID;
  const client = new ApifyClient({ token });
  const run = await client.actor(actorId).call({
    crawlerType: "playwright:adaptive",
    maxCrawlDepth: 0,
    maxCrawlPages: 1,
    startUrls: [{ url }],
  });

  if (!run.defaultDatasetId) {
    throw new Error("Apify website content crawler returned no dataset");
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems({
    limit: 1,
  });
  const item = (Array.isArray(items) ? items[0] : null) as
    | Record<string, any>
    | null;

  if (!item) {
    throw new Error("Apify website content crawler returned empty dataset");
  }

  const title =
    String(
      item.title ??
        item.pageTitle ??
        item.metadata?.title ??
        item.request?.userData?.title ??
        ""
    ).trim() || url;
  const resolvedUrl =
    String(
      item.url ?? item.loadedUrl ?? item.request?.loadedUrl ?? item.request?.url
    ).trim() || url;
  const rawMarkdown = String(
    item.markdown ?? item.contentMarkdown ?? item.cleanedMarkdown ?? ""
  ).trim();
  const rawText = normalizeText(
    String(item.text ?? item.description ?? item.excerpt ?? "").trim()
  );
  const markdown = rawMarkdown || `# ${title}\n\n${rawText}`;

  if (!markdown.trim()) {
    throw new Error("Apify website content crawler returned empty content");
  }

  return {
    excerpt:
      normalizeText(String(item.excerpt ?? item.description ?? "").trim()) ||
      rawText.slice(0, 2500) ||
      markdown.slice(0, 2500),
    markdown,
    title,
    url: resolvedUrl,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      pdfPageLimit?: number;
      url?: string;
    };
    const url = body.url;
    const pdfPageLimit =
      Number.isFinite(Number(body.pdfPageLimit)) &&
      Number(body.pdfPageLimit) > 0
        ? Math.floor(Number(body.pdfPageLimit))
        : 1;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Invalid or missing url" },
        { status: 400 }
      );
    }

    console.log("\nURL parsing을 실행합니다.\n");

    // 0) cache
    const supabaseAdmin = getSupabaseAdmin();
    const cache = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("url", url)
      .maybeSingle();

    if (cache.data) {
      logger.log("Cache hit for URL:", url);
      return NextResponse.json(
        {
          id: cache.data.id,
          url: cache.data.url,
          title: cache.data.title,
          markdown: cache.data.markdown,
          excerpt: cache.data.excerpt,
        },
        { status: 200 }
      );
    }

    // 1) PDF 분기 (링크가 .pdf로 끝나면)
    if (isPdfUrl(url)) {
      logger.log("PDF detected:", url);

      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      if (!resp.ok) {
        throw new Error(`Failed to download PDF: ${resp.status}`);
      }

      const arrayBuffer = await resp.arrayBuffer();

      if (arrayBuffer.byteLength > 25 * 1024 * 1024) {
        throw new Error("PDF too large");
      }

      const buffer = Buffer.from(arrayBuffer);

      // 첫 페이지만 파싱
      const data = await pdf(buffer, { max: pdfPageLimit });

      const title = (data?.info?.Title || "PDF Document").toString().trim();
      const text = normalizeText((data?.text || "").toString());

      if (!text) {
        return NextResponse.json(
          { error: "PDF has no extractable text (possibly scanned)" },
          { status: 422 }
        );
      }

      const markdown = `# ${title}\n\n${text}`;
      const excerpt = text.slice(0, 2500);
      const documentId = await saveDocumentCache({
        excerpt,
        markdown,
        title,
        url,
      });

      return NextResponse.json(
        {
          id: documentId,
          url,
          title,
          markdown,
          excerpt,
        },
        { status: 200 }
      );
    }

    if (isTwitterUrl(url)) {
      const token = process.env.APIFY_CLIENT_KEY;
      const client = new ApifyClient({
        token: token,
      });

      // Prepare Actor input
      const input = {
        startUrls: [url],
        searchTerms: [],
        twitterHandles: [],
        maxItems: 10,
        sort: "Latest",
        tweetLanguage: "en",
        customMapFunction: (object: any) => {
          return { ...object };
        },
      };

      const run = await client.actor("61RPP7dywgiy0JPD0").call(input);

      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      let results: any[] = [];
      items.forEach((item) => {
        results.push({
          url: item.url,
          text: item.text,
          retweetCount: item.retweetCount,
          replyCount: item.replyCount,
          likeCount: item.likeCount,
          createdAt: item.createdAt,
          quoteCount: item.quoteCount,
          isQuote: item.isQuote,
          isRetweet: item.isRetweet,
          author: (item.author as any).userName ?? "",
        });
      });
      console.log(results);

      const documentId = await saveDocumentCache({
        excerpt: "",
        markdown: JSON.stringify(results),
        title: url,
        url,
      });

      return NextResponse.json(
        {
          id: documentId,
          url,
          title: url,
          markdown: JSON.stringify(results),
          excerpt: "",
        },
        { status: 200 }
      );
    }

    // 2) HTML
    let result:
      | {
          excerpt?: string;
          markdown: string;
          title: string;
          url: string;
        }
      | null = null;
    let fetchSource = "direct";
    let directFetchError: string | null = null;

    try {
      const html = await fetchHtmlDirect(url);
      const directResult = htmlToReadableMarkdown(html, url, { maxLinks: 60 });

      if (isReadableMarkdown(directResult.markdown)) {
        result = directResult;
      } else {
        logger.log("Direct fetch returned thin content, retrying via Apify", {
          url,
        });
      }
    } catch (error) {
      directFetchError =
        error instanceof Error ? error.message : "direct fetch failed";
      logger.log("Direct fetch failed, retrying via Apify", {
        error: directFetchError,
        url,
      });
    }

    if (!result) {
      const apifyResult = await fetchWebsiteContentWithApify(url);
      result = apifyResult;
      fetchSource = "apify";
    }

    if (!result?.markdown?.trim()) {
      throw new Error(
        directFetchError
          ? `Failed to scrape page: ${directFetchError}`
          : "Failed to scrape page"
      );
    }

    const documentId = await saveDocumentCache({
      excerpt: result.excerpt,
      markdown: result.markdown,
      title: result.title,
      url: result.url,
    });

    return NextResponse.json(
      {
        id: documentId,
        url: result.url,
        title: result.title,
        markdown: result.markdown,
        excerpt: result.excerpt,
        source: fetchSource,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Scrape error:", err);
    const status = err?.response?.status ?? 500;
    const message = err?.response?.data ?? err?.message ?? "Unknown error";
    return NextResponse.json({ error: message }, { status });
  }
}
