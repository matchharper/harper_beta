import assert from "node:assert/strict";
import test from "node:test";

// Modules import the LLM client, which needs a key at import time; nothing calls it here.
process.env.OPENAI_API_KEY ||= "test-only-not-used";

const brief = {
  summary: "",
  hardConditions: [],
  keywords: [],
  criteria: [
    { id: "c1", name: "파이프라인 운영", criteria: "배치 파이프라인", requirement: "must" as const, kind: "similarity" as const },
    { id: "c2", name: "dbt", criteria: "dbt 활용", requirement: "preferred" as const, kind: "similarity" as const },
  ],
};

test("verdict grades map by criterion id; a left-out criterion reads as open", async () => {
  const { verdictFromRaw } = await import("./verdicts");
  const verdict = verdictFromRaw(
    {
      tldr: " 데이터 엔지니어 5년 ",
      finalFit: "good",
      criteria: [{ criterionId: "c1", fitness: "excellent", evidence: "Airflow 운영 3년" }],
      companyQuestion: { question: "dbt 없이도 될까요?", options: ["네", " 아니요 ", "", "글쎄요", "넷째"] },
      reasonChips: [
        { criterionId: "c2", kind: "missing_info", label: "dbt 언급 없음", evidence: "", appliesTo: ["uncertain"] },
        { criterionId: "unknown", kind: "other", label: "무시됨", evidence: "", appliesTo: ["bad"] },
      ],
    },
    brief
  );
  assert.deepEqual(
    verdict.criteria.map((item) => [item.criterionId, item.fitness]),
    [["c1", "excellent"], ["c2", "uncertain"]]
  );
  assert.equal(verdict.tldr, "데이터 엔지니어 5년");
  assert.deepEqual(verdict.companyQuestion?.options, ["네", "아니요", "글쎄요", "넷째"], "distinct, at most five");
  // "맞지 않음" gets the weakest criteria as gaps when the model gave none.
  assert.deepEqual(
    (verdict.reasonChips ?? []).map((chip) => [chip.label, chip.appliesTo.join("/")]),
    [["dbt 언급 없음", "uncertain"], ["dbt 경험 부족", "bad"]],
    "only criteria read as uncertain or bad become gap chips, never one read as a fit"
  );
});

test("each chip effect changes exactly one criterion or condition", async () => {
  const { applyChipEffect } = await import("./questions");
  const { levelOf } = await import("./brief");
  const level = applyChipEffect(brief, { type: "set_importance", criterion: "dbt", level: "nice" }, "답");
  assert.equal(levelOf(level.brief.criteria[1]!), "nice");
  assert.equal(level.applied, "'dbt' 기준을 있으면 좋음으로 바꿨어요.");
  assert.equal(levelOf(applyChipEffect(brief, { type: "set_importance", criterion: "dbt", level: "required" }, "답").brief.criteria[1]!), "required");
  const must = applyChipEffect(brief, { type: "set_requirement", criterion: "dbt", requirement: "must" }, "답");
  assert.equal(must.brief.criteria[1]!.requirement, "must");
  assert.equal(must.brief.criteria[0]!.requirement, "must");
  assert.equal(brief.criteria[1]!.requirement, "preferred", "input Brief untouched");
  const same = applyChipEffect(brief, { type: "set_requirement", criterion: "파이프라인 운영", requirement: "must" }, "답");
  assert.equal(same.applied, null);
  const refined = applyChipEffect(brief, { type: "refine_criterion", criterion: "c2", criteria: "dbt 또는 Dataform" }, "답");
  assert.equal(refined.brief.criteria[1]!.criteria, "dbt 또는 Dataform");
  const added = applyChipEffect(brief, { type: "add_criterion", name: "B2C", criteria: "대규모 B2C", requirement: "preferred" }, "답");
  assert.equal(added.brief.criteria.length, 3);
  const removed = applyChipEffect(brief, { type: "remove_criterion", criterion: "dbt" }, "답");
  assert.deepEqual(removed.brief.criteria.map((item) => item.id), ["c1"]);
  const condition = applyChipEffect(
    brief,
    { type: "add_hard_condition", condition: { kind: "min_years", label: "경력 3년 이상", years: 3 } as never },
    "답"
  );
  assert.equal(condition.brief.hardConditions.length, 1);
  const again = applyChipEffect(condition.brief, { type: "add_hard_condition", condition: { kind: "min_years", label: "경력 3년 이상", years: 3 } as never }, "답");
  assert.equal(again.applied, null, "the same condition is not added twice");
});

test("overall rank weighs 필수 3, 중요 2, 있으면 좋음 1, then the job score, then retrieval", async () => {
  const { rankPool, JOB_WEIGHT } = await import("./fastPath");
  const { criterionHash } = await import("./brief");
  const { jobScoreKey } = await import("./jobMatch");
  const member = (talentId: string, retrieval: number) => ({
    talentId, years: 5, countryCode: "KR", city: "seoul", remoteOk: null, relocationOk: null, retrieval,
  });
  const score = (value: number) => ({ score: value, raw: value, evidence: null, similarity: value });
  const pool = {
    builtAt: new Date().toISOString(), eligibleCount: 2, filteredCount: 2, conditionCounts: [],
    members: [member("a", 0.5), member("b", 0.5)],
    scores: {
      [criterionHash(brief.criteria[0]!)]: { a: score(0.4), b: score(0.8) },
      [criterionHash(brief.criteria[1]!)]: { a: score(1), b: score(0.5) },
    },
    timings: {}, embeddingTokens: 0,
  };
  const plain = rankPool({ pool, brief }).ranked;
  const expected = (required: number, important: number, retrieval: number) => ((required * 3 + important * 2) / 5) * 0.9 + retrieval * 0.1;
  assert.ok(Math.abs(plain.find((m) => m.talentId === "a")!.overall - expected(0.4, 1, 0.5)) < 1e-9);
  assert.equal(plain[0]!.talentId, "b", "a strong required criterion outweighs a strong important one");
  const nice = { ...brief, criteria: [brief.criteria[0]!, { ...brief.criteria[1]!, importance: 1 }] };
  const a = rankPool({ pool, brief: nice }).ranked.find((m) => m.talentId === "a")!;
  assert.ok(Math.abs(a.overall - (((0.4 * 3 + 1) / 4) * 0.9 + 0.05)) < 1e-9, "있으면 좋음 weighs 1");
  const titled = { ...brief, titles: { matching: ["data engineer"], nearMiss: [] } };
  const withJob = rankPool({ pool: { ...pool, job: { key: jobScoreKey(titled), scores: { a: 1, b: 0.2 } } }, brief: titled }).ranked;
  const aJob = withJob.find((m) => m.talentId === "a")!;
  assert.ok(Math.abs(aJob.overall - (JOB_WEIGHT * 1 + (0.9 - JOB_WEIGHT) * ((0.4 * 3 + 2) / 5) + 0.05)) < 1e-9);
  assert.equal(withJob[0]!.talentId, "a", "the job score moves the person doing the job up");
});

test("only 필수 filters: a weak 중요 or 있으면 좋음 criterion never removes a person", async () => {
  const { rankPool } = await import("./fastPath");
  const { criterionHash } = await import("./brief");
  const member = (talentId: string) => ({
    talentId, years: 5, countryCode: "KR", city: "seoul", remoteOk: null, relocationOk: null, retrieval: 0.5,
  });
  const score = (value: number) => ({ score: value, raw: value, evidence: null, similarity: value });
  const pool = {
    builtAt: new Date().toISOString(), eligibleCount: 2, filteredCount: 2, conditionCounts: [],
    members: [member("weakRequired"), member("weakImportant")],
    scores: {
      [criterionHash(brief.criteria[0]!)]: { weakRequired: score(0.1), weakImportant: score(0.9) },
      [criterionHash(brief.criteria[1]!)]: { weakRequired: score(0.9), weakImportant: score(0.05) },
    },
    timings: {}, embeddingTokens: 0,
  };
  const pass = (b: typeof brief) =>
    Object.fromEntries(rankPool({ pool, brief: b }).ranked.map((m) => [m.talentId, m.passesMust]));
  assert.deepEqual(pass(brief), { weakRequired: false, weakImportant: true });
  const nice = { ...brief, criteria: [brief.criteria[0]!, { ...brief.criteria[1]!, importance: 1 }] };
  assert.equal(pass(nice).weakImportant, true, "있으면 좋음 never filters");
  const none = { ...brief, criteria: [{ ...brief.criteria[0]!, requirement: "preferred" as const, importance: 2 }, brief.criteria[1]!] };
  assert.deepEqual(pass(none as never), { weakRequired: true, weakImportant: true }, "without 필수 nobody is filtered");
});

test("an info candidate's rating moves a criterion only between 있으면 좋음 and 중요, never to or from 필수", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { applyProbeRatings } = await import("./service");
  const { levelOf } = await import("./brief");
  const three = {
    ...brief,
    criteria: [
      brief.criteria[0]!,
      { ...brief.criteria[1]!, importance: 2 },
      { id: "c3", name: "B2C", criteria: "B2C", requirement: "preferred" as const, importance: 1, kind: "similarity" as const },
    ],
  };
  const session = (ratings: Record<string, string | null>) =>
    ({
      firstCandidates: Object.keys(ratings).map((criterionId) => ({
        talentId: criterionId,
        years: 5,
        probe: { type: "criterion_low", criterionId, label: "" },
      })),
      evaluations: Object.fromEntries(Object.entries(ratings).map(([id, rating]) => [id, { rating }])),
    }) as never;
  const liked = applyProbeRatings(three, session({ c1: "good", c2: "good", c3: "good" })).brief;
  assert.deepEqual(liked.criteria.map(levelOf), ["required", "nice", "nice"], "필수 stays; 중요 → 있으면 좋음");
  const aboutItself = new Map([["c1", new Set(["c1"])], ["c2", new Set(["c2"])], ["c3", new Set(["c3"])]]);
  const disliked = applyProbeRatings(three, session({ c1: "bad", c2: "bad", c3: "bad" }), aboutItself).brief;
  assert.deepEqual(disliked.criteria.map(levelOf), ["required", "important", "important"], "있으면 좋음 → 중요, never 필수");
  const unrated = applyProbeRatings(three, session({ c1: null, c2: null, c3: null }), aboutItself);
  assert.deepEqual(unrated.brief, three, "written feedback alone is not a positive or negative rating");
  assert.deepEqual(unrated.settled, []);
});

test("맞지 않음 changes the open criterion only when the team's reason is about it", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { applyProbeRatings } = await import("./service");
  const { levelOf } = await import("./brief");
  const open = { ...brief, criteria: [brief.criteria[0]!, { ...brief.criteria[1]!, importance: 1 }] };
  const session = {
    firstCandidates: [{ talentId: "p", years: 9, probe: { type: "criterion_low", criterionId: "c2", label: "" } }],
    evaluations: { p: { rating: "bad" } },
  } as never;
  const level = (targets: Map<string, Set<string>>) => levelOf(applyProbeRatings(open, session, targets).brief.criteria[1]!);
  assert.equal(level(new Map([["p", new Set(["c2"])]])), "important", "reason about the open criterion");
  assert.equal(level(new Map([["p", new Set(["c1"])]])), "nice", "reason about another criterion: unchanged");
  assert.equal(level(new Map()), "nice", "no reason: unchanged");
  const about = new Map([["p", new Set(["c2"])]]);
  const decided = applyProbeRatings(open, session, about, new Set([open.criteria[1]!.name]), new Set()).brief;
  assert.equal(levelOf(decided.criteria[1]!), "nice", "a level the team chose stays");
  const liked = {
    firstCandidates: [{ talentId: "p", years: 9, probe: { type: "criterion_low", criterionId: "c2", label: "" } }],
    evaluations: { p: { rating: "good" } },
  } as never;
  const important = { ...brief, criteria: [brief.criteria[0]!, { ...brief.criteria[1]!, importance: 2 }] };
  const gap = applyProbeRatings(important, liked, new Map(), new Set(), new Set(["c2"]));
  assert.equal(levelOf(gap.brief.criteria[1]!), "important", "a named gap does not go down");
  assert.equal(gap.settled.length, 0);
  assert.equal(levelOf(applyProbeRatings(open, session, about, new Set(), new Set(["c2"])).brief.criteria[1]!), "important", "a named gap may go up");
  const { YEARS_TARGET } = await import("./reasonTargets");
  const years = {
    firstCandidates: [{ talentId: "p", years: 9, probe: { type: "years_above", years: 6, label: "" } }],
    evaluations: { p: { rating: "bad" } },
  } as never;
  assert.equal(applyProbeRatings(open, years, new Map([["p", new Set(["c1"])]])).brief.hardConditions.length, 0, "years point, reason elsewhere");
  assert.equal(applyProbeRatings(open, years, new Map([["p", new Set([YEARS_TARGET])]])).brief.hardConditions[0]?.kind, "max_years");
});

test("a reason points at criteria by its chip, else by a short classification of the typed text", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { chipTargets, reasonTargetsByCandidate, YEARS_TARGET } = await import("./reasonTargets");
  const withYears = { ...brief, hardConditions: [{ id: "h_max", kind: "max_years" as const, label: "경력 7년 이하", years: 7 }] };
  assert.deepEqual([...chipTargets({ rating: "bad", reasons: [{ criterionId: "c2", kind: "mismatch", label: "x" }] } as never, withYears)], ["c2"]);
  assert.deepEqual([...chipTargets({ rating: "bad", reasons: [{ criterionId: "h_max", kind: "mismatch", label: "x" }] } as never, withYears)].sort(), ["h_max", YEARS_TARGET].sort());
  let calls = 0;
  const ask = (async () => (calls += 1, { data: { about: ["c1"] }, usage: { label: "t", model: "m", inputTokens: 1, outputTokens: 1, usd: 0, ms: 0, at: "" } })) as never;
  const session = {
    firstCandidates: [{ talentId: "a" }, { talentId: "b" }, { talentId: "c" }],
    evaluations: {
      a: { rating: "bad", reasonText: "파이프라인 운영 경험이 얕아요" },
      b: { rating: "bad", reasons: [{ criterionId: "c2", kind: "mismatch", label: "dbt 없음" }], reasonText: "dbt 없음" },
      c: { rating: "good" },
    },
  } as never;
  const { targets } = await reasonTargetsByCandidate(session, withYears, ask);
  assert.deepEqual([...targets.get("a")!], ["c1"], "typed only: classified");
  assert.deepEqual([...targets.get("b")!], ["c2"], "chip wins, no call");
  assert.equal(targets.has("c"), false, "only 맞지 않음");
  assert.equal(calls, 1);
});

test("hard conditions agree between SQL counts and the in-memory pool (local database only)", async (t) => {
  const url = process.env.DATABASE_URL ?? "";
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    t.skip("needs the local E2E database");
    return;
  }
  const { applyHardConditions, buildBroadPool, countByConditions } = await import("./fastPath");
  const { loadRoleStartSession } = await import("./session");
  const { roleStartSql } = await import("./db");
  const rows = await roleStartSql()<Array<{ role_id: string }>>`
    select role_id::text from public.company_role_start_sessions
    where jsonb_array_length(coalesce(brief->'hardConditions', '[]'::jsonb)) > 0 limit 3`;
  for (const { role_id: roleId } of rows) {
    const session = (await loadRoleStartSession(roleId, { forView: true }))!;
    const counts = await countByConditions({ roleId, brief: session.brief, excludeIds: [] });
    // Every eligible person in one pool: the in-memory twin must pass the same people.
    const pool = await buildBroadPool({ roleId, queryText: "x", excludeIds: [] }).catch(() => null);
    if (!pool) {
      t.skip("embeddings unavailable");
      return;
    }
    const sqlPass = new Set(counts.filteredIds);
    const memoryPass = new Set(applyHardConditions(pool, session.brief).members.map((member) => member.talentId));
    const inPool = new Set(pool.members.map((member) => member.talentId));
    const disagree = [...inPool].filter((id) => sqlPass.has(id) !== memoryPass.has(id));
    assert.equal(disagree.length, 0, `${roleId}: ${disagree.length} people differ`);
  }
  await roleStartSql().end();
});

test("a proposal written before the Role turns on stays open once it is on (local database only)", async (t) => {
  const url = process.env.DATABASE_URL ?? "";
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    t.skip("needs the local E2E database");
    return;
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { insertProposals } = await import("./service");
  const { roleStartSql } = await import("./db");
  const sql = roleStartSql();
  const [role] = await sql<Array<{ role_id: string; company_workspace_id: string; run_id: string }>>`
    select r.role_id::text, r.company_workspace_id::text, i.selection_run_id::text as run_id
    from public.company_roles r join public.company_intro_candidates i on i.role_id = r.role_id
    where r.source_type = 'internal' and (r.information->>'testOnly') = 'true' limit 1`;
  if (!role) {
    t.skip("no test-only Role in the local database");
    return;
  }
  const [talent] = await sql<Array<{ user_id: string }>>`
    select user_id::text from public.talent_users t
    where not exists (select 1 from public.company_intro_candidates i where i.role_id = ${role.role_id} and i.talent_id = t.user_id)
    limit 1`;
  let status: string | null = null;
  await sql
    .begin(async (tx) => {
      await tx`update public.company_roles set status = 'draft' where role_id = ${role.role_id}`;
      const [id] = await insertProposals(tx as never, {
        roleId: role.role_id, workspaceId: role.company_workspace_id, runId: role.run_id,
        items: [{ talentId: talent!.user_id, reason: "test", presentation: {} }], roleFingerprint: "role-start:test",
      });
      // Turned on the way registration does it.
      await tx`select public.complete_company_role_creation_v1(${role.role_id}::uuid, ${role.company_workspace_id}::uuid)`;
      status = (await tx<Array<{ status: string }>>`select status from public.company_intro_candidates where id = ${id!}`)[0]!.status;
      throw new Error("rollback");
    })
    .catch((error) => {
      if (error.message !== "rollback") throw error;
    });
  assert.equal(status, "ready");
});

test("first-three people rated 잘 맞음 or better go to the inbox with the pick", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { likedFirstThree } = await import("./service");
  const verdict = { tldr: "", finalFit: "good", criteria: [] };
  const liked = likedFirstThree({
    firstCandidates: [
      { talentId: "a", verdict }, { talentId: "b", verdict }, { talentId: "c", verdict }, { talentId: "d", verdict: null },
    ],
    evaluations: { a: { rating: "excellent" }, b: { rating: "good" }, c: { rating: "uncertain" }, d: { rating: "good" } },
  } as never);
  assert.deepEqual(liked.map((item) => item.talentId), ["a", "b"]);
});

test("first-three people rated 정보가 부족해요 also stay with the Role, read or not; 맞지 않음 does not", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { keptFirstThree } = await import("./service");
  const verdict = { tldr: "", finalFit: "good", criteria: [] };
  const kept = keptFirstThree({
    firstCandidates: [
      { talentId: "a", verdict }, { talentId: "b", verdict }, { talentId: "c", verdict }, { talentId: "d", verdict: null },
    ],
    evaluations: { a: { rating: "good" }, b: { rating: "uncertain" }, c: { rating: "bad" }, d: { rating: "uncertain" } },
  } as never);
  assert.deepEqual(kept.map((item) => item.talentId), ["a", "b", "d"]);
});

test("a registered Role's start links open the inbox", async () => {
  const { resolveOrgRoleTab } = await import("@/lib/org/routes");
  assert.equal(resolveOrgRoleTab({ isDraft: false, tab: "start" }), "inbox");
  assert.equal(resolveOrgRoleTab({ isDraft: true, tab: "start" }), "start");
  assert.equal(resolveOrgRoleTab({ isDraft: false, tab: "matching" }), "matching");
});

test("people rated 잘 맞음 or better stay in the inbox without the pick, and 맞지 않음 does not (local database only)", async (t) => {
  const url = process.env.DATABASE_URL ?? "";
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    t.skip("needs the local E2E database");
    return;
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { keepLikedFirstThree } = await import("./service");
  const { roleStartSql } = await import("./db");
  const sql = roleStartSql();
  const [role] = await sql<Array<{ role_id: string; company_workspace_id: string }>>`
    select role_id::text, company_workspace_id::text from public.company_roles
    where source_type = 'internal' and (information->>'testOnly') = 'true' limit 1`;
  if (!role) {
    t.skip("no test-only Role in the local database");
    return;
  }
  const people = await sql<Array<{ user_id: string }>>`
    select user_id::text from public.talent_users t
    where not exists (select 1 from public.company_intro_candidates i where i.role_id = ${role.role_id} and i.talent_id = t.user_id)
    limit 3`;
  const verdict = { tldr: "요약", finalFit: "good", criteria: [], companyQuestion: null };
  const session = {
    brief: { summary: "", keywords: [], hardConditions: [], criteria: [] },
    firstCandidates: people.map((person, index) => ({ talentId: person.user_id, name: `후보 ${index + 1}`, verdict })),
    evaluations: { [people[0]!.user_id]: { rating: "excellent" }, [people[1]!.user_id]: { rating: "good" }, [people[2]!.user_id]: { rating: "bad" } },
  } as never;
  let statuses: Array<{ talent_id: string; status: string }> = [];
  let names: string[] = [];
  await sql
    .begin(async (tx) => {
      await tx`update public.company_roles set status = 'draft' where role_id = ${role.role_id}`;
      // The pick after the ratings never runs here: the liked people do not depend on it.
      names = await keepLikedFirstThree(tx as never, { roleId: role.role_id, workspaceId: role.company_workspace_id, session });
      await tx`select public.complete_company_role_creation_v1(${role.role_id}::uuid, ${role.company_workspace_id}::uuid)`;
      statuses = await tx<Array<{ talent_id: string; status: string }>>`
        select talent_id::text, status from public.company_intro_candidates
        where role_id = ${role.role_id} and talent_id = any(${people.map((person) => person.user_id)}::uuid[])`;
      // Running it again adds nothing.
      await keepLikedFirstThree(tx as never, { roleId: role.role_id, workspaceId: role.company_workspace_id, session });
      const [{ n }] = await tx<Array<{ n: number }>>`
        select count(*)::int as n from public.company_intro_candidates
        where role_id = ${role.role_id} and talent_id = any(${people.map((person) => person.user_id)}::uuid[])`;
      assert.equal(n, 2, "no duplicate rows");
      throw new Error("rollback");
    })
    .catch((error) => {
      if (error.message !== "rollback") throw error;
    });
  assert.deepEqual(names, ["후보 1", "후보 2"]);
  assert.deepEqual(statuses.map((row) => row.status).sort(), ["ready", "ready"]);
  assert.ok(!statuses.some((row) => row.talent_id === people[2]!.user_id), "맞지 않음 is not proposed");
});

test("a first-three person rated 맞지 않음 is passed for the Role and no route proposes them again (local database only)", async (t) => {
  const url = process.env.DATABASE_URL ?? "";
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    t.skip("needs the local E2E database");
    return;
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { passDislikedFirstThree } = await import("./service");
  const { roleStartSql } = await import("./db");
  const sql = roleStartSql();
  const [role] = await sql<Array<{ role_id: string; company_workspace_id: string }>>`
    select role_id::text, company_workspace_id::text from public.company_roles
    where source_type = 'internal' and (information->>'testOnly') = 'true' limit 1`;
  const [member] = await sql<Array<{ user_id: string }>>`select user_id::text from public.company_users limit 1`;
  if (!role || !member) {
    t.skip("no test-only Role or member in the local database");
    return;
  }
  const people = await sql<Array<{ user_id: string }>>`
    select user_id::text from public.talent_users t
    where not exists (select 1 from public.company_intro_candidates i where i.role_id = ${role.role_id} and i.talent_id = t.user_id)
    limit 2`;
  const verdict = { tldr: "요약", finalFit: "unfit", criteria: [], companyQuestion: null };
  const session = {
    brief: { summary: "", keywords: [], hardConditions: [], criteria: [] },
    firstCandidates: people.map((person) => ({ talentId: person.user_id, name: "x", verdict })),
    evaluations: { [people[0]!.user_id]: { rating: "bad" }, [people[1]!.user_id]: { rating: "uncertain" } },
  } as never;
  const args = { roleId: role.role_id, workspaceId: role.company_workspace_id, userId: member.user_id, session };
  const checks: Record<string, unknown> = {};
  await sql
    .begin(async (tx) => {
      await tx`update public.company_roles set status = 'draft' where role_id = ${role.role_id}`;
      checks.passed = await passDislikedFirstThree(tx as never, args);
      checks.again = await passDislikedFirstThree(tx as never, args);
      await tx`select public.complete_company_role_creation_v1(${role.role_id}::uuid, ${role.company_workspace_id}::uuid)`;
      const rows = await tx<Array<{ talent_id: string; status: string; close_reason: string | null }>>`
        select talent_id::text, status, close_reason from public.company_intro_candidates
        where role_id = ${role.role_id} and talent_id = any(${people.map((person) => person.user_id)}::uuid[])`;
      checks.rows = rows.map((row) => [row.talent_id === people[0]!.user_id ? "bad" : "uncertain", row.status, row.close_reason]);
      const [routes] = await tx<Array<{ company_first: boolean; talent_first: boolean; uncertain_company_first: boolean }>>`
        select public.company_first_pair_is_available_v1(${people[0]!.user_id}::uuid, ${role.role_id}::uuid) as company_first,
               public.talent_first_pair_is_available_v1(${people[0]!.user_id}::uuid, ${role.role_id}::uuid) as talent_first,
               public.company_first_pair_is_available_v1(${people[1]!.user_id}::uuid, ${role.role_id}::uuid) as uncertain_company_first`;
      checks.routes = routes;
      const [{ followups }] = await tx<Array<{ followups: number }>>`
        select count(*)::int as followups from public.company_talent_followups
        where role_id = ${role.role_id} and talent_id = ${people[0]!.user_id}::uuid`;
      checks.followups = followups;
      throw new Error("rollback");
    })
    .catch((error) => {
      if (error.message !== "rollback") throw error;
    });
  assert.equal(checks.passed, 1);
  assert.equal(checks.again, 0, "a rerun adds nothing");
  assert.deepEqual(checks.rows, [["bad", "passed", "company_passed"]], "only 맞지 않음, recorded as a company pass");
  assert.deepEqual(checks.routes, { company_first: false, talent_first: false, uncertain_company_first: true });
  assert.equal(checks.followups, 0, "no follow-up or message is scheduled");
});

test("the prepared pick is keyed by the Brief and the ratings, not by when they were saved", async () => {
  const { ratingsKey } = await import("./service");
  const firstCandidates = [{ talentId: "t1" }, { talentId: "t2" }] as never;
  const rated = (rating: string, at: string) => ({
    t1: { rating, answer: null, note: null, reasons: [], reasonText: null, at },
    t2: { rating: "good", answer: null, note: null, reasons: [], reasonText: null, at },
  });
  const base = { brief, firstCandidates, evaluations: rated("bad", "2026-10-21T00:00:00Z") } as never;
  const sameLater = { brief, firstCandidates, evaluations: rated("bad", "2026-10-21T01:00:00Z") } as never;
  const changed = { brief, firstCandidates, evaluations: rated("excellent", "2026-10-21T00:00:00Z") } as never;
  const otherBrief = { brief: { ...brief, summary: "다른 요약" }, firstCandidates, evaluations: rated("bad", "2026-10-21T00:00:00Z") } as never;
  assert.equal(ratingsKey(base), ratingsKey(sameLater));
  assert.notEqual(ratingsKey(base), ratingsKey(changed));
  assert.notEqual(ratingsKey(base), ratingsKey(otherBrief));
});

test("reason chips read as the team's reason: notes and long labels fall back to the topic", async () => {
  const { reasonChipLabel, reasonChipFit, chipTopic } = await import("./verdicts");
  assert.equal(reasonChipLabel("PyTorch 경험 부족", "PyTorch", ["bad"]), "PyTorch 경험 부족");
  assert.equal(reasonChipLabel("PyTorch 실무 근거 부족", "PyTorch", ["bad"]), "PyTorch 경험 부족");
  assert.equal(reasonChipLabel("특허 연구 기여 범위", "리서치", ["uncertain"]), "리서치 경험");
  assert.equal(reasonChipLabel("BERT 개발을 PyTorch 요건 충족으로 볼지", "PyTorch", ["uncertain"]), "PyTorch 경험");
  assert.equal(reasonChipLabel("", "ML 연차", ["bad"]), "ML 연차 부족");
  assert.deepEqual(reasonChipFit("대면 근무 확약 정보 부족", "other", ["bad"]).appliesTo, ["uncertain"]);
  assert.deepEqual(reasonChipFit("NLP 경험 없음", "mismatch", ["bad"]).appliesTo, ["bad"]);
  assert.deepEqual(reasonChipFit("PyTorch 경험", "missing_info", ["uncertain", "bad"]).appliesTo, ["uncertain"]);
  assert.deepEqual(reasonChipFit("리서치 경험 부족", "level_unclear", ["bad"]).appliesTo, ["bad"]);
  assert.equal(chipTopic("PyTorch", { name: "PyTorch 활용 역량" }), "PyTorch");
  assert.equal(chipTopic("", { name: "리서치 경험" }), "리서치 경험");
});

test("chips about location or years belong to hard conditions and never to a criterion", async () => {
  const { verdictFromRaw } = await import("./verdicts");
  const { chipTargets } = await import("./reasonTargets");
  const withCondition = { ...brief, hardConditions: [{ id: "h1", kind: "location" as const, label: "서울 근무", countries: ["KR"], cities: ["서울"], allowRelocation: false }] } as never;
  const verdict = verdictFromRaw(
    {
      tldr: "",
      finalFit: "good",
      criteria: [
        { criterionId: "c1", fitness: "good", evidence: "" },
        { criterionId: "c2", fitness: "good", evidence: "" },
      ],
      companyQuestion: null,
      reasonChips: [
        { criterionId: "c1", kind: "missing_info", label: "서울 대면 근무", evidence: "", appliesTo: ["uncertain"] },
        { criterionId: "h1", kind: "mismatch", label: "오피스 근무 불가", evidence: "", appliesTo: ["bad"] },
      ],
    },
    withCondition
  );
  const chips = verdict.reasonChips ?? [];
  assert.deepEqual(chips.map((chip) => [chip.label, chip.criterionId, chip.scope]), [
    ["서울 대면 근무", "h1", "condition"],
    ["오피스 근무 불가", "h1", "condition"],
  ]);
  const targets = chipTargets({ rating: "bad", reasons: chips.map((chip) => ({ chipId: chip.id, criterionId: chip.criterionId, kind: chip.kind, label: chip.label, scope: chip.scope })) } as never, withCondition);
  assert.equal(targets.size, 0, "a condition reason changes nothing in the Brief");
});

test("a 맞지 않음 chip never lands on a criterion the read found a fit", async () => {
  const { verdictFromRaw } = await import("./verdicts");
  const verdict = verdictFromRaw(
    {
      tldr: "",
      finalFit: "good",
      criteria: [
        { criterionId: "c1", fitness: "excellent", evidence: "" },
        { criterionId: "c2", fitness: "uncertain", evidence: "" },
      ],
      companyQuestion: null,
      reasonChips: [
        { criterionId: "c1", kind: "mismatch", label: "파이프라인 경험 부족", evidence: "", appliesTo: ["bad"] },
        { criterionId: "c2", kind: "mismatch", label: "dbt 경험 부족", evidence: "", appliesTo: ["bad"] },
      ],
    },
    brief
  );
  assert.deepEqual((verdict.reasonChips ?? []).filter((chip) => chip.appliesTo.includes("bad")).map((chip) => chip.label), ["dbt 경험 부족"]);
});

test("with no gap on any criterion, 맞지 않음 offers reasons outside the Brief, handled like typed text", async () => {
  const { verdictFromRaw } = await import("./verdicts");
  const { chipTargets, typedReason } = await import("./reasonTargets");
  const raw = {
    tldr: "",
    finalFit: "good" as const,
    criteria: [
      { criterionId: "c1", fitness: "excellent" as const, evidence: "" },
      { criterionId: "c2", fitness: "good" as const, evidence: "" },
    ],
    companyQuestion: null,
    reasonChips: [],
    outsideReasons: [
      { label: "산업 경험 다름", evidence: "금융권 데이터 플랫폼만 맡았어요." },
      { label: "이직 잦음", evidence: "" },
    ],
  };
  const verdict = verdictFromRaw(raw, brief);
  const chips = verdict.reasonChips ?? [];
  assert.deepEqual(chips.map((chip) => [chip.label, chip.scope, chip.appliesTo.join("/")]), [["산업 경험 다름", "outside", "bad"]], "personal points never become chips");
  const evaluation = { rating: "bad", reasons: chips.map((chip) => ({ chipId: chip.id, criterionId: chip.criterionId, kind: chip.kind, label: chip.label, scope: chip.scope })), reasonText: "레퍼런스 부족" } as never;
  assert.equal(chipTargets(evaluation, brief).size, 0);
  assert.equal(typedReason(evaluation), "산업 경험 다름; 레퍼런스 부족");
  // A criterion gap present: no outside chips.
  const withGap = verdictFromRaw({ ...raw, criteria: [{ criterionId: "c1", fitness: "uncertain", evidence: "" }, { criterionId: "c2", fitness: "good", evidence: "" }] }, brief);
  assert.equal((withGap.reasonChips ?? []).some((chip) => chip.scope === "outside"), false);
});

test("role info from the first step sets only the changed Brief conditions in code", async () => {
  const { briefWithRoleInfo, asksRoleInfo, citiesOfLocationText, changedRoleInfo } = await import("./roleInfoConditions");
  assert.deepEqual(citiesOfLocationText("판교 오피스"), ["pangyo"]);
  assert.deepEqual(citiesOfLocationText("서울 성수"), ["seoul"]);
  assert.deepEqual(citiesOfLocationText("경기 광주"), ["gwangju-si"]);
  assert.deepEqual(citiesOfLocationText("세종대로 사옥"), [], "a street name is not the city of Sejong");
  assert.deepEqual(changedRoleInfo({ locationText: "서울", workMode: "onsite" }, { locationText: "서울", workMode: "hybrid" }), ["workMode"]);
  const withLocation = {
    ...brief,
    hardConditions: [
      { id: "h1", kind: "location" as const, label: "서울 근무", countries: ["KR"], cities: ["seoul", "pangyo"], allowRelocation: true },
      { id: "h2", kind: "remote_ok" as const, label: "원격 근무 가능" },
    ],
  } as never;
  const hybrid = briefWithRoleInfo(withLocation, { locationText: "판교", workMode: "hybrid" }, ["workMode"]);
  assert.deepEqual(hybrid.hardConditions, [
    { id: "h1", kind: "location", label: "서울 근무", countries: ["KR"], cities: ["seoul", "pangyo"], allowRelocation: true },
  ], "a work arrangement change leaves the model's location as written");
  const moved = briefWithRoleInfo(hybrid, { locationText: "판교", workMode: "hybrid" }, ["location"]);
  assert.deepEqual(moved.hardConditions[0], { id: "h1", kind: "location", label: "판교 근무", countries: ["KR"], cities: ["pangyo"], allowRelocation: true });
  const unknown = briefWithRoleInfo(hybrid, { locationText: "런던", workMode: "hybrid" }, ["location"]);
  assert.deepEqual((unknown.hardConditions[0] as { cities: string[] }).cities, ["seoul", "pangyo"], "an unknown place never widens the filter");
  const remote = briefWithRoleInfo(moved, { locationText: null, workMode: "remote" }, ["workMode"]);
  assert.equal(remote.hardConditions.filter((item) => item.kind === "remote_ok").length, 1);
  assert.deepEqual((remote.hardConditions.find((item) => item.kind === "location") as { cities: string[] }).cities, [], "remote keeps the country, not the city");
  assert.equal((unknown.hardConditions[0] as { label: string }).label, "서울 근무", "an unplaced name leaves the condition as written");
  assert.deepEqual(briefWithRoleInfo(remote, { locationText: null, workMode: "remote" }, ["workMode"]).hardConditions, remote.hardConditions);
  const cityOnly = { ...brief, hardConditions: [{ id: "h3", kind: "location" as const, label: "판교 근무", countries: [], cities: ["pangyo"], allowRelocation: false }] } as never;
  assert.deepEqual(
    (briefWithRoleInfo(cityOnly, { locationText: null, workMode: "remote" }, ["workMode"]).hardConditions[0] as { countries: string[] }).countries,
    ["KR"],
    "a city-only condition keeps its country when work turns remote"
  );
  const locationQuestion = { chips: [{ id: "a", label: "서울", effect: { type: "add_hard_condition", condition: { kind: "location", label: "서울" } } }] } as never;
  assert.equal(asksRoleInfo(locationQuestion, ["location"]), true);
  assert.equal(asksRoleInfo(locationQuestion, ["workMode"]), false, "only questions about the changed field leave");
});

test("text cut inside a two-part character is still saved (half becomes U+FFFD)", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { wellFormedJson } = await import("./session");
  const cut = "Staying 𝗵𝘂".slice(0, -1);
  const value = wellFormedJson({ evidence: cut, list: [cut], ok: "𝗵" }) as { evidence: string; list: string[]; ok: string };
  assert.equal(value.evidence, "Staying 𝗵\uFFFD");
  assert.equal(value.list[0], "Staying 𝗵\uFFFD");
  assert.equal(value.ok, "𝗵", "whole characters stay");
});
