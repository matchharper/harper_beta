/**
 * #5 하루별 성능 (Shaun 11/17: under the log, one row a day, since the agent runs once a day): the people found on each
 * Korea-time day and what came of them, with 수치's own columns and predicates (funnel.ts), so the days add up to 수치's
 * 합계 for the same period and a number opens exactly its people in the log. Each day also carries what its people
 * and its searches cost, by step, what that day's runs did, and 추천 품질 (how well the mailed postings fit). Pure: the
 * server, the screen and the tests share it.
 */
import { inFunnelColumn, tallyAgentPeople, type AgentFunnelNumbers, type AgentFunnelRow } from "./funnel";
import { addDays, periodLength } from "./period";
import { POSTING_GRADES, verdictAgrees } from "./review";
import type { AgentSpendStep } from "./spend";
import type { AgentPosting, AgentPostingGrade } from "./types";

/**
 * What the day's runs did: the sites searched (the open web counts as one), the applicant files uploaded, and the
 * searches' own counts (search queries run, new people kept, people kept who were already known).
 */
export type AgentDayRun = {
  searchedSources: number; skippedBudget: number; files: number;
  searches: number; newPeople: number; knownPeople: number;
};

const NO_RUN: AgentDayRun = { searchedSources: 0, skippedBudget: 0, files: 0, searches: 0, newPeople: 0, knownPeople: 0 };

/**
 * 추천 품질: the postings in the mails that went out to the day's people (the person's postings once mailed), how the
 * matcher scored them, how the separate grader read them and Ops's own calls (agent/review.ts).
 */
export type AgentDayQuality = {
  postings: number;
  /** Postings with the matcher's score, and the scores' sum (the average is sum ÷ scored). */
  scored: number; scoreSum: number;
  /** The grader's reads (postings it graded). */
  graded: Record<AgentPostingGrade, number>;
  /** Ops's calls: 맞음 / 안 맞음. */
  verdicts: { right: number; wrong: number };
  /** Postings with both Ops's call and a clear grade (잘 맞음 or 안 맞음), and those where the two agree. */
  compared: number; agreed: number;
};

export type AgentDayRow = {
  /** YYYY-MM-DD (KST); null for the 합계 row. */
  day: string | null;
  numbers: AgentFunnelNumbers;
  /** numbers.costUsd by step: search (the day's searches), lookup, match, review, compose, followup (the day's people). */
  costBy: Partial<Record<AgentSpendStep, number>>;
  run: AgentDayRun;
  /** The day's people with no address on their page or file: paid email lookups tried, and the ones that found one. */
  lookups: { tried: number; found: number };
  /**
   * 검색 수율, by the day of the run that searched (like the run's own counts): the people its searches found for the
   * first time (not from an applicant file), and those of them with an address the agent may write to (on their page,
   * or from a lookup).
   */
  search: { found: number; contactable: number };
  quality: AgentDayQuality;
};

/** What 추천 품질 reads of a posting (stored JSON: anything may be missing). */
export type AgentDayPosting = Pick<AgentPosting, "score" | "review" | "verdict">;

export type AgentDayPerson = AgentFunnelRow & {
  foundDay: string; lookupTried?: boolean; lookupFound?: boolean;
  /** The person's postings (only a mailed person's count, as the mail proposed them). */
  postings?: readonly AgentDayPosting[];
};
/** The people one day's searches found (by the run's day), and those with an address. */
export type AgentDaySearchPeople = { day: string; found: number; contactable: number };
/** A paid step of one of the period's people, by the day that person was found (the spend log). */
export type AgentDaySpend = { day: string; step: AgentSpendStep; usd: number };
/** One run's counters (gtm_agent_runs.counts) on its KST day. */
export type AgentDayRunFacts = { day: string; kind: string; counts: Record<string, unknown>; searchCostUsd: number };

const round = (value: number) => Math.round(value * 10_000) / 10_000;

const noQuality = (): AgentDayQuality => ({
  postings: 0, scored: 0, scoreSum: 0, graded: { good: 0, unsure: 0, poor: 0 }, verdicts: { right: 0, wrong: 0 }, compared: 0, agreed: 0,
});

/** 추천 품질 of some people: only the contacted ones' postings (the ones a mail proposed). */
export function postingQuality(people: readonly AgentDayPerson[]): AgentDayQuality {
  const quality = noQuality();
  for (const person of people) {
    if (!inFunnelColumn("contacted", person)) continue;
    for (const posting of person.postings ?? []) {
      quality.postings += 1;
      const score = posting.score;
      if (typeof score === "number" && Number.isFinite(score)) {
        quality.scored += 1;
        quality.scoreSum += score;
      }
      const grade = posting.review?.grade;
      if (grade && POSTING_GRADES.includes(grade)) quality.graded[grade] += 1;
      const value = posting.verdict?.value;
      if (value === "right" || value === "wrong") quality.verdicts[value] += 1;
      const agrees = verdictAgrees(posting);
      if (agrees !== null) {
        quality.compared += 1;
        if (agrees) quality.agreed += 1;
      }
    }
  }
  return quality;
}

/** 평균 적합 점수 (0-100, whole), or null when no mailed posting has a score. */
export function averageScore(quality: Pick<AgentDayQuality, "scored" | "scoreSum">): number | null {
  return quality.scored > 0 ? Math.round(quality.scoreSum / quality.scored) : null;
}

/** Postings the grader graded. */
export const gradedCount = (quality: Pick<AgentDayQuality, "graded">) => quality.graded.good + quality.graded.unsure + quality.graded.poor;

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
  searchPeople?: readonly AgentDaySearchPeople[];
}): { total: AgentDayRow; days: AgentDayRow[] } {
  const days = periodDaysNewestFirst(args.from, args.to);
  const lookupsOf = (people: readonly AgentDayPerson[]) => ({
    tried: people.filter((person) => person.lookupTried).length,
    found: people.filter((person) => person.lookupTried && person.lookupFound).length,
  });
  const searchOf = (day: string) => {
    const items = (args.searchPeople ?? []).filter((item) => item.day === day);
    return { found: items.reduce((sum, item) => sum + item.found, 0), contactable: items.reduce((sum, item) => sum + item.contactable, 0) };
  };
  const rows = new Map<string, AgentDayRow>(days.map((day) => {
    const people = args.people.filter((person) => person.foundDay === day);
    return [day, {
      day, numbers: tallyAgentPeople(people), costBy: {}, run: { ...NO_RUN }, lookups: lookupsOf(people), search: searchOf(day),
      quality: postingQuality(people),
    }];
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
  const total: AgentDayRow = {
    day: null, numbers: tallyAgentPeople(inPeriod), costBy: {}, run: { ...NO_RUN }, lookups: lookupsOf(inPeriod), search: { found: 0, contactable: 0 },
    quality: postingQuality(inPeriod),
  };
  for (const row of ordered) {
    for (const [step, usd] of Object.entries(row.costBy)) add(total, step as AgentSpendStep, usd ?? 0);
    for (const key of Object.keys(NO_RUN) as Array<keyof AgentDayRun>) total.run[key] += row.run[key];
    total.search.found += row.search.found;
    total.search.contactable += row.search.contactable;
  }
  total.numbers.costUsd = round(Object.values(total.costBy).reduce((sum, usd) => sum + (usd ?? 0), 0));
  return { total, days: ordered };
}

/** 연락 가능 1명당 검색비: the day's search spend ÷ the searched people it gave an address for, or null. */
export function searchCostPerContactable(row: Pick<AgentDayRow, "costBy" | "search">): number | null {
  return row.search.contactable > 0 ? round((row.costBy.search ?? 0) / row.search.contactable) : null;
}

/** 연락 1명당 비용: the day's 비용 ÷ 연락, or null when no one was contacted. */
export function costPerContact(numbers: Pick<AgentFunnelNumbers, "costUsd" | "contacted">): number | null {
  return numbers.contacted > 0 ? round(numbers.costUsd / numbers.contacted) : null;
}
