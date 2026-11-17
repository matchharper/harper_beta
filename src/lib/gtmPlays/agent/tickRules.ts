/**
 * #5 dispatcher tick rules (agent/run.server.ts): the tick's time slices, the send-queue throttle, when a written
 * mail expires, the last check before sending, retries of a step that failed for a passing reason, and the run's
 * error line. Pure, so the run and the tests agree.
 *
 * A tick does, in order: reactions → mails stuck mid-send → expired drafts → sending (first mails, follow-ups) →
 * email lookups started earlier → the run's new people → a search. Sending comes before any paid step, so a slow or
 * failing search or posting pick never holds back mails, follow-ups or reactions; a search runs only when the run has
 * no new people left to handle and the tick still has time for it.
 */
import type { AgentEvent, AgentPosting } from "./types";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

// ---------------------------------------------------------------------------------------------------------------
// Time slices (from the dispatch request's start; the route's limit is 300 s, the reply read takes up to ~30 s first)

/** The dispatch route's limit (route.ts maxDuration). */
export const TICK_LIMIT_MS = 300_000;
/** No new mail after this (one provider call takes seconds; what it sent must still be recorded). */
export const SEND_UNTIL_MS = 240_000;
/** No new person after this (picking postings takes 30-90 s). */
export const PEOPLE_UNTIL_MS = 170_000;
/** A search runs at most this long (partial results are kept) … */
export const SEARCH_MAX_MS = 150_000;
/** … ends by this point of the tick (its people are written after) … */
export const SEARCH_END_BY_MS = 255_000;
/** … and is not started with less than this left. */
export const SEARCH_MIN_MS = 60_000;
/** One provider call (Resend) at most. */
export const SEND_CALL_TIMEOUT_MS = 20_000;

/** Whether a new mail may still go out (`startedAt`: when the dispatch request started). */
export function maySendNow(startedAt: number, now: number): boolean {
  return now - startedAt < SEND_UNTIL_MS;
}

/** Whether a new person may still be started. */
export function mayStartPerson(startedAt: number, now: number): boolean {
  return now - startedAt < PEOPLE_UNTIL_MS;
}

/** When a search started now must stop, or null when the tick has no time left for one. */
export function searchDeadline(startedAt: number, now: number): number | null {
  const end = Math.min(now + SEARCH_MAX_MS, startedAt + SEARCH_END_BY_MS);
  return end - now >= SEARCH_MIN_MS ? end : null;
}

/** How long one provider call may take now: SEND_CALL_TIMEOUT_MS, less near the end of the tick (at least 1 s). */
export function sendCallTimeoutMs(startedAt: number, now: number): number {
  return Math.max(1_000, Math.min(SEND_CALL_TIMEOUT_MS, startedAt + TICK_LIMIT_MS - 30_000 - now));
}

// ---------------------------------------------------------------------------------------------------------------
// Throttle and draft expiry

/** New people are not handled (no lookup, posting pick or writing) while the written mails cover this many days. */
export const QUEUE_DAYS = 3;

/**
 * Whether the mails written and waiting already cover QUEUE_DAYS of the daily cap (the money for more people would go
 * to mails that wait days, go stale and expire). A cap of 0 sends nothing, so any queue is full.
 */
export function sendQueueFull(approved: number, dailyMailCap: number): boolean {
  return approved >= Math.max(0, Math.floor(dailyMailCap)) * QUEUE_DAYS;
}

/** A written mail not sent within this many days is not sent at all (the signal and the postings are old by then). */
export const DRAFT_MAX_AGE_DAYS = 5;
export const DRAFT_EXPIRED_REASON = `보낼 때를 놓쳐 만료됐어요 (쓴 지 ${DRAFT_MAX_AGE_DAYS}일 넘음)`;

/** When the person's mail was written (the drafted line), else `fallback` (the row's last change). */
export function draftedAt(events: readonly Pick<AgentEvent, "kind" | "at">[], fallback: string | null): string | null {
  const line = [...events].reverse().find((event) => event.kind === "drafted" || event.kind === "approved");
  return line?.at ?? fallback;
}

export function draftExpired(writtenAt: string | null | undefined, now: Date): boolean {
  const at = Date.parse(String(writtenAt ?? ""));
  return Number.isFinite(at) && now.getTime() - at > DRAFT_MAX_AGE_DAYS * DAY_MS;
}

/** A mail proposes at least this many postings. */
export const MIN_POSTINGS = 2;

/**
 * The postings still open right before sending: those whose Role closed (`closedRoleIds`) are dropped; a posting known
 * by URL alone cannot be checked and stays. `skip` when fewer than MIN_POSTINGS are left.
 */
export function stillOpenPostings(postings: readonly AgentPosting[], closedRoleIds: ReadonlySet<string>): {
  kept: AgentPosting[]; dropped: AgentPosting[]; skip: boolean;
} {
  const kept = postings.filter((posting) => !posting.roleId || !closedRoleIds.has(posting.roleId));
  const dropped = postings.filter((posting) => !kept.includes(posting));
  return { kept, dropped, skip: kept.length < MIN_POSTINGS };
}

/**
 * The draft's body with its postings list swapped for the kept ones (the composer ends the body with the list), or
 * null when the body does not end with the old list (it cannot be rebuilt safely).
 */
export function bodyWithPostings(body: string, oldList: string, newList: string): string | null {
  const trimmed = body.trimEnd();
  if (!oldList || !trimmed.endsWith(oldList)) return null;
  return `${trimmed.slice(0, trimmed.length - oldList.length).trimEnd()}\n\n${newList}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Searches and retries

/** A source's search is tried at most this many times in a run (a killed or failed try counts). */
export const SEARCH_MAX_ATTEMPTS = 2;

/**
 * What to do with a source in a run: done (searched, or given up), give_up (tried SEARCH_MAX_ATTEMPTS times without
 * finishing), or try. Reads the run's counts: searched_<id>, search_attempts_<id>.
 */
export function searchStep(counts: Readonly<Record<string, number>>, source: string): "done" | "give_up" | "try" {
  if (Number(counts[`searched_${source}`] ?? 0) > 0) return "done";
  return Number(counts[`search_attempts_${source}`] ?? 0) >= SEARCH_MAX_ATTEMPTS ? "give_up" : "try";
}

/** A step that failed for a passing reason (an email lookup that did not start, a model error) is tried this often. */
export const STEP_MAX_ATTEMPTS = 3;

/** After the n-th failed try (1-based): wait 5, then 20 minutes; null when it is given up. */
export function retryDelayMs(attempt: number): number | null {
  if (attempt >= STEP_MAX_ATTEMPTS) return null;
  return 5 * MINUTE_MS * 4 ** Math.max(0, attempt - 1);
}

// ---------------------------------------------------------------------------------------------------------------
// The run's error line

/** Set by the next tick when the last one on the run never ended (killed at the time limit or crashed). */
export const KILLED_TICK_NOTE = "지난 실행이 끝까지 가지 못하고 멈췄어요 (시간 초과 등)";

/**
 * The run's error after a tick: the tick's problems joined (kept until a tick without any), or null with clear when
 * the tick went through without one. A tick that started after a killed one never clears (Ops sees it first).
 */
export function runErrorAfterTick(problems: readonly string[]): { error: string | null; clear: boolean } {
  const lines = [...new Set(problems.map((line) => line.trim()).filter(Boolean))];
  if (!lines.length) return { error: null, clear: true };
  return { error: lines.join(" · ").slice(0, 1_000), clear: false };
}
