import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInternalRecommendationProgress,
  type TalentInternalRecommendationProgressEvent,
  type TalentOpportunityHistoryItem,
} from "./talentOpportunity";

const baseItem = {
  feedback: "positive",
  feedbackAt: "2026-07-10T05:12:01.000Z",
  isInternal: true,
  recommendedAt: "2026-07-08T01:28:25.000Z",
  status: "active",
} as TalentOpportunityHistoryItem;

const processStoppedTags = [
  {
    opportunity_id: "role-1",
    tag: "내부:프로세스중단",
    updated_at: "2026-07-11T05:42:24.000Z",
  },
];

function buildStopEvent(
  stopReason?: "candidate" | "company" | "internal"
): TalentInternalRecommendationProgressEvent {
  return {
    createdAt: "2026-07-11T05:42:24.300Z",
    metadata: {
      stage: "process_stopped",
      ...(stopReason ? { stopReason } : {}),
      tag: "내부:프로세스중단",
    },
    text: "연결 대기에서 프로세스 중단으로 옮겼습니다.",
  };
}

test("uses the candidate-stop message only for an explicit candidate stop", () => {
  const progress = buildInternalRecommendationProgress({
    events: [buildStopEvent("candidate")],
    item: baseItem,
    tags: processStoppedTags,
  });

  assert.equal(progress?.code, "stopped_by_candidate");
  assert.equal(progress?.stopReason, "candidate");
  assert.equal(
    progress?.message,
    "요청하신 대로 이 포지션의 진행을 종료했습니다."
  );
});

test("uses the existing company-closure message for an explicit company stop", () => {
  const progress = buildInternalRecommendationProgress({
    events: [buildStopEvent("company")],
    item: baseItem,
    tags: processStoppedTags,
  });

  assert.equal(progress?.code, "closed_by_company");
  assert.equal(progress?.stopReason, "company");
  assert.match(progress?.message ?? "", /^회사 측에서/);
});

test("uses the existing company-closure message for an internal Ops stop", () => {
  const progress = buildInternalRecommendationProgress({
    events: [buildStopEvent("internal")],
    item: baseItem,
    tags: processStoppedTags,
  });

  assert.equal(progress?.code, "closed_by_company");
  assert.equal(progress?.stopReason, "internal");
  assert.match(progress?.message ?? "", /^회사 측에서/);
});

test("treats legacy un-attributed process stops as internal/company closures", () => {
  const progress = buildInternalRecommendationProgress({
    events: [buildStopEvent()],
    item: baseItem,
    tags: processStoppedTags,
  });

  assert.equal(progress?.code, "closed_by_company");
  assert.equal(progress?.stopReason, "internal");
  assert.match(progress?.message ?? "", /^회사 측에서/);
  assert.equal(progress?.stageChangedAt, "2026-07-11T05:42:24.000Z");
});

test("closes an ended role with post-acceptance hiring closure guidance", () => {
  const progress = buildInternalRecommendationProgress({
    item: { ...baseItem, status: "ended" },
    tags: [
      {
        opportunity_id: "role-1",
        tag: "내부:연결대기",
        updated_at: "2026-07-11T05:42:24.000Z",
      },
    ],
  });

  assert.equal(progress?.code, "closed_by_company");
  assert.equal(progress?.stage, "pending_connection");
  assert.equal(
    progress?.message,
    "회사에서 해당 역할의 채용을 종료했다고 알려왔습니다. 이에 따라 이 기회의 프로세스를 종료하겠습니다."
  );
});

test("closes an ended role at the accepted stage with limited-review guidance", () => {
  const progress = buildInternalRecommendationProgress({
    item: { ...baseItem, status: "ENDED" },
    tags: [],
  });

  assert.equal(progress?.code, "closed_by_company");
  assert.equal(progress?.stage, null);
  assert.equal(
    progress?.message,
    "회사에 전달했지만 추가 진행 없이 해당 역할의 채용이 종료되었습니다. 자세한 검토까지 이어지지 않았을 가능성이 높습니다. 이에 따라 이 기회의 프로세스를 종료하겠습니다."
  );
});

test("keeps an explicit candidate stop authoritative when the role is ended", () => {
  const progress = buildInternalRecommendationProgress({
    events: [buildStopEvent("candidate")],
    item: { ...baseItem, status: "ended" },
    tags: processStoppedTags,
  });

  assert.equal(progress?.code, "stopped_by_candidate");
  assert.equal(progress?.stopReason, "candidate");
  assert.equal(
    progress?.message,
    "요청하신 대로 이 포지션의 진행을 종료했습니다."
  );
});
