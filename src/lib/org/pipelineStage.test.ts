import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrgAgentPipelineBucket,
  humanizeOrgFeedback,
  humanizeOrgProgressKind,
  humanizeOrgRoleStatus,
  humanizeOrgStage,
  humanizeOrgWorkMode,
  normalizeOrgAgentRecommendationIdFilter,
  ORG_AGENT_RECOMMENDATION_ID_FILTER_MAX,
} from "@/lib/org/pipelineStage";

test("company-side labels never expose common database enums", () => {
  assert.equal(humanizeOrgRoleStatus("top_priority"), "최우선 진행 중");
  assert.equal(humanizeOrgRoleStatus("paused"), "중단");
  assert.equal(humanizeOrgStage("pending_connection"), "연결 대기");
  assert.equal(humanizeOrgStage("final_offer"), "최종 오퍼 단계");
  assert.equal(humanizeOrgWorkMode("remote"), "원격 근무");
  assert.equal(humanizeOrgFeedback("positive"), "긍정 평가");
  assert.equal(humanizeOrgProgressKind("org_stage_change"), "채용 단계 변경");
  assert.equal(humanizeOrgStage("custom:123", "기술 인터뷰"), "기술 인터뷰");
});

test("company-side pipeline summary uses the three documented buckets", () => {
  assert.equal(getOrgAgentPipelineBucket("pending_connection"), "waiting");
  assert.equal(getOrgAgentPipelineBucket("connected"), "active");
  assert.equal(getOrgAgentPipelineBucket("custom:123"), "active");
  assert.equal(getOrgAgentPipelineBucket("final_offer"), "active");
  assert.equal(getOrgAgentPipelineBucket("process_stopped"), "ended");
  assert.equal(getOrgAgentPipelineBucket("accepted"), "active");
  assert.equal(getOrgAgentPipelineBucket("archived"), null);
});

test("recommendation ID filters are normalized and strictly bounded", () => {
  assert.equal(normalizeOrgAgentRecommendationIdFilter(undefined), null);
  assert.deepEqual(
    normalizeOrgAgentRecommendationIdFilter([" rec-1 ", "", "rec-1", "rec-2"]),
    ["rec-1", "rec-2"]
  );
  assert.throws(
    () =>
      normalizeOrgAgentRecommendationIdFilter(
        Array.from(
          { length: ORG_AGENT_RECOMMENDATION_ID_FILTER_MAX + 1 },
          (_, index) => `rec-${index}`
        )
      ),
    /at most 100 IDs/
  );
});
