/**
 * #5 spend log (gtm_agent_spend): every paid step writes what it cost when it costs it, keyed by the Korea-time day
 * the money was spent. The daily cap (checked before every paid call) and /ops #5 "오늘 비용" / "최근 N일 비용" read
 * the same rows, so the screen and the cap agree whatever run the step belonged to. Pure.
 */
import { kstClock } from "./people";

/** search: 사람 찾기 (Exa and the model); profile: reading the person's own pages once before matching (an
 * applicant's public LinkedIn profile, a searched person's linked pages and one profile search: agent/profileRead.ts);
 * lookup: an email lookup (its estimate when it starts, the rest when it ends); match: picking postings; review:
 * grading the picked postings apart (agent/review.ts); compose: writing a first mail; followup: a follow-up's search for
 * new postings (the same matcher, grader and mail lines: agent/followup.ts; the follow-up's words are fixed copy). */
/** reply: Ashley deciding on and writing a reply, and a re-search for it (agent/ashleyAgent.ts). Not under the daily cap:
 * Ashley's replies have none (Shaun 11/22; store.server.ts agentCostToday leaves them out). */
export type AgentSpendStep = "search" | "profile" | "lookup" | "match" | "review" | "compose" | "followup" | "reply";

/** The Korea-time day (YYYY-MM-DD) money spent at `at` counts on. */
export function spendDay(at: Date): string {
  return kstClock(at).day;
}

/** What is left of the day's cap (0 at least). */
export function capLeftUsd(spentUsd: number, capUsd: number): number {
  return Math.max(0, round(capUsd - spentUsd));
}

/**
 * Kept from the day's cap for follow-ups (11/18 risk review: new people are handled around the clock, so a big
 * applicant file could use the whole day's money before 09:00 and no follow-up could be written that day): new
 * people (profile reads, posting picks, lookups, first mails) and searches stop this much below the cap. At most a
 * tenth of the cap. One follow-up costs about $0.02, so $5 covers a few hundred.
 */
export const FOLLOWUP_RESERVE_USD = 5;

/** The day's cap for everything but follow-ups. */
export function newWorkCapUsd(capUsd: number): number {
  const cap = Math.max(0, Number(capUsd) || 0);
  return Math.max(0, cap - Math.min(FOLLOWUP_RESERVE_USD, cap * 0.1));
}

/** Whether a paid call expected to cost `nextUsd` still fits under the day's cap (nothing fits at the cap). */
export function fitsUnderCap(spentUsd: number, capUsd: number, nextUsd = 0): boolean {
  return spentUsd < capUsd && spentUsd + Math.max(0, nextUsd) <= capUsd + 1e-9;
}

/**
 * When an email lookup ends: what to add to the log (its real cost less what was logged when it started; negative
 * when it cost less). The person and the run carry the real cost.
 */
export function lookupSettleUsd(actualUsd: number, reservedUsd: number | null | undefined): number {
  return round((Number.isFinite(actualUsd) ? actualUsd : 0) - (Number.isFinite(reservedUsd) ? Number(reservedUsd) : 0));
}

function round(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
