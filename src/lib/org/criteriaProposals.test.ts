import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCriteriaProposal,
  CRITERIA_PROPOSAL_RULES,
  CRITERIA_PROPOSALS_ENABLED,
  criteriaProposalChangeReason,
  criteriaProposalContentKey,
  criteriaProposalStillApplies,
  criteriaProposalText,
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
