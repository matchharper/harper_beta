/**
 * #5 수치 · 후보 (Shaun 11/22: one panel instead of 수치 and 하루별 성능): the period's people and searches as rows by
 * 찾은 곳 (source), 날짜 (the KST day they were found), 검색어 (the search query that found them) or 채널 (where × why
 * they wrote, agent/channels.ts channelOf; 11/23), 합계 first. Givers are no row's (funnel.ts isGiver): the 합계 only
 * counts them apart (numbers.givers), with their own spend left out of every row. Every
 * row carries what the four views read (사람 흐름, 검색 수율, 추천 품질, 답장), grouped once by daily.ts agentRowsByKey
 * with 수치's own predicates (funnel.ts), so the rows of every kind add up to the same 합계 and a number opens exactly
 * its people in the log. Pure: the server, the screen and the tests share it.
 *
 * 검색 수율 by row kind: a 날짜 row reads the runs of that day (as 하루별 성능 did), a 찾은 곳 row its own search counts
 * (search_attempts_<id>, searches_<id>, signal_cost_<id> …), a 검색어 row the runs' search records of that wording
 * (gtm_agent_runs.signal_log.<source>.yields[]). A search's cost is the search's as a whole (its queries share the
 * plan and the judge calls), so a 검색어 row has no cost. One search finds people of several channels (a LinkedIn search
 * finds job and career-help posts alike), so a 채널 row has neither searches nor their cost.
 */
import { applicantListCompany } from "./applicantList";
import { CANDIDATE_CHANNELS, channelOf, type AgentCandidateChannel, type AgentFoundAs, type AgentIntent } from "./channels";
import {
  agentRowsByKey, dayRunOf, periodDaysNewestFirst, runCountsBySource, runCountsForConfig, runSearchCostUsd, searchConfigOf,
  type AgentDayConfigStart, type AgentDayPerson, type AgentDayRun, type AgentDayRunFacts, type AgentKeyRow,
} from "./daily";
import { isGiver } from "./funnel";
import { addDays, AGENT_PERIOD_MAX_DAYS, periodDate } from "./period";
import { DEFAULT_SEND_WEEKDAYS } from "./sendTiming";
import type { AgentSpendStep } from "./spend";

/** What a row is: where the people were found, the day they were found, the query that found them, or their channel. */
export const NUMBERS_ROWS = ["source", "day", "query", "channel"] as const;
export type NumbersRows = (typeof NUMBERS_ROWS)[number];

/** The 검색어 row of the people no search found (the uploaded applicant files): the log reads "" as "no query". */
export const NO_QUERY = "";

/** 검색어 rows shown before "검색어 N개 더 보기". */
export const QUERY_ROWS_SHOWN = 30;

export type NumbersPerson = AgentDayPerson & {
  personId: string; searchQuery?: string | null;
  /** What channelOf reads (with source): how they were found, why they wrote, author or commenter. */
  method?: string | null; intent?: AgentIntent | null; foundAs?: AgentFoundAs | null;
};

/** A person's channel (agent/channels.ts channelOf): the 채널 row they are in, and the log's 채널 filter. */
export function channelOfPerson(person: Pick<NumbersPerson, "source" | "method" | "intent" | "foundAs">): AgentCandidateChannel {
  return channelOf({ source: person.source, method: person.method ?? "", intent: person.intent ?? null, foundAs: person.foundAs ?? null });
}

/** One person's own spend on one step (not the searches, which are the runs'). */
export type NumbersSpend = { personId: string; step: AgentSpendStep; usd: number };

/** One query a run's search of `source` ran (signal_log.<source>.yields[]): who it kept new, and who it found again. */
export type NumbersYield = { source: string; query: string; kept: number; known: number };

export type NumbersRun = AgentDayRunFacts & { yields?: readonly NumbersYield[] };

/** The people one day's searches found for the first time (not from an applicant file), by source and query. */
export type NumbersSearchPeople = { day: string; source: string; query: string | null; found: number; contactable: number };

export type NumbersRow = AgentKeyRow & {
  /** Where the row's people were found and searched: the source itself, a query's places (most people first); none for a day. */
  sources: string[];
};

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);

/**
 * A run's stored search records (signal_log.<source>.yields, any JSON) as the 검색어 rows read them. News searches for
 * layoffs (stage layoff_news) are left out: they look for companies, never for people (their people are found by the
 * layoff_people queries, which are kept).
 */
export function yieldsOfSignalLog(bySource: Record<string, unknown> | null | undefined): NumbersYield[] {
  return Object.entries(bySource ?? {}).flatMap(([source, yields]) => (Array.isArray(yields) ? yields : []).flatMap((item): NumbersYield[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.query !== "string" || !record.query || record.stage === "layoff_news") return [];
    return [{ source, query: record.query, kept: count(record.kept), known: count(record.known) }];
  }));
}

/** A run as read (gtm_agent_runs), before the panel's 찾은 곳 and 설정 묶음 filters. */
export type NumbersRunRead = {
  day: string; kind: string; counts: Record<string, unknown> | null;
  configIds: readonly string[] | null; searchConfigs: Readonly<Record<string, string | null>> | null;
  /** signal_log.<source>.yields, when the 검색어 rows are read. */
  yields?: Record<string, unknown> | null;
};

/**
 * A run under the panel's filters, or null when nothing of it is under them. With `source`, only that site's searches
 * (a file is the LinkedIn applicants'); with `configId` (a 설정 묶음, agent/config.ts), only the searches that ran with
 * it (and a file uploaded with it), as 하루별 성능 has counted them.
 */
export function numbersRunOf(run: NumbersRunRead, filter: { source: string | null; configId: string | null }): NumbersRun | null {
  const { source, configId } = filter;
  if (source && run.kind === "import" && source !== "linkedin") return null;
  const counts = source ? runCountsBySource(run.counts ?? {}).get(source) ?? {} : run.counts ?? {};
  const yields = yieldsOfSignalLog(run.yields).filter((item) => !source || item.source === source);
  if (!configId) return { day: run.day, kind: run.kind, counts, searchCostUsd: runSearchCostUsd(counts), yields };
  const configs = { searchConfigs: run.searchConfigs ?? {}, configIds: run.configIds ?? [] };
  if (run.kind === "import") return configs.configIds[0] === configId ? { day: run.day, kind: run.kind, counts: {}, searchCostUsd: 0, yields: [] } : null;
  const under = runCountsForConfig(counts, configs, configId);
  return {
    day: run.day, kind: run.kind, counts: under, searchCostUsd: runSearchCostUsd(under),
    yields: yields.filter((item) => searchConfigOf(item.source, configs) === configId),
  };
}

/** The row a person is in. */
export function numbersKeyOf(
  kind: NumbersRows, person: Pick<NumbersPerson, "source" | "foundDay" | "searchQuery" | "method" | "intent" | "foundAs">,
): string {
  if (kind === "source") return person.source;
  if (kind === "day") return person.foundDay;
  if (kind === "channel") return channelOfPerson(person);
  return person.searchQuery ?? NO_QUERY;
}

/** A run's part in each row: its day; each source it searched; each query it ran; nothing of a channel's. */
function runParts(kind: NumbersRows, run: NumbersRun): Array<{ key: string; run: Partial<AgentDayRun>; searchCostUsd: number }> {
  if (kind === "channel") return [];
  if (kind === "day") return [{ key: run.day, run: dayRunOf(run), searchCostUsd: run.searchCostUsd }];
  if (kind === "query") {
    return (run.yields ?? []).map((item) => ({ key: item.query, run: { searches: 1, newPeople: item.kept, knownPeople: item.known }, searchCostUsd: 0 }));
  }
  return [...runCountsBySource(run.counts)].flatMap(([source, counts]) => {
    const part = { ...dayRunOf({ kind: run.kind, counts }), files: 0 };
    const searchCostUsd = runSearchCostUsd(counts);
    const any = searchCostUsd || part.searchedSources || part.skippedBudget || part.searches || part.newPeople || part.knownPeople;
    return any ? [{ key: source, run: part, searchCostUsd }] : [];
  });
}

/**
 * The rows of one kind and the 합계 (the same people and searches whatever the kind). 날짜: every day of the period,
 * newest first. 찾은 곳: `always` first (the sources turned on, so an empty one still shows), then the others, most
 * people first. 검색어: most people first, the uploaded-file people one row (NO_QUERY). 채널: the channels anyone was
 * found in, in the queue's order (agent/channels.ts CANDIDATE_CHANNELS).
 */
export function agentNumbersRows(args: {
  kind: NumbersRows; from: string; to: string;
  people: readonly NumbersPerson[];
  spend: readonly NumbersSpend[];
  runs: readonly NumbersRun[];
  searchPeople?: readonly NumbersSearchPeople[];
  configStarts?: readonly AgentDayConfigStart[];
  always?: readonly string[];
}): { total: NumbersRow; rows: NumbersRow[] } {
  const { kind } = args;
  const inPeriod = (day: string) => day >= args.from && day <= args.to;
  const found = args.people.filter((person) => inPeriod(person.foundDay));
  // Givers are in no row (a row of only givers would be a row of zeros) and their spend in no row's cost.
  const people = found.filter((person) => !isGiver(person));
  const givers = found.length - people.length;
  const keyOf = new Map(people.map((person) => [person.personId, numbersKeyOf(kind, person)]));
  // Summed per row and step first, so a row's cost is rounded once per step (as the spend log sums it).
  const spend = new Map<string, { key: string; step: AgentSpendStep; usd: number }>();
  for (const item of args.spend) {
    const key = keyOf.get(item.personId);
    if (key === undefined || !Number.isFinite(item.usd)) continue;
    const entry = spend.get(`${key}\u0000${item.step}`) ?? { key, step: item.step, usd: 0 };
    entry.usd += item.usd;
    spend.set(`${key}\u0000${item.step}`, entry);
  }
  const runs = args.runs.filter((run) => inPeriod(run.day));
  const { total, rows } = agentRowsByKey({
    keys: kind === "day" ? periodDaysNewestFirst(args.from, args.to) : kind === "source" ? args.always ?? [] : [],
    discover: kind !== "day",
    people: people.map((person) => ({ key: numbersKeyOf(kind, person), person })),
    spend: [...spend.values()],
    runs: runs.flatMap((run) => runParts(kind, run)),
    searchPeople: (kind === "channel" ? [] : args.searchPeople ?? []).filter((item) => inPeriod(item.day)).map((item) => ({
      key: kind === "day" ? item.day : kind === "source" ? item.source : item.query ?? NO_QUERY,
      found: item.found, contactable: item.contactable,
    })),
    configStarts: kind === "day" ? (args.configStarts ?? []).map((item) => ({ key: item.day, id: item.id })) : [],
  });
  // Where each 검색어 row's people were found, then where it was searched (a query of the open web finds people on many sites).
  const places = new Map<string, Map<string, number>>();
  const addPlace = (key: string, source: string, weight: number) => {
    const of = places.get(key) ?? new Map<string, number>();
    of.set(source, (of.get(source) ?? 0) + weight);
    places.set(key, of);
  };
  if (kind === "query") {
    for (const person of people) addPlace(numbersKeyOf(kind, person), person.source, 1_000_000);
    for (const run of runs) for (const item of run.yields ?? []) addPlace(item.query, item.source, 1);
  }
  const out: NumbersRow[] = rows.map((row) => ({
    ...row,
    sources: kind === "source" ? [row.key as string] : kind === "query"
      ? [...(places.get(row.key as string) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([source]) => source)
      : [],
  }));
  const totalRow: NumbersRow = { ...total, numbers: { ...total.numbers, givers }, sources: [] };
  if (kind === "source") {
    const always = new Set(args.always ?? []);
    const rest = out.filter((row) => !always.has(row.key as string))
      .sort((a, b) => b.numbers.found - a.numbers.found || b.numbers.costUsd - a.numbers.costUsd || String(a.key).localeCompare(String(b.key)));
    return { total: totalRow, rows: [...out.filter((row) => always.has(row.key as string)), ...rest] };
  }
  if (kind === "query") {
    out.sort((a, b) => b.numbers.found - a.numbers.found || b.run.searches - a.run.searches || String(a.key).localeCompare(String(b.key)));
  }
  if (kind === "channel") {
    const order = (key: string | null) => CANDIDATE_CHANNELS.indexOf(key as AgentCandidateChannel);
    out.sort((a, b) => order(a.key) - order(b.key));
  }
  return { total: totalRow, rows: out };
}

/**
 * Why a row's search cells (검색, 이미 찾은 사람, 검색 비용, 연락 가능 1명당) show words, not figures that open an empty
 * 검색 기록, or null when they show the row's searches:
 *   not_searched  people only ever uploaded: the 검색어 row of no query (NO_QUERY), and a company's applicant list
 *                 (applicants-<company>, agent/applicantList.ts) as a 찾은 곳 row or as the panel's 찾은 곳 filter
 *                 (then every 날짜 / 검색어 row and the 합계). Other 날짜 rows need none: a day's 검색 기록 lists its runs
 *                 and its uploaded files, so it is never empty for a day that ran.
 *   no_record     a 검색어 row with people but no search record: a search cut off and run again in a later tick (the
 *                 run's log keeps the last try's queries only).
 * A row that has searches always shows them.
 */
export type NoSearchRecord = "not_searched" | "no_record";

export function noSearchRecord(
  kind: NumbersRows, row: Pick<NumbersRow, "key" | "run" | "numbers">, filters: { source: string | null },
): NoSearchRecord | null {
  if (row.run.searches) return null;
  if (applicantListCompany(kind === "source" ? row.key : filters.source)) return "not_searched";
  if (kind !== "query" || row.key === null) return null;
  if (row.key === NO_QUERY) return "not_searched";
  return row.numbers.found ? "no_record" : null;
}

/** What a number click takes to the log (AgentTab): the row's key in its field and the panel's filters. */
export type NumbersPick = {
  source: string | null; day: string | null; query: string | null; config: string | null; channel: AgentCandidateChannel | null;
};

/**
 * The people behind a number of the row `key` (null: 합계): the row's own source, day, query or channel, with the
 * panel's 찾은 곳 (not on 찾은 곳 rows, where the row is the source) and 설정 묶음. The log filters by exactly these
 * (views.server.ts listAgentPeopleLog: source, the day as the period, search_query, config_id, channelOfPerson), so
 * its people are the number's.
 */
export function numbersPick(kind: NumbersRows, key: string | null, filters: { source: string | null; config: string | null }): NumbersPick {
  return {
    source: kind === "source" ? key : filters.source,
    day: kind === "day" ? key : null,
    query: kind === "query" ? key : null,
    config: filters.config,
    channel: kind === "channel" ? key as AgentCandidateChannel | null : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 지금까지: 가입 1명당 비용 since the agent started (Shaun 11/22: "1명 가입을 위해 들어간 돈을 실시간으로 트래킹하자")

/**
 * Since the first day the agent found someone or spent money (KST, test runs left out; at most 365 days back,
 * allTimeFrom) to today, whatever period the panel shows. signedUp is the funnel's 가입 over those days (the same rows
 * and predicate as every 가입 cell, so the log of { from, to } lists exactly them); costUsd is every non-test spend log
 * row since then, every step (Ashley's replies too: all the real money).
 */
export type NumbersAllTime = { from: string; to: string; signedUp: number; costUsd: number };

/** The earliest day 지금까지 reaches: 365 days back with today (period.ts AGENT_PERIOD_MAX_DAYS, as every period). */
export const allTimeEarliest = (today: string): string => addDays(today, -(AGENT_PERIOD_MAX_DAYS - 1));

/**
 * 지금까지's first day: the first KST day anyone was found or money spent (`first`), cut to 365 days back as
 * period.ts resolveAgentPeriod cuts every period, so 누적 가입's log over { from, to } (which the log resolves the same
 * way) lists exactly the people it counts; today when nothing happened yet (or the day is not a date).
 */
export function allTimeFrom(first: string | null | undefined, today: string): string {
  const day = periodDate(first);
  if (!day || day >= today) return today;
  const earliest = allTimeEarliest(today);
  return day < earliest ? earliest : day;
}

/** 가입 1명당: 비용 ÷ 가입 to the cent, or null when no one signed up. */
export function costPerSignup(allTime: Pick<NumbersAllTime, "signedUp" | "costUsd">): number | null {
  return allTime.signedUp > 0 ? Math.round((allTime.costUsd / allTime.signedUp) * 100) / 100 : null;
}

/**
 * 하루 평균 가입 (Shaun 11/22 16:03; 11/23 14:38: only the days mails go out): 가입 ÷ the KST days from the first day
 * to today, both ends in, that are send weekdays (sendWeekdays, 0 = Sunday; 월~금 by default), to one decimal. At
 * least one day.
 */
export function signupsPerDay(
  allTime: Pick<NumbersAllTime, "from" | "to" | "signedUp">, sendWeekdays: readonly number[] = DEFAULT_SEND_WEEKDAYS,
): { days: number; perDay: number } {
  const from = Date.parse(`${allTime.from}T00:00:00Z`);
  const span = Math.max(0, Math.round((Date.parse(`${allTime.to}T00:00:00Z`) - from) / 86_400_000) + 1);
  const sendDays = new Set(sendWeekdays);
  // KST dates as UTC midnights: getUTCDay is that date's weekday.
  const counted = Array.from({ length: span }, (_, index) => new Date(from + index * 86_400_000).getUTCDay()).filter((day) => sendDays.has(day)).length;
  const days = Math.max(1, counted);
  return { days, perDay: Math.round((allTime.signedUp / days) * 10) / 10 };
}

// ---------------------------------------------------------------------------------------------------------------
// 날짜 rows: a stretch of quiet days is one line (Shaun 11/17: no screens of zeros)

/** Whether a day's runs did anything: searched a site, uploaded a file, or skipped a site for the cap. */
export const ranOn = (run: AgentDayRun) => Boolean(run.searchedSources || run.files || run.skippedBudget);

type DayFacts = Pick<AgentKeyRow, "run" | "numbers" | "configsStarted">;

/** A day with no run, no one found, nothing spent and no new 설정 묶음. */
export const isQuietDay = (row: DayFacts) => !ranOn(row.run) && !row.numbers.found && !row.numbers.costUsd && !row.configsStarted.length;

export type DayLine<T> = { kind: "day"; row: T } | { kind: "quiet"; newest: string; oldest: string; count: number };

/** The days as given (newest first), each stretch of quiet days as one line. */
export function dayLines<T extends DayFacts>(rows: readonly T[], dayOf: (row: T) => string): Array<DayLine<T>> {
  const lines: Array<DayLine<T>> = [];
  for (const row of rows) {
    const last = lines[lines.length - 1];
    if (!isQuietDay(row)) lines.push({ kind: "day", row });
    else if (last?.kind === "quiet") { last.oldest = dayOf(row); last.count += 1; } else lines.push({ kind: "quiet", newest: dayOf(row), oldest: dayOf(row), count: 1 });
  }
  return lines;
}
