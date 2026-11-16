import assert from "node:assert/strict";
import test from "node:test";
import {
  formatOpportunityDecisionReceipt,
  formatSavedOpportunityDecision,
} from "@/lib/career/opportunityFeedbackEvent";
import {
  buildInternalRecommendationProgress,
  type TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import { formatRecommendedOpportunityProgress } from "./tools";

const item = {
  companyName: "고객사 A",
  feedback: "positive",
  feedbackAt: "2026-11-01T05:12:01.000Z",
  id: "rec-1",
  isInternal: true,
  opportunityType: "internal_recommendation",
  recommendedAt: "2026-10-30T01:28:25.000Z",
  roleId: "role-1",
  savedStage: "connected",
  sourceType: "internal",
  status: "active",
  title: "AI Investments Associate",
} as TalentOpportunityHistoryItem;

const stoppedTags = [
  { opportunity_id: "role-1", tag: "내부:프로세스중단", updated_at: "2026-11-09T08:52:58.000Z" },
];

function closure(notifyCandidateOnClosure?: boolean) {
  return buildInternalRecommendationProgress({
    events: [{
      createdAt: "2026-11-09T08:52:58.600Z",
      metadata: {
        stage: "process_stopped",
        previousStage: "pending_connection",
        tag: "내부:프로세스중단",
        stopNote: "위치 조건이 맞지 않음",
        ...(notifyCandidateOnClosure === undefined ? {} : { notifyCandidateOnClosure }),
      },
      text: "진행 종료로 옮겼습니다.",
    }],
    item,
    tags: stoppedTags,
  });
}

const WITHHELD_FACT =
  "Company's choice: no separate closing notice from Harper to the candidate. The candidate's Career screen shows this opportunity's saved stage as connected, not as ended.";

test("a withheld company closure reaches the model with the company's choice and the screen status, not raw internal values", () => {
  const progress = formatRecommendedOpportunityProgress({
    internalProgress: closure(false),
    savedStage: "connected",
  });
  const text = JSON.stringify(progress);

  assert.equal(progress?.closureNotice, WITHHELD_FACT);
  assert.equal("stage" in (progress ?? {}), false);
  assert.doesNotMatch(text, /process_stopped|프로세스중단|위치 조건|긍정적으로 검토/);
});

test("the screen status fact follows the candidate's saved stage", () => {
  const progress = formatRecommendedOpportunityProgress({
    internalProgress: closure(false),
    savedStage: "closed",
  });

  assert.match(progress?.closureNotice ?? "", /Career screen shows this opportunity as ended\.$/);
});

test("an announced company closure carries no withheld fact", () => {
  for (const notify of [true, undefined]) {
    const progress = formatRecommendedOpportunityProgress({
      internalProgress: closure(notify),
      savedStage: "connected",
    });
    assert.equal("closureNotice" in (progress ?? {}), false);
    assert.equal("stage" in (progress ?? {}), false);
  }
});

test("other progress keeps its stage for the existing Talent-side rules", () => {
  const progress = formatRecommendedOpportunityProgress({
    internalProgress: buildInternalRecommendationProgress({
      item,
      tags: [{ opportunity_id: "role-1", tag: "내부:거절", updated_at: "2026-11-09T08:52:58.000Z" }],
    }),
    savedStage: "connected",
  });

  assert.equal(progress?.code, "rejected_by_talent");
  assert.equal(progress?.stage, "rejected");
  assert.equal("closureNotice" in (progress ?? {}), false);
});

test("feedback receipts and saved-decision context carry the same company choice beside the closure", () => {
  const withheld = { ...item, internalProgress: closure(false) };
  const allowed = { ...item, internalProgress: closure(true) };

  assert.ok(formatOpportunityDecisionReceipt({ opportunity: withheld, feedback: "like" }).includes(WITHHELD_FACT));
  assert.ok(formatSavedOpportunityDecision(withheld).includes(WITHHELD_FACT));
  assert.doesNotMatch(formatOpportunityDecisionReceipt({ opportunity: allowed, feedback: "like" }), /Company's choice/);
  assert.doesNotMatch(formatSavedOpportunityDecision(allowed), /Company's choice/);
});
