import type { OrgStageId } from "@/lib/org/server";

export const CANDIDATE_DECISION_LABELS = {
  connect: "Connect",
  reject: "Reject",
} as const;

export const DEFAULT_ORG_STOP_REASONS = [
  "경력이 부족함",
  "경력이 너무 많음",
  "연봉 기대치가 높을 것 같음",
  "이미 대화해본 후보자",
  "위치 조건이 맞지 않음",
] as const;

export function isOrgInternalStage(stage: OrgStageId) {
  return stage === "accepted" || stage === "archived";
}

export function canInitiateOrgCandidateContact(stage: OrgStageId) {
  return !isOrgInternalStage(stage) && stage !== "process_stopped";
}

export function canCreateOrgCandidateContact(stage: OrgStageId) {
  return !isOrgInternalStage(stage);
}

type OrgActiveCompanyPosition = {
  recommendationId: string;
  roleId: string;
  stage: OrgStageId;
  updatedAt: string | null;
};

export function currentOrgActiveCompanyPosition<
  T extends OrgActiveCompanyPosition,
>(positions: readonly T[], roleId: string): T | null {
  return currentOrgCompanyPosition(positions, roleId, (stage) =>
    canInitiateOrgCandidateContact(stage)
  );
}

export function currentOrgContactableCompanyPosition<
  T extends OrgActiveCompanyPosition,
>(positions: readonly T[], roleId: string): T | null {
  return currentOrgCompanyPosition(positions, roleId, (stage) =>
    canCreateOrgCandidateContact(stage)
  );
}

function currentOrgCompanyPosition<T extends OrgActiveCompanyPosition>(
  positions: readonly T[],
  roleId: string,
  isEligible: (stage: OrgStageId) => boolean
): T | null {
  const latest =
    positions
      .filter((position) => position.roleId === roleId)
      .sort(
        (left, right) =>
          (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") ||
          right.recommendationId.localeCompare(left.recommendationId)
      )[0] ?? null;

  return latest && isEligible(latest.stage) ? latest : null;
}

export function canStopOrgCandidateProcess(stage: OrgStageId) {
  return !isOrgInternalStage(stage) && stage !== "process_stopped";
}

export function shouldOpenOrgAcceptIntroDialog(
  currentStage: OrgStageId,
  nextStage: OrgStageId
) {
  return (
    (currentStage === "pending_connection" ||
      currentStage === "process_stopped") &&
    nextStage !== "accepted" &&
    canInitiateOrgCandidateContact(nextStage)
  );
}

export function shouldOpenOrgStopCandidateDialog(
  currentStage: OrgStageId,
  nextStage: OrgStageId
) {
  return (
    canStopOrgCandidateProcess(currentStage) && nextStage === "process_stopped"
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

export function shouldSendOrgIntroEmail(args: {
  currentStage: OrgStageId;
  nextStage: OrgStageId;
  contactDirectly: boolean;
  scheduleInterview: boolean;
  skipAutomaticContact: boolean;
  recipientCount: number;
}) {
  return (
    args.recipientCount > 0 &&
    requiresOrgIntroEmailRecipient(
      args.currentStage,
      args.nextStage,
      args.contactDirectly ||
        args.scheduleInterview ||
        args.skipAutomaticContact
    )
  );
}
