/**
 * #5 spend log (gtm_agent_spend): every paid step writes what it cost when it costs it, keyed by the Korea-time day
 * the money was spent. The daily cap (checked before every paid call) and /ops #5 "오늘 비용" / "최근 N일 비용" read
 * the same rows, so the screen and the cap agree whatever run the step belonged to. Pure.
 */
import { kstClock } from "./people";

/** search: 사람 찾기 (Exa and the model); lookup: an email lookup (its estimate when it starts, the rest when it ends);
 * match: picking postings; review: grading the picked postings apart (agent/review.ts); compose: writing a first
 * mail; followup: writing a follow-up. */
export type AgentSpendStep = "search" | "lookup" | "match" | "review" | "compose" | "followup";

/** The Korea-time day (YYYY-MM-DD) money spent at `at` counts on. */
export function spendDay(at: Date): string {
  return kstClock(at).day;
}

/** What is left of the day's cap (0 at least). */
export function capLeftUsd(spentUsd: number, capUsd: number): number {
  return Math.max(0, round(capUsd - spentUsd));
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
