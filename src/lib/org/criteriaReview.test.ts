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
      { criteriaChangedSince: [], decisionId: 30, talentId: "t-a", isNew: true, at: null, action: "pass", reasons: ["RN 없음"], tags: [], headline: null },
      { criteriaChangedSince: [], decisionId: 29, talentId: "t-b", isNew: true, at: null, action: "pass", reasons: ["RN 없음"], tags: [], headline: null },
      { criteriaChangedSince: [], decisionId: 20, talentId: "t-c", isNew: false, at: null, action: "pass", reasons: ["RN 없음"], tags: [], headline: null },
      { criteriaChangedSince: [], decisionId: 19, talentId: "t-d", isNew: false, at: null, action: "pass", reasons: ["연차"], tags: [], headline: null },
      { criteriaChangedSince: [], decisionId: 18, talentId: "t-c", isNew: false, at: null, action: "pass", reasons: ["RN 없음"], tags: [], headline: null },
    ],
    silent: { newCount: 1, earlierCount: 0 }, companyMessages: [],
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
    (criteriaProposalFromReview({ criteria, snapshot, criterionId: "B2B 경험", decisionIds: [30, 29], rationale: "B2B" }).change as { to: string }).to,
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

test("a new criterion: a name the Role lacks, below required, with the same evidence rules", () => {
  const newCriterion = { name: " 결제 도메인 ", description: "결제 시스템을 만들어 봤다", level: "important" };
  const payload = criteriaProposalFromReview({
    criteria, snapshot, criterionId: undefined, newCriterion, decisionIds: [30, 29], rationale: "결제 경험이 없었어요.",
  });
  assert.deepEqual(payload.change, { type: "criterion_add", criterionName: "결제 도메인", description: "결제 시스템을 만들어 봤다", to: "important" });
  assert.deepEqual(payload.evidence, { count: 2, window: 5, decisionIds: [30, 29] });
  const refused = (input: Record<string, unknown>, pattern: RegExp) =>
    assert.throws(
      () => criteriaProposalFromReview({ criteria, snapshot, criterionId: undefined, newCriterion, decisionIds: [30, 29], rationale: "결제", ...input }),
      (error: unknown) => error instanceof CriteriaReviewInputError && pattern.test(error.message)
    );
  refused({ criterionId: "c-rn" }, /exactly one of criterionId .* newCriterion .* or memoryNote/);
  refused({ newCriterion: undefined }, /exactly one of criterionId .* newCriterion .* or memoryNote/);
  refused({ newCriterion: { ...newCriterion, level: "required" } }, /starts at nice to have \(있으면 좋음\) or important \(중요\)/);
  refused({ newCriterion: { ...newCriterion, description: " " } }, /needs a name and a description/);
  // An existing criterion (any case or spacing) is raised, not added again.
  refused({ newCriterion: { ...newCriterion, name: "b2b  경험" } }, /B2B 경험 is already one of this Role's criteria \(id B2B 경험\); suggest raising it instead/);
  refused({ decisionIds: [20, 18] }, /at least two different candidates/);
  refused({ decisionIds: [20, 19] }, /at least one pass since the last review/);
  // An answered new criterion is listed as never suggested again.
  const text = formatCriteriaReview({
    roleId: "role-1", criteria, review: { passes: [], silent: { newCount: 0, earlierCount: 0 }, companyMessages: [] },
    answeredKeys: ["criterion_add:결제 도메인"], locale: "ko",
  });
  assert.match(text, /never suggested again\):\n- new criterion 결제 도메인$/);
  assert.match(text, /whether the Role needs a new criterion/);
});

// A lasting company preference rather than a check for this Role: a memory note.
const noteSnapshot = criteriaReviewSnapshot(
  {
    passes: [
      { criteriaChangedSince: [], decisionId: 30, talentId: "t-a", isNew: true, at: null, action: "pass", reasons: ["두 회사 연속 6개월 안에 퇴사"], tags: [], headline: null },
      { criteriaChangedSince: [], decisionId: 29, talentId: "t-b", isNew: true, at: null, action: "pass", reasons: [], tags: ["role_fit"], headline: null },
      { criteriaChangedSince: [], decisionId: 20, talentId: "t-c", isNew: false, at: null, action: "pass", reasons: ["이전 두 직장 모두 짧게 다님"], tags: [], headline: null },
    ],
    silent: { newCount: 0, earlierCount: 0 }, companyMessages: [],
  },
  "ko"
);

test("a memory note: one short note in the company's words, backed by written reasons of two candidates", () => {
  assert.deepEqual(noteSnapshot.passes.map((pass) => pass.written), [true, false, true]);
  assert.deepEqual(parseCriteriaReviewSnapshot(JSON.parse(JSON.stringify(noteSnapshot))), { ...noteSnapshot, proposalId: null });
  // A snapshot saved before notes existed counts no pass as written.
  assert.equal(parseCriteriaReviewSnapshot({ passes: [{ id: 30, talentId: "t-a", isNew: true }], withReason: 1 })!.passes[0].written, false);
  const memoryNote = { text: "  최근 두 회사에서 모두 6개월 안에 나온 분은   뽑지 않아요. ", scope: "company" };
  const base = {
    criteria, snapshot: noteSnapshot, criterionId: undefined, memoryNote, decisionIds: [30, 20],
    rationale: "짧은 재직이 반복해서 이유였어요.", candidateNames: ["김하나", "Jane Doe"], roleTeamId: "team-1",
  };
  const payload = criteriaProposalFromReview(base);
  assert.deepEqual(payload, {
    version: 1,
    change: { type: "memory_note", note: "최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요.", scope: "company" },
    evidence: { count: 2, window: 3, decisionIds: [30, 20] },
    locale: "ko",
    rationale: "짧은 재직이 반복해서 이유였어요.",
  });
  assert.deepEqual(criteriaProposalFromReview({ ...base, memoryNote: { ...memoryNote, scope: "team" } }).change, {
    type: "memory_note", note: "최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요.", scope: "team", teamId: "team-1",
  });

  const refused = (input: Record<string, unknown>, pattern: RegExp) =>
    assert.throws(
      () => criteriaProposalFromReview({ ...base, ...input }),
      (error: unknown) => error instanceof CriteriaReviewInputError && pattern.test(error.message)
    );
  refused({ criterionId: "c-rn" }, /exactly one of criterionId .* newCriterion .* or memoryNote/);
  refused({ newCriterion: { name: "재직", description: "오래 다녔다", level: "nice" } }, /exactly one of/);
  refused({ memoryNote: { ...memoryNote, text: " ... " } }, /memoryNote needs text/);
  refused({ memoryNote: { ...memoryNote, text: "가".repeat(101) } }, /memoryNote\.text is 101 characters; keep it within 100/);
  // Never a candidate's contact details, ID or name (in any spacing or case).
  refused({ memoryNote: { ...memoryNote, text: "연락은 hire@example.com 으로" } }, /must not contain an email address, phone number or ID/);
  refused({ memoryNote: { ...memoryNote, text: "010-1234-5678 후보처럼 짧게 다닌 분은 안 돼요" } }, /must not contain an email address/);
  refused({ memoryNote: { ...memoryNote, text: "0b8e1a3c-1d2e-4f50-9a6b-7c8d9e0f1a2b 같은 분은 안 돼요" } }, /or ID/);
  refused({ memoryNote: { ...memoryNote, text: "김 하나님처럼 짧게 다닌 분은 뽑지 않아요" } }, /names a candidate from this review/);
  refused({ memoryNote: { ...memoryNote, text: "Like jane doe, short stays are a no." } }, /names a candidate/);
  refused({ memoryNote: { ...memoryNote, scope: "role" } }, /memoryNote\.scope is company \(every Role\) or team/);
  refused({ memoryNote: { ...memoryNote, scope: "team" }, roleTeamId: null }, /This Role has no team; use scope company/);
  // The same evidence rules, and a note rests on written reasons, not tags alone.
  refused({ decisionIds: [30] }, /at least two different candidates/);
  refused({ decisionIds: [30, 29] }, /Decision 29 has reason tags but no written reason/);
  refused({ decisionIds: [30, 99] }, /Decision 99 is not a pass with a stated reason/);

  // An answered note is listed as never suggested again, and the purpose names notes.
  const text = formatCriteriaReview({
    roleId: "role-1", criteria, review: { passes: [], silent: { newCount: 0, earlierCount: 0 }, companyMessages: [] },
    answeredKeys: ["memory_note:최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요"], locale: "ko",
  });
  assert.match(text, /never suggested again\):\n- memory note "최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요"$/);
  assert.match(text, /lasting company preference or fact rather than something to check for this Role, whether to save one company memory note/);
});

test("what the company said can back a suggestion alone, and only messages in this review count", () => {
  const withMessage = { ...snapshot, messageIds: [501] };
  const payload = criteriaProposalFromReview({
    criteria,
    snapshot: withMessage,
    criterionId: null,
    memoryNote: { text: "인턴 경험만 있는 사람은 보지 않아요", scope: "company" },
    decisionIds: [],
    messageIds: [501],
    rationale: "앞으로 인턴 경험만 있는 분은 안 본다고 하셨어요.",
  });
  assert.deepEqual(payload.evidence.messageIds, [501]);
  assert.deepEqual(payload.evidence.decisionIds, []);
  assert.throws(
    () => criteriaProposalFromReview({ criteria, snapshot: withMessage, criterionId: "c-rn", decisionIds: [], messageIds: [999], rationale: "x" }),
    (error: unknown) => error instanceof CriteriaReviewInputError && /Message 999/.test(error.message)
  );
  assert.throws(
    () => criteriaProposalFromReview({ criteria, snapshot: withMessage, criterionId: "c-rn", decisionIds: [], rationale: "x" }),
    CriteriaReviewInputError
  );
  assert.deepEqual(parseCriteriaReviewSnapshot({ passes: [], withReason: 0, messageIds: [501], locale: "ko" })?.messageIds, [501]);
  assert.deepEqual(parseCriteriaReviewSnapshot({ passes: [], withReason: 0, locale: "ko" })?.messageIds, []);
});

test("each pass says how the criteria changed after it, and the review lists what the company said", () => {
  const review = buildCriteriaReview({
    cursor: 0,
    decisions: [{ ...decision(30, "t-a"), briefRevision: 2 }, { ...decision(29, "t-b"), briefRevision: 3 }],
    details: [{ id: 30, action: "pass", reasonText: "경력이 부족함" }, { id: 29, action: "pass", reasonText: "경력이 부족함" }],
    criteria,
    briefCriteriaAt: { "2": criteria.slice(1), "3": criteria },
    messages: [{ id: 501, channel: "slack", text: " 앞으로   인턴만 한 분은 안 봐요 ", createdAt: at(40) }],
  });
  assert.deepEqual(review.passes.find((pass) => pass.decisionId === 30)?.criteriaChangedSince, ["React Native 실무 경험 added"]);
  assert.deepEqual(review.passes.find((pass) => pass.decisionId === 29)?.criteriaChangedSince, []);
  assert.deepEqual(criteriaReviewSnapshot(review, "ko").messageIds, [501]);
  const text = formatCriteriaReview({ roleId: "r", criteria, review, locale: "ko" });
  assert.match(text, /criteria changed after this decision: React Native 실무 경험 added/);
  assert.match(text, /message 501 \| .* \| Slack\n  said: "앞으로 인턴만 한 분은 안 봐요"/);
});
