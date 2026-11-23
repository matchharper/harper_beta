import "server-only";

import { getExaClient } from "@/lib/tools/exaClient";
import { gtmStructuredCall } from "../llm.server";
import { measured } from "./compose.server";
import {
  EVENT_MAX_DAYS, EVENT_PAGE_CHARS, EVENT_SCHEMA, checkedEvents, eventPages, eventPrompt, eventQueries, eventSearchFacts, eventsNote,
  type EventPick,
} from "./events";
import { exaSearchCost } from "./signals";
import type { AgentOfferEvent, AgentPerson } from "./types";

export { EVENT_MAX_DAYS, EVENTS_PER_MAIL } from "./events";

/** Results per query: enough event pages to choose from, few enough to keep one person's search cheap. */
const RESULTS_PER_QUERY = 8;
const SEARCH_TIMEOUT_MS = 25_000;
const MODEL_TIMEOUT_MS = 60_000;

type ExaResult = { url: string; title?: string | null; text?: string | null; publishedDate?: string | null };
type ExaSearch = (query: string, options: Record<string, unknown>) => Promise<{ results?: ExaResult[]; costDollars?: { total?: number } }>;

/** One search; past the time limit it counts at its estimate (the call may still be billed). */
async function searchOnce(search: ExaSearch, query: string): Promise<{ results: ExaResult[]; costUsd: number; failed: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      search(query, { numResults: RESULTS_PER_QUERY, type: "auto", contents: { text: { maxCharacters: EVENT_PAGE_CHARS } } }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("event search timed out")), SEARCH_TIMEOUT_MS);
      }),
    ]);
    const results = response.results ?? [];
    return { results, costUsd: exaSearchCost(response.costDollars?.total, results.length), failed: false };
  } catch (error) {
    console.warn("[gtm-agent:events] search", error instanceof Error ? error.message : String(error));
    const timedOut = error instanceof Error && error.message === "event search timed out";
    return { results: [], costUsd: timedOut ? exaSearchCost(null, RESULTS_PER_QUERY) : 0, failed: true };
  }
}

/**
 * Events for a general mail (Shaun 11/23: the DB and event-seeking posts get fitting postings and events): up to
 * `max` events in the person's field, online or in their city, starting within EVENT_MAX_DAYS, each with why it fits.
 *
 * One search round (events.ts eventQueries: near them, online, hiring events; at most 3 queries, run together), then
 * one model call that picks and writes the events from those results only. The checks are code (events.ts
 * checkedEvents): the link is the result's own page, the name is on it, the date starts after `now` and within
 * EVENT_MAX_DAYS. Never throws: a search that found nothing or failed gives events [] with a note.
 */
export async function findAgentEvents(person: AgentPerson, args: { language: "ko" | "en"; max: number; now?: Date }): Promise<{
  events: AgentOfferEvent[]; costUsd: number; note: string | null;
}> {
  const now = args.now ?? new Date();
  const max = Math.max(0, Math.floor(args.max));
  let costUsd = 0;
  const done = (events: AgentOfferEvent[], note: string | null) => ({ events, costUsd: Number(costUsd.toFixed(6)), note });
  if (!max) return done([], null);
  const facts = eventSearchFacts(person);
  const queries = eventQueries(facts, { language: args.language, now });
  if (!queries.length) return done([], "분야를 몰라서 이벤트를 찾지 않았어요");
  try {
    const exa = getExaClient() as unknown as { search: ExaSearch };
    const searched = await Promise.all(queries.map((query) => searchOnce(exa.search.bind(exa), query)));
    costUsd += searched.reduce((sum, item) => sum + item.costUsd, 0);
    const failed = searched.filter((item) => item.failed).length;
    // Results in query order, interleaved, so each query's best pages make the cut.
    const lists = searched.map((item) => item.results);
    const interleaved = Array.from({ length: RESULTS_PER_QUERY }, (_, index) => lists.flatMap((list) => (list[index] ? [list[index]] : []))).flat();
    const pages = eventPages(interleaved);
    if (!pages.length) {
      return done([], failed === queries.length ? "이벤트 검색이 안 됐어요" : eventsNote({ queries: queries.length, failed, pages: 0, found: 0, dropped: {} }));
    }
    const prompt = eventPrompt({
      person: { headline: person.headline, location: person.location, currentCompany: person.currentCompany, background: person.profileText },
      facts, pages, language: args.language, now, max, maxDays: EVENT_MAX_DAYS,
    });
    const { value, costUsd: modelUsd } = await measured("events", () => gtmStructuredCall<{ events?: Partial<EventPick>[] }>({
      label: "gtm-agent:events", schemaName: "gtm_agent_events", schema: EVENT_SCHEMA as unknown as Record<string, unknown>,
      system: prompt.system, user: prompt.user, maxTokens: 1_500, signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    }));
    costUsd += modelUsd;
    const { events, dropped } = checkedEvents(Array.isArray(value.events) ? value.events : [], pages, { now, max, maxDays: EVENT_MAX_DAYS });
    return done(events, eventsNote({ queries: queries.length, failed, pages: pages.length, found: events.length, dropped }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[gtm-agent:events] failed", person.id, message);
    return done([], `이벤트를 찾다가 멈췄어요: ${message}`.slice(0, 200));
  }
}
