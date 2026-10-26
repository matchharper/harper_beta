import { buildScoringInput, v2PromptCandidate } from "./scoringInput";
import test from "node:test";
import assert from "node:assert/strict";
import { fetchExternalFitCache, roleCard } from "../talentOnboarding/jobPostingRecommendations";
import {
  parsePlan,
  v2CompletionRequest,
  generateSummaries,
  rerankCandidates,
  getSearchPlan,
  loadFitCache,
  type EngineArgs,
} from "./engine";
import { SEARCH_PLAN_VERSION, evaluatorKey, fingerprint } from "./contract";
import { PLAN_PROMPT, WORKER_PLAN_PROMPT } from "./prompts";
const cards = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    roleCard({
      role_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      role_name: `Backend ${i}`,
      description: "Synthetic backend work",
      company_workspace_id: `00000000-0000-4000-9000-${String(i + 1).padStart(12, "0")}`,
      company_name: `Synthetic company ${i}`,
    })
  );
const args: EngineArgs = {
  admin: {} as any,
  userId: "00000000-0000-4000-8000-000000000000",
  surface: "web",
  language: "en",
  dryRun: true,
};
test("control cached scores reach reranking without requiring V2 dimensions", async () => {
  const [card] = cards(1);
  card.roleSummary = { en: { content: "Existing role summary" } };
  const selected = await rerankCandidates(
    args,
    {},
    [{ card, score: 82.34, fit: { legacyScore: 82.34 } }],
    async (_system, input) => {
      assert.match(input, /legacyScore/);
      assert.match(input, /82\.3/);
      assert.doesNotMatch(input, /candidateInterest/);
      return {
        selectedRoles: [
          { candidateId: "1", recommendationNote: "Relevant prior experience" },
        ],
      };
    }
  );
  assert.equal(selected[0].card.roleId, card.roleId);
  await assert.rejects(
    rerankCandidates(args, {}, [{ card, score: 80, fit: { mutualFit: 80 } }]),
    /No valid fit evaluations/
  );
});
test("web summarizes only ten missing-language roles in one call; worker covers its whole top hundred", async () => {
  for (const surface of ["web", "worker"] as const) {
    const input = cards(100);
    input[0].roleSummary = { en: { content: "Existing summary to preserve" } };
    let calls = 0,
      count = 0;
    const completed = async (_system: string, text: string) => {
      calls++;
      const ids = input
        .filter((c) => text.includes(c.roleId))
        .map((c) => c.roleId);
      count += ids.length;
      return {
        evaluations: ids.map((roleId) => ({
          roleId,
          fitSummary: "A factual neutral summary.",
        })),
      };
    };
    await generateSummaries({ ...args, surface }, input, completed);
    assert.equal(calls, surface === "web" ? 1 : 10);
    assert.equal(count, surface === "web" ? 10 : 99);
    assert.equal(
      (input[0].roleSummary?.en as any).content,
      "Existing summary to preserve"
    );
  }
});
test("incomplete summaries are excluded while valid summaries are saved and reranked", async () => {
  const input = cards(5);
  let saved: any[] = [];
  const admin: any = {
    rpc: async (name: string, payload: any) => {
      assert.equal(name, "save_external_role_summaries_v2");
      saved = payload.p_rows;
      return {
        data: saved.map((row) => ({
          role_id: row.roleId,
          summary: { en: row.payload },
        })),
        error: null,
      };
    },
  };
  const count = await generateSummaries(
    { ...args, admin, dryRun: false },
    input,
    async () => ({
      evaluations: [
        { roleId: input[0].roleId },
        {
          roleId: input[1].roleId,
          fitSummary: 65,
        },
        {
          roleId: input[2].roleId,
          fitSummary: "",
        },
        {
          roleId: input[3].roleId,
          fitSummary: "Valid summary",
        },
        // The fifth role is omitted entirely.
      ],
    })
  );
  assert.equal(count, 1);
  assert.deepEqual(
    saved.map((row) => row.roleId),
    [input[3].roleId]
  );
  const selected = await rerankCandidates(
    args,
    {},
    input.map((card) => ({
      card,
      score: 50,
      fit: {
        candidateInterest: 60,
        companyInterest: 60,
        mutualFit: 60,
        roleFit: 60,
        constraintPass: 100,
        evidence: "partial",
      },
    })),
    async (_system, text) => {
      assert.ok(text.includes("Valid summary"));
      assert.ok(!text.includes("Missing score"));
      return {
        selectedRoles: [
          { candidateId: "1", recommendationNote: "Valid recommendation" },
        ],
      };
    }
  );
  assert.deepEqual(
    selected.map((row) => row.card.roleId),
    [input[3].roleId]
  );
});

test("all missing summary texts finish with zero recommendations and no writes", async () => {
  const input = cards(2);
  const count = await generateSummaries(
    { ...args, dryRun: false },
    input,
    async () => ({
      evaluations: input.map((card) => ({
        roleId: card.roleId,
        fitSummary: "",
      })),
    })
  );
  assert.equal(count, 0);
  const selected = await rerankCandidates(
    args,
    {},
    input.map((card) => ({ card, score: 50, fit: { legacyScore: 50 } })),
    async () => {
      throw new Error("No candidates should reach reranking");
    }
  );
  assert.deepEqual(selected, []);
});

test("rerank sees only top twenty-five with requested-language summary and consumes just IDs plus note", async () => {
  const input = cards(30);
  input.forEach((c, i) => {
    if (i > 0) c.roleSummary = { en: { content: `Summary ${i}` } };
  });
  const ranked = input.map((card, i) => ({
    card,
    fit: {
      mutualFit: 60.999,
      candidateInterest: 34,
      companyInterest: 67,
      roleFit: 64.25,
      constraintPass: 100,
      evidence: "partial",
    },
    score: 90.999 - i,
  }));
  let text = "",
    prompt = "";
  const result = await rerankCandidates(
    args,
    {
      search_brief: [
        { label: "Current direction", content: "Synthetic brief authority" },
      ],
      behavior_context: "Synthetic tentative behavior",
    },
    ranked,
    async (_system, value) => {
      prompt = _system;
      text = value;
      return {
        selectedRoles: [
          {
            candidateId: "1",
            recommendationNote: "A specific advantage for this candidate.",
          },
        ],
      };
    }
  );
  assert.equal(result[0].card.roleId, input[1].roleId);
  assert.ok(text.includes("Summary 25"));
  assert.ok(text.includes("score: 89.9"));
  assert.ok(text.includes("mutualFit: 60.9"));
  assert.ok(text.includes("roleFit: 64.2"));
  assert.ok(text.includes("candidateInterest: 34"));
  for (const metric of [
    "candidateInterest",
    "companyInterest",
    "mutualFit",
    "roleFit",
    "constraintPass",
  ])
    assert.ok(prompt.includes(metric + ":"));
  assert.ok(!text.includes("Synthetic backend work"));
  assert.ok(!text.includes("sourceEvidence"));
  assert.ok(!text.includes("Summary 26"));
  assert.ok(
    text.indexOf("Synthetic brief authority") >
      text.indexOf("Synthetic tentative behavior")
  );
  assert.equal(
    result[0].recommendationNote,
    "A specific advantage for this candidate."
  );
  assert.deepEqual(await rerankCandidates(args, {}, ranked, async () => ({
      selectedRoles: [{ candidateId: "31", recommendationNote: "Invalid" }],
    })), []);
});
test("daily current-context default reuses the complete plan and vectors without a planner call", async () => {
  const saved = {
    version: SEARCH_PLAN_VERSION,
    contextFingerprint: "same",
    plan: {
      roleTitles: ["Backend Engineer", "백엔드 엔지니어"],
      searchIntentSummary: "Backend", ftsKeywords: [],
      includeContract: false, includeIntern: false, includeParttime: false,
      includeRemote: true, remoteOnly: false, isPreferEntry: 0, postingRecency: null,
      locations: [], // Legacy saved default must not reintroduce this field.
      countries: [{ countryCode: "KR", weight: 1, remoteOnly: false }],
    },
    titleVectors: [Array.from({ length: 1536 }, (_, i) => i === 0 ? 1 : 0)],
    targetSalaryKrw: 70,

    sql: "SQL template",
  };
  let calls = 0;
  const result = await getSearchPlan(
    { ...args, reuseDefault: true },
    {
      setting: { external_search_default: saved },
      contextFingerprint: "same",
      blockedCompanies: [],
    } as any,
    async () => {
      calls++;
      throw new Error("Should not plan");
    }
  );
  assert.equal(calls, 0);
  assert.equal(result.planCall, false);
  assert.match(result.sql, /LIMIT 3000/);
  assert.ok(result.sql.endsWith("LIMIT 500"));
  assert.equal("locations" in result.plan, false);
  assert.equal(result.targetSalaryKrw, 70);
  assert.ok(!PLAN_PROMPT.includes("hard ILIKE gate"));
  await assert.rejects(
    getSearchPlan(
      { ...args, reuseDefault: true },
      {
        setting: {
          external_search_default: { ...saved, titleVectors: [[1], [2]] },
        },
        contextFingerprint: "same",
      blockedCompanies: [],
      } as any,
      async (_prompt, input) => {
        assert.ok(input.includes("reusable: false"));
        throw new Error("Must regenerate a multi-vector default");
      }
    ),
    /Must regenerate a multi-vector default/
  );
});

test("same-name companies retain separate company evidence in batch input", () => {
  const input = cards(2);
  input.forEach((c) => (c.companyName = "Same Display Name"));
  input[0].company.description = "Unique strong execution evidence";
  input[1].company.description = "Unique weak execution evidence";
  const text = buildScoringInput(
    {},
    input.map((c) => v2PromptCandidate(c, "en"))
  );
  assert.ok(text.includes("Unique strong execution evidence"));
  assert.ok(text.includes("Unique weak execution evidence"));
});

test("500-role cache reads use bounded URLs without losing any role", async () => {
  const seen: string[] = [];
  const admin: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async (_column: string, ids: string[]) => {
            assert.ok(ids.length <= 200);
            seen.push(...ids);
            return { data: [], error: null };
          },
        }),
      }),
    }),
  };
  const input = cards(500);
  await loadFitCache({ ...args, admin }, input, "synthetic", "openai");
  assert.equal(new Set(seen).size, 500);
});

test("planner reuse/explore/replace preserve the default contract and upgrade outdated defaults", async () => {
  const plan = {
    searchIntentSummary: "Backend in accepted countries",
    ftsKeywords: [],
    role_titles: ["Backend"],
    include_contract: false,
    include_parttime: false,
    include_intern: false,
    includeRemote: true,
    remoteOnly: false,
    is_prefer_entry: 0,
    postingRecency: null,
    countries: [
      { countryCode: "KR", weight: 0.8, remoteOnly: false },
      { countryCode: "US", weight: 0.2, remoteOnly: true },
    ],
  };
  const saved = {
    revision: "previous-revision",
    version: SEARCH_PLAN_VERSION,
    contextFingerprint: "same",
    plan: { ...plan, roleTitles: plan.role_titles, locations: [] },
    titleVectors: [Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0))],
    sql: "Existing SQL",
  };
  for (const surface of ["web", "worker"] as const) {
    for (const defaultAction of ["reuse", "explore", "replace"] as const) {
      let written: any;
      const predicates: any[] = [];
      const query = {
        eq: (...v: any[]) => {
          predicates.push(v);
          return query;
        },
      };
      const admin: any = {
        from: () => ({
          update: (value: any) => {
            written = value;
            return query;
          },
        }),
      };
      const result = await getSearchPlan(
        { ...args, surface, admin, dryRun: false },
        {
          context: {},
          setting: { external_search_default: saved },
          contextFingerprint: "same",
          blockedCompanies: [],
        } as any,
        async (_system, input) => {
          assert.ok(input.includes("reusable: true"));
          assert.ok(input.includes("Existing SQL"));
          assert.doesNotMatch(input, /locations/);
          return {
            defaultAction,
            searchIntentSummary: "This run's search direction",
            plan: defaultAction === "reuse" ? null : plan,
            targetSalaryKrw: 70,
          };
        }
      );
      assert.equal(Boolean(written), defaultAction !== "explore");
      assert.deepEqual(result.plan.countries, plan.countries);
      assert.equal("locations" in result.plan, false);
      if (written)
        assert.equal(
          "locations" in written.external_search_default.plan,
          false
        );
      if (written)
        assert.ok(
          predicates.some(
            ([key, value]) =>
              key === "external_search_default->>revision" &&
              value === saved.revision
          )
        );
    }
  }
  for (const previous of [
    {
      ...saved,
      version: "external-recommendations-2026-10-v1",
      plan: { ...saved.plan, countries: undefined },
    },
    {
      ...saved,
      version: "external-search-v2-salary-v1",
      targetSalaryKrw: null,
    },
  ]) {
    let calls = 0;
    const upgraded = await getSearchPlan(
      { ...args, reuseDefault: true },
      {
        context: {},
        setting: {
          external_search_default: previous,
        },
        contextFingerprint: "same",
        blockedCompanies: [],
      } as any,
      async (_system, input) => {
        calls++;
        assert.ok(input.includes("reusable: false"));
        return {
          defaultAction: "replace",
          plan,
          targetSalaryKrw: 70,
        };
      }
    );
    assert.equal(calls, 1);
    assert.equal(upgraded.version, SEARCH_PLAN_VERSION);
    assert.deepEqual(upgraded.titleVectors, saved.titleVectors);
    assert.ok(upgraded.sql.includes("cr.country_code='KR'"));
  }
});

test("worker planner gets compact history and refreshes run purpose even when reusing a default", async () => {
  const saved = {
    revision: "durable",
    version: SEARCH_PLAN_VERSION,
    contextFingerprint: "same",
    targetSalaryKrw: 50,
    plan: {
      searchIntentSummary: "Durable backend direction",
      roleTitles: ["Backend"],
      ftsKeywords: [],
      includeContract: false,
      includeParttime: false,
      includeIntern: false,
      includeRemote: true,
      remoteOnly: false,
      isPreferEntry: 0,
      locations: [],
      postingRecency: null,
      countries: [{ countryCode: "KR", weight: 1, remoteOnly: false }],
    },
    titleVectors: [Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0))],
    sql: "Existing SQL",
  };
  const workerSearchContext = {
    search_goal_seed: "Explore a useful next step",
    companion_actions: [],
    search_history: ["Prior search: research systems; recommended(0)"],
  };
  let stored: any,
    count = 0;
  const query = { eq: () => query };
  const admin: any = {
    from: () => ({
      update: (v: any) => {
        stored = v;
        return query;
      },
    }),
  };
  const purpose =
    "No demonstrated rejection of this direction. Test more ownership within the current backend scope.";
  const result = await getSearchPlan(
    {
      ...args,
      surface: "worker",
      workerSearchContext,
      reuseDefault: true,
      dryRun: false,
      admin,
    },
    {
      setting: { external_search_default: saved },
      context: {},
      contextFingerprint: "same",
      blockedCompanies: [],
    } as any,
    async (system, text) => {
      count++;
      assert.equal(system, WORKER_PLAN_PROMPT);
      assert.ok(text.includes(workerSearchContext.search_history[0]));
      return {
        defaultAction: "reuse",
        plan: null,
        targetSalaryKrw: 70,

        searchIntentSummary: purpose,
      };
    }
  );
  assert.equal(count, 1);
  assert.equal(result.plan.searchIntentSummary, purpose);
  assert.equal(
    stored.external_search_default.plan.searchIntentSummary,
    saved.plan.searchIntentSummary
  );
  assert.deepEqual(result.titleVectors, saved.titleVectors);
  assert.equal(stored.external_search_default.targetSalaryKrw, 70);
  assert.equal(stored.external_search_default.sql, result.sql);
  assert.ok(result.sql.endsWith("LIMIT 500"));
  await getSearchPlan(
    { ...args, workerSearchContext },
    {
      setting: { external_search_default: saved },
      context: {},
      contextFingerprint: "same",
      blockedCompanies: [],
    } as any,
    async (system, text) => {
      assert.equal(system, PLAN_PROMPT);
      assert.ok(!text.includes(workerSearchContext.search_history[0]));
      return {
        defaultAction: "reuse",
        plan: null,
        targetSalaryKrw: 70,
      };
    }
  );
});

test("worker rerank carries its search hypothesis beside the authoritative Brief without adding full JD", async () => {
  const [card] = cards(1);
  card.roleSummary = { en: { content: "Neutral role evidence" } };
  const purpose =
    "Test research ownership as a tentative adjacent direction, not a changed user preference.";
  await rerankCandidates(
    { ...args, surface: "worker" },
    {
      current_search_purpose: purpose,
      search_brief: "Explicit current criteria",
    },
    [
      {
        card,
        score: 73.487,
        fit: {
          mutualFit: 70,
          candidateInterest: 72,
          companyInterest: 80,
          roleFit: 82,
          constraintPass: 100,
          evidence: "partial",
        },
      },
    ],
    async (system, input) => {
      assert.ok(system.includes("current_search_purpose explains this run"));
      assert.ok(input.includes(purpose));
      assert.ok(input.includes("score: 73.4"));
      assert.ok(!input.includes("Synthetic backend work"));
      return {
        selectedRoles: [
          { candidateId: "1", recommendationNote: "Specific next-step value" },
        ],
      };
    }
  );
});

test("all surfaces reuse cached fits despite age, source, context and evaluator changes", async () => {
  const [card] = cards(1);
  const sourceHash = fingerprint(
    buildScoringInput({}, [v2PromptCandidate(card, "en")])
  );
  const fit = {
    candidateInterest: 40,
    companyInterest: 50,
    mutualFit: 40,
    roleFit: 50,
    constraintPass: 90,
    evidence: "sufficient",
    roleId: card.roleId,
    inputFingerprint: "previous-profile-and-brief",
    roleSourceHash: sourceHash,
    evaluatedAt: new Date(Date.now() - 1000).toISOString(),
  };
  const evaluations: Record<string, unknown> = {
    "old-prompt:jev:old-model": fit,
    [evaluatorKey("openai")]: {
      ...fit,
      evaluatedAt: new Date(Date.now() - 2000).toISOString(),
    },
    expired: {
      ...fit,
      evaluatedAt: new Date(Date.now() - 31 * 86400000).toISOString(),
    },
    "changed-source": {
      ...fit,
      roleSourceHash: "different",
      evaluatedAt: new Date().toISOString(),
    },
  };
  const admin: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async () => ({
            data: [{ role_id: card.roleId, evaluations }],
            error: null,
          }),
        }),
      }),
    }),
  };
  const daily = await loadFitCache(
    { ...args, admin, surface: "daily" },
    [card],
    "current-context",
    "openai"
  );
  assert.equal(daily.get(card.roleId), evaluations["changed-source"]);
  for (const surface of ["web", "worker"] as const) {
    const strict = await loadFitCache(
      { ...args, admin, surface },
      [card],
      "current-context",
      "openai"
    );
    assert.equal(strict.size, 1);
  }
  evaluations["changed-source"] = undefined;
  delete evaluations["old-prompt:jev:old-model"];
  delete evaluations[evaluatorKey("openai")];
  assert.equal((await loadFitCache({ ...args, admin }, [card], "changed", "jev")).size, 1);
  assert.equal((await loadFitCache({ ...args, admin, refreshFit: true }, [card], "changed", "jev")).size, 0);
  evaluations.expired = { mutualFit: 90 };
  assert.equal((await loadFitCache({ ...args, admin }, [card], "changed", "jev")).size, 0);

});

test("reranking skips incomplete fits and preserves valid legacy scores", async () => {
  const input = cards(2);
  for (const card of input)
    card.roleSummary = { en: { content: "Valid summary" } };
  const result = await rerankCandidates(
    args,
    {},
    [
      { card: input[0], score: 90, fit: { mutualFit: 90 } },
      { card: input[1], score: 80, fit: { legacyScore: 80 } },
    ],
    async (_system, text) => {
      assert.ok(!text.includes("Backend 0"));
      assert.ok(text.includes("Backend 1"));
      return {
        selectedRoles: [
          { candidateId: "1", recommendationNote: "Relevant experience" },
        ],
      };
    }
  );
  assert.deepEqual(
    result.map((r) => r.card.roleId),
    [input[1].roleId]
  );
});

test("one failed summary batch leaves other batches available", async () => {
  const input = cards(11);
  const result = await generateSummaries(
    { ...args, surface: "worker" },
    input,
    async (_system, text) => {
      if (text.includes(input[0].roleId))
        throw new Error("provider unavailable");
      return {
        evaluations: [
          { roleId: input[10].roleId, fitSummary: "Valid summary" },
        ],
      };
    }
  );
  assert.equal(result, 1);
  assert.equal(input[0].roleSummary?.en, undefined);
  assert.equal((input[10].roleSummary?.en as any).content, "Valid summary");
});

test("summary cache timeout skips its batch; permission errors remain fatal", async () => {
  for (const code of ["57014", "42501"]) {
    const input = cards(1);
    const admin: any = {
      rpc: async () => ({ error: { code, message: "DB failure" } }),
    };
    const run = generateSummaries(
      { ...args, admin, dryRun: false },
      input,
      async () => ({
        evaluations: [{ roleId: input[0].roleId, fitSummary: "Valid summary" }],
      })
    );
    if (code === "57014") assert.equal(await run, 0);
    else await assert.rejects(run, /batch\(es\) failed/);
    assert.equal(input[0].roleSummary?.en, undefined);
  }
});


test("rerank repairs structural errors once with the original context and invalid response", async () => {
  for (const invalid of [
    {
      selectedRoles: [{ candidateId: "99", recommendationNote: "Invalid ID" }],
    },
    {
      selectedRoles: [
        { candidateId: "1", recommendationNote: "A" },
        { candidateId: "1", recommendationNote: "B" },
      ],
    },
    {
      selectedRoles: [
        { candidateId: "1", recommendationNote: "A" },
        { candidateId: "2", recommendationNote: "B" },
      ],
    },
    { selectedRoles: [{ candidateId: "1" }] },
  ]) {
    const inputCards = cards(2);
    inputCards[1].companyWorkspaceId = inputCards[0].companyWorkspaceId;
    const ranked = inputCards.map((card) => {
      card.roleSummary = { en: { content: "Synthetic summary" } };
      return { card, score: 80, fit: { legacyScore: 80 } };
    });
    let calls = 0;
    const result = await rerankCandidates(
      args,
      { search_brief: "Original brief" },
      ranked,
      async (system, input, label) => {
        calls++;
        if (calls === 1) return invalid;
        assert.equal(label, "rerank_repair");
        assert.match(system, /Correct the previous output/);
        assert.match(input, /Original brief/);
        assert.match(input, /previousInvalidResponse/);
        assert.match(input, /validationErrors/);
        return {
          selectedRoles: [
            { candidateId: "2", recommendationNote: "Corrected" },
          ],
        };
      },
    );
    assert.equal(calls, 2);
    assert.equal(result[0].card.roleId, inputCards[1].roleId);
  }
});

test("rerank stops after one repair and propagates transport errors", async () => {
  const [card] = cards(1);
  card.roleSummary = { en: { content: "Summary" } };
  const ranked = [{ card, score: 80, fit: { legacyScore: 80 } }];
  let calls = 0;
  assert.deepEqual(
    await rerankCandidates(args, {}, ranked, async () => {
      calls++;
      return {
        selectedRoles: [{ candidateId: "99", recommendationNote: "Invalid" }],
      };
    }),
    [],
  );
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(
    rerankCandidates(args, {}, ranked, async () => {
      calls++;
      throw new Error("Network unavailable");
    }),
    /Network unavailable/,
  );
  assert.equal(calls, 1);
  const request = v2CompletionRequest("system", "input", "rerank_repair");
  assert.equal(request.primaryModel, "gpt-6-luna");
  assert.equal(request.openAIResponsesReasoningEffort, "high");
  assert.equal(request.maxTokens, 32768);
  assert.equal(v2CompletionRequest("system", "input", "rerank").openAIResponsesReasoningEffort, "high");
  for (const label of ["plan", "summary", "control_rerank", "control_rerank_repair"]) {
    const unchanged = v2CompletionRequest("system", "input", label);
    assert.equal(unchanged.openAIResponsesReasoningEffort, "low");
    assert.equal(unchanged.maxTokens, 8000);
  }
});

test("planner clips oversized search arrays before validation and defaults missing weight", () => {
  const plan = parsePlan({
    searchIntentSummary: "Synthetic search",
    role_titles: [...Array.from({ length: 24 }, (_, i) => `Role ${i}`), null],
    ftsKeywords: [
      ...Array.from({ length: 4 }, () => ({
        terms: [...Array.from({ length: 8 }, (_, i) => `Term ${i}`), null],
      })),
      null,
    ],
    include_contract: false,
    include_parttime: false,
    include_intern: false,
    includeRemote: true,
    remoteOnly: false,
    is_prefer_entry: 0,
    countries: [{ countryCode: "KR", weight: 1, remoteOnly: false }],
    postingRecency: null,
  });
  assert.equal(plan.roleTitles.length, 24);
  assert.equal(plan.ftsKeywords.length, 4);
  assert.equal(plan.ftsKeywords[0].terms.length, 8);
  assert.equal(plan.ftsKeywords[0].weight, 1);
});


test("legacy web cache preserves old evidence and propagates read errors", async () => {
  const [card] = cards(1);
  let failure = false;
  const query: any = {
    select: () => query, eq: () => query,
    in: async () => ({ data: [{ role_id: card.roleId, created_at: "2020-01-01T00:00:00Z",
      meta: { score: 80, inputFingerprint: "old", roleSourceHash: "old" } }],
      error: failure ? { message: "cache unavailable" } : null }),
  };
  const input = { admin: { from: () => query } as any, userId: args.userId,
    roleIds: [card.roleId], roleCards: [card], inputFingerprint: "changed" };
  assert.equal((await fetchExternalFitCache(input)).get(card.roleId)?.score100, 80);
  failure = true;
  await assert.rejects(fetchExternalFitCache(input), /cache unavailable/);
});
