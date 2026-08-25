import assert from "node:assert/strict";
import test from "node:test";
import {
  describeOpsCompanyProgressActivity,
  describeOpsCompanyRoleRecommendation,
  isHiddenOpsCompanyProgressActivity,
} from "@/lib/ops/companyActivityPresentation";

test("shows a process transition with the before and after stage labels", () => {
  const activity = describeOpsCompanyProgressActivity({
    candidateName: "김하퍼",
    customStageLabelByKey: new Map([
      ["role-1:screen", "서류 검토"],
      ["role-1:interview", "1차 인터뷰"],
    ]),
    progress: {
      kind: "org_stage_change",
      metadata: {
        previousStage: "custom:screen",
        stage: "custom:interview",
      },
      roleId: "role-1",
      text: "서류 검토에서 1차 인터뷰로 옮겼습니다.",
    },
    roleName: "Product Engineer",
  });

  assert.equal(activity.meta, "프로세스 변경");
  assert.equal(activity.title, "김하퍼 [서류 검토] → [1차 인터뷰]");
  assert.equal(
    activity.subtitle,
    "Product Engineer · 서류 검토에서 1차 인터뷰로 옮겼습니다."
  );
});

test("labels a candidate priority review request without calling it a status change", () => {
  const activity = describeOpsCompanyProgressActivity({
    candidateName: "김하퍼",
    customStageLabelByKey: new Map(),
    progress: {
      kind: "candidate_requested_connection",
      metadata: {},
      roleId: "role-1",
      text: "User requested priority review for connection to this role.",
    },
    roleName: "Product Engineer",
  });

  assert.deepEqual(activity, {
    meta: "우선 검토 요청",
    subtitle: "Product Engineer",
    title: "김하퍼 우선 검토 요청",
  });
});

test("makes clear that a role was recommended to the candidate", () => {
  assert.deepEqual(
    describeOpsCompanyRoleRecommendation({
      candidateName: "김하퍼",
      roleName: "Product Engineer",
    }),
    {
      meta: "후보자에게 역할을 추천함",
      subtitle: "Product Engineer",
      title: "김하퍼 후보자에게 역할을 추천함",
    }
  );
});

test("hides internal fit clarification question delivery events", () => {
  assert.equal(
    isHiddenOpsCompanyProgressActivity({
      kind: "internal_fit_question_asked",
      text: "Harper internal fit question asked: Wonderful - Deployment Strategist",
    }),
    true
  );
});
