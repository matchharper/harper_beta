import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCriteriaProposal,
  CRITERIA_PROPOSAL_RULES,
  CRITERIA_PROPOSALS_ENABLED,
  criteriaProposalChangeReason,
  criteriaProposalContentKey,
  criteriaProposalsOverlap,
  criteriaProposalStillApplies,
  criteriaProposalText,
  MEMORY_NOTE_MAX,
  memoryNoteKey,
  nextCriterionLevel,
  parseCriteriaProposalPayload,
  type CriteriaProposalPayload,
} from "./criteriaProposals";

// What a suggestion is, with no judgment in it: Harper decides whether to
// suggest (criteriaReview.server.ts); these are the levels, the stored
// payload and the To-do text.
const criteria = [
  { id: "c-go", name: "Go 서비스 운영", criteria: "Go로 서비스를 운영해 봤다", requirement: "preferred", importance: 2 },
  { id: "c-lead", name: "리드 경험", criteria: "팀을 이끌어 봤다", requirement: "preferred", importance: 1 },
  { id: "c-k8s", name: "쿠버네티스", criteria: "클러스터를 운영해 봤다", requirement: "must", importance: 3 },
  { name: "B2B 경험", criteria: "기업 고객 제품" },
];

const goProposal: CriteriaProposalPayload = {
  version: 1,
  change: { type: "criterion_level", criterionKey: "c-go", criterionName: "Go 서비스 운영", from: "important", to: "required" },
  evidence: { count: 4, window: 4, decisionIds: [9, 8, 7, 6] },
};

test("on since 11/6, read again every 3 passes or 7 days", () => {
  assert.equal(CRITERIA_PROPOSALS_ENABLED, true);
  assert.deepEqual(
    { every: CRITERIA_PROPOSAL_RULES.everyDecisions, wait: CRITERIA_PROPOSAL_RULES.waitDays, size: CRITERIA_PROPOSAL_RULES.reviewSize },
    { every: 3, wait: 7, size: 20 }
  );
});

test("a suggestion goes one level up, never past required", () => {
  assert.equal(nextCriterionLevel("nice"), "important");
  assert.equal(nextCriterionLevel("important"), "required");
  assert.equal(nextCriterionLevel("required"), null);
  // The highest level is one switch.
  assert.equal(nextCriterionLevel("important", "important"), null);
  assert.equal(nextCriterionLevel("nice", "important"), "important");
  assert.equal(criteriaProposalContentKey(goProposal.change), "criterion_level:c-go:important>required");
});

test("the change keeps other criteria and records why", () => {
  const now = new Date("2026-11-07T01:00:00Z");
  const next = applyCriteriaProposal(criteria, goProposal.change, criteriaProposalChangeReason(goProposal, "ko"), now);
  assert.deepEqual(next[0], {
    id: "c-go",
    name: "Go 서비스 운영",
    criteria: "Go로 서비스를 운영해 봤다",
    requirement: "must",
    importance: 3,
    changeReason: "넘긴 이유 반영 (4명 중 4명)",
    changedAt: now.toISOString(),
  });
  assert.deepEqual(next.slice(1).map((item) => item.name), ["리드 경험", "쿠버네티스", "B2B 경험"]);
  assert.equal(criteriaProposalStillApplies(goProposal.change, criteria), true);
  assert.equal(criteriaProposalStillApplies(goProposal.change, next), false);
  assert.equal(criteriaProposalStillApplies(goProposal.change, criteria.slice(1)), false);
  // Older criteria are keyed by name and read as 중요.
  const byName = { ...goProposal.change, criterionKey: "B2B 경험", criterionName: "B2B 경험" };
  assert.equal(criteriaProposalStillApplies(byName, criteria), true);
});

test("the To-do line, in both languages, fits the summary column", () => {
  const payload: CriteriaProposalPayload = {
    version: 1,
    change: {
      type: "criterion_level",
      criterionKey: "c-go",
      criterionName: "아주 긴 이름의 확인할 기준이 들어가도 줄이 넘치지 않아야 해요 정말로 아주 길게",
      from: "nice",
      to: "important",
    },
    evidence: { count: 7, window: 10, decisionIds: [1] },
  };
  const ko = criteriaProposalText(payload, "ko");
  const en = criteriaProposalText(payload, "en");
  assert.match(ko.summary, /있으면 좋음에서 중요로 올릴까요\? 최근 이유를 남기고 넘긴 후보 10명 중 7명이 이 기준 때문이었어요\.$/);
  assert.match(en.summary, /from Nice to have to Important\? It was the reason for 7 of your last 10 passes with a reason\.$/);
  for (const text of [ko.summary, en.summary]) assert.ok(Array.from(text).length <= 160, text);
  assert.match(ko.preview, /: 있으면 좋음 → 중요$/);
  const required = criteriaProposalText({ ...payload, change: { type: "criterion_level", criterionKey: "c-go", criterionName: "Go", from: "important", to: "required" } }, "ko");
  assert.equal(required.summary.startsWith("'Go' 기준을 중요에서 필수로 올릴까요?"), true);
  assert.equal(criteriaProposalChangeReason(payload, "en"), "From pass reasons (7 of 10)");
});

test("Harper's own sentence is shown to readers of its language, with the counts from the evidence", () => {
  const payload: CriteriaProposalPayload = {
    ...goProposal,
    evidence: { count: 4, window: 6, decisionIds: [9, 8, 7, 6] },
    locale: "ko",
    rationale: "최근 넘긴 후보들이 공통으로 Go 운영 경험이 없다는 이유였어요.",
  };
  assert.equal(
    criteriaProposalText(payload, "ko").summary,
    "'Go 서비스 운영' 기준을 중요에서 필수로 올릴까요? 최근 넘긴 후보들이 공통으로 Go 운영 경험이 없다는 이유였어요. (이유를 남긴 6명 중 4명)"
  );
  // An English reader gets the fixed sentence, not Korean prose.
  assert.match(criteriaProposalText(payload, "en").summary, /It was the reason for 4 of your last 6 passes with a reason\.$/);
  // A long sentence is cut so the line still fits; the counts stay.
  const long = criteriaProposalText({ ...payload, rationale: "가".repeat(200) }, "ko").summary;
  assert.ok(Array.from(long).length <= 160, long);
  assert.match(long, /…\s\(이유를 남긴 6명 중 4명\)$/);
});

test("stored payloads are read back strictly", () => {
  assert.deepEqual(parseCriteriaProposalPayload({ ...goProposal, locale: "en", claim: { by: "x" } }), { ...goProposal, locale: "en" });
  assert.deepEqual(parseCriteriaProposalPayload({ ...goProposal, rationale: "  why  " }), { ...goProposal, rationale: "why" });
  assert.equal(parseCriteriaProposalPayload({ ...goProposal, rationale: "가".repeat(400) })!.rationale!.length, 200);
  assert.equal("rationale" in parseCriteriaProposalPayload({ ...goProposal, rationale: "   " })!, false);
  assert.equal(parseCriteriaProposalPayload({ changes: [] }), null);
  assert.equal(parseCriteriaProposalPayload({ ...goProposal, change: { ...goProposal.change, to: "max" } }), null);
  assert.equal(parseCriteriaProposalPayload({ ...goProposal, evidence: { count: 5, window: 3 } }), null);
});

// B18: when the reasons point outside the current criteria, a new criterion.
const newProposal: CriteriaProposalPayload = {
  version: 1,
  change: { type: "criterion_add", criterionName: "결제 도메인", description: "결제 시스템을 만들어 봤다", to: "important" },
  evidence: { count: 3, window: 5, decisionIds: [9, 8, 7] },
};

test("a new criterion is added at its level, once, and only while the Role lacks it", () => {
  const now = new Date("2026-11-08T01:00:00Z");
  assert.equal(criteriaProposalContentKey(newProposal.change), "criterion_add:결제 도메인");
  // Same name in other spacing or case: the same change, never suggested twice.
  assert.equal(
    criteriaProposalContentKey({ ...newProposal.change, criterionName: "  결제   도메인 " } as typeof newProposal.change),
    criteriaProposalContentKey(newProposal.change)
  );
  assert.equal(criteriaProposalStillApplies(newProposal.change, criteria), true);
  const next = applyCriteriaProposal(criteria, newProposal.change, criteriaProposalChangeReason(newProposal, "ko"), now);
  assert.deepEqual(next.slice(0, criteria.length).map((item) => item.name), criteria.map((item) => item.name));
  assert.deepEqual(next.at(-1), {
    name: "결제 도메인",
    criteria: "결제 시스템을 만들어 봤다",
    requirement: "preferred",
    importance: 2,
    changeReason: "넘긴 이유 반영 (5명 중 3명)",
    changedAt: now.toISOString(),
  });
  assert.equal(criteriaProposalStillApplies(newProposal.change, next), false);
  const ko = criteriaProposalText(newProposal, "ko");
  assert.match(ko.summary, /^'결제 도메인' 기준을 중요로 새로 넣을까요\? 최근 이유를 남기고 넘긴 후보 5명 중 3명이 이 이유 때문이었어요\.$/);
  assert.match(criteriaProposalText(newProposal, "en").summary, /^Add '결제 도메인' as a new criterion \(Important\)\?/);
  assert.equal(ko.preview, "새 기준 결제 도메인 (중요): 결제 시스템을 만들어 봤다");
  assert.deepEqual(parseCriteriaProposalPayload(newProposal), newProposal);
  // Never stored at required, and never without what it checks.
  assert.equal(parseCriteriaProposalPayload({ ...newProposal, change: { ...newProposal.change, to: "required" } }), null);
  assert.equal(parseCriteriaProposalPayload({ ...newProposal, change: { ...newProposal.change, description: " " } }), null);
});

// When the reasons point at a lasting company preference, a company memory note.
const noteProposal: CriteriaProposalPayload = {
  version: 1,
  change: { type: "memory_note", note: "최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요.", scope: "company" },
  evidence: { count: 3, window: 5, decisionIds: [9, 8, 7] },
  locale: "ko",
  rationale: "넘긴 이유가 짧은 재직을 반복해서 들었어요.",
};

test("a memory note is keyed by its words, leaves the criteria alone and shows whole on the card", () => {
  const key = criteriaProposalContentKey(noteProposal.change);
  assert.equal(key, "memory_note:최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요");
  // Other spacing, case or punctuation: the same note, never suggested twice.
  assert.equal(
    criteriaProposalContentKey({ ...noteProposal.change, note: "  최근 두 회사에서   모두 6개월 안에 나온 분은 뽑지 않아요!! " } as typeof noteProposal.change),
    key
  );
  assert.equal(memoryNoteKey("We DON'T hire  job-hoppers."), "we don t hire job hoppers");
  assert.notEqual(memoryNoteKey("C++ 경력만 봐요"), memoryNoteKey("C 경력만 봐요"));
  assert.ok(Array.from(criteriaProposalContentKey({ ...noteProposal.change, note: "﷽".repeat(100) } as typeof noteProposal.change)).length <= 300);
  assert.equal(criteriaProposalStillApplies(noteProposal.change, criteria), true);
  assert.equal(criteriaProposalStillApplies(noteProposal.change, []), true);
  assert.deepEqual(
    applyCriteriaProposal(criteria, noteProposal.change, "x", new Date()).map((item) => item.name),
    criteria.map((item) => item.name)
  );

  assert.deepEqual(criteriaProposalText(noteProposal, "ko"), {
    summary:
      "'최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요.' 내용을 회사 기억에 남길까요? 넘긴 이유가 짧은 재직을 반복해서 들었어요. (이유를 남긴 5명 중 3명)",
    preview: "회사 기억: 최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요.",
  });
  // An English reader gets the note as written and the counts, not Korean prose.
  assert.deepEqual(criteriaProposalText(noteProposal, "en"), {
    summary: "Save '최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요.' to company memory? (3 of 5 passes with a reason)",
    preview: "Company memory: 최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요.",
  });
  const team: CriteriaProposalPayload = {
    ...noteProposal,
    change: { type: "memory_note", note: "We work from the office four days a week.", scope: "team", teamId: "team-1" },
    locale: "en",
    rationale: "Several passes were about working in the office.",
  };
  assert.equal(
    criteriaProposalText(team, "en").summary,
    "Save 'We work from the office four days a week.' to team memory? Several passes were about working in the office. (3 of 5 passes with a reason)"
  );
  assert.match(criteriaProposalText(team, "ko").summary, /^'We work from the office four days a week\.' 내용을 팀 기억에 남길까요\? \(이유를 남긴 5명 중 3명\)$/);
  assert.equal(criteriaProposalText(team, "ko").preview, "팀 기억: We work from the office four days a week.");
  // The longest note still shows whole, in both languages, within the summary column.
  const longest = { ...noteProposal, change: { ...noteProposal.change, note: "가".repeat(MEMORY_NOTE_MAX) } as typeof noteProposal.change,
    evidence: { count: 20, window: 20, decisionIds: [] } };
  for (const locale of ["ko", "en"] as const) {
    const { summary } = criteriaProposalText(longest, locale);
    assert.ok(summary.includes("가".repeat(MEMORY_NOTE_MAX)), summary);
    assert.ok(Array.from(summary).length <= 160, summary);
  }
});

test("a stored memory note is read back exactly, or not at all", () => {
  assert.deepEqual(parseCriteriaProposalPayload(noteProposal), noteProposal);
  const team = { ...noteProposal, change: { type: "memory_note", note: "팀은 주 4일 출근해요.", scope: "team", teamId: "team-1" } };
  assert.deepEqual(parseCriteriaProposalPayload(team), team);
  for (const change of [
    { ...noteProposal.change, note: "가".repeat(MEMORY_NOTE_MAX + 1) },
    { ...noteProposal.change, note: "  " },
    { ...noteProposal.change, scope: "role" },
    { ...noteProposal.change, teamId: "team-1" },
    { type: "memory_note", note: "팀은 주 4일 출근해요.", scope: "team" },
  ])
    assert.equal(parseCriteriaProposalPayload({ ...noteProposal, change }), null, JSON.stringify(change));
});

test("two suggestions overlap on the same criterion or the same memory note", () => {
  const level = (criterionKey: string, criterionName: string) => ({ type: "criterion_level", criterionKey, criterionName, from: "nice", to: "important" }) as const;
  const added = (criterionName: string) => ({ type: "criterion_add", criterionName, description: "d", to: "nice" }) as const;
  const note = (text: string) => ({ type: "memory_note", note: text, scope: "company" }) as const;
  assert.equal(criteriaProposalsOverlap(level("c-a", "Go"), { ...level("c-a", "Go"), from: "important", to: "required" }), true);
  assert.equal(criteriaProposalsOverlap(level("c-a", "Go"), level("c-b", "TS")), false);
  assert.equal(criteriaProposalsOverlap(added("Go  운영"), added("go 운영")), true);
  assert.equal(criteriaProposalsOverlap(added("Go"), level("c-a", "go")), true);
  assert.equal(criteriaProposalsOverlap(note("짧은 재직은 어려워요."), note("짧은 재직은 어려워요")), true);
  assert.equal(criteriaProposalsOverlap(note("Go"), level("c-a", "Go")), false);
});

test("a suggestion from the conversation says so instead of counting passes", () => {
  const payload: CriteriaProposalPayload = {
    version: 1,
    change: { type: "memory_note", note: "인턴 경험만 있는 사람은 보지 않아요", scope: "company" },
    evidence: { count: 1, window: 1, decisionIds: [], messageIds: [501] },
    locale: "ko",
  };
  assert.match(criteriaProposalText(payload, "ko").summary, /\(대화에서 말씀하신 내용\)$/);
  assert.match(criteriaProposalText(payload, "en").summary, /\(from what your team said\)$/);
  assert.equal(criteriaProposalChangeReason(payload, "ko"), "대화에서 말씀하신 내용 반영");
  assert.deepEqual(parseCriteriaProposalPayload(JSON.parse(JSON.stringify(payload)))?.evidence.messageIds, [501]);
});
