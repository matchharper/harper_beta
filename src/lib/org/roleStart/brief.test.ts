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
  const edited = mergeVisibleBriefEdit(stored, { ...roleStartBriefView(stored), summary: "결제 백엔드를 이끌 리드를 찾아요" }, "test", { summaryEdited: true });
  assert.equal(edited.summary, "결제 백엔드를 이끌 리드를 찾아요");
  assert.deepEqual(edited.criteria, stored.criteria);
  // The summary follows the rest, so it does not make a screen's other edits conflict.
  assert.equal(visibleBriefHash(edited), visibleBriefHash(stored));
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

test("withLatestBackground keeps the draft's background signals, summary, keywords and titles under an answer applied meanwhile", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { withLatestBackground } = await import("./view");
  const { signalsKey } = await import("./brief");
  const criterion = { id: "c1", name: "Spark 경험", criteria: "Spark로 배치를 운영한 경험", requirement: "must" as const, importance: 3 };
  // The answer was applied to the Brief as read before the draft's background step finished.
  const base = { summary: "", hardConditions: [], keywords: ["spark"], criteria: [criterion, { ...criterion, id: "c2", name: "SQL", criteria: "SQL 경험" }] };
  const signals = { excellent: ["배경 신호"] };
  const latest = {
    summary: "배경에서 쓴 요약",
    summaryOf: "s1",
    hardConditions: [],
    keywords: ["spark"],
    titles: { matching: ["데이터 엔지니어"], nearMiss: ["백엔드 개발자"] },
    criteria: [
      { ...criterion, signals, signalsOf: signalsKey(criterion) },
      { ...criterion, id: "c2", name: "SQL", criteria: "SQL 경험", signals, signalsOf: "k2" },
    ],
  };
  const answered = { ...base, criteria: [criterion, { ...criterion, id: "c2", name: "SQL", criteria: "SQL로 지표를 만든 경험" }] };
  const saved = withLatestBackground(answered as never, latest as never, base as never);
  assert.deepEqual(saved.criteria[0]!.signals, signals, "a criterion the answer left alone keeps the background signals");
  assert.equal(saved.criteria[0]!.signalsOf, signalsKey(criterion));
  assert.equal(saved.criteria[1]!.signals, undefined, "a criterion the answer changed does not take signals for the old text");
  assert.equal(saved.summary, "배경에서 쓴 요약");
  assert.equal(saved.summaryOf, "s1");
  assert.deepEqual(saved.titles, latest.titles);
  assert.deepEqual(saved.keywords, ["spark"]);
  // What the answer itself rewrote stays; an empty rewritten summary does not wipe the latest one.
  const rewritten = withLatestBackground(
    { ...answered, summary: "답을 반영한 요약", summaryOf: "s2", keywords: ["spark", "airflow"], titles: { matching: ["ML 엔지니어"], nearMiss: [] } } as never,
    latest as never,
    { ...base, summary: "예전 요약" } as never
  );
  assert.equal(rewritten.summary, "답을 반영한 요약");
  assert.equal(rewritten.summaryOf, "s2");
  assert.deepEqual(rewritten.keywords, ["spark", "airflow"]);
  assert.deepEqual(rewritten.titles, { matching: ["ML 엔지니어"], nearMiss: [] });
  const empty = withLatestBackground({ ...answered, summary: "" } as never, latest as never, { ...base, summary: "예전 요약" } as never, {
    blankSummaryFromLatest: true,
  });
  assert.equal(empty.summary, "배경에서 쓴 요약");
});

test("withLatestBackground keeps a summary the team cleared on a Brief edit, while an empty answer rewrite takes the latest", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { withLatestBackground } = await import("./view");
  const criterion = { id: "c1", name: "Spark 경험", criteria: "Spark로 배치를 운영한 경험", requirement: "must" as const, importance: 3 };
  const before = { summary: "예전 요약", summaryOf: "s1", hardConditions: [], keywords: [], criteria: [criterion] };
  const latest = { ...before, summary: "배경에서 쓴 요약", summaryOf: "s2" };
  const cleared = { ...before, summary: "", summaryOf: undefined };
  const edited = withLatestBackground(cleared as never, latest as never, before as never);
  assert.equal(edited.summary, "", "the team's cleared summary is not brought back");
  const answered = withLatestBackground(cleared as never, latest as never, before as never, { blankSummaryFromLatest: true });
  assert.equal(answered.summary, "배경에서 쓴 요약");
  assert.equal(answered.summaryOf, "s2");
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
  // A screen that only sends back the summary it loaded keeps the stored (maybe newer) one.
  const kept = mergeVisibleBriefEdit({ ...stored, summary: "배경에서 새로 쓴 요약" }, { ...roleStartBriefView(stored) }, "test");
  assert.equal(kept.summary, "배경에서 새로 쓴 요약");
  // The team wrote the summary themselves: kept, and counted as up to date.
  const own = mergeVisibleBriefEdit(stored, { ...roleStartBriefView(stored), summary: "우리 팀이 직접 쓴 요약" }, "test", { summaryEdited: true });
  assert.equal(own.summary, "우리 팀이 직접 쓴 요약");
  assert.equal(needsSummary(own), false);
  // A prepared verdict must also match the job-related context in the summary.
  assert.notEqual(verdictBriefHash({ ...stored, summary: "다른 요약" }), verdictBriefHash(stored));
});

test("legacy notes become visible summary text and are absent from every new Brief projection", async () => {
  process.env.OPENAI_API_KEY ||= "test-only-not-used";
  const { renderBriefMarkdown, verdictBriefHash } = await import("./brief");
  const { visibleBriefHash, roleStartBriefView } = await import("./view");
  const { mergeVisibleBriefEdit } = await import("./service");
  const { briefForPrompt } = await import("./verdicts");
  const { formatPromptText } = await import("@/lib/llm/promptText");
  const brief = normalizeRoleStartBrief({
    summary: "결제 백엔드를 맡아요.",
    hardConditions: [],
    criteria: [{ id: "c1", name: "백엔드 경력", criteria: "백엔드 개발 3년 이상", requirement: "required" }],
    otherNotes: ["1월 입사 가능", "월 1회 해외 출장", ""],
  });
  assert.equal(brief.summary, "결제 백엔드를 맡아요.\n\n1월 입사 가능\n\n월 1회 해외 출장");
  assert.equal("otherNotes" in brief, false);
  assert.deepEqual(normalizeRoleStartBrief(JSON.parse(JSON.stringify(brief))), brief, "reading a saved Brief never appends the text twice");
  const saved = mergeVisibleBriefEdit(brief, roleStartBriefView(brief), "test");
  assert.equal(saved.summary, brief.summary);
  assert.equal("otherNotes" in saved, false);
  assert.equal("otherNotes" in roleStartBriefView(saved), false);
  assert.deepEqual(Object.keys(briefForPrompt(saved)), ["summary", "hardConditions", "criteria"]);
  const modelInput = formatPromptText(briefForPrompt(saved));
  assert.ok(modelInput.includes("1월 입사 가능"));
  assert.ok(!modelInput.includes("기타 참고 사항"));
  const markdown = renderBriefMarkdown(brief);
  assert.ok(!markdown.includes("## Other notes"));
  assert.ok(markdown.startsWith(brief.summary));
  assert.notEqual(verdictBriefHash(brief), verdictBriefHash({ ...brief, summary: "결제 백엔드를 맡아요." }));
  assert.equal(visibleBriefHash({ ...brief, summary: "다른 요약" }), visibleBriefHash(brief));
});

test("all Brief-producing model schemas omit the retired field", async () => {
  const { DRAFT_SCHEMA, NEXT_QUESTIONS_SCHEMA, REFLECT_SCHEMA, buildReflectPatchSchema } = await import("./prompts");
  for (const schema of [DRAFT_SCHEMA, NEXT_QUESTIONS_SCHEMA, REFLECT_SCHEMA, buildReflectPatchSchema(["c1"])]) {
    assert.equal(JSON.stringify(schema).includes("otherNotes"), false);
  }
  const patch = buildReflectPatchSchema(["c1"]);
  assert.ok(patch.required.includes("summary"));
});

test("the first-three key follows everything the ranking reads, not only what a verdict reads", async () => {
  const { criterionHash, hardConditionsHash, rankingBriefHash, verdictBriefHash } = await import("./brief");
  const base = normalizeRoleStartBrief({
    summary: "",
    hardConditions: [{ kind: "location", label: "서울 근무", countries: ["KR"], cities: ["Seoul"], allowRelocation: false }],
    criteria: [
      { id: "c1", name: "데이터 파이프라인", criteria: "Kafka, Airflow 운영", importance: "required", kind: "similarity", evidenceTerms: [["Kafka", "카프카"]] },
      { id: "c2", name: "총 경력", criteria: "5년 이상", importance: "important", kind: "rule", rule: { minYears: 5, maxYears: null } },
    ],
  });
  const changed = (edit: (brief: RoleStartBrief) => RoleStartBrief) => {
    const next = edit(structuredClone(base));
    return { verdict: verdictBriefHash(next) !== verdictBriefHash(base), ranking: rankingBriefHash(next) !== rankingBriefHash(base) };
  };
  // Search words, a criterion's kind, a rule's years and a condition's values change who ranks first without changing what a verdict reads.
  assert.deepEqual(changed((b) => ((b.criteria[0]!.evidenceTerms = [["Flink"]]), b)), { verdict: false, ranking: true });
  assert.deepEqual(changed((b) => ((b.criteria[0]!.kind = "judgment"), b)), { verdict: false, ranking: true });
  assert.deepEqual(changed((b) => ((b.criteria[1]!.rule = { minYears: 3, maxYears: null }), b)), { verdict: false, ranking: true });
  assert.deepEqual(changed((b) => (((b.hardConditions[0] as { cities: string[] }).cities = ["Busan"]), b)), { verdict: false, ranking: true });
  // A label rewording or a level change: the label is only a verdict's, the level both.
  assert.deepEqual(changed((b) => ((b.hardConditions[0]!.label = "서울 사무실 근무"), b)), { verdict: true, ranking: false });
  assert.deepEqual(changed((b) => ({ ...b, criteria: [withLevel(b.criteria[0]!, levelOf(b.criteria[0]!) === "nice" ? "required" : "nice") as never, b.criteria[1]!] })), { verdict: true, ranking: true });
  assert.equal(hardConditionsHash(base), hardConditionsHash({ ...base, hardConditions: base.hardConditions.map((c) => ({ ...c, id: "other-id" })) }));
  // Only a rule criterion's score key reads its years: stored scores of every other kind keep their key.
  const similarity = base.criteria[0]!;
  assert.equal(criterionHash(similarity), criterionHash({ ...similarity, rule: { minYears: 9, maxYears: null } } as never));
  assert.notEqual(criterionHash(base.criteria[1]!), criterionHash({ ...base.criteria[1]!, rule: { minYears: 3, maxYears: null } } as never));
});

test("the draft's first summary is kept when an answer changes the Brief meanwhile, and then reads as needing a rewrite", async () => {
  const { needsSummary, SUMMARY_PENDING, summaryKey, summaryToSave } = await import("./brief");
  const draft = normalizeRoleStartBrief({
    summary: "",
    hardConditions: [],
    criteria: [{ id: "c1", name: "백엔드 경력", criteria: "백엔드 개발 3년 이상", importance: "important" }],
  });
  draft.summaryOf = SUMMARY_PENDING;
  // An answer made the criterion required while the summary was being written.
  const answered = { ...draft, criteria: [withLevel(draft.criteria[0]!, "required") as never] };
  const saved = summaryToSave({ written: draft, summary: "결제 백엔드를 맡아요.", latest: answered });
  assert.equal(saved?.summary, "결제 백엔드를 맡아요.");
  assert.equal(saved?.summaryOf, summaryKey(draft), "kept with the key it was written for");
  assert.equal(needsSummary(saved!), true, "so the next refresh follows the answer");
  // Nothing changed meanwhile: saved as up to date.
  assert.equal(needsSummary(summaryToSave({ written: draft, summary: "요약", latest: draft })!), false);
  // The team wrote their own summary meanwhile: never replaced.
  const own = { ...answered, summary: "팀이 쓴 요약", summaryOf: summaryKey(answered) };
  assert.equal(summaryToSave({ written: draft, summary: "요약", latest: own }), null);
  // A later rewrite still lands only on the Brief it was written for.
  const current = { ...answered, summary: "예전 요약", summaryOf: "old" };
  assert.equal(summaryToSave({ written: current, summary: "새 요약", latest: { ...current, criteria: draft.criteria } }), null);
  assert.equal(summaryToSave({ written: current, summary: "새 요약", latest: current })?.summaryOf, summaryKey(current));
});
