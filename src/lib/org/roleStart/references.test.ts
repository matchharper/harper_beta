import assert from "node:assert/strict";
import test from "node:test";
import {
  briefForModel,
  criterionHash,
  levelOf,
  normalizeRoleStartBrief,
  renderBriefMarkdown,
  verdictBriefHash,
  type RoleStartBrief,
  type RoleStartReference,
} from "./brief";

// Modules import the LLM client, which needs a key at import time; nothing calls it here.
process.env.OPENAI_API_KEY ??= "test-only-not-used";

const reference: RoleStartReference = {
  id: "rf1",
  label: "참고 인물 A",
  source: "text",
  talentId: null,
  url: null,
  status: "read",
  summary: "물류 회사에서 실시간 데이터 파이프라인을 설계하고 운영했어요.",
  traits: [
    { id: "tr1", label: "스트리밍 운영", criterionName: "스트리밍 파이프라인 운영", criteria: "실시간 파이프라인을 직접 운영한 경험", mergeInto: null },
    { id: "tr2", label: "장애 대응", criterionName: "장애 대응", criteria: "파이프라인 장애를 직접 해결한 경험", mergeInto: "Spark 경험" },
  ],
  liked: [],
  notUsed: [],
  waiting: [],
  conflicts: [{ id: "cf1", question: "이분은 8년 차예요. 경력 조건을 바꿀까요?", answer: null }],
  answered: false,
  addedAt: "2026-10-22T00:00:00.000Z",
};

const brief: RoleStartBrief = {
  summary: "데이터 엔지니어를 찾고 있어요.",
  hardConditions: [],
  keywords: [],
  criteria: [{ id: "c1", name: "Spark 경험", criteria: "Spark로 배치를 운영한 경험", requirement: "must", importance: 3 }],
  references: [reference],
};

test("reference people stay in the Brief record and out of the saved text, the hashes and model input", () => {
  const normalized = normalizeRoleStartBrief(brief);
  assert.equal(normalized.references?.[0]?.label, "참고 인물 A");
  assert.equal(normalized.references?.[0]?.traits.length, 2);
  const without = normalizeRoleStartBrief({ ...brief, references: [] });
  assert.equal(renderBriefMarkdown(normalized), renderBriefMarkdown(without));
  assert.equal(verdictBriefHash(normalized), verdictBriefHash(without));
  const tagged = normalizeRoleStartBrief({ ...brief, criteria: [{ ...brief.criteria[0], reference: "참고 인물 A" }] });
  assert.equal(tagged.criteria[0].reference, "참고 인물 A");
  assert.equal(criterionHash(tagged.criteria[0]), criterionHash(normalized.criteria[0]));
  const forModel = briefForModel(tagged) as Record<string, unknown> & { criteria: Array<Record<string, unknown>> };
  assert.equal("references" in forModel, false);
  assert.equal("reference" in forModel.criteria[0], false);
});

test("an accepted trait becomes 있으면 좋음 unless the team said it is required; a merge adds to the criterion", async () => {
  const { applyAcceptedTraits } = await import("./references");
  const plain = applyAcceptedTraits(normalizeRoleStartBrief(brief), reference, reference.traits, new Set());
  const added = plain.brief.criteria.find((criterion) => criterion.name === "스트리밍 파이프라인 운영");
  assert.equal(added && levelOf(added), "nice");
  assert.equal(added?.reference, "참고 인물 A");
  // Spark 경험 is a 필수 조건: the trait does not tighten it, it becomes its own 평가 기준.
  const spark = plain.brief.criteria.find((criterion) => criterion.name === "Spark 경험");
  assert.doesNotMatch(spark?.criteria ?? "", /장애를 직접 해결/);
  const own = plain.brief.criteria.find((criterion) => criterion.name === "장애 대응");
  assert.equal(own && levelOf(own), "nice");
  const soft = normalizeRoleStartBrief({ ...brief, criteria: [{ ...brief.criteria[0], requirement: "preferred", importance: 2 }] });
  const merged = applyAcceptedTraits(soft, reference, [reference.traits[1]], new Set()).brief.criteria.find((criterion) => criterion.name === "Spark 경험");
  assert.match(merged?.criteria ?? "", /장애를 직접 해결/);
  const required = applyAcceptedTraits(normalizeRoleStartBrief(brief), reference, [reference.traits[0]], new Set(["tr1"]));
  assert.equal(levelOf(required.brief.criteria.find((criterion) => criterion.name === "스트리밍 파이프라인 운영")!), "required");
});

test("a new reference criterion is preserved beyond the old criteria cap", async () => {
  const { applyAcceptedTraits } = await import("./references");
  const full = normalizeRoleStartBrief({
    ...brief,
    criteria: Array.from({ length: 20 }, (_, index) => ({ id: `c${index}`, name: `기준 ${index}`, criteria: `설명 ${index}`, requirement: "preferred", importance: 2 })),
  });
  const result = applyAcceptedTraits(full, reference, [reference.traits[0]], new Set());
  assert.equal(result.brief.criteria.length, 21);
  assert.deepEqual(result.waiting, []);
});

test("an edit sent from a screen never adds or changes reference people", async () => {
  const { mergeVisibleBriefEdit } = await import("./service");
  const stored = normalizeRoleStartBrief(brief);
  const edited = mergeVisibleBriefEdit(
    stored,
    { ...stored, references: [{ ...reference, id: "rf-forged", label: "참고 인물 Z" }], criteria: [{ ...stored.criteria[0], reference: "참고 인물 Z" }] },
    "test"
  );
  assert.deepEqual(edited.references?.map((item) => item.id), ["rf1"]);
  assert.equal(edited.criteria[0].reference, undefined);
});

test("links compare by profile, not by spelling; a trait about years is never accepted as one", async () => {
  const { normalizeUrl, YEARS } = await import("./references");
  assert.equal(normalizeUrl("https://kr.linkedin.com/in/example-person/details/?a=1"), "linkedin.com/in/example-person");
  assert.equal(normalizeUrl("http://www.linkedin.com/in/example-person/"), "linkedin.com/in/example-person");
  assert.equal(normalizeUrl("https://github.com/Example/"), "github.com/example");
  assert.equal(normalizeUrl("https://www.linkedin.com/in/%E0%A4%A"), "linkedin.com/in/%e0%a4%a");
  assert.ok(YEARS.test("경력 5년 이상"));
  assert.ok(YEARS.test("7년 차 데이터 엔지니어"));
  assert.ok(!YEARS.test("3년간 운영한 결제 시스템을 직접 개선한 경험"));
  assert.ok(!YEARS.test("결제 시스템을 직접 운영한 경험"));
});

test("only traits that became criteria count as liked; a required one never makes another criterion 필수", async () => {
  const { applyAcceptedTraits } = await import("./references");
  const soft = normalizeRoleStartBrief({ ...brief, criteria: [{ ...brief.criteria[0], requirement: "preferred", importance: 1 }] });
  // A required trait stands on its own: the 있으면 좋음 criterion it would have joined stays as it is.
  const result = applyAcceptedTraits(soft, reference, [reference.traits[1]], new Set(["tr2"]));
  assert.deepEqual(result.applied, ["장애 대응"]);
  assert.equal(levelOf(result.brief.criteria[0]), "nice");
  assert.equal(levelOf(result.brief.criteria.find((criterion) => criterion.name === "장애 대응")!), "required");
  const full = normalizeRoleStartBrief({
    ...brief,
    criteria: Array.from({ length: 20 }, (_, index) => ({ id: `c${index}`, name: `기준 ${index}`, criteria: `설명 ${index}`, requirement: "preferred", importance: 2 })),
  });
  const waited = applyAcceptedTraits(full, reference, [reference.traits[0]], new Set());
  assert.deepEqual([waited.applied, waited.waiting], [["스트리밍 운영"], []]);
});

test("roomForAnotherQuestion: the limit of 5 counts start questions only (helper arithmetic only)", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { roomForAnotherQuestion } = await import("./references");
  assert.equal(roomForAnotherQuestion(3), true, "3 answered: one more fits");
  assert.equal(roomForAnotherQuestion(4), true, "4 answered: the 5th question still comes");
  assert.equal(roomForAnotherQuestion(5), false, "5 answered: no 6th question");
});

test("a link is looked up by its whole normalized form, plain and URL-encoded", async () => {
  const { linkSearchPatterns, normalizeUrl } = await import("./references");
  assert.deepEqual(linkSearchPatterns(normalizeUrl("https://kr.linkedin.com/in/예시-사람/")), [
    "%linkedin.com/in/예시-사람%",
    "%linkedin.com/in/%EC%98%88%EC%8B%9C-%EC%82%AC%EB%9E%8C%",
  ]);
  assert.deepEqual(linkSearchPatterns("github.com/example"), ["%github.com/example%", "%github.com/example%"]);
});

test("the answer call names the person it maps, so one answer about two people maps each apart", async () => {
  const { referenceAnswerInput } = await import("./references");
  const input = referenceAnswerInput({ brief, reference: { ...reference, label: "참고 인물 B" }, answer: "A는 좋고 B는 별로예요" });
  assert.match(input, /^<PERSON>참고 인물 B<\/PERSON>/);
  assert.match(input, /<ANSWER>A는 좋고 B는 별로예요<\/ANSWER>/);
});

test("2 reference people with conflicts plus 1 answer still leave room: people take no question slots (helper arithmetic only)", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { roomForAnotherQuestion } = await import("./references");
  const { questionsTowardLimit } = await import("./chatAnswers");
  // The count reads only the questions; a Brief with two people and their conflicts adds nothing.
  const counted = questionsTowardLimit({ history: [], pending: null, queued: [] });
  assert.equal(counted, 0);
  assert.equal(roomForAnotherQuestion(counted + 1), true, "1 answered: more questions fit");
});

test("reference people alone never use up the questions before any answer (helper arithmetic only)", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { roomForAnotherQuestion } = await import("./references");
  // Three people (two with conflicts) used to fill all 5 slots; now the first question still comes.
  assert.equal(roomForAnotherQuestion(0), true);
});

test("each pasted profile is its own person, a one-line one included; a profile next to a link joins that link (no link opened here)", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { loadReferenceSources } = await import("./references");
  const profile = (work: string) => `${work}을(를) 맡아 설계하고 운영했어요. `.repeat(8);
  const row = (text: string, liked: string | null = null) => ({ url: null, text, liked });
  // A one-line profile is read as it is (the box field is a profile by definition); a blank one is skipped.
  const sources = await loadReferenceSources([row(profile("결제 시스템")), row("   "), row(profile("검색 서비스")), row("간편결제 백엔드 5년")]);
  assert.deepEqual(sources.map((source) => [source.key, source.source]), [["row:0", "text"], ["row:2", "text"], ["row:3", "text"]]);
  assert.match(sources[1]?.content ?? "", /검색 서비스/);
  assert.equal(sources[2]?.content, "간편결제 백엔드 5년");
  const liked = await loadReferenceSources([row(profile("결제 시스템"), "도메인 경험 / 핀테크")]);
  assert.equal(liked[0]?.liked, "도메인 경험 / 핀테크", "what the team liked goes into the read with the profile");
});

test("a repeated link is read once and its 마음에 든 점 goes to the person recorded for it (helper only)", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { isRepeatedLink, repeatedLinkAnswers } = await import("./references");
  const known = { ...reference, url: "https://www.linkedin.com/in/example-a" };
  const added = { ...reference, id: "rf2", label: "참고 인물 B", url: "https://example.com/b" };
  const rows = [
    { url: "https://linkedin.com/in/example-a/", text: null, liked: "도메인 경험" },
    { url: "https://example.com/b", text: null, liked: null },
    { url: "https://example.com/b", text: null, liked: "운영 경험" },
    { url: null, text: "붙여 넣은 프로필", liked: "리더십" },
  ];
  assert.deepEqual(rows.map((_, index) => isRepeatedLink(rows, index, [known])), [true, false, true, false]);
  assert.deepEqual(
    repeatedLinkAnswers(rows, [known], [known, added]).map((item) => [item.reference.id, item.liked]),
    [["rf1", "도메인 경험"], ["rf2", "운영 경험"]]
  );
});

test("the remove action drops only that person and keeps the criteria added from them", async () => {
  const { withoutReference } = await import("./references");
  const tagged = normalizeRoleStartBrief({
    ...brief,
    criteria: [...brief.criteria, { id: "c2", name: "스트리밍 파이프라인 운영", criteria: "실시간 파이프라인 운영", requirement: "preferred", importance: 2, reference: "참고 인물 A" }],
    references: [reference, { ...reference, id: "rf2", label: "참고 인물 B" }],
  });
  const removed = withoutReference(tagged, "rf1");
  assert.deepEqual(removed.references?.map((item) => item.id), ["rf2"]);
  assert.deepEqual(removed.criteria, tagged.criteria);
});

test("withLatestReferences keeps the computed Brief and takes the latest reference people (helper only)", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { withLatestReferences } = await import("./references");
  const computed = { ...brief, summary: "평가를 반영했어요.", references: [reference] };
  const latest = { ...brief, references: [{ ...reference, answered: true }, { ...reference, id: "rf2", label: "참고 인물 B" }] };
  const saved = withLatestReferences(computed, latest);
  assert.equal(saved.summary, "평가를 반영했어요.", "the computed Brief is kept");
  assert.deepEqual(saved.references?.map((item) => [item.id, item.answered]), [["rf1", true], ["rf2", false]]);
});

test("a 참고 인물 matched to a Harper talent by link is kept out of the start-flow picks (no Pass record is written for it)", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { referenceTalentIds } = await import("./references");
  const linked = { ...reference, id: "rf9", source: "link" as const, url: "https://example.com/in/fictional", talentId: "talent-1" };
  assert.deepEqual(referenceTalentIds({ ...brief, references: [reference, linked] }), ["talent-1"]);
});

test("with 5 people recorded, a row repeating one's link takes no new place and its liked text goes to that person", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { isRepeatedLink, repeatedLinkAnswers } = await import("./references");
  const known = ["A", "B", "C", "D", "E"].map((letter, index) => ({ ...reference, id: `rf${index}`, label: `참고 인물 ${letter}`, source: "link" as const, url: `https://example.com/in/fictional-${index}` }));
  const rows = [{ url: "https://example.com/in/fictional-2", text: null, liked: "도메인 경험" }];
  const fresh = rows.filter((_, index) => !isRepeatedLink(rows, index, known)).length;
  assert.equal(known.length + fresh <= 5, true, "the 5-person cap is not exceeded by a repeat");
  assert.deepEqual(repeatedLinkAnswers(rows, known, known).map((item) => [item.reference.id, item.liked]), [["rf2", "도메인 경험"]]);
});
