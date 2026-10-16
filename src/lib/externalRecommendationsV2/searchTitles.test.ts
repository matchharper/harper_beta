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
      countries: [{ countryCode: "KR", weight: 1, remoteOnly: false }],
      postingRecency: null,
    },
    vectors,
    userId: "00000000-0000-4000-8000-000000000001",
    blockedCompanies: [],
    limit: 200 as const,
  };
  const sql = buildHybridSql(args);
  const calls: string[] = [];
  const names: string[] = [];
  const admin = {
    rpc: async (name: string, payload: { p_sql: string }) => {
      names.push(name); calls.push(payload.p_sql);
      return { data: [], error: null };
    },
  } as any;
  await retrieveRoles({ ...args, admin });
  assert.deepEqual(names, ["search_external_roles_filter_first"]);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /ORDER BY distance LIMIT 3000/);
  assert.match(calls[0], /company_roles/);
  assert.match(calls[0], /OPERATOR\(public\.<=>\)/);
  assert.match(calls[0], /testOnly/);
  assert.match(calls[0], /talent_opportunity_recommendation/);
  assert.doesNotMatch(sql, /country_targets|nearest_titles|unembedded_matches/);
  assert.throws(
    () => buildHybridSql({ ...args, vectors: [vector, vector] }),
    /one combined/
  );
  assert.throws(() => searchTitleText([" "]), /nonempty/);
  for (const prompt of [PLAN_PROMPT, WORKER_PLAN_PROMPT]) {
    assert.ok(prompt.includes(SEARCH_TITLE_INSTRUCTION));
    assert.doesNotMatch(prompt, /"locations"\s*:/);
  }
});

test("production plans and retrieval API require countries and never accept city filters", async () => {
  const { normalizeExternalSearchPlan } = await import("../talentOnboarding/jobPostingRecommendations");
  const { externalRetrievalRequestSchema } = await import("./searchRequest");
  const countries = [{ countryCode: "KR", weight: 1, remoteOnly: false }];
  const plan = normalizeExternalSearchPlan({ countries, role_titles: ["Backend Engineer"], locations: ["Seoul"] }, "Backend");
  assert.deepEqual(plan.countries, countries);
  assert.equal("locations" in plan, false);
  const request = { userId: "00000000-0000-4000-8000-000000000001", plan };
  assert.equal(externalRetrievalRequestSchema.safeParse(request).success, true);
  assert.equal(externalRetrievalRequestSchema.safeParse({ ...request, plan: { ...plan, locations: ["Seoul"] } }).success, false);
  const { countries: _countries, ...missing } = plan;
  assert.equal(externalRetrievalRequestSchema.safeParse({ ...request, plan: missing }).success, false);
  assert.throws(() => normalizeExternalSearchPlan({ role_titles: ["Backend"], locations: ["Seoul"] }, "Backend"));
});
