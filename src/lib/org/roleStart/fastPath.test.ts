import assert from "node:assert/strict";
import test from "node:test";

// The module imports the LLM client, which needs a key at import time; no call is made here.
process.env.OPENAI_API_KEY ||= "test-only-not-used";
import { criterionHash } from "./brief";
const fastPath = () => import("./fastPath");

const must = { id: "c1", name: "파이프라인 운영", criteria: "배치 파이프라인 운영", requirement: "must" as const, kind: "similarity" as const };
const pref = { id: "c2", name: "dbt", criteria: "dbt 활용", requirement: "preferred" as const, kind: "similarity" as const };
const brief = { summary: "", hardConditions: [], criteria: [must, pref], keywords: [] };

function pool(scores: Record<string, [number | null, number | null]>) {
  const ids = Object.keys(scores);
  const map = (index: 0 | 1) =>
    Object.fromEntries(
      ids.flatMap((id) => {
        const value = scores[id]![index];
        return value === null ? [] : [[id, { score: value, raw: value, evidence: null }]];
      })
    );
  return {
    builtAt: new Date().toISOString(),
    eligibleCount: ids.length,
    filteredCount: ids.length,
    conditionCounts: [],
    members: ids.map((talentId) => ({ talentId, years: 5, countryCode: "KR", city: "seoul", remoteOk: null, relocationOk: null, retrieval: 0.5 })),
    scores: { [criterionHash(must)]: map(0), [criterionHash(pref)]: map(1) },
    timings: {},
    embeddingTokens: 0,
  };
}

test("a person without sections ranks low but is not a must miss", async () => {
  const { rankPool, UNKNOWN_SCORE } = await fastPath();
  const { ranked } = rankPool({ pool: pool({ a: [0.8, 0.5], b: [null, null], c: [0.1, 0.9] }), brief });
  const byId = Object.fromEntries(ranked.map((member) => [member.talentId, member]));
  assert.equal(byId.b!.perCriterion.c1!.score, UNKNOWN_SCORE);
  assert.equal(byId.b!.passesMust, true);
  assert.equal(byId.c!.passesMust, false);
  assert.equal(ranked[0]!.talentId, "a");
});

test("the first three are the top three by the formula among must-passers, with no info candidate", async () => {
  const { pickFirstThree, rankPool } = await fastPath();
  const { ranked } = rankPool({ pool: pool({ a: [0.9, 0.9], b: [0.85, 0.8], c: [0.8, 0.1], d: [0.2, 0.05], e: [0.7, 0.2] }), brief });
  const picked = pickFirstThree({ ranked });
  assert.deepEqual(
    picked.map((member) => member.talentId),
    ranked.filter((member) => member.passesMust).slice(0, 3).map((member) => member.talentId)
  );
  assert.ok(picked.every((member) => member.passesMust && member.probe === null));
});

test("an onsite city implies its country, and relocation needs to be allowed", async () => {
  const { passesCondition } = await fastPath();
  const { normalizeHardConditions } = await import("./brief");
  const [seoul] = normalizeHardConditions([{ kind: "location", label: "서울 근무", countries: [], cities: ["Seoul"] }]);
  assert.ok(seoul && seoul.kind === "location");
  assert.equal(seoul.allowRelocation, false);
  const person = (countryCode: string | null, city: string | null, relocationOk: boolean | null, relocationCountries: string[] = []) => ({
    talentId: "x", years: 5, countryCode, city, remoteOk: null, relocationOk, relocationCountries, retrieval: 0.5,
  });
  const welcome = { ...seoul, allowRelocation: true };
  // On site (no remote_ok condition).
  assert.equal(passesCondition(person("KR", "seongnam", null), seoul, true), true);
  assert.equal(passesCondition(person("KR", "busan", null), seoul, true), false);
  assert.equal(passesCondition(person("KR", "busan", true), welcome, true), true, "moving within the country");
  assert.equal(passesCondition(person("SG", "singapore", true), welcome, true), false, "willing, but no stated move to KR");
  assert.equal(passesCondition(person("SG", "singapore", true, ["JP"]), welcome, true), false, "moving elsewhere");
  assert.equal(passesCondition(person("SG", "singapore", true, ["KR"]), welcome, true), true, "said they can move to KR");
  assert.equal(passesCondition(person("SG", "singapore", true, ["KR"]), seoul, true), false, "relocation not welcome");
  assert.equal(passesCondition(person(null, null, null), seoul, true), true, "an unknown home country stays in (확인 필요)");
  assert.equal(passesCondition(person(null, "busan", null), seoul, true), false, "a known other city is a mismatch");
  assert.equal(passesCondition({ ...person("SG", null, true), relocationCountries: undefined }, welcome, true), false, "older pool");
  // Fully remote Role: unknowns stay in, as before.
  assert.equal(passesCondition(person(null, null, null), seoul, false), true);
  assert.equal(passesCondition(person("SG", "singapore", true), welcome, false), true);
});

test("a Role is on site unless the Brief has a remote condition (hybrid counts as on site)", async () => {
  const { onsiteRole } = await fastPath();
  const brief = (kinds: string[]) => ({ summary: "", keywords: [], criteria: [], hardConditions: kinds.map((kind, index) => ({ id: `h${index}`, kind, label: kind })) }) as never;
  assert.equal(onsiteRole(brief(["location"])), true);
  assert.equal(onsiteRole(brief(["location", "remote_ok"])), false);
});

test("job-match score drops other jobs, gates must, and a tool name alone does not pass must", async () => {
  const { rankPool } = await fastPath();
  const { jobScoreKey } = await import("./jobMatch");
  const titled = { ...brief, titles: { matching: ["data engineer"], nearMiss: ["data analyst"] } };
  const base = pool({ a: [0.8, 0.5], b: [0.8, 0.5], c: [0.8, 0.5], d: [0.8, 0.5], e: [0.8, 0.5] });
  // e names the tool (high score) but its sections are not similar.
  const hash = criterionHash(must);
  base.scores[hash]!.e = { score: 0.6, raw: 0.6, evidence: null, similarity: 0.1 } as never;
  const withJob = { ...base, job: { key: jobScoreKey(titled), scores: { a: 0.9, b: 0.25, c: 0.05, d: null, e: 0.9 } } };
  const { ranked } = rankPool({ pool: withJob, brief: titled });
  const byId = Object.fromEntries(ranked.map((member) => [member.talentId, member]));
  assert.equal(byId.c, undefined, "clearly another job is left out");
  assert.equal(byId.a!.passesMust, true);
  assert.equal(byId.b!.passesMust, false, "weak job match fails must");
  assert.equal(byId.d!.passesMust, true, "unknown job does not fail must");
  assert.equal(byId.e!.passesMust, false, "tool name without similar sections fails must");
  assert.ok(byId.a!.overall > byId.d!.overall);
});

test("years conditions read years in the Role's job, total years only when the job is unreadable", async () => {
  const { applyHardConditions } = await fastPath();
  const { jobScoreKey, unionYears } = await import("./jobMatch");
  const year = 365.25 * 86_400_000;
  assert.equal(Math.round(unionYears([[0, 2 * year], [year, 3 * year], [5 * year, 6 * year]])), 4);
  const titled = {
    ...brief,
    titles: { matching: ["product manager"], nearMiss: [] },
    hardConditions: [{ id: "h1", kind: "min_years" as const, label: "PM 경력 4년 이상", years: 4 }],
  };
  const base = pool({ a: [0.8, 0.5], b: [0.8, 0.5], c: [0.8, 0.5] });
  base.members = base.members.map((member) => ({ ...member, years: 10 }));
  const withJob = { ...base, job: { key: jobScoreKey(titled), scores: { a: 0.9, b: 0.9, c: null }, years: { a: 6, b: 2, c: null } } };
  const { members } = applyHardConditions(withJob, titled);
  const byId = Object.fromEntries(members.map((member) => [member.talentId, member]));
  assert.equal(byId.a?.yearsBasis, "role");
  assert.equal(byId.b, undefined, "10 years in total but 2 in the job");
  assert.equal(byId.c?.yearsBasis, "total");
});

test("shown evidence maps each section to its criterion, cut to 600 characters", async () => {
  const { evidenceByTalent } = await fastPath();
  const long = "가".repeat(700);
  const byTalent = evidenceByTalent(
    [
      { talent_id: "a", idx: 1, best_text: "Airflow 배치 운영" },
      { talent_id: "a", idx: 2, best_text: long },
      { talent_id: "b", idx: 2, best_text: null },
    ],
    ["h1", "h2"]
  );
  assert.deepEqual(byTalent.get("a"), { h1: "Airflow 배치 운영", h2: "가".repeat(600) });
  assert.equal(byTalent.has("b"), false);
});

test("older pools lose section text under every stored criterion, rule lines and scores stay", async () => {
  const { scoreCriteria } = await fastPath();
  const base = pool({ a: [0.8, 0.5] });
  base.scores.old = { a: { score: 0.7, raw: 0.7, evidence: "예전 Brief의 섹션 텍스트" } } as never;
  base.scores.rule = { a: { score: 0.9, raw: 5, evidence: "경력 약 5년" } } as never;
  base.scores[criterionHash(must)]!.a = { score: 0.8, raw: 0.8, evidence: "섹션 텍스트" } as never;
  // Every criterion is already scored, so nothing is queried.
  await scoreCriteria({ pool: base, criteria: [must, pref] });
  assert.deepEqual(base.scores.old!.a, { score: 0.7, raw: 0.7 });
  assert.deepEqual(base.scores.rule!.a, { score: 0.9, raw: 5, evidence: "경력 약 5년" });
  assert.deepEqual(base.scores[criterionHash(must)]!.a, { score: 0.8, raw: 0.8 });
  assert.equal(base.scores[criterionHash(pref)]!.a!.score, 0.5);
});
