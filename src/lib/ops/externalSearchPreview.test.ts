import test from "node:test";
import assert from "node:assert/strict";
import {
  createPreviewVectorCache,
  previewExternalSearch,
} from "./externalSearchPreview.server";
import {
  externalSearchPreviewRequest,
  type PreviewQuery,
} from "./externalSearchPreview";

type Dependencies = NonNullable<Parameters<typeof previewExternalSearch>[2]>;
const userId = "00000000-0000-4000-8000-000000000001";
const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
export const query: PreviewQuery = {
  plan: {
    searchIntentSummary: "Synthetic backend",
    roleTitles: ["Backend"],
    ftsKeywords: [{ terms: ["backend"], weight: 1 }],
    countries: [
      { countryCode: "KR", weight: 100, remoteOnly: false },
      { countryCode: "US", weight: 1, remoteOnly: true },
    ],
    includeContract: false,
    includeIntern: false,
    includeParttime: false,
    includeRemote: true,
    remoteOnly: false,
    isPreferEntry: 0,
    postingRecency: null,
  },
  targetSalaryKrw: null,
};
function dependencies(): Dependencies {
  const forbidden = async () => {
    throw new Error("Unexpected paid/planner call");
  };
  const cache = createPreviewVectorCache();
  cache.set(userId, query.plan.roleTitles, [vector]);
  return {
    getSupabaseAdmin: () => ({}) as any,
    loadExternalContext: async () => ({ blockedCompanies: ["Blocked"] }) as any,
    getSearchPlan: forbidden,
    complete: forbidden,
    embedSearchTitles: forbidden,
    vectorsCache: cache,
    execute: async () => [{ rows: [], counts: { candidates: 0 }, timings: { candidateSearchMs: 0, rerankMs: 0 } }],
  };
}
test("vector cache separates users/titles, clones values, and expires", () => {
  let time = 0;
  const cache = createPreviewVectorCache(() => time);
  cache.set(userId, ["Backend"], [vector]);
  assert.equal(cache.get("other", ["Backend"]), undefined);
  assert.equal(cache.get(userId, ["Frontend"]), undefined);
  cache.get(userId, ["Backend"])![0][0] = 99;
  assert.equal(cache.get(userId, ["Backend"])![0][0], 1);
  time = 300000;
  assert.equal(cache.get(userId, ["Backend"]), undefined);
});
test("manual query uses shared HNSW retrieval, fresh eligibility and cached vector", async () => {
  const deps = dependencies();
  deps.execute = async (_admin, sql) => {
    assert.doesNotMatch(sql, /country_targets|nearest_titles/);
    assert.match(sql, /halfvec\(1536\)/);
    assert.match(sql, /Blocked/);
    assert.match(sql, /0.9 \* \(2 \* salary_utility - 1\)/);
    assert.match(sql, /LIMIT 500/);
    return [{ counts: { candidates: 1 }, timings: { candidateSearchMs: 1, rerankMs: 2 }, rows: [
      {
        role_id: "role",
        role_name: "Backend",
        salary_min: 80000000,
        salary_currency: "KRW",
        salary_period: "year",
        description: "not returned",
      },
    ] }];
  };
  const result = await previewExternalSearch(
    { talentId: userId, action: "search", query, salaryWeight: 0.9 },
    undefined,
    deps
  );
  assert.equal(result.error, null);
  assert.equal(result.embeddingReused, true);
  assert.equal(result.rows[0].salaryMinKrw, 80000000);
  assert.equal(result.calls.length, 0);
  assert.equal(result.sql.length, 1);
  assert.ok(!JSON.stringify(result).includes("not returned"));
});
test("timeout retains SQL, successful stages and failing-stage duration", async () => {
  const deps = dependencies();
  deps.execute = async () => {
    throw new Error("statement timeout");
  };
  const result = await previewExternalSearch(
    { talentId: userId, action: "search", method: "filter_first", query },
    undefined,
    deps
  );
  assert.equal(result.error, "statement timeout");
  assert.equal(result.sql.length, 1);
  assert.equal(result.timings.at(-1)?.status, "error");
  assert.ok(result.totalMs >= 0);
  assert.deepEqual(result.query, query);
});
test("invalid query/SQL, N and contradictory filters fail before reads or paid calls", async () => {
  const deps = dependencies();
  deps.getSupabaseAdmin = () => {
    throw new Error("Must not access data");
  };
  for (const input of [
    { talentId: "bad" },
    { talentId: userId, action: "search" },
    {
      talentId: userId,
      action: "search",
      query,
      sql: "delete from company_roles",
    },
    { talentId: userId, action: "search", query, candidateLimit: 0 },
    {
      talentId: userId,
      action: "search",
      query: { ...query, plan: { ...query.plan, includeRemote: false } },
    },
  ])
    await assert.rejects(
      previewExternalSearch(input, undefined, deps),
      (e: any) => e.status === 400
    );
  assert.equal(
    externalSearchPreviewRequest.safeParse({
      talentId: userId,
      query: { ...query, plan: { ...query.plan, surpriseSql: "select 1" } },
    }).success,
    false
  );
});
test("old editor JSON drops the empty locations field before search and response", async () => {
  const legacy = { ...query, plan: { ...query.plan, locations: [] } };
  const result = await previewExternalSearch(
    { talentId: userId, action: "search", query: legacy },
    undefined,
    dependencies()
  );
  assert.equal(result.error, null);
  assert.deepEqual(result.query, query);
  assert.equal("locations" in result.query!.plan, false);
  for (const fields of [
    { locations: ["Seoul"] },
    { locations: [], surpriseSql: "select 1" },
  ]) {
    assert.equal(
      externalSearchPreviewRequest.safeParse({
        talentId: userId,
        action: "search",
        query: { ...query, plan: { ...query.plan, ...fields } },
      }).success,
      false
    );
  }
});
test("prepare is dry-run and captures raw planner output, model, usage, vectors", async () => {
  const deps = dependencies();
  deps.complete = async (args) => {
    args.onUsage?.({
      model: "gpt-6-luna",
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    });
    return '{"defaultAction":"reuse"}';
  };
  deps.getSearchPlan = async (args, _loaded, complete) => {
    assert.equal(args.dryRun, true);
    assert.equal(args.surface, "worker");
    await complete!("system", "input", "plan");
    return {
      plan: query.plan,
      titleVectors: [vector],
      targetSalaryKrw: null,
    } as any;
  };
  const result = await previewExternalSearch(
    { talentId: userId, action: "prepare" },
    undefined,
    deps
  );
  assert.equal(result.error, null);
  assert.equal(result.rawOutput, '{"defaultAction":"reuse"}');
  assert.equal(result.calls[0].model, "gpt-6-luna");
  assert.equal(result.calls[0].inputTokens, 100);
  assert.ok(result.calls[0].estimatedCostUsd !== null);
  assert.equal(result.rows.length, 0);
});

test("editing title query refreshes only the embedding and records its cost and DB stages", async () => {
  const deps = dependencies();
  let embeddingCalls = 0;
  deps.embedSearchTitles = async (titles, _signal, onUsage) => {
    embeddingCalls++;
    assert.deepEqual(titles, ["Changed title"]);
    onUsage?.({ prompt_tokens: 10, total_tokens: 10 }, 12);
    return [vector];
  };
  deps.execute = async () => [
    {
      rows: [],
      counts: {
        eligible: 12,
        embedded: 0,
        missingEmbedding: 12,
        candidates: 0,
      },
      timings: { candidateSearchMs: 4, rerankMs: 5 },
    },
  ];
  const edited = {
    ...query,
    plan: { ...query.plan, roleTitles: ["Changed title"] },
  };
  const request = {
    talentId: userId,
    action: "search",
    method: "filter_first",
    query: edited,
  };
  const first = await previewExternalSearch(request, undefined, deps);
  assert.equal(first.error, null);
  assert.equal(embeddingCalls, 1);
  assert.equal(first.embeddingReused, false);
  assert.ok(Math.abs(first.calls[0].estimatedCostUsd! - 0.0000002) < 1e-12);
  assert.equal(first.counts.missingEmbedding, 12);
  assert.deepEqual(
    first.timings.filter((t) => t.scope === "database").map((t) => t.ms),
    [4, 5]
  );
  const second = await previewExternalSearch(request, undefined, deps);
  assert.equal(second.embeddingReused, true);
  assert.equal(embeddingCalls, 1);
  assert.equal(second.calls.length, 0);
});
