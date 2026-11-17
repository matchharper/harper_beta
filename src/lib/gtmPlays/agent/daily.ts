/**
 * #5 하루별 성능 (Shaun 11/17: under the log, one row a day, since the agent runs once a day): the people found on each
 * Korea-time day and what came of them, with 수치's own columns and predicates (funnel.ts), so the days add up to 수치's
 * 합계 for the same period and a number opens exactly its people in the log. Each day also carries what its people
 * and its searches cost, by step, and what that day's runs did. Pure: the server, the screen and the tests share it.
 */
import { tallyAgentPeople, type AgentFunnelNumbers, type AgentFunnelRow } from "./funnel";
import { addDays, periodLength } from "./period";
import type { AgentSpendStep } from "./spend";

/**
 * What the day's runs did: the sites searched (the open web counts as one), the applicant files uploaded, and the
 * searches' own counts (search queries run, new people kept, people kept who were already known).
 */
export type AgentDayRun = {
  searchedSources: number; skippedBudget: number; files: number;
  searches: number; newPeople: number; knownPeople: number;
};

const NO_RUN: AgentDayRun = { searchedSources: 0, skippedBudget: 0, files: 0, searches: 0, newPeople: 0, knownPeople: 0 };

export type AgentDayRow = {
  /** YYYY-MM-DD (KST); null for the 합계 row. */
  day: string | null;
  numbers: AgentFunnelNumbers;
  /** numbers.costUsd by step: search (the day's searches), lookup, match, compose, followup (the day's people). */
  costBy: Partial<Record<AgentSpendStep, number>>;
  run: AgentDayRun;
  /** The day's people with no address on their page or file: paid email lookups tried, and the ones that found one. */
  lookups: { tried: number; found: number };
};

export type AgentDayPerson = AgentFunnelRow & { foundDay: string; lookupTried?: boolean; lookupFound?: boolean };
/** A paid step of one of the period's people, by the day that person was found (the spend log). */
export type AgentDaySpend = { day: string; step: AgentSpendStep; usd: number };
/** One run's counters (gtm_agent_runs.counts) on its KST day. */
export type AgentDayRunFacts = { day: string; kind: string; counts: Record<string, unknown>; searchCostUsd: number };

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/** Every KST day from `from` to `to`, newest first (days with nothing still get a row, so a quiet day shows). */
export function periodDaysNewestFirst(from: string, to: string): string[] {
  const length = Math.max(0, periodLength(from, to));
  return Array.from({ length }, (_, index) => addDays(to, -index));
}

/** The sites a run searched (search_attempts_<id> or signal_cost_<id>), less the ones it skipped for the cap. */
export function runSearchCounts(counts: Record<string, unknown>): {
  searched: number; skippedBudget: number; searches: number; newPeople: number; knownPeople: number;
} {
  const ids = new Set<string>();
  const skipped = new Set<string>();
  let searches = 0;
  let newPeople = 0;
  let knownPeople = 0;
  const n = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  for (const [key, value] of Object.entries(counts ?? {})) {
    if (/^searches_.+$/.test(key)) searches += n(value);
    if (/^signal_found_.+$/.test(key)) newPeople += n(value);
    if (/^signal_known_.+$/.test(key)) knownPeople += n(value);
    const searched = /^(?:search_attempts|signal_cost)_(.+)$/.exec(key);
    if (searched && Number(value) > 0) ids.add(searched[1]);
    const skip = /^skipped_budget_(.+)$/.exec(key);
    if (skip && Number(value) > 0) skipped.add(skip[1]);
  }
  for (const id of skipped) ids.delete(id);
  return { searched: ids.size, skippedBudget: skipped.size, searches, newPeople, knownPeople };
}

/**
 * One row per day of the period (newest first) and the 합계 row. 비용 = the day's searches (by the run's day, as 수치
 * counts them) + what the day's people cost (email lookup, posting pick, writing, follow-up), so the days add up to
 * 수치's 합계 비용.
 */
export function agentDailyRows(args: {
  from: string; to: string;
  people: readonly AgentDayPerson[];
  /** The people's own spend by step (not the searches). */
  spend: readonly AgentDaySpend[];
  runs: readonly AgentDayRunFacts[];
}): { total: AgentDayRow; days: AgentDayRow[] } {
  const days = periodDaysNewestFirst(args.from, args.to);
  const lookupsOf = (people: readonly AgentDayPerson[]) => ({
    tried: people.filter((person) => person.lookupTried).length,
    found: people.filter((person) => person.lookupTried && person.lookupFound).length,
  });
  const rows = new Map<string, AgentDayRow>(days.map((day) => {
    const people = args.people.filter((person) => person.foundDay === day);
    return [day, { day, numbers: tallyAgentPeople(people), costBy: {}, run: { ...NO_RUN }, lookups: lookupsOf(people) }];
  }));
  const add = (row: AgentDayRow, step: AgentSpendStep, usd: number) => {
    if (!Number.isFinite(usd) || usd === 0) return;
    row.costBy[step] = round((row.costBy[step] ?? 0) + usd);
  };
  for (const item of args.spend) {
    const row = rows.get(item.day);
    if (row && item.step !== "search") add(row, item.step, item.usd);
  }
  for (const item of args.runs) {
    const row = rows.get(item.day);
    if (!row) continue;
    if (item.kind === "import") row.run.files += 1;
    const counts = runSearchCounts(item.counts);
    row.run.searchedSources += counts.searched;
    row.run.skippedBudget += counts.skippedBudget;
    row.run.searches += counts.searches;
    row.run.newPeople += counts.newPeople;
    row.run.knownPeople += counts.knownPeople;
    add(row, "search", item.searchCostUsd);
  }
  const ordered = days.map((day) => rows.get(day) as AgentDayRow);
  for (const row of ordered) {
    // 비용 is the steps' sum, so the hover's parts always add up to the cell.
    row.numbers.costUsd = round(Object.values(row.costBy).reduce((sum, usd) => sum + (usd ?? 0), 0));
  }
  const inPeriod = args.people.filter((person) => rows.has(person.foundDay));
  const total: AgentDayRow = { day: null, numbers: tallyAgentPeople(inPeriod), costBy: {}, run: { ...NO_RUN }, lookups: lookupsOf(inPeriod) };
  for (const row of ordered) {
    for (const [step, usd] of Object.entries(row.costBy)) add(total, step as AgentSpendStep, usd ?? 0);
    for (const key of Object.keys(NO_RUN) as Array<keyof AgentDayRun>) total.run[key] += row.run[key];
  }
  total.numbers.costUsd = round(Object.values(total.costBy).reduce((sum, usd) => sum + (usd ?? 0), 0));
  return { total, days: ordered };
}

/** 연락 1명당 비용: the day's 비용 ÷ 연락, or null when no one was contacted. */
export function costPerContact(numbers: Pick<AgentFunnelNumbers, "costUsd" | "contacted">): number | null {
  return numbers.contacted > 0 ? round(numbers.costUsd / numbers.contacted) : null;
}
