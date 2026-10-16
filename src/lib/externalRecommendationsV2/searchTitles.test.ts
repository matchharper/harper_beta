import test from "node:test";
import assert from "node:assert/strict";
import { embedSearchTitles, buildHybridSql, retrieveRoles } from "./retrieval";
import { SEARCH_TITLE_INSTRUCTION, searchTitleText } from "./searchTitles";
import { PLAN_PROMPT, WORKER_PLAN_PROMPT } from "./prompts";

test("localized role titles share one comma-joined embedding and one ANN lookup", async (t) => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });
  const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
  const requests: unknown[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options: RequestInit) => {
      requests.push(JSON.parse(String(options.body)));
      return new Response(
        JSON.stringify({ data: [{ index: 0, embedding: vector }], usage: {} }),
        { status: 200 }
      );
    }
  );
  const titles = [
    " AI Engineer ",
    "AI 엔지니어",
    "Software Engineer",
    "ソフトウェアエンジニア",
  ];
  const vectors = await embedSearchTitles(titles);
  assert.equal(requests.length, 1);
  assert.deepEqual((requests[0] as any).input, [
    "AI Engineer, AI 엔지니어, Software Engineer, ソフトウェアエンジニア",
  ]);
  assert.deepEqual(vectors, [vector]);
  const args = {
    plan: {
      searchIntentSummary: "AI roles",
      roleTitles: titles,
      ftsKeywords: [{ terms: ["AI"], weight: 1 }],
      includeContract: false,
      includeIntern: false,
      includeParttime: false,
      includeRemote: true,
      remoteOnly: false,
      isPreferEntry: 0 as const,
      locations: [],
      countries: [{ countryCode: "KR", weight: 1, remoteOnly: false }],
      postingRecency: null,
    },
    vectors,
    userId: "00000000-0000-4000-8000-000000000001",
    blockedCompanies: [],
    limit: 200 as const,
  };
  const sql = buildHybridSql(args);
  const neighbors = [
    { title_key: "synthetic-key", title: "Engineer's role", distance: 0.2 },
  ];
  const calls: string[] = [];
  const admin = {
    rpc: async (_name: string, payload: { p_sql: string }) => {
      calls.push(payload.p_sql);
        return { data: calls.length === 1 ? [{ title_neighbors: neighbors }] : [], error: null };
    },
  } as any;
  await retrieveRoles({ ...args, admin });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /LIMIT 5000/);
  assert.doesNotMatch(calls[0], /company_roles/);
  assert.match(calls[1], /jsonb_to_recordset/);
  assert.match(calls[1], /Engineer''s role/);
  assert.doesNotMatch(calls[1], /OPERATOR\(public\.<=>\)/);
  assert.match(calls[1], /testOnly/);
  assert.match(calls[1], /talent_opportunity_recommendation/);
  assert.equal((sql.match(/nearest_\d+ AS MATERIALIZED/g) ?? []).length, 1);
  assert.throws(
    () => buildHybridSql({ ...args, vectors: [vector, vector] }),
    /one combined/
  );
  assert.throws(() => searchTitleText([" "]), /nonempty/);
  for (const prompt of [PLAN_PROMPT, WORKER_PLAN_PROMPT])
    assert.ok(prompt.includes(SEARCH_TITLE_INSTRUCTION));
});
