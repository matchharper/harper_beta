import type { OrgStageId } from "@/lib/org/server";

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
