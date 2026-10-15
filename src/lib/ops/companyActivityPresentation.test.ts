import assert from "node:assert/strict";
import test from "node:test";
import {
  describeOpsCompanyProgressActivity,
  describeOpsCompanyAction,
  describeOpsCompanyRoleRecommendation,
  isHiddenOpsCompanyProgressActivity,
} from "./companyActivityPresentation";

test("priority requests, automatic followups and unclassified progress stay out of recent activity", () => {
  for (const kind of [
    "candidate_requested_connection",
    "internal_role_priority_review_requested",
    "internal_fit_question_asked",
    "internal_followup_sent",
    "unclassified_event",
  ]) {
    assert.equal(
      isHiddenOpsCompanyProgressActivity({ kind, text: "자동 기록" }),
      true
    );
  }
});

test("meaningful explicit events remain even if a company note mentions follow-up", () => {
  for (const kind of [
    "org_note",
    "org_stage_change",
    "intro_to_company",
    "org_candidate_activity",
    "org_candidate_role_move",
    "org_candidate_profile_first_view",
  ]) {
    assert.equal(
      isHiddenOpsCompanyProgressActivity({ kind, text: "follow-up 논의" }),
      false
    );
  }
});

test("first view identifies the teammate, candidate and channel", () => {
  const result = describeOpsCompanyProgressActivity({
    actorName: "서연",
    candidateName: "민준",
    customStageLabelByKey: new Map(),
    progress: {
      kind: "org_candidate_profile_first_view",
      metadata: { source: "slack" },
      roleId: "role",
      text: "",
    },
    roleName: "엔지니어",
  });
  assert.equal(result.title, "서연님이 민준 · 엔지니어 후보자 최초 열람");
  assert.equal(result.subtitle, "Slack");
});

test("meeting confirmation and candidate replies have distinct event labels", () => {
  for (const [eventType, label] of [
    ["meeting_confirmed", "미팅 확정"],
    ["candidate_response_received", "후보자 답변 도착"],
    ["candidate_message_delivered", "후보자 메시지 회사에 전달"],
  ]) {
    const result = describeOpsCompanyProgressActivity({
      candidateName: "민준",
      customStageLabelByKey: new Map(),
      progress: {
        kind: "org_candidate_activity",
        metadata: { eventType },
        roleId: "role",
        text: "내용",
      },
      roleName: "엔지니어",
    });
    assert.equal(result.meta, label);
  }
});

test("Intro request remains distinct from completed delivery or acceptance", () => {
  const result = describeOpsCompanyProgressActivity({
    actorName: "서연",
    candidateName: "민준",
    customStageLabelByKey: new Map(),
    progress: {
      kind: "org_company_intro_requested",
      metadata: {},
      roleId: "role",
      text: "",
    },
    roleName: "엔지니어",
  });
  assert.equal(result.meta, "Intro 요청");
  assert.equal(result.title, "서연 · 민준 · 엔지니어 Intro 요청");
});

test("recommendation row names the exact role without a second line", () => {
  const result = describeOpsCompanyRoleRecommendation({
    candidateName: "민준",
    roleName: "Founding Designer",
  });
  assert.equal(result.title, "민준 · Founding Designer 추천");
  assert.equal(result.subtitle, null);
});

test("resume access identifies the actor and candidate with filename in tooltip detail", () => {
  const result = describeOpsCompanyAction({
    type: "org_resume_opened",
    actorName: "서연",
    targetName: "민준",
    metadata: { workspaceId: "workspace", resumeFileName: "Portfolio.pdf" },
  });
  assert.equal(result.title, "서연 · 민준 · 이력서·자료 열기");
  assert.equal(result.subtitle, "Portfolio.pdf");
});
