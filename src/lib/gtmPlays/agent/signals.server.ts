import "server-only";

import { randomUUID } from "node:crypto";
import { createCompanyRunUsage } from "@/lib/llm/runUsage";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import { getExaClient } from "@/lib/tools/exaClient";
import { gtmStructuredCall } from "../llm.server";
import {
  EXPLORE_SOURCE, JUDGE_ESTIMATE_USD, JUDGE_SCHEMA, LAYOFF_NEWS_DAYS, LAYOFF_SCHEMA, MAX_QUERIES_PER_ROUND, PLAN_SCHEMA,
  concurrencyLimit, exaSearchCost, exploreExcludeDomains, isRegistrySource, judgeBatch, judgePrompt, layoffCompanies, layoffPrompt,
  normalizeDomainList, normalizeSignalSource, planPrompt, plainPageText, rankSignalPeople, resultFitsStage, searchCostHint,
  signalLogEntry, signalLogSample, signalMethod, signalSourceInfo, signalWindows, sortVerdicts, sourceOfUrl, stageDomains,
  urlFingerprint, verdictCounts, windowDates,
  type LayoffCompany, type LayoffEvent, type RoleFamilyCount, type SignalHistoryRun, type SignalJudgement, type SignalLogEntry,
  type SignalMethod, type SignalPlan, type SignalQuery, type SignalSource, type SignalSourceInfo, type SignalStage, type SignalWindow,
  type SignalYield,
} from "./signals";
import { normalizeSignalTuning, signalTuningVersion, type SignalTuning } from "./tuning";

/**
 * #5 사람 찾기 for one source (one site), or for the open web (source "explore": no include_domains, the default list,
 * news sites and blocked domains excluded): plan → search the source's own domains → judge every result → look at what
 * each query family yielded → revise (at most tuning.maxRounds), inside the budget (Exa and the model together). With
 * tuning.layoffSearch on, part of the same budget goes to the layoff method: search news sites for recent layoffs,
 * then search the source for people from those companies who say they are looking. Returns the kept people (one per
 * person, those with a public contact first, then the newest signal), each with how it was found, and the plan
 * versions with their reasons.
 *
 * Newest first (Shaun 11/17): each round runs its queries on the last FRESH_SIGNAL_DAYS, then on the rest of
 * maxAgeDays only while the run is not full; the yields keep the window so the revision sees which windows yield. A
 * stage's first plan also reads what earlier runs of the source learned (`history`, from gtm_agent_runs.signal_log),
 * and the result carries this search's own log entry for the next runs.
 *
 * Only new people and new pages (the 11/17 search review: over half of the kept people were found again): pages an
 * earlier run judged (`knownUrls`, fingerprints) are skipped before the judge, people an earlier run found (`known`)
 * are not kept, and the yields count new people only. A round that keeps nobody ends the stage. The judge calls run a
 * few at a time (JUDGE_CONCURRENCY) while the next searches go on: one after another they took most of the time.
 *
 * Bounded (#5 review): with `deadlineAt` the search stops there, whatever step it is in, and returns what it kept so
 * far (stopped "deadline"; a step still running is counted at its estimate). An error part-way returns what was kept
 * too (stopped "error"). Each paid step's cost goes to `onSpend` as soon as it is known (the spend log), so a search
 * cut off later never loses it; `recordedUsd` is how much went there, costUsd the whole.
 *
 * The frame (runSignalSearch) is shared with the sources that do not use the web search (signals.hn.server.ts).
 */

/** Share of the budget kept for the layoff method when it is on (the signal rounds stop before it). */
const LAYOFF_BUDGET_SHARE = 0.4;
/** People rounds after the news step. */
const LAYOFF_PEOPLE_ROUNDS = 2;
const LAYOFF_ARTICLES = 12;
const NEWS_TEXT_CHARS = 1_200;
/** Judge calls one search runs at once. */
export const JUDGE_CONCURRENCY = 3;

export type SignalPerson = {
  personKey: string;
  /** Where the person's page was found: a default-list id, else the page's registrable domain ("someone.dev"). */
  source: SignalSource;
  /** How they were found. */
  method: SignalMethod;
  /** The query family that found them (for layoff_company, the company). */
  group: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  currentCompany: string | null;
  profileUrl: string | null;
  /** Only an address the person wrote on the page, near their name (checked against the page text: identifyPerson). */
  email: string | null;
  /** A link the person wrote on the page to their own site, GitHub, portfolio ... (checked against the page text). */
  contactUrl: string | null;
  signalText: string;
  signalUrl: string;
  signalAt: string | null;
  /** The page text the judge read (plain, at most PAGE_TEXT_CHARS): kept as profile_text for matching and the mail. */
  pageText: string | null;
  language: "ko" | "en";
  score: number;
  /** The tuning version that found them (tuning.ts). */
  tuningVersion: string;
};

export type SignalSearchResult = {
  source: SignalSource;
  people: SignalPerson[];
  costUsd: number;
  plans: SignalPlan[];
  yields: SignalYield[];
  /** The effective tuning and its version. */
  tuning: SignalTuning;
  tuningVersion: string;
  /** Companies the layoff method looked for (found here or passed in), to pass to the next source of the run. */
  layoffs: LayoffCompany[];
  /** Domains outside the default list where people were kept (most first): /ops #5 offers "기본 목록에 넣기". */
  newDomains: Array<{ domain: string; kept: number }>;
  /** What this search learned, for later runs' first plans (gtm_agent_runs.signal_log[source]). */
  log: SignalLogEntry;
  /** done: it ran its course; deadline: cut off at deadlineAt (partial); error: a step failed (partial, see error). */
  stopped: "done" | "deadline" | "error";
  error: string | null;
  /** How much of costUsd was already passed to onSpend. */
  recordedUsd: number;
  /** Search calls that failed (the search engine or the HN API): their yields say error, not "no results". */
  searchErrors: number;
  /** Targets the judge kept whom an earlier run had found (not kept again). */
  knownPeople: number;
  /** Pages an earlier run had judged (skipped before the judge). */
  knownUrls: number;
};

export type SignalSearchArgs = {
  /** A source id ("explore" for the open web); earlier ids ("opentowork") are read as their source. */
  source: SignalSource | "opentowork";
  /** The most this search may spend: its share of the run's search budget (settings' open-web split). */
  budgetUsd: number;
  maxPeople: number;
  /** Person keys earlier runs found (the last RECENT_MEMORY_DAYS; any of a person's keys): never kept again. */
  known: ReadonlySet<string>;
  /** Fingerprints (urlFingerprint) of pages earlier runs judged (the last RECENT_MEMORY_DAYS): not judged again. */
  knownUrls?: ReadonlySet<string> | null;
  now?: Date;
  /** The source's tuning from /ops #5; missing fields take the defaults. */
  tuning?: Partial<SignalTuning> | null;
  /** Layoff companies an earlier source found in this run: reused instead of searching the news again. */
  layoffs?: readonly LayoffCompany[] | null;
  /** Never searched or kept (settings-level, /ops #5). */
  blockedDomains?: readonly string[] | null;
  /** What earlier runs of this source learned (newest first): each stage's first plan reads it. */
  history?: readonly SignalHistoryRun[] | null;
  /** Open postings by role family: the first plans lean toward them. */
  openRoles?: readonly RoleFamilyCount[] | null;
  /** When the search must stop (ms since epoch): it returns what it kept by then. */
  deadlineAt?: number | null;
  /** Called with each paid step's cost as soon as it is known (the spend log). */
  onSpend?: ((usd: number) => Promise<void>) | null;
};

/** Thrown inside the search when deadlineAt is reached: the search returns what it kept. */
export class SearchCutOff extends Error {}

/** A page to judge, as a search returned it. */
export type JudgeInput = { url: string; title?: string | null; text?: string | null; publishedDate?: string | null };

/** What a source's search works with inside runSignalSearch. */
export type SignalSearchFrame = {
  source: SignalSource;
  info: SignalSourceInfo;
  tuning: SignalTuning;
  now: Date;
  budget: number;
  blocked: string[];
  args: SignalSearchArgs;
  plans: SignalPlan[];
  yields: SignalYield[];
  keptSamples: string[];
  rejectedSamples: string[];
  /** Layoff companies looked for (the judge names them on layoff_people pages). */
  layoffs: LayoffCompany[];
  /** Spent so far (searches and the model, steps cut off not included). */
  spent: () => number;
  /** Room under `cap` for one more search with its judging (judge calls still running counted at their estimate). */
  room: (cap: number) => boolean;
  addSearchUsd: (usd: number) => void;
  /** One paid or slow step, cut off at the deadline (counted at `estimateUsd` then). */
  step: <T>(work: () => Promise<T>, estimateUsd: number) => Promise<T>;
  /** Passes what was spent since the last call to onSpend. */
  flush: () => Promise<void>;
  full: () => boolean;
  /** People kept so far (new ones). */
  keptCount: () => number;
  /** The items new to this search and not judged by an earlier run (now marked seen; known ones counted on the row). */
  freshItems: <T extends { url: string }>(items: readonly T[], row: SignalYield) => T[];
  /** Judges one batch in the background (JUDGE_CONCURRENCY at once); its outcomes are added to `row` when it ends. */
  judge: (stage: SignalStage, group: string, items: readonly JudgeInput[], row: SignalYield) => void;
  /** Waits for every judge call started so far; throws what stopped one (the deadline or an error). */
  settle: () => Promise<void>;
  /** Throws when a judge call in the background failed (so nothing more is searched). */
  check: () => void;
  /** A search call that failed: counted, and its row says error. */
  searchFailed: (row: SignalYield, what: string, error: unknown) => void;
};

/**
 * The shared frame of a source's search: the tuning, the budget and the deadline, the spend passed to onSpend, the
 * judge (pages in, new people out), and the result with its log entry. `body` does the source's own searching.
 */
export async function runSignalSearch(args: SignalSearchArgs, body: (frame: SignalSearchFrame) => Promise<void>): Promise<SignalSearchResult> {
  const normalized = normalizeSignalSource(args.source);
  if (!normalized) throw new Error(`unknown signal source: ${String(args.source)}`);
  const source: SignalSource = normalized;
  const info = signalSourceInfo(source);
  const { tuning } = normalizeSignalTuning(args.tuning ?? {}, source);
  const tuningVersion = signalTuningVersion(source, tuning);
  const budget = Math.max(0, args.budgetUsd);
  const now = args.now ?? new Date();
  const totals = createCompanyRunUsage();
  const knownUrls = args.knownUrls ?? new Set<string>();
  let searchUsd = 0;
  /** Judge calls waiting or running, at their estimate (so the budget check does not overrun while they go on). */
  let reservedUsd = 0;
  const spent = () => searchUsd + totals.costUsd;
  const searchCost = searchCostHint(tuning.resultsPerSearch);
  const seenPages = new Set<string>();
  const judgedPages = new Set<string>();
  const seenKeys = new Set<string>();
  const people = new Map<string, SignalPerson>();
  /** Kept people as the log keeps them (no names). */
  const logSamples: string[] = [];
  let stopped: SignalSearchResult["stopped"] = "done";
  let failure: string | null = null;
  /** Steps still running at the deadline, at their estimate (their real cost comes after the search returned). */
  let cutOffUsd = 0;
  let recordedUsd = 0;
  let searchErrors = 0;
  let knownPeople = 0;
  let knownUrlCount = 0;
  const limit = concurrencyLimit(JUDGE_CONCURRENCY);
  const pending = new Set<Promise<void>>();
  let broken: unknown = null;

  const flush = async () => {
    const delta = Math.round((spent() - recordedUsd) * 1_000_000) / 1_000_000;
    if (!args.onSpend || delta <= 0) return;
    recordedUsd += delta;
    try {
      await args.onSpend(delta);
    } catch (error) {
      // A lost log line never stops the search.
      console.warn("[gtm-agent:signals] spend", source, error instanceof Error ? error.message : String(error));
    }
  };
  const step = async <T>(work: () => Promise<T>, estimateUsd: number): Promise<T> => {
    const deadline = args.deadlineAt ?? null;
    if (deadline === null) return work();
    const left = deadline - Date.now();
    if (left <= 0) throw new SearchCutOff();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const running = work();
    try {
      return await Promise.race([
        running,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            cutOffUsd += estimateUsd;
            running.catch(() => undefined);
            reject(new SearchCutOff());
          }, left);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const frame: SignalSearchFrame = {
    source, info, tuning, now, budget, blocked: normalizeDomainList(args.blockedDomains ?? []), args,
    plans: [], yields: [], keptSamples: [], rejectedSamples: [], layoffs: [...(args.layoffs ?? [])],
    spent,
    room: (cap) => spent() + reservedUsd + searchCost <= cap,
    addSearchUsd: (usd) => { searchUsd += usd; },
    step, flush,
    full: () => people.size >= args.maxPeople,
    keptCount: () => people.size,
    freshItems: (items, row) => items.filter((item) => {
      const print = urlFingerprint(item.url);
      if (seenPages.has(print)) return false;
      seenPages.add(print);
      if (!knownUrls.has(print)) return true;
      row.knownUrls = (row.knownUrls ?? 0) + 1;
      knownUrlCount += 1;
      return false;
    }),
    judge: (stage, group, items, row) => {
      if (!items.length) return;
      reservedUsd += JUDGE_ESTIMATE_USD;
      const task: Promise<void> = limit(() => (broken ? Promise.resolve() : judgeNow(stage, group, items, row)))
        .catch((error) => { broken ??= error; })
        .finally(() => {
          reservedUsd -= JUDGE_ESTIMATE_USD;
          pending.delete(task);
        });
      pending.add(task);
    },
    settle: async () => {
      while (pending.size) await Promise.all([...pending]);
      if (broken) throw broken;
    },
    check: () => {
      if (broken) throw broken;
    },
    searchFailed: (row, what, error) => {
      searchErrors += 1;
      row.error = true;
      console.warn("[gtm-agent:signals]", source, what, row.group, error instanceof Error ? error.message : String(error));
    },
  };

  async function judgeNow(stage: SignalStage, group: string, items: readonly JudgeInput[], row: SignalYield): Promise<void> {
    const batch = judgeBatch(items, info.textChars);
    batch.forEach((page) => judgedPages.add(urlFingerprint(page.url)));
    const judged = await step(() => gtmStructuredCall<{ results: SignalJudgement[] }>({
      label: "gtm-agent:signals-judge", schemaName: "gtm_agent_signal_judge", schema: JUDGE_SCHEMA as unknown as Record<string, unknown>,
      ...judgePrompt(batch, { source, stage, tuning, layoffs: frame.layoffs, now }), maxTokens: info.sharedPages ? 6_000 : 4_000,
    }), searchCost);
    const sorted = sortVerdicts({
      batch, verdicts: judged.results ?? [], sharedPages: Boolean(info.sharedPages), minScore: tuning.minScore, known: args.known, seen: seenKeys,
    });
    for (const { verdict, page, outcome, who } of sorted) {
      const sample = `- ${verdict.kind} · ${verdict.headline || verdict.name} · ${verdict.signal}`.slice(0, 200);
      if (outcome === "rejected" || outcome === "below_score") frame.rejectedSamples.push(sample);
      if (outcome === "known") knownPeople += 1;
      if (outcome !== "kept" || !page || !who?.key) continue;
      who.keys.forEach((key) => seenKeys.add(key));
      people.set(who.key, {
        personKey: who.key, source: sourceOfUrl(page.url), method: signalMethod(stage, page.url), group,
        name: who.name, headline: verdict.headline || null, location: verdict.location || null,
        currentCompany: verdict.currentCompany || null, profileUrl: who.profileUrl, email: who.email, contactUrl: who.contactUrl,
        signalText: verdict.signal.slice(0, 600), signalUrl: page.url,
        signalAt: page.publishedDate && Number.isFinite(Date.parse(page.publishedDate)) ? new Date(page.publishedDate).toISOString() : null,
        pageText: plainPageText(page.text), language: verdict.language === "en" ? "en" : "ko", score: verdict.score, tuningVersion,
      });
      frame.keptSamples.push(sample);
      logSamples.push(signalLogSample(verdict.headline, verdict.signal));
      // No cut here: the batch is judged already, and the end keeps the best of everyone (contact, newest, score).
    }
    const counts = verdictCounts(sorted);
    for (const [field, value] of Object.entries(counts) as Array<[keyof typeof counts, number]>) {
      row[field] = (row[field] ?? 0) + value;
    }
    await flush();
  }

  await withLlmUsageContext(
    { requestId: randomUUID(), careerOrigin: "server", careerCapability: { name: "gtm_agent", step: `signals_${source}` }, companyRunUsage: totals },
    async () => {
      try {
        await body(frame);
        await frame.settle();
      } catch (error) {
        // What was kept so far stays (people, plans, yields, spend); the caller decides whether to try again.
        if (error instanceof SearchCutOff) {
          stopped = "deadline";
        } else {
          stopped = "error";
          failure = (error instanceof Error ? error.message : String(error)).slice(0, 300);
          console.warn("[gtm-agent:signals]", source, "stopped", failure);
        }
        // Judge calls not started yet are dropped; those running end too (at the deadline their steps are cut off as
        // well), and what they keep stays.
        broken ??= error;
        while (pending.size) await Promise.all([...pending]);
      }
      await flush();
    },
  );
  // More than maxPeople only from the last judged batches: those with a contact, then the newest, stay.
  const kept = rankSignalPeople([...people.values()]).slice(0, args.maxPeople);
  const newDomains = new Map<string, number>();
  for (const person of kept) {
    if (!isRegistrySource(person.source)) newDomains.set(person.source, (newDomains.get(person.source) ?? 0) + 1);
  }
  return {
    source, people: kept, costUsd: Number((spent() + cutOffUsd).toFixed(6)), plans: frame.plans, yields: frame.yields, tuning,
    tuningVersion, layoffs: frame.layoffs, stopped, error: failure, recordedUsd: Number(recordedUsd.toFixed(6)),
    newDomains: [...newDomains].map(([domain, count]) => ({ domain, kept: count })).sort((a, b) => b.kept - a.kept || a.domain.localeCompare(b.domain)),
    log: signalLogEntry({ tuningVersion, plans: frame.plans, yields: frame.yields, keptSamples: logSamples, at: now, judged: judgedPages }),
    searchErrors, knownPeople, knownUrls: knownUrlCount,
  };
}

type ExaResult = { url: string; title?: string | null; text?: string | null; publishedDate?: string | null };
type Article = { id: string; url: string; publishedDate: string | null; text: string; row: SignalYield };

/** A source's search on the web (Exa), plan → search → judge → revise. */
export async function searchSignalPeople(args: SignalSearchArgs): Promise<SignalSearchResult> {
  return runSignalSearch(args, (frame) => webSearch(frame));
}

async function webSearch(frame: SignalSearchFrame): Promise<void> {
  const { source, info, tuning, now, budget, blocked, args } = frame;
  const explore = source === EXPLORE_SOURCE;
  const layoffSearch = tuning.layoffSearch && source === "linkedin";
  const searchCost = searchCostHint(tuning.resultsPerSearch);
  const exa = getExaClient();

  /**
   * Plan → search → judge → revise for one stage, while there is room under `cap`. A round that keeps nobody new ends
   * the stage (the next round's plan would revise from nothing).
   */
  async function runStage(stage: SignalStage, rounds: number, cap: number, articles: Article[] = []) {
    // People newest first (the fresh window, then the rest of maxAgeDays); news in one window.
    const newsDays = Math.max(LAYOFF_NEWS_DAYS, tuning.maxAgeDays);
    const windows = stage === "layoff_news" ? signalWindows(newsDays, newsDays) : signalWindows(tuning.maxAgeDays);
    const stageYields: SignalYield[] = [];
    let previous: SignalPlan | null = null;
    for (let round = 1; round <= rounds; round += 1) {
      if (frame.full() || !frame.room(cap)) break;
      const prompt = planPrompt({
        source, stage, previous, yields: stageYields, keptSamples: frame.keptSamples.slice(-6), rejectedSamples: frame.rejectedSamples.slice(-6),
        budgetLeftUsd: Math.max(0, cap - frame.spent()), tuning, layoffs: frame.layoffs, history: args.history, openRoles: args.openRoles, now,
      });
      const planned = await frame.step(() => gtmStructuredCall<SignalPlan>({
        label: "gtm-agent:signals-plan", schemaName: "gtm_agent_signal_plan", schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
        system: prompt.system, user: prompt.user, maxTokens: 1_500,
      }), searchCost);
      await frame.flush();
      const queries = (planned.queries ?? []).filter((item) => item.query?.trim()).slice(0, MAX_QUERIES_PER_ROUND)
        .map((item) => ({ query: item.query.trim(), group: item.group?.trim() || "other" }));
      previous = { plan: planned.plan, reason: planned.reason ?? null, queries, stage };
      frame.plans.push(previous);
      if (!queries.length) break;

      const keptBefore = frame.keptCount();
      for (const window of windows) {
        for (const query of queries) {
          frame.check();
          if (frame.full() || !frame.room(cap)) break;
          const row = await searchQuery(stage, query, window, round, cap, articles);
          frame.yields.push(row);
          stageYields.push(row);
          await frame.flush();
        }
      }
      // The round's judging ends before its yields are read (the revision, the stop below).
      await frame.settle();
      // One news step: the companies it finds are what the people rounds look for.
      if (stage === "layoff_news") break;
      if (frame.keptCount() === keptBefore) break;
    }
  }

  /** One search on one publication window, its results judged in the background (people) or kept for the layoff step (news). */
  async function searchQuery(stage: SignalStage, query: SignalQuery, window: SignalWindow, round: number, cap: number, articles: Article[]): Promise<SignalYield> {
    const row: SignalYield = { stage, window: window.label, round, group: query.group, query: query.query, results: 0, kept: 0, withContact: 0, raw: 0 };
    const found = await frame.step(() => runSearch(exa, query, {
      domains: stageDomains(source, stage), exclude: stage === "explore" ? exploreExcludeDomains(blocked) : [], ...windowDates(window, now),
      results: tuning.resultsPerSearch, textChars: stage === "layoff_news" ? NEWS_TEXT_CHARS : info.textChars,
    }), searchCost).catch((error) => {
      if (error instanceof SearchCutOff) throw error;
      frame.searchFailed(row, `${stage} search`, error);
      return { results: [] as ExaResult[], costUsd: 0 };
    });
    frame.addSearchUsd(found.costUsd);
    row.raw = found.results.length;
    const fresh = frame.freshItems(found.results.filter((item) => item.url && resultFitsStage(item.url, source, stage, blocked)), row);
    row.results = fresh.length;
    if (stage === "layoff_news") {
      fresh.forEach((item) => articles.push({
        id: String(articles.length), url: item.url, publishedDate: item.publishedDate ?? null, row,
        text: `${item.title ?? ""}\n${item.text ?? ""}`.replace(/\s+/g, " ").slice(0, NEWS_TEXT_CHARS),
      }));
    } else if (fresh.length && frame.spent() < cap) {
      frame.judge(stage, query.group, fresh, row);
    }
    return row;
  }

  async function findLayoffs(articles: Article[]): Promise<LayoffCompany[]> {
    const read = articles.slice(0, LAYOFF_ARTICLES);
    if (!read.length || frame.spent() >= budget) return [];
    const extracted = await frame.step(() => gtmStructuredCall<{ events: LayoffEvent[] }>({
      label: "gtm-agent:signals-layoffs", schemaName: "gtm_agent_signal_layoffs", schema: LAYOFF_SCHEMA as unknown as Record<string, unknown>,
      ...layoffPrompt(read), maxTokens: 2_000,
    }), searchCost);
    await frame.flush();
    const found = layoffCompanies(extracted.events ?? [], read);
    for (const article of read) {
      if (found.some((item) => item.url === article.url)) article.row.kept += 1;
    }
    return found;
  }

  await runStage(explore ? "explore" : "signal", tuning.maxRounds, layoffSearch ? budget * (1 - LAYOFF_BUDGET_SHARE) : budget);
  if (!layoffSearch || frame.full()) return;
  if (frame.layoffs.length) {
    frame.plans.push({ plan: `Layoff companies from an earlier source of this run: ${frame.layoffs.map((item) => item.company).join(", ")}`, reason: null, queries: [], stage: "layoff_news" });
  } else {
    const articles: Article[] = [];
    await runStage("layoff_news", 1, budget, articles);
    frame.layoffs = await findLayoffs(articles);
  }
  if (frame.layoffs.length) await runStage("layoff_people", Math.min(LAYOFF_PEOPLE_ROUNDS, tuning.maxRounds), budget);
}

async function runSearch(
  exa: ReturnType<typeof getExaClient>,
  query: SignalQuery,
  options: {
    domains: readonly string[]; exclude: readonly string[]; startPublishedDate: string; endPublishedDate: string | null; results: number;
    textChars: number;
  },
) {
  const response = await (exa as unknown as {
    search: (query: string, options: Record<string, unknown>) => Promise<{ results?: ExaResult[]; costDollars?: { total?: number } }>;
  }).search(query.query, {
    numResults: options.results,
    // Exa takes include or exclude, not both: a source's own domains, or (open web) what to leave out.
    ...(options.domains.length ? { includeDomains: [...options.domains] } : options.exclude.length ? { excludeDomains: [...options.exclude] } : {}),
    // Posts by when they were written; profiles (the signal in their headline) by when they were last read. An
    // older window ends where the newer one begins, so it brings only pages the newer one could not.
    startPublishedDate: options.startPublishedDate,
    ...(options.endPublishedDate ? { endPublishedDate: options.endPublishedDate } : {}),
    type: "auto",
    contents: { text: { maxCharacters: options.textChars } },
  });
  const results = response.results ?? [];
  return { results, costUsd: exaSearchCost(response.costDollars?.total, results.length) };
}
