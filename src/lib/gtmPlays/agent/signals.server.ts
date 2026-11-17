import "server-only";

import { randomUUID } from "node:crypto";
import { createCompanyRunUsage } from "@/lib/llm/runUsage";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import { getExaClient } from "@/lib/tools/exaClient";
import { gtmStructuredCall } from "../llm.server";
import {
  EXPLORE_SOURCE, JUDGE_SCHEMA, LAYOFF_NEWS_DAYS, LAYOFF_SCHEMA, MAX_QUERIES_PER_ROUND, PLAN_SCHEMA, exaSearchCost, identifyPerson,
  exploreExcludeDomains, isRegistrySource, judgePrompt, layoffCompanies, layoffPrompt, normalizeDomainList, normalizeSignalSource, planPrompt, rankSignalPeople, resultFitsStage,
  searchCostHint, signalLogEntry, signalLogSample, signalMethod, signalSourceInfo, signalWindows, sourceOfUrl, stageDomains, windowDates,
  type LayoffCompany, type LayoffEvent, type SignalHistoryRun, type SignalJudgement, type SignalLogEntry, type SignalMethod, type SignalPlan,
  type SignalQuery, type SignalSource, type SignalStage, type SignalWindow, type SignalYield,
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
 * Bounded (#5 review): with `deadlineAt` the search stops there, whatever step it is in, and returns what it kept so
 * far (stopped "deadline"; a step still running is counted at its estimate). An error part-way returns what was kept
 * too (stopped "error"). Each paid step's cost goes to `onSpend` as soon as it is known (the spend log), so a search
 * cut off later never loses it; `recordedUsd` is how much went there, costUsd the whole.
 */

/** Share of the budget kept for the layoff method when it is on (the signal rounds stop before it). */
const LAYOFF_BUDGET_SHARE = 0.4;
/** People rounds after the news step. */
const LAYOFF_PEOPLE_ROUNDS = 2;
const LAYOFF_ARTICLES = 12;
const NEWS_TEXT_CHARS = 1_200;

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
};

/** Thrown inside the search when deadlineAt is reached: the search returns what it kept. */
class SearchCutOff extends Error {}

type ExaResult = { url: string; title?: string | null; text?: string | null; publishedDate?: string | null };
type Article = { id: string; url: string; publishedDate: string | null; text: string; row: SignalYield };

export async function searchSignalPeople(args: {
  /** A source id ("explore" for the open web); earlier ids ("opentowork") are read as their source. */
  source: SignalSource | "opentowork";
  /** The most this search may spend: its share of the run's search budget (settings' open-web split). */
  budgetUsd: number;
  maxPeople: number;
  /** Person keys the agent already knows (any status): never returned again. */
  known: ReadonlySet<string>;
  now?: Date;
  /** The source's tuning from /ops #5; missing fields take the defaults. */
  tuning?: Partial<SignalTuning> | null;
  /** Layoff companies an earlier source found in this run: reused instead of searching the news again. */
  layoffs?: readonly LayoffCompany[] | null;
  /** Never searched or kept (settings-level, /ops #5). */
  blockedDomains?: readonly string[] | null;
  /** What earlier runs of this source learned (newest first): each stage's first plan reads it. */
  history?: readonly SignalHistoryRun[] | null;
  /** When the search must stop (ms since epoch): it returns what it kept by then. */
  deadlineAt?: number | null;
  /** Called with each paid step's cost as soon as it is known (the spend log). */
  onSpend?: ((usd: number) => Promise<void>) | null;
}): Promise<SignalSearchResult> {
  const normalized = normalizeSignalSource(args.source);
  if (!normalized) throw new Error(`unknown signal source: ${String(args.source)}`);
  const source: SignalSource = normalized;
  const info = signalSourceInfo(source);
  const blocked = normalizeDomainList(args.blockedDomains ?? []);
  const explore = source === EXPLORE_SOURCE;
  const { tuning } = normalizeSignalTuning(args.tuning ?? {}, source);
  const layoffSearch = tuning.layoffSearch && source === "linkedin";
  const tuningVersion = signalTuningVersion(source, tuning);
  const budget = Math.max(0, args.budgetUsd);
  const now = args.now ?? new Date();
  const totals = createCompanyRunUsage();
  let exaUsd = 0;
  const spent = () => exaUsd + totals.costUsd;
  const searchCost = searchCostHint(tuning.resultsPerSearch);
  /** Room under the cap for one more search with its judging. */
  const room = (cap: number) => spent() + searchCost <= cap;
  const exa = getExaClient();
  const seenUrls = new Set<string>();
  const people = new Map<string, SignalPerson>();
  const plans: SignalPlan[] = [];
  const yields: SignalYield[] = [];
  const keptSamples: string[] = [];
  const rejectedSamples: string[] = [];
  /** Kept people as the log keeps them (no names). */
  const logSamples: string[] = [];
  let layoffs: LayoffCompany[] = [...(args.layoffs ?? [])];
  const full = () => people.size >= args.maxPeople;
  let stopped: SignalSearchResult["stopped"] = "done";
  let failure: string | null = null;
  /** Steps still running at the deadline, at their estimate (their real cost comes after the search returned). */
  let cutOffUsd = 0;
  let recordedUsd = 0;
  /** Passes what was spent since the last call to onSpend (never throws: a lost log line never stops the search). */
  const flush = async () => {
    const delta = Math.round((spent() - recordedUsd) * 1_000_000) / 1_000_000;
    if (!args.onSpend || delta <= 0) return;
    recordedUsd += delta;
    try {
      await args.onSpend(delta);
    } catch (error) {
      console.warn("[gtm-agent:signals] spend", source, error instanceof Error ? error.message : String(error));
    }
  };
  /** One paid step, cut off at the deadline (counted at `estimateUsd` then; its late answer is ignored). */
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

  async function judgeResults(stage: SignalStage, query: SignalQuery, fresh: ExaResult[]): Promise<{ kept: number; withContact: number }> {
    const batch = fresh.map((item, index) => ({
      id: String(index), url: item.url, publishedDate: item.publishedDate ?? null,
      text: `${item.title ?? ""}\n${item.text ?? ""}`.replace(/\s+/g, " ").slice(0, info.textChars),
    }));
    const judged = await step(() => gtmStructuredCall<{ results: SignalJudgement[] }>({
      label: "gtm-agent:signals-judge", schemaName: "gtm_agent_signal_judge", schema: JUDGE_SCHEMA as unknown as Record<string, unknown>,
      ...judgePrompt(batch, { source, stage, tuning, layoffs, now }), maxTokens: info.sharedPages ? 6_000 : 4_000,
    }), searchCost);
    let kept = 0;
    let withContact = 0;
    const used = new Set<string>();
    // Everyone the judge named on each page: on a thread page, an address near someone else's name is not this person's.
    const namesOnPage = new Map<string, string[]>();
    for (const verdict of judged.results ?? []) namesOnPage.set(verdict.id, [...(namesOnPage.get(verdict.id) ?? []), verdict.name]);
    for (const verdict of judged.results ?? []) {
      const item = batch[Number(verdict.id)];
      if (!item || (!info.sharedPages && used.has(verdict.id))) continue;
      used.add(verdict.id);
      const sample = `- ${verdict.kind} · ${verdict.headline || verdict.name} · ${verdict.signal}`.slice(0, 200);
      if (!verdict.keep || verdict.kind !== "seeking_individual" || verdict.score < tuning.minScore) {
        rejectedSamples.push(sample);
        continue;
      }
      const who = identifyPerson({
        url: item.url, text: item.text, email: verdict.email, contactUrl: verdict.contactUrl, name: verdict.name,
        others: namesOnPage.get(verdict.id),
      });
      if (!who.key || who.keys.some((key) => args.known.has(key) || people.has(key))) continue;
      people.set(who.key, {
        personKey: who.key, source: sourceOfUrl(item.url), method: signalMethod(stage, item.url), group: query.group,
        name: who.name, headline: verdict.headline || null, location: verdict.location || null,
        currentCompany: verdict.currentCompany || null, profileUrl: who.profileUrl, email: who.email, contactUrl: who.contactUrl,
        signalText: verdict.signal.slice(0, 600), signalUrl: item.url,
        signalAt: item.publishedDate ? new Date(item.publishedDate).toISOString() : null,
        language: verdict.language === "en" ? "en" : "ko", score: verdict.score, tuningVersion,
      });
      keptSamples.push(sample);
      logSamples.push(signalLogSample(verdict.headline, verdict.signal));
      kept += 1;
      if (who.email || who.contactUrl) withContact += 1;
      // No cut here: the batch is judged already, and the end keeps the best of everyone (contact, newest, score).
    }
    return { kept, withContact };
  }

  /** Plan → search → judge → revise for one stage, while there is room under `cap`. */
  async function runStage(stage: SignalStage, rounds: number, cap: number, articles: Article[] = []) {
    // People newest first (the fresh window, then the rest of maxAgeDays); news in one window.
    const newsDays = Math.max(LAYOFF_NEWS_DAYS, tuning.maxAgeDays);
    const windows = stage === "layoff_news" ? signalWindows(newsDays, newsDays) : signalWindows(tuning.maxAgeDays);
    const stageYields: SignalYield[] = [];
    let previous: SignalPlan | null = null;
    for (let round = 0; round < rounds; round += 1) {
      if (full() || !room(cap)) break;
      const prompt = planPrompt({
        source, stage, previous, yields: stageYields, keptSamples: keptSamples.slice(-6), rejectedSamples: rejectedSamples.slice(-6),
        budgetLeftUsd: Math.max(0, cap - spent()), tuning, layoffs, history: args.history, now,
      });
      const planned = await step(() => gtmStructuredCall<SignalPlan>({
        label: "gtm-agent:signals-plan", schemaName: "gtm_agent_signal_plan", schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
        system: prompt.system, user: prompt.user, maxTokens: 1_500,
      }), searchCost);
      await flush();
      const queries = (planned.queries ?? []).filter((item) => item.query?.trim()).slice(0, MAX_QUERIES_PER_ROUND)
        .map((item) => ({ query: item.query.trim(), group: item.group?.trim() || "other" }));
      previous = { plan: planned.plan, reason: planned.reason ?? null, queries, stage };
      plans.push(previous);
      if (!queries.length) break;

      for (const window of windows) {
        for (const query of queries) {
          if (full() || !room(cap)) break;
          const row = await searchQuery(stage, query, window, cap, articles);
          yields.push(row);
          stageYields.push(row);
          await flush();
        }
      }
      // One news step: the companies it finds are what the people rounds look for.
      if (stage === "layoff_news") break;
    }
  }

  /** One search on one publication window, its results judged (people) or kept for the layoff step (news). */
  async function searchQuery(stage: SignalStage, query: SignalQuery, window: SignalWindow, cap: number, articles: Article[]): Promise<SignalYield> {
    const found = await step(() => runSearch(exa, query, {
      domains: stageDomains(source, stage), exclude: stage === "explore" ? exploreExcludeDomains(blocked) : [], ...windowDates(window, now),
      results: tuning.resultsPerSearch, textChars: stage === "layoff_news" ? NEWS_TEXT_CHARS : info.textChars,
    }), searchCost).catch((error) => {
      if (error instanceof SearchCutOff) throw error;
      console.warn("[gtm-agent:signals]", source, stage, "search", query.group, error instanceof Error ? error.message : String(error));
      return { results: [] as ExaResult[], costUsd: 0 };
    });
    exaUsd += found.costUsd;
    const fresh = found.results.filter((item) => item.url && !seenUrls.has(item.url) && resultFitsStage(item.url, source, stage, blocked));
    fresh.forEach((item) => seenUrls.add(item.url));
    const row: SignalYield = { stage, window: window.label, group: query.group, query: query.query, results: fresh.length, kept: 0, withContact: 0 };
    if (stage === "layoff_news") {
      fresh.forEach((item) => articles.push({
        id: String(articles.length), url: item.url, publishedDate: item.publishedDate ?? null, row,
        text: `${item.title ?? ""}\n${item.text ?? ""}`.replace(/\s+/g, " ").slice(0, NEWS_TEXT_CHARS),
      }));
    } else if (fresh.length && spent() < cap) {
      Object.assign(row, await judgeResults(stage, query, fresh));
    }
    return row;
  }

  async function findLayoffs(articles: Article[]): Promise<LayoffCompany[]> {
    const read = articles.slice(0, LAYOFF_ARTICLES);
    if (!read.length || spent() >= budget) return [];
    const extracted = await step(() => gtmStructuredCall<{ events: LayoffEvent[] }>({
      label: "gtm-agent:signals-layoffs", schemaName: "gtm_agent_signal_layoffs", schema: LAYOFF_SCHEMA as unknown as Record<string, unknown>,
      ...layoffPrompt(read), maxTokens: 2_000,
    }), searchCost);
    await flush();
    const found = layoffCompanies(extracted.events ?? [], read);
    for (const article of read) {
      if (found.some((item) => item.url === article.url)) article.row.kept += 1;
    }
    return found;
  }

  await withLlmUsageContext(
    { requestId: randomUUID(), careerOrigin: "server", careerCapability: { name: "gtm_agent", step: `signals_${source}` }, companyRunUsage: totals },
    async () => {
      try {
        await runStage(explore ? "explore" : "signal", tuning.maxRounds, layoffSearch ? budget * (1 - LAYOFF_BUDGET_SHARE) : budget);
        if (!layoffSearch || full()) return;
        if (layoffs.length) {
          plans.push({ plan: `Layoff companies from an earlier source of this run: ${layoffs.map((item) => item.company).join(", ")}`, reason: null, queries: [], stage: "layoff_news" });
        } else {
          const articles: Article[] = [];
          await runStage("layoff_news", 1, budget, articles);
          layoffs = await findLayoffs(articles);
        }
        if (layoffs.length) await runStage("layoff_people", Math.min(LAYOFF_PEOPLE_ROUNDS, tuning.maxRounds), budget);
      } catch (error) {
        // What was kept so far stays (people, plans, yields, spend); the caller decides whether to try again.
        if (error instanceof SearchCutOff) {
          stopped = "deadline";
        } else {
          stopped = "error";
          failure = (error instanceof Error ? error.message : String(error)).slice(0, 300);
          console.warn("[gtm-agent:signals]", source, "stopped", failure);
        }
      }
      await flush();
    },
  );
  // More than maxPeople only from the last judged batch: those with a contact, then the newest, stay.
  const kept = rankSignalPeople([...people.values()]).slice(0, args.maxPeople);
  const newDomains = new Map<string, number>();
  for (const person of kept) {
    if (!isRegistrySource(person.source)) newDomains.set(person.source, (newDomains.get(person.source) ?? 0) + 1);
  }
  return {
    source, people: kept, costUsd: Number((spent() + cutOffUsd).toFixed(6)), plans, yields, tuning,
    tuningVersion, layoffs, stopped, error: failure, recordedUsd: Number(recordedUsd.toFixed(6)),
    newDomains: [...newDomains].map(([domain, count]) => ({ domain, kept: count })).sort((a, b) => b.kept - a.kept || a.domain.localeCompare(b.domain)),
    log: signalLogEntry({ tuningVersion, plans, yields, keptSamples: logSamples, at: now }),
  };
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
