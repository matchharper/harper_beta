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

/**
 * New people are not handled (no lookup, posting pick or writing) while the written mails cover this many days. Two:
 * a Friday's full queue still goes out on Monday and Tuesday, well before DRAFT_MAX_AGE_DAYS (three days' worth left
 * paid-for drafts to expire after a weekend, 11/18 risk review).
 */
export const QUEUE_DAYS = 2;

/**
 * Whether the mails written and waiting already cover QUEUE_DAYS of the daily cap (the money for more people would go
 * to mails that wait days, go stale and expire). A cap of 0 sends nothing, so any queue is full.
 */
export function sendQueueFull(approved: number, dailyMailCap: number): boolean {
  return approved >= Math.max(0, Math.floor(dailyMailCap)) * QUEUE_DAYS;
}

/**
 * Who may be worked on (looked up, matched, written) while mails wait (Shaun 11/23): the count is the written mails
 * and the follow-ups due within QUEUE_DAYS. Over the cap's QUEUE_DAYS worth, people without a date (the applicant
 * file, the DB) wait; people with a date (posts, profiles: they go out first) wait only when those alone fill it.
 */
export function workPaused(queue: { all: number; dated: number }, dailyMailCap: number): { undated: boolean; dated: boolean } {
  return { undated: sendQueueFull(queue.all, dailyMailCap), dated: sendQueueFull(queue.dated, dailyMailCap) };
}

/**
 * A written mail not sent within this many days is not sent as written (the postings are old by then): the person is
 * worked on again from the start once (postings picked and the mail written afresh, Shaun 11/23: nobody is lost to
 * waiting), and skipped the second time.
 */
export const DRAFT_MAX_AGE_DAYS = 5;
export const DRAFT_EXPIRED_REASON = `보낼 때를 놓쳐 만료됐어요 (쓴 지 ${DRAFT_MAX_AGE_DAYS}일 넘음)`;
export const DRAFT_REDO_NOTE = `쓴 지 ${DRAFT_MAX_AGE_DAYS}일이 넘어 공고를 다시 고르고 메일을 다시 써요`;

/** Whether an expired mail is written again (the first time) or the person is skipped (it expired before). */
export function redoExpiredDraft(events: readonly Pick<AgentEvent, "kind">[]): boolean {
  return !events.some((event) => event.kind === "expired");
}

/** When the person's mail was written (the drafted line), else `fallback` (the row's last change). */
export function draftedAt(events: readonly Pick<AgentEvent, "kind" | "at">[], fallback: string | null): string | null {
  const line = [...events].reverse().find((event) => event.kind === "drafted" || event.kind === "approved");
  return line?.at ?? fallback;
}

export function draftExpired(writtenAt: string | null | undefined, now: Date): boolean {
  const at = Date.parse(String(writtenAt ?? ""));
  return Number.isFinite(at) && now.getTime() - at > DRAFT_MAX_AGE_DAYS * DAY_MS;
}

/** A mail proposes at least this many postings (match.ts MIN_FITS). */
export const MIN_POSTINGS = 1;

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
 * A day's search budget (all its searches, split by the agent: budget.ts): at most this share of what is left of
 * today's money, and never more than SIGNAL_BUDGET_MAX ($2.4: what the fixed shares added up to before the split,
 * LinkedIn $1.2 + open web $0.8 + Hacker News $0.4).
 */
export const SIGNAL_BUDGET_SHARE = 0.5;
export const SIGNAL_BUDGET_MAX = 2.4;
/** What one search may keep at most; the budget and the tuning bound it long before (no per-source headcount). */
export const SIGNAL_MAX_PEOPLE = 50;
/**
 * What to do with a source in a run: done (searched, or given up), give_up (tried SEARCH_MAX_ATTEMPTS times without
 * finishing), or try. Reads the run's counts: searched_<id>, search_attempts_<id>.
 */
export function searchStep(counts: Readonly<Record<string, number>>, source: string): "done" | "give_up" | "try" {
  if (Number(counts[`searched_${source}`] ?? 0) > 0) return "done";
  return Number(counts[`search_attempts_${source}`] ?? 0) >= SEARCH_MAX_ATTEMPTS ? "give_up" : "try";
}

/**
 * Whether a run still has a search to do: one of `sources` (the turned-on sources, and the open web when its share is
 * above 0) not done yet. One given up counts as left: the next tick records it as done.
 */
export function searchesLeft(counts: Readonly<Record<string, number>>, sources: readonly string[]): boolean {
  return sources.some((source) => searchStep(counts, source) !== "done");
}

/**
 * A step that failed for a passing reason (an email lookup that did not start, a model or grader error) is tried this
 * often, the waits growing to a day, so a provider outage of a day loses nobody (11/18 risk review: with 5 and 20
 * minutes, an hour's outage turned every person it touched into a failure after the posting pick was already paid for).
 */
export const STEP_MAX_ATTEMPTS = 5;
const RETRY_WAITS_MS = [5 * MINUTE_MS, 60 * MINUTE_MS, 6 * 60 * MINUTE_MS, 24 * 60 * MINUTE_MS];

/** After the n-th failed try (1-based): wait 5 minutes, 1 hour, 6 hours, 24 hours; null when it is given up. */
export function retryDelayMs(attempt: number): number | null {
  if (attempt >= STEP_MAX_ATTEMPTS) return null;
  return RETRY_WAITS_MS[Math.max(0, Math.min(RETRY_WAITS_MS.length - 1, attempt - 1))];
}

/** A wait in plain words for the person's log: "5분", "2시간". */
export function waitLabel(ms: number): string {
  const minutes = Math.round(ms / MINUTE_MS);
  return minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60}시간` : `${minutes}분`;
}

// ---------------------------------------------------------------------------------------------------------------
// Follow-ups

/**
 * A follow-up more than this many days past its due day is not sent (the person ends): it says "지난주에" and its
 * postings are weeks older than when it was due (11/18 risk review: when first mails fill the day's cap, follow-ups
 * only get what is left and can go out weeks late).
 */
export const FOLLOWUP_MAX_LATE_DAYS = 7;
export const FOLLOWUP_LATE_NOTE = `후속 메일 때를 ${FOLLOWUP_MAX_LATE_DAYS}일 넘게 놓쳐 보내지 않고 끝냈어요`;

export function followupTooLate(dueAt: string | null | undefined, now: Date): boolean {
  const at = Date.parse(String(dueAt ?? ""));
  return Number.isFinite(at) && now.getTime() - at > FOLLOWUP_MAX_LATE_DAYS * DAY_MS;
}

// ---------------------------------------------------------------------------------------------------------------
// The automatic brake

/** Over the last BRAKE_DAYS days of the agent's mails (counted from when it was last turned on): */
export const BRAKE_DAYS = 7;
/** hard bounces of at least this share, once at least BRAKE_MIN_SENT mails went out, */
export const BRAKE_BOUNCE_RATE = 0.03;
export const BRAKE_MIN_SENT = 50;
/** or this many spam complaints, turn the agent off (11/18 risk review: one bad week can burn the sending domain). */
export const BRAKE_COMPLAINTS = 2;

/**
 * Why the agent turns itself off, or null. One rule (Shaun 11/23), measured on all mails (the agent turns off) and on
 * each channel's own mails (`channel`: its label; only that channel turns off, the rest goes on).
 */
export function brakeReason(stats: { sent: number; bounced: number; complained: number }, channel: string | null = null): string | null {
  const who = channel ? "이 채널을" : "에이전트를";
  const where = channel ? `${channel}: ` : "";
  const again = channel ? "원인을 확인한 뒤 /ops에서 다시 켜 주세요" : "원인을 확인한 뒤 다시 켜 주세요";
  if (stats.complained >= BRAKE_COMPLAINTS) {
    return `${where}최근 ${BRAKE_DAYS}일 스팸 신고가 ${stats.complained}건이라 ${who} 껐어요. ${again}`;
  }
  if (stats.sent >= BRAKE_MIN_SENT && stats.bounced / stats.sent >= BRAKE_BOUNCE_RATE) {
    const share = Math.round((stats.bounced / stats.sent) * 1000) / 10;
    return `${where}최근 ${BRAKE_DAYS}일 반송이 ${stats.bounced}/${stats.sent}통(${share}%)이라 ${who} 껐어요. ${again}`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// One sender at a time

/**
 * Sending is leased for this long (two ticks on different runs must never send from the one queue at once: both
 * would read the same approved people and mail them twice). Under the route's limit, so a killed tick frees it.
 */
export const SEND_LEASE_MS = 290_000;

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

// ---------------------------------------------------------------------------------------------------------------
// One person's next step

/**
 * What a person the tick handles does next (Shaun 11/18, item 8): found → the exclusion rules (checked first) → the
 * free contact paths (an address on their page or in the file, their own pages: 프로필 읽기) → the posting pick with its
 * reasons and the grader's gate → only for someone with 2+ fitting postings and still no address the agent may mail,
 * the paid email lookup → the mail. Nobody with fewer than 2 fits gets a paid lookup (no_fit as before).
 *   profile       read their own pages, once (found)
 *   no_address    no address the agent may mail and nothing to look one up from, or an earlier lookup ended without
 *                 one: excluded with why, no pick paid for
 *   pick          pick postings (found)
 *   write         matched, with an address the agent may mail: write the mail
 *   lookup        matched (2+ fits), no address yet, a page to start from: start the paid lookup (the person stays
 *                 matched while it runs: 처리 중 · "맞는 공고가 있어 이메일을 찾는 중")
 *   wait          a lookup is running (looked at on later ticks)
 *   lookup_ended  matched, the lookup ended (or never started) without an address: one treg call when it ended
 *                 (run.server.ts tryVendorLookup), then excluded with why when that gives none either
 */
export type PersonStep = "profile" | "no_address" | "pick" | "write" | "lookup" | "wait" | "lookup_ended";

export function personStep(args: {
  status: "found" | "matched";
  /** The person has an address the agent may mail (mailRules.ts agentMailableAddress). */
  mailable: boolean;
  lookupState: "running" | "done" | null;
  /** A profile or own link to start a lookup from, and no lookup yet (emailLookup.ts needsEmailLookup). */
  lookupPossible: boolean;
  /** Their own pages still to read (profileRead.ts needsProfileRead). */
  profileNeeded: boolean;
}): PersonStep {
  if (args.lookupState === "running") return "wait";
  if (args.status === "matched") {
    if (args.mailable) return "write";
    return args.lookupPossible ? "lookup" : "lookup_ended";
  }
  if (args.profileNeeded) return "profile";
  if (!args.mailable && !args.lookupPossible) return "no_address";
  return "pick";
}
