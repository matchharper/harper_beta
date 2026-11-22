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
   * 연락 가능 (수치 · 후보's 찾기): the row's people with an address the agent may write to (on their page or file, or from
   * a lookup), of its 찾음.
   */
  withAddress: number;
  /**
   * 검색 수율, by the day of the run that searched (like the run's own counts): the people its searches found for the
   * first time (not from an applicant file), and those of them with an address the agent may write to (on their page,
   * or from a lookup).
   */
  search: { found: number; contactable: number };
  quality: AgentDayQuality;
  /** The 설정 묶음 (agent/config.ts) first used on the day (none on the 합계 row). */
  configsStarted: string[];
};

/** What 추천 품질 reads of a posting (stored JSON: anything may be missing). */
export type AgentDayPosting = Pick<AgentPosting, "score" | "review" | "verdict">;

export type AgentDayPerson = AgentFunnelRow & {
  foundDay: string; lookupTried?: boolean; lookupFound?: boolean;
  /** They have an address the agent may write to (gtm_agent_people.email). */
  hasEmail?: boolean;
  /** The person's postings (only a mailed person's count, as the mail proposed them). */
  postings?: readonly AgentDayPosting[];
};
/** The people one day's searches found (by the run's day), and those with an address. */
export type AgentDaySearchPeople = { day: string; found: number; contactable: number };
/** A paid step of one of the period's people, by the day that person was found (the spend log). */
export type AgentDaySpend = { day: string; step: AgentSpendStep; usd: number };
/** One run's counters (gtm_agent_runs.counts) on its KST day. */
export type AgentDayRunFacts = { day: string; kind: string; counts: Record<string, unknown>; searchCostUsd: number };
/** A 설정 묶음 and the KST day it was first used. */
export type AgentDayConfigStart = { day: string; id: string };

/** What a run says about its 설정 묶음: each search's own (signal_log.<source>.configId) and the ones its ticks ran with, in order. */
export type AgentRunConfigs = { searchConfigs: Readonly<Record<string, string | null>>; configIds: readonly string[] };

/** The 설정 묶음 a run's search of `source` ran with: its log's, else the run's when it only ever ran with one. */
export function searchConfigOf(source: string, run: AgentRunConfigs): string | null {
  return run.searchConfigs[source] ?? (run.configIds.length === 1 ? run.configIds[0] : null);
}

const SOURCE_KEY = /^(?:search_attempts|signal_cost|searched|search_cut_off|search_gave_up|skipped_budget|searches|signal_found|signal_known)_(.+)$/;

/**
 * A run's counts limited to its searches that ran with `configId` (every count of a search ends with its source id; the
 * open web's new domains are its own). Counts that belong to no search (people's steps, sends) are left out: under a
 * 설정 묶음, the day's people come from their own rows.
 */
export function runCountsForConfig(counts: Record<string, unknown>, run: AgentRunConfigs, configId: string): Record<string, unknown> {
  const sources = new Set(Object.keys(run.searchConfigs));
  for (const key of Object.keys(counts ?? {})) {
    const match = SOURCE_KEY.exec(key);
    if (match) sources.add(match[1]);
  }
  // The longest source id a key ends with is its source ("…_naver_blog" is naver_blog's, not a source named "blog").
  const ids = [...sources].sort((a, b) => b.length - a.length);
  const sourceOf = (key: string) => (key.startsWith("new_domain:") ? "explore" : ids.find((id) => key.endsWith(`_${id}`)) ?? null);
  return Object.fromEntries(Object.entries(counts ?? {}).filter(([key]) => {
    const source = sourceOf(key);
    return source !== null && searchConfigOf(source, run) === configId;
  }));
}

/**
 * A run's search counts by the source each belongs to (search_attempts_<id>, signal_cost_<id>, searches_<id> …: the id
 * is what follows the fixed prefix), for 수치 · 후보's 찾은 곳 rows. Counts that belong to no one search (people's
 * steps, sends, the open web's new domains) are left out; runSearchCounts and runSearchCostUsd read only these.
 */
export function runCountsBySource(counts: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const bySource = new Map<string, Record<string, unknown>>();
  for (const [key, value] of Object.entries(counts ?? {})) {
    const source = SOURCE_KEY.exec(key)?.[1];
    if (!source) continue;
    bySource.set(source, { ...bySource.get(source), [key]: value });
  }
  return bySource;
}

/** The search spend in a run's counts (signal_cost_<source>), as 하루별 성능 adds it to the run's day. */
export function runSearchCostUsd(counts: Record<string, unknown>): number {
  return round(Object.entries(counts ?? {})
    .filter(([key, value]) => key.startsWith("signal_cost_") && Number.isFinite(Number(value)))
    .reduce((sum, [, value]) => sum + Number(value), 0));
}

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

/** What one run did, for its day's 그날 실행 (a file is the import run's; the searches from its counts). */
export function dayRunOf(run: Pick<AgentDayRunFacts, "kind" | "counts">): AgentDayRun {
  const counts = runSearchCounts(run.counts);
  return {
    searchedSources: counts.searched, skippedBudget: counts.skippedBudget, files: run.kind === "import" ? 1 : 0,
    searches: counts.searches, newPeople: counts.newPeople, knownPeople: counts.knownPeople,
  };
}

/** A row of the numbers by any key: a KST day (하루별 성능), a source or a search query (agent/numbers.ts); null on 합계. */
export type AgentKeyRow = Omit<AgentDayRow, "day"> & { key: string | null };

/**
 * The one grouping behind 하루별 성능 and 수치 · 후보 (agent/numbers.ts, Shaun 11/22): the people, their own spend, what
 * the runs did and the searched people, each already given its row's key (a day, a source or a search query). Rows are
 * `keys` in that order (a quiet day still gets one), then, with `discover`, any other key met (in the order met);
 * anything keyed outside the rows is left out of them and of the 합계. 비용 = the rows' searches + what the rows' people
 * cost (email lookup, posting pick, writing, follow-up), so the rows add up to the 합계 비용.
 */
export function agentRowsByKey(args: {
  keys: readonly string[]; discover?: boolean;
  people: ReadonlyArray<{ key: string; person: AgentDayPerson }>;
  /** The people's own spend by step (a search step here is ignored: searches come from the runs). */
  spend: ReadonlyArray<{ key: string; step: AgentSpendStep; usd: number }>;
  runs: ReadonlyArray<{ key: string; run: Partial<AgentDayRun>; searchCostUsd: number }>;
  searchPeople?: ReadonlyArray<{ key: string; found: number; contactable: number }>;
  configStarts?: ReadonlyArray<{ key: string; id: string }>;
}): { total: AgentKeyRow; rows: AgentKeyRow[] } {
  const keys = [...new Set(args.keys)];
  if (args.discover) {
    for (const item of [...args.people, ...args.runs, ...(args.searchPeople ?? [])]) if (!keys.includes(item.key)) keys.push(item.key);
  }
  const peopleOf = new Map<string, AgentDayPerson[]>(keys.map((key) => [key, []]));
  for (const item of args.people) peopleOf.get(item.key)?.push(item.person);
  const lookupsOf = (people: readonly AgentDayPerson[]) => ({
    tried: people.filter((person) => person.lookupTried).length,
    found: people.filter((person) => person.lookupTried && person.lookupFound).length,
  });
  const rows = new Map<string, AgentKeyRow>(keys.map((key) => {
    const people = peopleOf.get(key) ?? [];
    return [key, {
      key, numbers: tallyAgentPeople(people), costBy: {}, run: { ...NO_RUN }, lookups: lookupsOf(people), search: { found: 0, contactable: 0 },
      withAddress: people.filter((person) => person.hasEmail).length, quality: postingQuality(people),
      configsStarted: [...new Set((args.configStarts ?? []).filter((item) => item.key === key).map((item) => item.id))],
    }];
  }));
  const add = (row: AgentKeyRow, step: AgentSpendStep, usd: number) => {
    if (!Number.isFinite(usd) || usd === 0) return;
    row.costBy[step] = round((row.costBy[step] ?? 0) + usd);
  };
  for (const item of args.spend) {
    const row = rows.get(item.key);
    if (row && item.step !== "search") add(row, item.step, item.usd);
  }
  for (const item of args.runs) {
    const row = rows.get(item.key);
    if (!row) continue;
    for (const key of Object.keys(NO_RUN) as Array<keyof AgentDayRun>) {
      const value = Number(item.run[key] ?? 0);
      if (Number.isFinite(value)) row.run[key] += value;
    }
    add(row, "search", item.searchCostUsd);
  }
  for (const item of args.searchPeople ?? []) {
    const row = rows.get(item.key);
    if (!row) continue;
    row.search.found += item.found;
    row.search.contactable += item.contactable;
  }
  const ordered = keys.map((key) => rows.get(key) as AgentKeyRow);
  for (const row of ordered) {
    // 비용 is the steps' sum, so the hover's parts always add up to the cell.
    row.numbers.costUsd = round(Object.values(row.costBy).reduce((sum, usd) => sum + (usd ?? 0), 0));
  }
  const inRows = keys.flatMap((key) => peopleOf.get(key) ?? []);
  const total: AgentKeyRow = {
    key: null, numbers: tallyAgentPeople(inRows), costBy: {}, run: { ...NO_RUN }, lookups: lookupsOf(inRows), search: { found: 0, contactable: 0 },
    withAddress: inRows.filter((person) => person.hasEmail).length, quality: postingQuality(inRows), configsStarted: [],
  };
  for (const row of ordered) {
    for (const [step, usd] of Object.entries(row.costBy)) add(total, step as AgentSpendStep, usd ?? 0);
    for (const key of Object.keys(NO_RUN) as Array<keyof AgentDayRun>) total.run[key] += row.run[key];
    total.search.found += row.search.found;
    total.search.contactable += row.search.contactable;
  }
  total.numbers.costUsd = round(Object.values(total.costBy).reduce((sum, usd) => sum + (usd ?? 0), 0));
  return { total, rows: ordered };
}

/** A keyed row as a 하루별 성능 day (the key is the day). */
const asDayRow = ({ key, ...row }: AgentKeyRow): AgentDayRow => ({ day: key, ...row });

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
  configStarts?: readonly AgentDayConfigStart[];
}): { total: AgentDayRow; days: AgentDayRow[] } {
  const { total, rows } = agentRowsByKey({
    keys: periodDaysNewestFirst(args.from, args.to),
    people: args.people.map((person) => ({ key: person.foundDay, person })),
    spend: args.spend.map((item) => ({ key: item.day, step: item.step, usd: item.usd })),
    runs: args.runs.map((item) => ({ key: item.day, run: dayRunOf(item), searchCostUsd: item.searchCostUsd })),
    searchPeople: (args.searchPeople ?? []).map((item) => ({ key: item.day, found: item.found, contactable: item.contactable })),
    configStarts: (args.configStarts ?? []).map((item) => ({ key: item.day, id: item.id })),
  });
  return { total: asDayRow(total), days: rows.map(asDayRow) };
}

/** 연락 가능 1명당 검색비: the day's search spend ÷ the searched people it gave an address for, or null. */
export function searchCostPerContactable(row: Pick<AgentDayRow, "costBy" | "search">): number | null {
  return row.search.contactable > 0 ? round((row.costBy.search ?? 0) / row.search.contactable) : null;
}

/** 연락 1명당 비용: the day's 비용 ÷ 연락, or null when no one was contacted. */
export function costPerContact(numbers: Pick<AgentFunnelNumbers, "costUsd" | "contacted">): number | null {
  return numbers.contacted > 0 ? round(numbers.costUsd / numbers.contacted) : null;
}

/**
 * A row's cost by step as the daily cost cap counts it: every step but Ashley's replies (step reply has no cap:
 * store.server.ts agentCostToday leaves it out). 수치 · 후보's 메일 비용 (Shaun 11/22: "the cap figure only what the cap
 * counts").
 */
export function cappedCostBy(costBy: Partial<Record<AgentSpendStep, number>>): Partial<Record<AgentSpendStep, number>> {
  return Object.fromEntries(Object.entries(costBy).filter(([step]) => step !== "reply"));
}

/** 메일's 비용: the row's cost the daily cap counts (cappedCostBy), summed. */
export function cappedCostUsd(row: Pick<AgentDayRow, "costBy">): number {
  return round(Object.values(cappedCostBy(row.costBy)).reduce((sum, usd) => sum + (usd ?? 0), 0));
}

/** 메일's 연락 1명당: cappedCostUsd ÷ 연락, or null when no one was contacted. */
export function cappedCostPerContact(row: Pick<AgentDayRow, "costBy" | "numbers">): number | null {
  return costPerContact({ costUsd: cappedCostUsd(row), contacted: row.numbers.contacted });
}

/** 답장's Ashley 비용: what Ashley deciding on, writing and re-searching the row's people's replies cost (step reply). */
export function ashleyCostUsd(row: Pick<AgentDayRow, "costBy">): number {
  return round(row.costBy.reply ?? 0);
}
