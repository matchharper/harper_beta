import { ApifyClient } from "apify-client";

export type WebSearchResult = {
  snippet: string;
  title: string;
  url: string;
};

export type WebSearchResponse = {
  query: string;
  results: WebSearchResult[];
};

function clampCount(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(8, parsed));
}

export async function runWebSearch(args: {
  maxResults?: number;
  query: string;
}): Promise<WebSearchResponse> {
  const query = String(args.query ?? "").trim();
  const maxResults = clampCount(args.maxResults, 5);
  const token = String(process.env.APIFY_CLIENT_KEY ?? "").trim();

  if (!query) {
    throw new Error("query is required");
  }

  if (!token) {
    throw new Error("APIFY_CLIENT_KEY is not configured");
  }

  const client = new ApifyClient({ token });
  const run = await client.actor("563JCPLOqM1kMmbbP").call({
    keyword: query,
    language: "ko",
    country: "KR",
    page: 1,
    limit: String(Math.max(maxResults, 5)),
    logger: null,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  if (!items || items.length === 0) {
    return { query, results: [] };
  }

  const lastItem = items[items.length - 1] as {
    results?: Array<{
      description?: string;
      title?: string;
      url?: string;
    }>;
  };

  const results = Array.isArray(lastItem?.results)
    ? lastItem.results
        .map((item) => ({
          snippet: String(item.description ?? "").trim(),
          title: String(item.title ?? "").trim(),
          url: String(item.url ?? "").trim(),
        }))
        .filter((item) => item.url.length > 0)
        .slice(0, maxResults)
    : [];

  return {
    query,
    results,
  };
}
