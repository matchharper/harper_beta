import assert from "node:assert/strict";
import test from "node:test";
import {
  keepRequired,
  levelOf,
  normalizeRoleStartBrief,
  reapplySettled,
  renderBriefMarkdown,
  weightOf,
  withLevel,
  type RoleStartBrief,
} from "./brief";

const brief: RoleStartBrief = {
  summary: "",
  hardConditions: [],
  keywords: [],
  criteria: [
    { id: "c1", name: "dbt 활용", criteria: "dbt", requirement: "must" },
    { id: "c2", name: "B2C 대규모 데이터", criteria: "대규모", requirement: "preferred" },
    { id: "c3", name: "품질 모니터링", criteria: "품질", requirement: "preferred", importance: 1 },
  ],
};

test("older criteria read 꼭 확인 → 필수 and 가산 → 중요; weights are 1 / 2 / 3", () => {
  assert.deepEqual(brief.criteria.map(levelOf), ["required", "important", "nice"]);
  assert.deepEqual(brief.criteria.map(weightOf), [3, 2, 1]);
  const normalized = normalizeRoleStartBrief(brief);
  assert.deepEqual(
    normalized.criteria.map((item) => [item.requirement, item.importance]),
    [["must", 3], ["preferred", 2], ["preferred", 1]]
  );
  assert.deepEqual(withLevel(brief.criteria[1]!, "required").requirement, "must");
  assert.deepEqual(withLevel(brief.criteria[0]!, "nice").requirement, "preferred");
});

test("a level settled by an info candidate survives a rewritten Brief", () => {
  const next = reapplySettled(brief, [
    { criterionId: "c2", name: "B2C 대규모 데이터", level: "nice" },
    { criterionId: "old", name: "품질 모니터링", level: "important" },
  ]);
  assert.equal(levelOf(next.criteria[1]!), "nice", "matched by id");
  assert.equal(levelOf(next.criteria[2]!), "important", "matched by name after an id change");
  assert.equal(levelOf(next.criteria[0]!), "required", "untouched");
});

test("a model rewrite neither turns 필수 on nor off", () => {
  const rewritten: RoleStartBrief = {
    ...brief,
    criteria: [
      { ...brief.criteria[0]!, requirement: "preferred", importance: 2 },
      { ...brief.criteria[1]!, requirement: "must" },
      { id: "c4", name: "새 기준", criteria: "새", requirement: "must" },
    ],
  };
  assert.deepEqual(keepRequired(brief, rewritten).criteria.map(levelOf), ["required", "important", "important"]);
});

test("the saved Brief text puts required criteria under Hard constraints and only orders the rest", () => {
  const text = renderBriefMarkdown(brief);
  const [required, preferred] = text.split("## Preferred criteria");
  assert.match(required!, /## Hard constraints\n(?:.*\n)*?- \*\*dbt 활용\*\*/);
  assert.ok(!preferred!.includes("dbt 활용"), "a required criterion is not repeated as a preference");
  assert.match(preferred!, /- \*\*B2C 대규모 데이터\*\* \(중요\)[^\n]*\n(?:.*\n)*?- \*\*품질 모니터링\*\* \(있으면 좋음\)/);
  assert.ok(!/###|맞는 분만 추천/.test(text), "no 필수 group inside the preferences");
  assert.ok(!/꼭 확인|가산/.test(text));
});

test("grade signals are fresh only for the name and criteria they were written for", async () => {
  const { needsSignals, signalsKey, normalizeRoleStartBrief } = await import("./brief");
  const signals = { excellent: "a", good: "b", uncertain: "c", bad: "d" };
  const saved = normalizeRoleStartBrief({ summary: "", criteria: [{ id: "k", name: "Kafka 경험", criteria: "Kafka를 쓴 경험", importance: 2, requirement: "preferred", signals }] });
  assert.equal(needsSignals(saved.criteria[0]!), false, "signals saved before the key existed count as written for their text");
  const edited = { ...saved.criteria[0]!, criteria: "Kafka를 3년 이상 쓴 경험" };
  assert.equal(needsSignals(edited), true, "a changed criteria needs new signals");
  assert.equal(needsSignals({ ...edited, signalsOf: signalsKey(edited) }), false);
  assert.equal(needsSignals({ ...edited, signals: undefined }), true);
});

test("a screen edit keeps a criterion's rule only while its text is unchanged", async () => {
  process.env.OPENAI_API_KEY ||= "test-only-not-used";
  const { mergeVisibleBriefEdit } = await import("./service");
  const stored = normalizeRoleStartBrief({
    summary: "",
    hardConditions: [],
    criteria: [
      { id: "c1", name: "백엔드 경력", criteria: "백엔드 개발 3년 이상", requirement: "required", rule: { minYears: 3, maxYears: null } },
      { id: "c2", name: "데이터 경력", criteria: "데이터 파이프라인 2년 이상", requirement: "required", rule: { minYears: 2, maxYears: null } },
    ],
  });
  // The screen holds only what it shows (no rules).
  const { roleStartBriefView } = await import("./view");
  const shown = roleStartBriefView(stored);
  const edited = mergeVisibleBriefEdit(
    stored,
    { ...shown, criteria: [shown.criteria[0], { ...shown.criteria[1], criteria: "데이터 파이프라인을 직접 운영한 경험" }] },
    "test"
  );
  assert.deepEqual(edited.criteria[0].rule, { minYears: 3, maxYears: null });
  assert.equal(edited.criteria[1].rule, undefined);
});

test("a summary-only screen edit saves the summary and leaves every criterion as it was", async () => {
  process.env.OPENAI_API_KEY ||= "test-only-not-used";
  const { mergeVisibleBriefEdit } = await import("./service");
  const { roleStartBriefView, visibleBriefHash } = await import("./view");
  const stored = normalizeRoleStartBrief({
    summary: "백엔드 리드를 찾아요",
    hardConditions: [],
    criteria: [{ id: "c1", name: "백엔드 경력", criteria: "백엔드 개발 3년 이상", requirement: "required", rule: { minYears: 3, maxYears: null } }],
  });
  const edited = mergeVisibleBriefEdit(stored, { ...roleStartBriefView(stored), summary: "결제 백엔드를 이끌 리드를 찾아요" }, "test");
  assert.equal(edited.summary, "결제 백엔드를 이끌 리드를 찾아요");
  assert.deepEqual(edited.criteria, stored.criteria);
  assert.notEqual(visibleBriefHash(edited), visibleBriefHash(stored));
});

test("a Brief counts as changed since a screen loaded it only when what the screen saves changed, not grade signals or reference bookkeeping", async () => {
  process.env.OPENAI_API_KEY ||= "test-only-not-used";
  const { visibleBriefHash } = await import("./view");
  const loaded = normalizeRoleStartBrief({
    summary: "",
    hardConditions: [],
    criteria: [{ id: "c1", name: "Kafka 경험", criteria: "Kafka를 쓴 경험", requirement: "preferred", importance: 2 }],
    references: [{ id: "r1", label: "참고 인물", status: "read", addedAt: "2026-01-01T00:00:00.000Z" }],
  });
  const hash = visibleBriefHash(loaded);
  const signals = { excellent: "a", good: "b", uncertain: "c", bad: "d" };
  // A background grade signals write and a reference read leave the hash alone.
  assert.equal(visibleBriefHash({ ...loaded, criteria: [{ ...loaded.criteria[0]!, signals, signalsOf: "k" }] }), hash);
  assert.equal(visibleBriefHash({ ...loaded, references: [{ ...loaded.references![0]!, addedAt: "2026-02-01T00:00:00.000Z" }] }), hash);
  // A criterion's text or level changed elsewhere does not.
  assert.notEqual(visibleBriefHash({ ...loaded, criteria: [{ ...loaded.criteria[0]!, criteria: "Kafka를 3년 이상 쓴 경험" }] }), hash);
  assert.notEqual(visibleBriefHash({ ...loaded, criteria: [withLevel(loaded.criteria[0]!, "required")] }), hash);
});

test("withLatestBackground keeps the edit and takes background grade signals and reference people as they are now", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { withLatestBackground } = await import("./view");
  const criterion = { id: "c1", name: "Spark 경험", criteria: "Spark로 배치를 운영한 경험", requirement: "must" as const, importance: 3 };
  const edited = { summary: "고친 요약", hardConditions: [], keywords: [], criteria: [criterion, { ...criterion, id: "c2", name: "SQL", criteria: "새로 고친 설명" }] };
  const latest = {
    summary: "예전 요약",
    hardConditions: [],
    keywords: [],
    criteria: [
      { ...criterion, signals: { excellent: ["새 신호"] } },
      { ...criterion, id: "c2", name: "SQL", criteria: "예전 설명", signals: { excellent: ["예전 설명의 신호"] } },
    ],
    references: [{ id: "rf1" }],
  } as never;
  const saved = withLatestBackground(edited as never, latest);
  assert.equal(saved.summary, "고친 요약");
  assert.deepEqual(saved.criteria[0]!.signals, { excellent: ["새 신호"] }, "an unchanged criterion takes the background signals");
  assert.equal(saved.criteria[1]!.signals, undefined, "an edited criterion does not take the old text's signals");
  assert.deepEqual(saved.references, [{ id: "rf1" }]);
});

test("the summary follows the conditions and criteria it recaps, and a team-written summary stays theirs", async () => {
  process.env.OPENAI_API_KEY ||= "test-only-not-used";
  const { mergeVisibleBriefEdit } = await import("./service");
  const { roleStartBriefView } = await import("./view");
  const { needsSummary, summaryKey, verdictBriefHash } = await import("./brief");
  const stored = normalizeRoleStartBrief({
    summary: "결제 백엔드를 맡아요. 백엔드 3년 이상이 필요해요.",
    hardConditions: [],
    criteria: [{ id: "c1", name: "백엔드 경력", criteria: "백엔드 개발 3년 이상", requirement: "required" }],
  });
  stored.summaryOf = summaryKey(stored);
  assert.equal(needsSummary(stored), false);
  // A criterion changed on the screen: the summary is now out of date (rewritten in the background).
  const changed = mergeVisibleBriefEdit(stored, { ...roleStartBriefView(stored), criteria: [{ ...roleStartBriefView(stored).criteria[0], criteria: "백엔드 개발 5년 이상" }] }, "test");
  assert.equal(needsSummary(changed), true);
  // The team wrote the summary themselves: kept, and counted as up to date.
  const own = mergeVisibleBriefEdit(stored, { ...roleStartBriefView(stored), summary: "우리 팀이 직접 쓴 요약" }, "test");
  assert.equal(own.summary, "우리 팀이 직접 쓴 요약");
  assert.equal(needsSummary(own), false);
  // A prepared verdict does not depend on the summary.
  assert.equal(verdictBriefHash({ ...stored, summary: "다른 요약" }), verdictBriefHash(stored));
});
