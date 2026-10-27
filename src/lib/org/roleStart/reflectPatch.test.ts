import assert from "node:assert/strict";
import test from "node:test";

// Modules import the LLM client, which needs a key at import time; nothing calls it here.
process.env.OPENAI_API_KEY ||= "test-only-not-used";

const signals = { excellent: "강해요", good: "충족돼요", uncertain: "알 수 없어요", bad: "달라요" };

async function base() {
  const { normalizeRoleStartBrief, summaryKey } = await import("./brief");
  const brief = normalizeRoleStartBrief({
    summary: "데이터 엔지니어를 찾아요.",
    hardConditions: [
      { id: "h1", kind: "min_years", label: "경력 3년 이상", years: 3 },
      { id: "h2", kind: "location", label: "서울", countries: ["KR"], cities: ["Seoul"], allowRelocation: false },
      { id: "h3", kind: "other", label: "팀이 직접 적은 조건" },
    ],
    criteria: [
      { id: "c1", name: "파이프라인 운영", criteria: "배치 파이프라인 운영", requirement: "must", kind: "similarity", signals, evidenceTerms: [["Airflow", "에어플로우"]], changeReason: "초안", changedAt: "2026-01-01T00:00:00.000Z" },
      { id: "c2", name: "dbt", criteria: "dbt 모델링", requirement: "preferred", importance: 2, kind: "similarity", signals },
      { id: "c3", name: "총 경력", criteria: "데이터 엔지니어 경력 3-8년", requirement: "preferred", importance: 1, kind: "judgment", signals },
    ],
    keywords: ["Airflow", "dbt"],
    titles: { matching: ["Data Engineer"], nearMiss: ["Data Analyst"] },
    otherNotes: ["1월 입사 가능"],
  });
  return { ...brief, summaryOf: summaryKey(brief) };
}

const none = { operations: [], hardConditions: null, otherNotes: null, appliedSummary: "" };

test("an empty patch gives back the same Brief", async () => {
  const { rawBriefFromPatch } = await import("./reflectPatch");
  const { briefFromRaw } = await import("./questions");
  const brief = await base();
  const result = rawBriefFromPatch(brief, none);
  assert.ok(result.ok);
  assert.deepEqual(briefFromRaw(result.raw, brief, "답"), brief);
});

test("a reworded criterion keeps its id, drops its signals and records the change; the rest stays", async () => {
  const { rawBriefFromPatch } = await import("./reflectPatch");
  const { briefFromRaw } = await import("./questions");
  const { needsSummary } = await import("./brief");
  const brief = await base();
  const result = rawBriefFromPatch(brief, {
    ...none,
    operations: [
      { type: "update_criterion", id: "c1", name: null, criteria: "스트리밍·배치 파이프라인 운영", importance: null, kind: null, years: null, evidenceTerms: null },
      { type: "update_criterion", id: "c2", name: null, criteria: null, importance: "required", kind: null, years: null, evidenceTerms: null },
    ],
    appliedSummary: "파이프라인 기준을 넓혔어요.",
  });
  assert.ok(result.ok);
  const next = briefFromRaw(result.raw, brief, "답");
  const [c1, c2, c3] = next.criteria;
  assert.equal(c1.id, "c1");
  assert.equal(c1.criteria, "스트리밍·배치 파이프라인 운영");
  assert.equal(c1.signals, undefined, "rewritten from the new text afterwards");
  assert.deepEqual(c1.evidenceTerms, [["airflow", "에어플로우"]]);
  assert.equal(c1.changeReason, "답");
  // A level change alone keeps the signals (same text) but counts as a change.
  assert.deepEqual([c2.requirement, c2.signals, c2.changeReason], ["must", signals, "답"]);
  assert.deepEqual(c3, brief.criteria[2]);
  assert.deepEqual([next.summary, next.keywords, next.titles, next.otherNotes], [brief.summary, brief.keywords, brief.titles, brief.otherNotes]);
  assert.deepEqual(next.hardConditions, brief.hardConditions);
  assert.equal(needsSummary(next), true, "the summary is rewritten by its own call");
});

test("add, remove and new lists apply like a full rewrite", async () => {
  const { rawBriefFromPatch } = await import("./reflectPatch");
  const { briefFromRaw } = await import("./questions");
  const brief = await base();
  const result = rawBriefFromPatch(brief, {
    operations: [
      { type: "remove_criterion", id: "c2" },
      { type: "add_criterion", name: "Kafka", criteria: "Kafka 운영", importance: "nice", kind: "similarity", minYears: null, maxYears: null, evidenceTerms: [["Kafka", "카프카"]] },
      { type: "update_criterion", id: "c3", name: null, criteria: null, importance: null, kind: "rule", years: { minYears: 3, maxYears: 8 }, evidenceTerms: null },
    ],
    hardConditions: [{ kind: "min_years", label: "경력 5년 이상", years: 5, countries: [], cities: [], allowRelocation: null }],
    otherNotes: ["원격 주 1회"],
    appliedSummary: "Kafka를 더했어요.",
  });
  assert.ok(result.ok);
  const next = briefFromRaw(result.raw, brief, "답");
  assert.deepEqual(next.criteria.map((item) => item.name), ["파이프라인 운영", "총 경력", "Kafka"]);
  const added = next.criteria[2];
  assert.ok(added.id && !["c1", "c2", "c3"].includes(added.id));
  assert.deepEqual([added.signals, added.changeReason, added.requirement, added.importance], [undefined, "답", "preferred", 1]);
  assert.deepEqual(next.criteria[1].rule, { minYears: 3, maxYears: 8 });
  // The team's own "other" condition is kept, as briefFromRaw keeps it for a rewrite.
  assert.deepEqual(next.hardConditions.map((item) => item.label), ["경력 5년 이상", "팀이 직접 적은 조건"]);
  assert.deepEqual(next.otherNotes, ["원격 주 1회"]);
});

test("unknown ids, repeated ids and malformed operations are refused, not guessed", async () => {
  const { rawBriefFromPatch } = await import("./reflectPatch");
  const brief = await base();
  const update = { type: "update_criterion" as const, id: "c1", name: null, criteria: null, importance: null, kind: null, years: null, evidenceTerms: null };
  const add = { type: "add_criterion" as const, name: "Kafka", criteria: "Kafka 운영", importance: "nice", kind: "similarity", minYears: null, maxYears: null, evidenceTerms: [] };
  for (const [label, operations] of [
    ["unknown id", [{ ...update, id: "nope" }]],
    ["removed unknown", [{ type: "remove_criterion" as const, id: "nope" }]],
    ["twice", [update, { type: "remove_criterion" as const, id: "c1" }]],
    ["bad importance", [{ ...update, importance: "maybe" }]],
    ["empty name", [{ ...update, name: " " }]],
    ["add without text", [{ ...add, criteria: "" }]],
    ["add under a kept name", [{ ...add, name: "dbt" }]],
    ["unknown type", [{ type: "rename_role", id: "c1" }]],
  ] as const) {
    const result = rawBriefFromPatch(brief, { ...none, operations: operations as never });
    assert.equal(result.ok, false, label);
  }
  assert.equal(rawBriefFromPatch(brief, { ...none, hardConditions: [{ label: "" }] as never }).ok, false);
  // A name freed by a removal can be taken by a new criterion.
  assert.equal(rawBriefFromPatch(brief, { ...none, operations: [{ type: "remove_criterion", id: "c2" }, { ...add, name: "dbt" }] }).ok, true);
});

test("a rename next to a new criterion under the old name gives two ids, never one", async () => {
  const { rawBriefFromPatch } = await import("./reflectPatch");
  const { briefFromRaw } = await import("./questions");
  const brief = await base();
  const result = rawBriefFromPatch(brief, {
    ...none,
    operations: [
      { type: "update_criterion", id: "c1", name: "배치 파이프라인", criteria: null, importance: null, kind: null, years: null, evidenceTerms: null },
      { type: "add_criterion", name: "파이프라인 운영", criteria: "스트리밍 파이프라인 운영", importance: "nice", kind: "similarity", minYears: null, maxYears: null, evidenceTerms: [] },
    ],
  });
  assert.ok(result.ok);
  const next = briefFromRaw(result.raw, brief, "답");
  const renamed = next.criteria.find((item) => item.name === "배치 파이프라인")!;
  const added = next.criteria.find((item) => item.name === "파이프라인 운영")!;
  assert.equal(renamed.id, "c1");
  assert.ok(added.id && added.id !== "c1", "the new criterion gets its own id");
  assert.equal(added.signals, undefined, "and none of the renamed criterion's grade signals");
  assert.equal(new Set(next.criteria.map((item) => item.id)).size, next.criteria.length);
});

test("an id a rewrite gives twice goes to its first criterion; the other is new", async () => {
  const { briefFromRaw } = await import("./questions");
  const brief = await base();
  const raw = (name: string, id: string | null) => ({ id, name, criteria: `${name} 기준`, importance: "important", kind: "similarity" as const, minYears: null, maxYears: null, evidenceTerms: [] });
  const next = briefFromRaw(
    { summary: brief.summary, hardConditions: [], keywords: [], criteria: [raw("파이프라인 운영", "c1"), raw("스트리밍", "c1"), raw("dbt", null)] } as never,
    brief,
    "요청: 정리"
  );
  assert.equal(next.criteria[0]!.id, "c1");
  assert.ok(next.criteria[1]!.id && next.criteria[1]!.id !== "c1");
  assert.equal(next.criteria[2]!.id, "c2", "a name match to a criterion nobody kept still keeps its id");
});
