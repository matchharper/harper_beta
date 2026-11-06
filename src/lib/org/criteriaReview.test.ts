import assert from "node:assert/strict";
import { test } from "node:test";
import type { PassDecision } from "./criteriaProposals";
import {
  buildCriteriaReview,
  criteriaProposalFromReview,
  CriteriaReviewInputError,
  criteriaReviewSnapshot,
  formatCriteriaReview,
  parseCriteriaReviewSnapshot,
  type PassDecisionDetail,
} from "./criteriaReview";

// What Harper reads in a review of pass reasons and how the evidence it cites
// is checked. Harper's judgment itself is tested with a stand-in model in
// criteriaReview.server.test.ts.
const criteria = [
  { id: "c-rn", name: "React Native 실무 경험", criteria: "RN으로 앱을 출시해 봤다", requirement: "preferred", importance: 1 },
  { id: "c-go", name: "Go 서비스 운영", criteria: "Go로 운영", requirement: "must", importance: 3 },
  { name: "B2B 경험", criteria: "기업 고객 제품" },
];

const at = (minute: number) => `2026-11-06T0${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}:00.123456+00:00`;
const decision = (id: number, talent: string | null, tags: string[] = []): PassDecision => ({
  id, subjectId: talent, reasonTags: tags, hasReasonText: false, createdAt: at(id),
});

test("one line per candidate: its newest pass, every reason it was given, new before earlier", () => {
  const decisions = [
    decision(30, "t-a"),
    decision(29, "t-b", ["c-rn"]),
    decision(28, "t-c"),
    decision(27, "t-a", ["timing"]),
    decision(20, "t-d", ["experience_skills"]),
    decision(19, "t-e"),
    decision(18, null),
  ];
  const details: PassDecisionDetail[] = [
    { id: 30, action: "pass", reasonText: "  RN   경험이 없어요 " },
    { id: 29, action: "stop", reasonText: null },
    { id: 28, action: "stage_change", stage: "archived", reasonText: null },
    { id: 27, action: "pass", reasonText: "지금은 이직 생각이 없대요" },
    { id: 20, action: "pass", reasonText: "연차가 부족" },
    { id: 19, action: "pass", reasonText: null },
    { id: 18, action: "pass", reasonText: "RN 없음" },
  ];
  const review = buildCriteriaReview({
    cursor: 25,
    decisions,
    details,
    headlines: { "t-a": "Frontend Engineer at Acme", "t-b": " iOS 개발자 ", "t-d": null },
    notes: [
      { talentId: "t-a", text: "RN 경험이 없어요", createdAt: "2026-11-06T01:00:00Z" },
      { talentId: "t-c", text: "웹만 해 봤음, RN 없음", createdAt: "2026-11-06T02:00:00Z" },
      { talentId: "t-c", text: "포트폴리오 좋음", createdAt: "2026-11-06T03:00:00Z" },
    ],
  });
  assert.deepEqual(
    review.passes.map((pass) => [pass.decisionId, pass.talentId, pass.isNew, pass.action, pass.reasons, pass.tags, pass.headline]),
    [
      [30, "t-a", true, "pass", ["RN 경험이 없어요", "지금은 이직 생각이 없대요"], ["timing"], "Frontend Engineer at Acme"],
      [29, "t-b", true, "stop", [], ["c-rn"], "iOS 개발자"],
      // Notes count as the company's words, newest first; the pass-reason note itself is not repeated.
      [28, "t-c", true, "archive", ["포트폴리오 좋음", "웹만 해 봤음, RN 없음"], [], null],
      [20, "t-d", false, "pass", ["연차가 부족"], ["experience_skills"], null],
      [18, null, false, "pass", ["RN 없음"], [], null],
    ]
  );
  assert.deepEqual(review.silent, { newCount: 0, earlierCount: 1 });

  // Every new pass is kept; earlier ones fill up to the review size. Without
  // its notes, the archived candidate gave no reason and is only counted.
  const small = buildCriteriaReview({ cursor: 25, decisions, details, size: 4 });
  assert.deepEqual(small.passes.map((pass) => pass.decisionId), [30, 29, 20]);
  assert.deepEqual(small.silent, { newCount: 1, earlierCount: 0 });
  const tiny = buildCriteriaReview({ cursor: 25, decisions, details, size: 1 });
  assert.deepEqual(tiny.passes.map((pass) => pass.decisionId), [30, 29]);
  assert.deepEqual(tiny.silent, { newCount: 1, earlierCount: 0 });
});

test("the review text gives criteria, reasons and answered changes as facts, in Korea time", () => {
  const review = buildCriteriaReview({
    cursor: 25,
    decisions: [decision(30, "t-a", ["c-rn", "working_conditions", "c-gone"]), decision(20, "t-b"), decision(19, "t-c")],
    details: [
      { id: 30, action: "pass", reasonText: 'RN "실무" 경험이 없어요' },
      { id: 20, action: "pass", reasonText: "연차 부족" },
    ],
    headlines: { "t-a": "Frontend Engineer at Acme" },
  });
  const text = formatCriteriaReview({
    roleId: "role-1",
    roleTitle: "모바일 엔지니어",
    criteria,
    review,
    answeredKeys: ["criterion_level:c-rn:nice>important", "something else"],
    locale: "ko",
  });
  assert.match(text, /^Review of pass reasons for Role role-1 \(모바일 엔지니어\)\. time_zone=Asia\/Seoul\. Workspace language: Korean\./);
  assert.match(text, /- c-rn \| React Native 실무 경험 \| nice to have \(있으면 좋음\) \| can be raised to important \(중요\) \| RN으로 앱을 출시해 봤다/);
  assert.match(text, /- c-go \| Go 서비스 운영 \| required \(필수\) \| cannot be raised/);
  assert.match(text, /- B2B 경험 \| B2B 경험 \| important \(중요\) \| can be raised to required \(필수\)/);
  assert.match(text, /Passed since your last review, with a stated reason \(1\):\n- decision 30 \| 2026-11-06 09:30 \| passed \| candidate t-a \| headline: Frontend Engineer at Acme\n  reason: "RN '실무' 경험이 없어요"\n  tags: criterion React Native 실무 경험, working conditions, c-gone \(no longer a criterion\)/);
  assert.match(text, /Earlier passes with a stated reason on this Role, for context \(1\):\n- decision 20 \| 2026-11-06 09:20 \| passed \| candidate t-b\n  reason: "연차 부족"/);
  assert.match(text, /Passed without any reason \(not citable\): 0 since your last review, 1 earlier\./);
  assert.match(text, /Changes the company already applied or dismissed \(never suggested again\):\n- React Native 실무 경험: nice to have \(있으면 좋음\) → important \(중요\)$/);
  // Raw timestamps never reach the model.
  assert.doesNotMatch(text, /\d{2}:\d{2}:\d{2}|T\d{2}:|\+00:00/);
});

const snapshot = criteriaReviewSnapshot(
  {
    passes: [
      { decisionId: 30, talentId: "t-a", isNew: true, at: null, action: "pass", reasons: ["RN 없음"], tags: [], headline: null },
      { decisionId: 29, talentId: "t-b", isNew: true, at: null, action: "pass", reasons: ["RN 없음"], tags: [], headline: null },
      { decisionId: 20, talentId: "t-c", isNew: false, at: null, action: "pass", reasons: ["RN 없음"], tags: [], headline: null },
      { decisionId: 19, talentId: "t-d", isNew: false, at: null, action: "pass", reasons: ["연차"], tags: [], headline: null },
      { decisionId: 18, talentId: "t-c", isNew: false, at: null, action: "pass", reasons: ["RN 없음"], tags: [], headline: null },
    ],
    silent: { newCount: 1, earlierCount: 0 },
  },
  "ko"
);

test("a suggestion is one existing criterion one level up, backed by passes in this review", () => {
  assert.deepEqual(parseCriteriaReviewSnapshot(JSON.parse(JSON.stringify(snapshot))), { ...snapshot, proposalId: null });
  const payload = criteriaProposalFromReview({
    criteria,
    snapshot,
    criterionId: "c-rn",
    decisionIds: [20, 30, 29, 30],
    rationale: "  넘긴 후보 대부분이 RN 실무 경험이 없었어요. ",
  });
  assert.deepEqual(payload, {
    version: 1,
    change: { type: "criterion_level", criterionKey: "c-rn", criterionName: "React Native 실무 경험", from: "nice", to: "important" },
    evidence: { count: 3, window: 5, decisionIds: [30, 29, 20] },
    locale: "ko",
    rationale: "넘긴 후보 대부분이 RN 실무 경험이 없었어요.",
  });
  // Older criteria are named by their name.
  assert.equal(
    criteriaProposalFromReview({ criteria, snapshot, criterionId: "B2B 경험", decisionIds: [30, 29], rationale: "B2B" }).change.to,
    "required"
  );
});

test("the evidence must be real: listed passes, two candidates, one of them new", () => {
  const refused = (input: Record<string, unknown>, pattern: RegExp) =>
    assert.throws(
      () => criteriaProposalFromReview({ criteria, snapshot, criterionId: "c-rn", decisionIds: [30, 29], rationale: "RN", ...input }),
      (error: unknown) => error instanceof CriteriaReviewInputError && pattern.test(error.message)
    );
  refused({ criterionId: "c-gone" }, /c-gone is not one of this Role's criteria: c-rn, c-go, B2B 경험\. No suggestion was added\./);
  refused({ criterionId: "c-go" }, /already required \(필수\), the strictest level/);
  refused({ decisionIds: [30, 99] }, /Decision 99 is not a pass with a stated reason in this review/);
  refused({ decisionIds: [] }, /No decision was a pass with a stated reason/);
  refused({ decisionIds: "30,29" }, /No decision was a pass/);
  // Two decisions of the same candidate are one candidate.
  refused({ decisionIds: [20, 18] }, /at least two different candidates/);
  // Earlier passes alone were already reviewed.
  refused({ decisionIds: [20, 19] }, /at least one pass since the last review/);
  refused({ rationale: "   " }, /reason is required/);
});
