import type { InternalConnectionConfirmationEmailMode } from "@/lib/ops/connectionConfirmationEmail";
import type {
  OrgAcceptedTalentsResponse,
  OrgBoardResponse,
  OrgStageChangeOptions,
  OrgStageId,
  OrgTalentDetailResponse,
} from "@/lib/org/server";

export type OrgCandidateStageMutationInput = {
  acceptReason?: OrgStageChangeOptions["acceptReason"];
  additionalMessage?: OrgStageChangeOptions["additionalMessage"];
  additionalMessageVisibility?: OrgStageChangeOptions["additionalMessageVisibility"];
  attendeeEmails?: OrgStageChangeOptions["attendeeEmails"];
  contactDirectly?: OrgStageChangeOptions["contactDirectly"];
  durationMinutes?: OrgStageChangeOptions["durationMinutes"];
  emailMode?: InternalConnectionConfirmationEmailMode;
  introEmails?: OrgStageChangeOptions["introEmails"];
  recommendationId: string;
  roleId: string;
  scheduleInterview?: OrgStageChangeOptions["scheduleInterview"];
  stage: OrgStageId;
  stopNote?: OrgStageChangeOptions["stopNote"];
  talentId: string;
  title?: OrgStageChangeOptions["title"];
  workspaceId: string;
};

export type OrgCandidateStageMutationResponse = {
  meetingSchedule?: {
    alreadyExisted: boolean;
    detailPath: string;
    roundId: string;
    scheduleId: string;
    status: string;
  } | null;
  ok: true;
  roleId: string;
  stage: OrgStageId;
  stageTag: string;
  talentId: string;
};

export const ORG_CANDIDATE_STAGE_MUTATION_KEY = [
  "org",
  "candidateStageMutation",
] as const;

export function getOrgCandidateStageMutationIdentity(
  input: Pick<
    OrgCandidateStageMutationInput,
    "roleId" | "talentId" | "workspaceId"
  >
) {
  return `${input.workspaceId}:${input.roleId}:${input.talentId}`;
}

export function buildPendingOrgCandidateStageMap(
  mutations: readonly OrgCandidateStageMutationInput[],
  workspaceId: string
) {
  const pendingByCandidate = new Map<string, OrgCandidateStageMutationInput>();

  for (const mutation of mutations) {
    if (mutation.workspaceId !== workspaceId) continue;
    pendingByCandidate.set(
      getOrgCandidateStageMutationIdentity(mutation),
      mutation
    );
  }

  return pendingByCandidate;
}

export function applyOrgCandidateStageToBoard(
  current: OrgBoardResponse | undefined,
  update: OrgCandidateStageMutationResponse,
  variables: OrgCandidateStageMutationInput
) {
  if (!current || current.workspaceId !== variables.workspaceId) return current;
  return {
    ...current,
    items: current.items.map((item) =>
      item.roleId === update.roleId && item.talentId === update.talentId
        ? {
            ...item,
            stage: update.stage,
            stageTag: update.stageTag,
          }
        : item
    ),
  };
}

export function applyOrgCandidateStageToDetail(
  current: OrgTalentDetailResponse | undefined,
  update: OrgCandidateStageMutationResponse,
  variables: OrgCandidateStageMutationInput
) {
  if (
    !current ||
    current.workspace.workspaceId !== variables.workspaceId ||
    current.role.roleId !== update.roleId ||
    current.talent.userId !== update.talentId
  ) {
    return current;
  }
  return {
    ...current,
    recommendation: {
      ...current.recommendation,
      stage: update.stage,
    },
  };
}

export function applyOrgCandidateStageToAcceptedTalents(
  current: OrgAcceptedTalentsResponse | undefined,
  update: OrgCandidateStageMutationResponse,
  variables: OrgCandidateStageMutationInput
) {
  if (!current) return current;
  return {
    ...current,
    items: current.items.map((item) =>
      item.workspaceId === variables.workspaceId &&
      item.roleId === update.roleId &&
      item.talentId === update.talentId
        ? {
            ...item,
            currentStage: update.stage,
            isAwaitingStageMove: update.stage === "accepted",
          }
        : item
    ),
  };
}
