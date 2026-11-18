/**
 * #5 사람 찾기 on Hacker News, through its free API (hn.algolia.com) instead of the web search: the monthly "Ask HN:
 * Who wants to be hired?" thread, its top-level comments from any country (Shaun 11/18), each judged as its own page
 * (https://news.ycombinator.com/item?id=<comment id>). Pure: reading the API's answers, so tests can check them;
 * signals.hn.server.ts fetches and judges.
 *
 * Who a commenter is comes from what they wrote (an email or their own site: identifyPerson, HN is a shared-pages
 * source). A comment is judged once: the pages a search judged are remembered (RECENT_MEMORY_DAYS), so a thread is
 * not judged again each day, while comments added to it later are.
 */
import { SIGNAL_MAX_AGE_DAYS } from "./people";

export const HN_API = "https://hn.algolia.com/api/v1";
/** The whoishiring account's newest stories (three a month: who is hiring, who wants to be hired, freelancers). */
export const HN_THREADS_URL = `${HN_API}/search_by_date?tags=story,author_whoishiring&hitsPerPage=20`;
export const hnItemApiUrl = (id: string) => `${HN_API}/items/${encodeURIComponent(id)}`;
export const hnPageUrl = (id: string) => `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`;
/** The query family name on the log. */
export const HN_GROUP = "who wants to be hired";
/** Comments one judge call reads. */
export const HN_JUDGE_BATCH = 8;
/** Threads read at most (this month's and last month's: late comments in last month's can still be fresh). */
export const HN_MAX_THREADS = 2;

const DAY_MS = 86_400_000;
const THREAD_TITLE = /who wants to be hired/i;
/**
 * Only comments that mention Korea (true until 11/18). Shaun 11/18: every country, since the postings decide later
 * whether there is a fit (the matcher and the separate grader read location and remote work; with fewer than 2
 * fitting postings no mail goes out).
 */
export const HN_KOREA_ONLY = false;
/** Korea in a comment: the country, its cities, its time zone (UTC+9 is Japan's too: the judge decides). */
const KOREA = /\b(south\s+)?korea(n)?\b|\bseoul\b|\bbusan\b|\bpangyo\b|\bincheon\b|\bdaejeon\b|\bkst\b|\b(utc|gmt)\s*\+\s*0?9(:00)?\b|한국|대한민국|서울|부산|판교/i;

export type HnThread = { id: string; title: string; createdAt: string };
export type HnComment = { id: string; createdAt: string | null; text: string };

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const text = (value: unknown) => (typeof value === "string" ? value : "");
const idOf = (value: unknown) => (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value)) ? String(value) : "");

/**
 * The "Who wants to be hired?" threads whose comments may still be within `maxAgeDays` (created at most
 * maxAgeDays + 31 days ago), newest first, at most HN_MAX_THREADS.
 */
export function hnThreads(response: unknown, now: Date, maxAgeDays = SIGNAL_MAX_AGE_DAYS): HnThread[] {
  const hits = Array.isArray(record(response).hits) ? record(response).hits as unknown[] : [];
  const oldest = now.getTime() - (maxAgeDays + 31) * DAY_MS;
  return hits.map(record)
    .map((hit) => ({ id: idOf(hit.objectID ?? hit.story_id), title: text(hit.title).trim(), createdAt: text(hit.created_at) }))
    .filter((hit) => hit.id && THREAD_TITLE.test(hit.title) && Date.parse(hit.createdAt) >= oldest)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, HN_MAX_THREADS);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

/** A comment's HTML as plain text: paragraphs as line breaks, a link as its full address, entities decoded. */
export function hnCommentText(html: string | null | undefined): string {
  const decode = (value: string) => value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
  return String(html ?? "")
    // HN shortens a long link's text ("https://example.com/a/b/c..."): the address is in href.
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>[\s\S]*?<\/a>/gi, (_, href: string) => decode(href))
    .replace(/<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .split("\n").map((line) => decode(line).replace(/[ \t]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function mentionsKorea(value: string): boolean {
  return KOREA.test(value);
}

/**
 * A thread item's top-level comments: how many there are, how many mention Korea, and those written within
 * `maxAgeDays` (all of them, or with `koreaOnly` only those that mention Korea), newest first (no country comes first:
 * Shaun 11/18), so a
 * small budget reaches the Korea ones. Deleted or dead comments (no text) are left out.
 */
export function hnKoreaComments(
  item: unknown, now: Date, maxAgeDays = SIGNAL_MAX_AGE_DAYS, koreaOnly = HN_KOREA_ONLY,
): { topLevel: number; korea: number; fresh: HnComment[] } {
  const children = Array.isArray(record(item).children) ? record(item).children as unknown[] : [];
  const comments = children.map(record)
    .filter((child) => text(child.type || "comment") === "comment")
    .map((child) => ({ id: idOf(child.id), createdAt: text(child.created_at) || null, text: hnCommentText(text(child.text)) }))
    .filter((comment) => comment.id && comment.text);
  const korea = comments.filter((comment) => mentionsKorea(comment.text));
  const since = now.getTime() - maxAgeDays * DAY_MS;
  const fresh = (koreaOnly ? korea : comments).filter((comment) => comment.createdAt !== null && Date.parse(comment.createdAt) >= since)
    .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
  return { topLevel: comments.length, korea: korea.length, fresh };
}

/** A comment as one page for the judge: its own URL, the thread's title first (it says they are looking), its date. */
export function hnJudgeInput(thread: HnThread, comment: HnComment) {
  return { url: hnPageUrl(comment.id), title: thread.title, text: comment.text, publishedDate: comment.createdAt };
}
