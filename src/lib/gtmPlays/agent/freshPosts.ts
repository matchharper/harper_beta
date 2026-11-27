/**
 * 링크드인 최신 글 (treg, Shaun 11/27 "새 출처로 붙이기"): the rules of the LinkedIn post search through treg
 * (harvestapi.linkedin.post.search), pure so tests can read them. The search itself is in signals.server.ts; the people
 * it finds go through the same judge, keys and dedup as the web search's LinkedIn people (signals.ts identifyPerson).
 *
 * One call: GET with the query parameters only (treg's catalog: declared parameters once each, no body), sorted by
 * date, inside LinkedIn's own posted-within filter. treg answers with the provider's own body: `elements` (each post's
 * linkedinUrl, content, author, postedAt), or a status/error in the body even on HTTP 200.
 */
import { TREG_POST_SEARCH_USD, authorProfileUrl } from "./signals";

export const FRESH_POST_TOOL = "harvestapi.linkedin.post.search";
/** What one call may cost at most (treg's X-Treg-Route-Max-Cost): the catalog says $0.004, it came to $0.002 on 11/27. */
export const FRESH_POST_MAX_USD = 0.01;
/** Used when treg's answer carries no cost header (the catalog price). */
export const FRESH_POST_COST_USD = TREG_POST_SEARCH_USD;
/** Posts in one page of LinkedIn's search. */
export const FRESH_POST_PAGE = 50;

/** LinkedIn's posted-within filter for a window reaching `oldestDays` back. */
export function postedLimit(oldestDays: number): "24h" | "week" | "month" {
  return oldestDays <= 1 ? "24h" : oldestDays <= 7 ? "week" : "month";
}

/** The call's URL: the tool under treg's call endpoint, with the search's parameters. */
export function freshPostSearchUrl(base: string, query: string, oldestDays: number): string {
  const params = new URLSearchParams({ search: query, sortBy: "date", postedLimit: postedLimit(oldestDays), page: "1" });
  return `${base}${FRESH_POST_TOOL}?${params.toString()}`;
}

/** One post as the judge reads it (the web search's result shape), with whose it is. */
export type FreshPost = { url: string; title: string; text: string; publishedDate: string | null; author: string };

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const textOf = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

/** When the post went up, as an ISO time, from postedAt's date or its timestamp (milliseconds), or null. */
function postedAtOf(value: unknown): string | null {
  const posted = asRecord(value);
  const fromDate = typeof posted.date === "string" ? Date.parse(posted.date) : Number.NaN;
  const stamp = Number(posted.timestamp);
  const at = Number.isFinite(fromDate) ? fromDate : Number.isFinite(stamp) && stamp > 0 ? stamp : Number.NaN;
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

/**
 * The author's LinkedIn profile (linkedin.com/in/<handle>, the same form the web search's pages give), or null for a
 * company page or an author without a profile.
 */
export function freshPostAuthor(value: unknown): string | null {
  const author = asRecord(value);
  if (textOf(author.type) && textOf(author.type).toLowerCase() !== "profile") return null;
  const fromUrl = typeof author.linkedinUrl === "string" ? authorProfileUrl(author.linkedinUrl) : null;
  if (fromUrl?.includes("linkedin.com/in/")) return fromUrl;
  const handle = textOf(author.publicIdentifier);
  return handle && /^[^/?#\s]+$/.test(handle) ? authorProfileUrl(`https://www.linkedin.com/in/${handle}`) : null;
}

/** The post's own page: its linkedinUrl, or the activity's feed page from its id. */
function postUrlOf(item: Record<string, unknown>): string | null {
  const url = textOf(item.linkedinUrl);
  if (/^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(url)) return url;
  const id = textOf(item.id ?? item.entityId);
  return /^\d{10,25}$/.test(id) ? `https://www.linkedin.com/feed/update/urn:li:activity:${id}/` : null;
}

export class FreshPostSearchError extends Error {}

/**
 * The posts in treg's answer, newest first as LinkedIn gave them, at most `limit`: a person's posts with text only
 * (a company page's post, or one without an author profile, is no job seeker's). Throws FreshPostSearchError when the
 * body says the search failed.
 */
export function readFreshPosts(body: unknown, limit: number): FreshPost[] {
  const record = asRecord(body);
  const status = textOf(record.status).toLowerCase();
  const error = record.error ? textOf(typeof record.error === "string" ? record.error : asRecord(record.error).message) || "error" : "";
  const elements = Array.isArray(record.elements) ? record.elements : Array.isArray(record.element) ? record.element : null;
  if (!elements) {
    throw new FreshPostSearchError(`treg 링크드인 글 검색이 결과를 주지 않았어요${error ? ` · ${error.slice(0, 160)}` : status ? ` · ${status}` : ""}`);
  }
  const posts: FreshPost[] = [];
  for (const raw of elements) {
    if (posts.length >= limit) break;
    const item = asRecord(raw);
    const url = postUrlOf(item);
    const author = freshPostAuthor(item.author);
    const content = textOf(item.content ?? item.text);
    if (!url || !author || !content) continue;
    const who = asRecord(item.author);
    const name = textOf(who.name);
    const headline = textOf(who.info ?? who.headline);
    posts.push({
      url, author, publishedDate: postedAtOf(item.postedAt),
      title: [name, headline].filter(Boolean).join(" · "),
      // Whose post it is, then the post: the judge reads both (signals.ts judgeBatch).
      text: `Author: ${[name || "unknown", headline].filter(Boolean).join(", ")} (${author})\n${content}`,
    });
  }
  return posts;
}

/** What treg says one call cost (X-Treg-Cost-Micro), in dollars, or the catalog price when it says nothing. */
export function freshPostCost(costMicro: string | null | undefined): number {
  const micro = Number(costMicro);
  return costMicro != null && costMicro !== "" && Number.isFinite(micro) && micro >= 0 ? micro / 1_000_000 : FRESH_POST_COST_USD;
}
