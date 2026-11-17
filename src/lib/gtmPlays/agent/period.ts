/**
 * #5 수치 and 로그 period (Shaun 11/17: 최근 7·30·90일 or 직접 고르기): Korea-time calendar days, both ends included,
 * so the numbers, their log and the spend log (keyed by the KST day the money was spent) all cover the same days.
 * Pure: the API, the screen and the tests share it.
 */

/** What the screen sends: a preset (최근 N일) or a custom range (YYYY-MM-DD, KST). */
export type AgentPeriodInput = { days?: number | null; from?: string | null; to?: string | null };

export type AgentPeriod = {
  /** First and last KST day, YYYY-MM-DD, both included. */
  from: string;
  to: string;
  /** The preset's N, null for a custom range. */
  days: number | null;
  /** As the screen writes it: "최근 30일" or "11. 1. ~ 11. 17." (with the year when it is not this year). */
  label: string;
};

export const AGENT_PERIOD_PRESETS = [7, 30, 90] as const;
export const AGENT_PERIOD_DEFAULT_DAYS = 30;
export const AGENT_PERIOD_MAX_DAYS = 365;

const DAY_MS = 86_400_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The KST calendar day of `at`, YYYY-MM-DD (the screen's "today"). */
export function kstDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** A YYYY-MM-DD that is a real calendar date, or null. */
export function periodDate(value: unknown): string | null {
  const match = typeof value === "string" ? DATE.exec(value.trim()) : null;
  if (!match) return null;
  const at = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === match[0] ? match[0] : null;
}

/** The day `n` days after `day` (YYYY-MM-DD; n may be negative). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Days from `from` to `to`, both included. */
export function periodLength(from: string, to: string): number {
  const at = (day: string) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((at(to) - at(from)) / DAY_MS) + 1;
}

/** "11. 17." (or "2025. 12. 1." when the year is not `thisYear`), as the other ops dates read. */
export function periodDayLabel(day: string, thisYear: string): string {
  const [y, m, d] = day.split("-");
  return `${y === thisYear ? "" : `${y}. `}${Number(m)}. ${Number(d)}.`;
}

/**
 * The period as KST days. A custom range is used when both ends are real dates: swapped when reversed, the end
 * kept at today at the latest, and cut to the last 365 days. Otherwise the preset (1..365 days, 30 by default),
 * ending today.
 */
export function resolveAgentPeriod(input: AgentPeriodInput | null | undefined, today: string): AgentPeriod {
  const thisYear = today.slice(0, 4);
  let from = periodDate(input?.from);
  let to = periodDate(input?.to);
  if (from && to) {
    if (from > to) [from, to] = [to, from];
    if (to > today) to = today;
    if (from > to) from = to;
    if (periodLength(from, to) > AGENT_PERIOD_MAX_DAYS) from = addDays(to, -(AGENT_PERIOD_MAX_DAYS - 1));
    return { from, to, days: null, label: `${periodDayLabel(from, thisYear)} ~ ${periodDayLabel(to, thisYear)}` };
  }
  const raw = Math.trunc(Number(input?.days));
  const days = Number.isFinite(raw) && raw >= 1 ? Math.min(raw, AGENT_PERIOD_MAX_DAYS) : AGENT_PERIOD_DEFAULT_DAYS;
  return { from: addDays(today, -(days - 1)), to: today, days, label: `최근 ${days}일` };
}
