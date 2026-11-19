import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseCompaniesToFill, COMPANY_PREPARATION_CONCURRENCY, needsInformation, prepareCompanies, retrievalRanks, scoreRanks,
} from "./fill";

const context = { admin: {} as never, userId: "u1" };

test("companies near the top by score or by retrieval are filled when their information is missing or stale", () => {
  const now = Date.parse("2026-11-19T00:00:00Z");
  const fresh = { checkedAt: "2026-11-15T00:00:00Z" }, old = { checkedAt: "2026-10-01T00:00:00Z" };
  assert.equal(needsInformation("current", fresh, now), false);
  assert.equal(needsInformation("current", old, now), true);
  assert.equal(needsInformation("stale", fresh, now), true);
  assert.equal(needsInformation("missing", fresh, now), true);
  assert.equal(needsInformation(undefined, undefined, now), true);

  const byScore = scoreRanks([
    { key: "company:a", score: 70 }, { key: "role:r1", score: 90 }, { key: "company:b", score: 40 },
    { key: "company:c", score: null }, { key: "company:d", score: 65 },
  ]);
  assert.deepEqual([...byScore], [["role:r1", 1], ["company:a", 2], ["company:d", 3], ["company:b", 4]]);

  // Retrieval order holds each route's companies in the order they were found.
  const near = retrievalRanks(["a", "b", "c", "d", "e"], { a: ["about"], b: ["about", "like"], c: ["like"], d: ["about"], e: ["named"] });
  assert.deepEqual([...near], [["a", 1], ["b", 1], ["c", 2], ["d", 3], ["e", 1]]);

  assert.deepEqual(chooseCompaniesToFill([
    { companyId: "low-but-close", scoreRank: 40, retrievalRank: 1, needsInformation: true },
    { companyId: "top-current", scoreRank: 1, retrievalRank: 5, needsInformation: false },
    { companyId: "top-stale", scoreRank: 2, retrievalRank: 9, needsInformation: true },
    { companyId: "far", scoreRank: 31, retrievalRank: 31, needsInformation: true },
    { companyId: "unscored-close", scoreRank: null, retrievalRank: 3, needsInformation: true },
    { companyId: "edge", scoreRank: 30, needsInformation: true },
  ], 30), ["low-but-close", "top-stale", "unscored-close", "edge"]);
});

test("preparation waits only for its budget; the rest finishes in the background", async () => {
  const started: string[] = [], kept: Promise<unknown>[] = [];
  const release = new Map<string, () => void>();
  const prepare = async (_: unknown, id: string) => {
    started.push(id);
    if (id === "broken") throw new Error("provider down");
    if (id.startsWith("slow")) await new Promise<void>(resolve => release.set(id, resolve));
  };
  const result = await prepareCompanies(context, ["quick", "slow-1", "broken", "quick", "slow-2"],
    { budgetMs: 30, prepare, keepAlive: work => kept.push(work) });
  assert.deepEqual(result, { ready: ["quick"], pending: ["slow-1", "slow-2"], failed: ["broken"], deferred: [] });
  assert.equal(kept.length, 1);
  for (const done of release.values()) done();
  await kept[0];
  assert.deepEqual(started.sort(), ["broken", "quick", "slow-1", "slow-2"]);

  // Everything done within the budget: nothing is left to keep alive.
  const all = await prepareCompanies(context, ["a", "b"], { budgetMs: 1_000, prepare: async () => undefined, keepAlive: work => kept.push(work) });
  assert.deepEqual(all, { ready: ["a", "b"], pending: [], failed: [], deferred: [] });
  assert.equal(kept.length, 1);
  assert.deepEqual(await prepareCompanies(context, [], { budgetMs: 0, prepare }), { ready: [], pending: [], failed: [], deferred: [] });
});

test("named companies are all prepared, while a budget-bound fill starts no company after its budget", async () => {
  const many = Array.from({ length: COMPANY_PREPARATION_CONCURRENCY + 2 }, (_, i) => `c${i}`);
  const slow = async (ids: string[], startWithinBudget: boolean) => {
    const started: string[] = [], kept: Promise<unknown>[] = [];
    const result = await prepareCompanies(context, ids, { budgetMs: 20, startWithinBudget, keepAlive: work => kept.push(work),
      prepare: async (_, id) => { started.push(id); await new Promise(resolve => setTimeout(resolve, 40)); } });
    await Promise.all(kept);
    return { result, started };
  };
  const bounded = await slow(many, true);
  assert.deepEqual(bounded.result.pending, many.slice(0, COMPANY_PREPARATION_CONCURRENCY));
  assert.deepEqual(bounded.result.deferred, many.slice(COMPANY_PREPARATION_CONCURRENCY));
  assert.deepEqual(bounded.started, many.slice(0, COMPANY_PREPARATION_CONCURRENCY));
  const named = await slow(many, false);
  assert.deepEqual(named.result.pending, many);
  assert.deepEqual(named.result.deferred, []);
  assert.deepEqual(named.started.sort(), [...many].sort());
});

test("companies are prepared a bounded number at a time, and the caller can stop waiting", async () => {
  let running = 0, peak = 0;
  const prepare = async () => {
    running++; peak = Math.max(peak, running);
    await new Promise(resolve => setTimeout(resolve, 5));
    running--;
  };
  const ids = Array.from({ length: COMPANY_PREPARATION_CONCURRENCY * 2 + 1 }, (_, i) => `c${i}`);
  const result = await prepareCompanies(context, ids, { budgetMs: 5_000, prepare });
  assert.equal(result.ready.length, ids.length);
  assert.equal(peak, COMPANY_PREPARATION_CONCURRENCY);

  const stop = new AbortController(), kept: Promise<unknown>[] = [];
  const waiting = prepareCompanies(context, ["never"], { budgetMs: 5_000, signal: stop.signal,
    prepare: () => new Promise(() => undefined), keepAlive: work => kept.push(work) });
  stop.abort(new Error("turn stopped"));
  await assert.rejects(waiting, /turn stopped/);
  assert.equal(kept.length, 1);
});
