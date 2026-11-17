import "server-only";

import {
  HN_GROUP, HN_JUDGE_BATCH, HN_THREADS_URL, hnItemApiUrl, hnJudgeInput, hnKoreaComments, hnThreads, type HnThread,
} from "./signals.hn";
import type { SignalYield } from "./signals";
import { SearchCutOff, runSignalSearch, type SignalSearchArgs, type SignalSearchFrame, type SignalSearchResult } from "./signals.server";

/**
 * #5 사람 찾기 on Hacker News (source "hn") through the free HN API instead of the web search (signals.hn.ts): the
 * "Who wants to be hired?" threads of this month and last, their top-level comments that mention Korea and were
 * written within maxAgeDays, each comment judged as its own page in batches (a few at once), comments judged by an
 * earlier run skipped. Only the judging costs money. Same frame, result and log as the other sources
 * (signals.server.ts runSignalSearch).
 */

const FETCH_TIMEOUT_MS = 20_000;

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "harper-gtm-agent" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HN API ${response.status}`);
  return response.json();
}

/** The HN source's search (`args.source` is read as "hn"). */
export async function searchHnPeople(args: SignalSearchArgs): Promise<SignalSearchResult> {
  return runSignalSearch({ ...args, source: "hn" }, hnSearch);
}

async function hnSearch(frame: SignalSearchFrame): Promise<void> {
  const { tuning, now } = frame;
  const window = `0-${tuning.maxAgeDays}d`;
  const row = (query: string): SignalYield => ({
    stage: "signal", window, round: 1, group: HN_GROUP, query, results: 0, kept: 0, withContact: 0, raw: 0,
  });
  const notes: string[] = [];
  const plan = () => frame.plans.push({
    plan: `Hacker News API: "Who wants to be hired?" threads, top-level comments that mention Korea, written in the last ${tuning.maxAgeDays} days, each judged once. ${notes.join(" · ")}`.trim(),
    reason: null, queries: [], stage: "signal",
  });
  let threads: HnThread[];
  try {
    threads = hnThreads(await frame.step(() => getJson(HN_THREADS_URL), 0), now, tuning.maxAgeDays);
  } catch (error) {
    if (error instanceof SearchCutOff) throw error;
    const failed = row("whoishiring threads");
    frame.searchFailed(failed, "hn threads", error);
    frame.yields.push(failed);
    notes.push("the thread list could not be read");
    plan();
    return;
  }
  if (!threads.length) notes.push("no thread in the window");
  for (const thread of threads) {
    frame.check();
    const yielded = row(thread.title);
    frame.yields.push(yielded);
    let item: unknown;
    try {
      item = await frame.step(() => getJson(hnItemApiUrl(thread.id)), 0);
    } catch (error) {
      if (error instanceof SearchCutOff) throw error;
      frame.searchFailed(yielded, "hn thread", error);
      notes.push(`${thread.title}: could not be read`);
      continue;
    }
    const comments = hnKoreaComments(item, now, tuning.maxAgeDays);
    yielded.raw = comments.topLevel;
    const fresh = frame.freshItems(comments.fresh.map((comment) => hnJudgeInput(thread, comment)), yielded);
    notes.push(`${thread.title}: ${comments.topLevel} comments, ${comments.korea} mention Korea, ${comments.fresh.length} within ${tuning.maxAgeDays} days, ${fresh.length} not judged before`);
    // Comments left unjudged (budget, full) are not remembered as judged: a later run takes them.
    for (let start = 0; start < fresh.length; start += HN_JUDGE_BATCH) {
      if (frame.full() || !frame.room(frame.budget)) break;
      const batch = fresh.slice(start, start + HN_JUDGE_BATCH);
      yielded.results += batch.length;
      frame.judge("signal", HN_GROUP, batch, yielded);
    }
  }
  plan();
  await frame.settle();
}
