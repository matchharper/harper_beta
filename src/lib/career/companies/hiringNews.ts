import { randomUUID } from "node:crypto";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { runWebSearch, type WebSearchResponse } from "@/lib/tools/webSearch";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import type { FollowCompany } from "./inventory";

export type HiringNews = {
  evidence: WebSearchResponse | null;
  checked_at: string | null;
  error: string | null;
  lease_expires_at: string | null;
};
export const hiringCacheKey = (company: FollowCompany) =>
  company.companyDbId !== null
    ? `company:${company.companyDbId}`
    : `workspace:${company.workspaceId}`;
// Shared public evidence freshness, independent of each user's contact cadence.
export const HIRING_SEARCH_TTL_MS = 72 * 60 * 60 * 1000;
export function hiringSearchQuery(company: FollowCompany, now = new Date()) {
  return `${company.researchName} ${company.researchWebsite ?? ""} hiring recruitment announcements 채용 공채 수시채용 대규모 채용. Find dated announcements of new or expanded recruitment campaigns in the past month, as of ${formatLlmDateTime(now).slice(0, 10)}. Prefer the company's official hiring site. Exclude general company, funding, product and business news without an actual hiring announcement.`;
}
export async function readHiringNews(
  admin: TalentAdminClient,
  company: FollowCompany
): Promise<HiringNews | null> {
  const { data, error } = await (admin.from as any)(
    "company_hiring_search_cache"
  )
    .select("evidence,checked_at,error,lease_expires_at")
    .eq("cache_key", hiringCacheKey(company))
    .maybeSingle();
  if (error) throw error;
  return data;
}
export async function refreshHiringNews(args: {
  admin: TalentAdminClient;
  company: FollowCompany;
  search?: typeof runWebSearch;
}) {
  const key = hiringCacheKey(args.company),
    token = randomUUID();
  const claimed = await (args.admin.rpc as any)("claim_company_hiring_search", {
    p_key: key,
    p_token: token,
  });
  if (claimed.error) throw claimed.error;
  if (!claimed.data) return readHiringNews(args.admin, args.company);
  const query = hiringSearchQuery(args.company);
  let patch: Record<string, unknown>;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Exa's search client has no AbortSignal contract. Bound this invocation;
    // an overdue response cannot overwrite the cache after timeout/lease loss.
    const evidence = await Promise.race([
      (args.search ?? runWebSearch)({ admin: args.admin, query }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Hiring search timed out")),
          45_000
        );
      }),
    ]);
    patch = {
      evidence,
      checked_at: new Date().toISOString(),
      error: null,
      refresh_after: new Date(Date.now() + HIRING_SEARCH_TTL_MS).toISOString(),
    };
  } catch (error) {
    // Preserve last successful evidence. A failure is not an empty search and
    // isn't retried for every follower. The next due execution can try after 1h.
    patch = {
      error: error instanceof Error ? error.message : String(error),
      refresh_after: new Date(Date.now() + 3600_000).toISOString(),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
  const saved = await (args.admin.from as any)("company_hiring_search_cache")
    .update({ ...patch, lease_token: null, lease_expires_at: null })
    .eq("cache_key", key)
    .eq("lease_token", token);
  if (saved.error) throw saved.error;
  return readHiringNews(args.admin, args.company);
}
export function formatHiringNews(news: HiringNews | null) {
  if (!news?.evidence)
    return news?.error
      ? `Hiring research unavailable: ${news.error}`
      : "Hiring research is not yet available.";
  return [
    `Shared hiring search checked ${formatLlmDateTime(news.checked_at)} Asia/Seoul. Search evidence, not verified announcements; open a source if needed.`,
    news.error
      ? `Latest refresh failed; the following is older evidence: ${news.error}`
      : "",
    ...news.evidence.results.map(
      (item) =>
        `${item.title}; published ${item.publishedDate ? formatLlmDateTime(item.publishedDate).slice(0, 10) : "unknown"}\n${item.url}\n${item.highlights.join("\n")}`
    ),
    !news.evidence.results.length
      ? "This hiring search returned no sources."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
