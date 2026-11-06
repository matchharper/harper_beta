import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCriteriaProposal,
  CRITERIA_PROPOSAL_RULES,
  CRITERIA_PROPOSALS_ENABLED,
  countedPasses,
  criteriaProposalChangeReason,
  criteriaProposalContentKey,
  criteriaProposalStillApplies,
  criteriaProposalText,
  findCriteriaProposal,
  nextCriterionLevel,
  parseCriteriaProposalPayload,
  type PassDecision,
} from "./criteriaProposals";

const criteria = [
  { id: "c-go", name: "Go 서비스 운영", criteria: "Go로 서비스를 운영해 봤다", requirement: "preferred", importance: 2 },
  { id: "c-lead", name: "리드 경험", criteria: "팀을 이끌어 봤다", requirement: "preferred", importance: 1 },
  { id: "c-k8s", name: "쿠버네티스", criteria: "클러스터를 운영해 봤다", requirement: "must", importance: 3 },
  { name: "B2B 경험", criteria: "기업 고객 제품" },
];

let id = 0;
const pass = (tags: string[], extra: Partial<PassDecision> = {}): PassDecision => {
  id += 1;
  return { id, subjectId: `talent-${id}`, reasonTags: tags, hasReasonText: false, ...extra };
};

test("off by default: nothing is suggested until Shaun turns it on", () => {
  assert.equal(CRITERIA_PROPOSALS_ENABLED, false);
  assert.deepEqual(
    { every: CRITERIA_PROPOSAL_RULES.everyDecisions, wait: CRITERIA_PROPOSAL_RULES.waitDays },
    { every: 3, wait: 7 }
  );
});

test("7 of the last 10 passes with a reason name a criterion: raise it one level", () => {
  const decisions = [
    ...Array.from({ length: 7 }, () => pass(["c-go"])),
    pass(["experience_skills"]),
    pass([], { hasReasonText: true }),
    pass(["c-lead"]),
  ];
  const proposal = findCriteriaProposal({ decisions, criteria });
  assert.ok(proposal);
  assert.deepEqual(proposal.change, {
    type: "criterion_level",
    criterionKey: "c-go",
    criterionName: "Go 서비스 운영",
    from: "important",
    to: "required",
  });
  assert.equal(proposal.evidence.count, 7);
  assert.equal(proposal.evidence.window, 10);
  assert.equal(proposal.evidence.decisionIds.length, 7);
  assert.equal(criteriaProposalContentKey(proposal.change), "criterion_level:c-go:important>required");
});

test("free-text-only reasons count as reasons that name no criterion", () => {
  // 3 tagged of 7 with a reason: below half, so nothing.
  const decisions = [
    ...Array.from({ length: 3 }, () => pass(["c-go"])),
    ...Array.from({ length: 4 }, () => pass([], { hasReasonText: true })),
  ];
  assert.equal(findCriteriaProposal({ decisions, criteria }), null);
  // Passes with no reason at all are not counted.
  const silent = [...Array.from({ length: 3 }, () => pass(["c-go"])), ...Array.from({ length: 5 }, () => pass([]))];
  assert.equal(findCriteriaProposal({ decisions: silent, criteria })?.evidence.window, 3);
});

test("timing-only reasons, repeats and fixed categories", () => {
  // Timing is about the candidate's moment: left out of the window.
  const timing = [...Array.from({ length: 3 }, () => pass(["c-go"])), ...Array.from({ length: 4 }, () => pass(["timing"]))];
  assert.equal(findCriteriaProposal({ decisions: timing, criteria })?.evidence.window, 3);
  // A timing tag next to a criterion still counts for the criterion.
  assert.deepEqual(countedPasses([pass(["timing", "c-go"])], 10)[0].reasonTags, ["c-go"]);
  // One candidate counts once (the newest decision with a reason).
  const same = Array.from({ length: 3 }, () => pass(["c-go"], { subjectId: "talent-x" }));
  assert.equal(findCriteriaProposal({ decisions: same, criteria }), null);
  // Fixed categories count as reasons but never make a suggestion by themselves.
  const fixed = Array.from({ length: 6 }, () => pass(["working_conditions"]));
  assert.equal(findCriteriaProposal({ decisions: fixed, criteria }), null);
  // Fewer than three counted passes: nothing.
  assert.equal(findCriteriaProposal({ decisions: [pass(["c-go"]), pass(["c-go"])], criteria }), null);
});

test("a required criterion, an answered change or a removed criterion is skipped", () => {
  const k8s = Array.from({ length: 4 }, () => pass(["c-k8s"]));
  assert.equal(findCriteriaProposal({ decisions: k8s, criteria }), null);
  // The next criterion that qualifies is taken instead.
  const mixed = [...Array.from({ length: 5 }, () => pass(["c-k8s", "c-lead"]))];
  const lead = findCriteriaProposal({ decisions: mixed, criteria });
  assert.equal(lead?.change.criterionKey, "c-lead");
  assert.deepEqual([lead?.change.from, lead?.change.to], ["nice", "important"]);
  assert.equal(
    findCriteriaProposal({ decisions: mixed, criteria, answeredKeys: ["criterion_level:c-lead:nice>important"] }),
    null
  );
  assert.equal(findCriteriaProposal({ decisions: Array.from({ length: 4 }, () => pass(["c-gone"])), criteria }), null);
  // Older criteria are tagged by name and read as 중요.
  const byName = findCriteriaProposal({ decisions: Array.from({ length: 3 }, () => pass(["B2B 경험"])), criteria });
  assert.deepEqual([byName?.change.criterionKey, byName?.change.from], ["B2B 경험", "important"]);
  // The highest level is one switch.
  assert.equal(nextCriterionLevel("important", "important"), null);
  assert.equal(nextCriterionLevel("nice", "important"), "important");
  assert.equal(nextCriterionLevel("required"), null);
});

test("the change keeps other criteria and records why", () => {
  const proposal = findCriteriaProposal({ decisions: Array.from({ length: 4 }, () => pass(["c-go"])), criteria })!;
  const now = new Date("2026-11-07T01:00:00Z");
  const next = applyCriteriaProposal(criteria, proposal.change, criteriaProposalChangeReason(proposal, "ko"), now);
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
  assert.equal(criteriaProposalStillApplies(proposal.change, criteria), true);
  assert.equal(criteriaProposalStillApplies(proposal.change, next), false);
  assert.equal(criteriaProposalStillApplies(proposal.change, criteria.slice(1)), false);
});

test("the To-do line, in both languages, fits the summary column", () => {
  const payload = {
    version: 1 as const,
    change: {
      type: "criterion_level" as const,
      criterionKey: "c-go",
      criterionName: "아주 긴 이름의 확인할 기준이 들어가도 줄이 넘치지 않아야 해요 정말로 아주 길게",
      from: "nice" as const,
      to: "important" as const,
    },
    evidence: { count: 7, window: 10, decisionIds: [1] },
  };
  const ko = criteriaProposalText(payload, "ko");
  const en = criteriaProposalText(payload, "en");
  assert.match(ko.summary, /있으면 좋음에서 중요로 올릴까요\? 최근 이유를 남기고 넘긴 후보 10명 중 7명이 이 기준 때문이었어요\.$/);
  assert.match(en.summary, /from Nice to have to Important\? It was the reason for 7 of your last 10 passes with a reason\.$/);
  for (const text of [ko.summary, en.summary]) assert.ok(Array.from(text).length <= 160, text);
  assert.match(ko.preview, /: 있으면 좋음 → 중요$/);
  const required = criteriaProposalText({ ...payload, change: { ...payload.change, criterionName: "Go", from: "important", to: "required" } }, "ko");
  assert.equal(required.summary.startsWith("'Go' 기준을 중요에서 필수로 올릴까요?"), true);
  assert.equal(criteriaProposalChangeReason(payload, "en"), "From pass reasons (7 of 10)");
});

test("stored payloads are read back strictly", () => {
  const proposal = findCriteriaProposal({ decisions: Array.from({ length: 3 }, () => pass(["c-go"])), criteria })!;
  assert.deepEqual(parseCriteriaProposalPayload({ ...proposal, locale: "en", claim: { by: "x" } }), { ...proposal, locale: "en" });
  assert.equal(parseCriteriaProposalPayload({ changes: [] }), null);
  assert.equal(parseCriteriaProposalPayload({ ...proposal, change: { ...proposal.change, to: "max" } }), null);
  assert.equal(parseCriteriaProposalPayload({ ...proposal, evidence: { count: 5, window: 3 } }), null);
});
