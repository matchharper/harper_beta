import type { OrgStageId } from "./server";

export type CandidateRoleMoveInput = {
  workspaceId: string;
  talentId: string;
  sourceRoleId: string;
  recommendationId: string;
  expectedStage: OrgStageId;
  targetRoleId: string;
  targetStageId: OrgStageId;
  requestId: string;
  method: "ask_candidate" | "direct";
  confirmedDirectly: boolean;
};

export type CandidateRoleMoveResponse = {
  status: string;
  requestId?: string;
  targetRoleId?: string;
  targetRecommendationId?: string;
};

export function candidateRoleMoveMode(stage: OrgStageId) {
  if (stage === "company_intro") return "proposal";
  if (stage === "intro_requested") return "waiting";
  if (stage === "pending_connection") return "pending";
  return "pipeline";
}

export function candidateRoleMoveError(status: string, english: boolean) {
  const messages: Record<string, [string, string]> = {
    request_pending: [
      "이미 Role 변경을 확인하고 있어요. 기존 요청을 확인해 주세요.",
      "A role change request is already pending. Review the existing request.",
    ],
    direct_confirmation_required: [
      "후보자와 직접 합의했다는 확인이 필요해요.",
      "Confirm that you agreed on this change with the candidate.",
    ],
    state_changed: [
      "후보자 상태가 변경됐어요. 상세 화면을 새로고침하고 다시 시도해 주세요.",
      "This candidate’s status has changed. Refresh their profile and try again.",
    ],
    already_in_target_pipeline: [
      "이 Role에서 이미 진행 중인 후보예요.",
      "This candidate is already in this role’s pipeline.",
    ],
    target_has_intro: [
      "이 Role에 이미 제안 내역이 있어요. 해당 내역을 먼저 확인해 주세요.",
      "This role already has an intro for this candidate. Review it first.",
    ],
    target_role_unavailable: [
      "지금은 이 Role로 옮길 수 없어요. 다른 Role을 선택해 주세요.",
      "This role is unavailable. Choose another role.",
    ],
    intro_pending: [
      "이미 제안을 보내 답변을 기다리고 있어요. 답변 전에는 Role을 옮길 수 없어요.",
      "An intro is awaiting a response. You can move this candidate after they respond.",
    ],
    target_stage_not_found: [
      "선택한 단계가 변경됐어요. 다시 선택해 주세요.",
      "The selected stage has changed. Choose a stage again.",
    ],
  };
  return (messages[status] ?? [
    "후보자를 옮기지 못했어요. 화면을 새로고침하고 다시 시도해 주세요.",
    "Couldn’t move this candidate. Refresh and try again.",
  ])[english ? 1 : 0];
}
