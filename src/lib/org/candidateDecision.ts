import type { OrgStageId } from "@/lib/org/server";

export const DEFAULT_ORG_STOP_REASONS = [
  "너무 주니어",
  "너무 시니어",
  "높은 연봉을 요구할 것 같음",
  "이미 대화해본 후보자",
  "위치/지역 조건 불일치",
] as const;

export function isOrgInternalStage(stage: OrgStageId) {
  return stage === "accepted" || stage === "archived";
}

export function canInitiateOrgCandidateContact(stage: OrgStageId) {
  return !isOrgInternalStage(stage) && stage !== "process_stopped";
}

export function shouldOpenOrgAcceptIntroDialog(
  currentStage: OrgStageId,
  nextStage: OrgStageId
) {
  return (
    currentStage === "pending_connection" &&
    nextStage !== "accepted" &&
    canInitiateOrgCandidateContact(nextStage)
  );
}

export function shouldOpenOrgStopCandidateDialog(
  currentStage: OrgStageId,
  nextStage: OrgStageId
) {
  return (
    currentStage === "pending_connection" && nextStage === "process_stopped"
  );
}

export function requiresOrgIntroEmailRecipient(
  currentStage: OrgStageId,
  nextStage: OrgStageId,
  contactDirectly: boolean
) {
  return (
    !contactDirectly && shouldOpenOrgAcceptIntroDialog(currentStage, nextStage)
  );
}
