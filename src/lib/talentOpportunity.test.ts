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

test("uses the company-closure message for an internal Ops stop", () => {
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

test("treats rejected as a Talent-side rejection record, not company rejection", () => {
  const progress = buildInternalRecommendationProgress({
    item: { ...baseItem, status: "ended" },
    tags: [
      {
        opportunity_id: "role-1",
        tag: "내부:거절",
        updated_at: "2026-07-11T05:42:24.000Z",
      },
    ],
  });

  assert.equal(progress?.code, "rejected_by_talent");
  assert.equal(progress?.stage, "rejected");
  assert.equal(
    progress?.message,
    "현재 기록에는 회원님이 이 연결 제안을 거절한 것으로 표시되어 있습니다. 수락하신 것이 맞다면 기록이 서로 일치하지 않아 확인이 필요합니다."
  );
});

test("keeps archived in the existing company-closure flow after grace", () => {
  const progress = buildInternalRecommendationProgress({
    item: baseItem,
    tags: [
      {
        opportunity_id: "role-1",
        tag: "내부:아카이브",
        updated_at: "2026-07-11T05:42:24.000Z",
      },
    ],
  });

  assert.equal(progress?.code, "closed_by_company");
  assert.equal(progress?.stage, "archived");
  assert.match(progress?.message ?? "", /^회사 측에서/);
});

test("keeps a recently archived opportunity in the existing grace period", () => {
  const now = new Date().toISOString();
  const progress = buildInternalRecommendationProgress({
    item: {
      ...baseItem,
      feedbackAt: now,
      recommendedAt: now,
    },
    tags: [
      {
        opportunity_id: "role-1",
        tag: "내부:아카이브",
        updated_at: now,
      },
    ],
  });

  assert.equal(progress?.code, "awaiting_company_response");
  assert.equal(progress?.stage, "archived");
  assert.equal(
    progress?.message,
    "회사에게 전달되었고, 회신을 기다리고 있습니다."
  );
});

test("does not build accepted-connection progress for Talent rejection feedback", () => {
  const progress = buildInternalRecommendationProgress({
    item: { ...baseItem, feedback: "negative" },
    tags: [],
  });

  assert.equal(progress, null);
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
    "회사에서 해당 역할의 채용을 종료했다고 알려왔습니다. 우선적으로 보고 있는 방향과 더 가까운 후보자와 다음 단계를 진행하게 되었다고 알려왔습니다. 또 다른 좋은 기회가 있을 때 연락드릴게요. 우선 이 기회의 프로세스를 종료하겠습니다. 감사합니다."
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
    "회사에 전달했지만, 추가 진행 의사 없이 해당 역할의 채용이 종료되었습니다. 자세한 검토까지 이어지지 않았을 가능성이 높지만 우선 이 기회의 프로세스를 종료하겠습니다."
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
