import type { InternalConnectionConfirmationEmailMode } from "@/lib/ops/connectionConfirmationEmail";
import type {
  OpsMatchingFitHumanLabelUpdateResponse,
  OpsMatchingFitItem,
  OpsMatchingFitLabel,
  OpsMatchingFitListResponse,
  OpsMatchingProgressResponse,
  OpsMatchingReviewBoardResponse,
  OpsMatchingReviewStageId,
  OpsMatchingReviewStageUpdateResponse,
  OpsMatchingTalentFitsResponse,
  OpsMatchingTalentItem,
  OpsMatchingTalentListResponse,
  OpsMatchingTalentPoolListResponse,
} from "@/lib/ops/matching";

export type OpsMatchingFitHumanLabelMutationInput = {
  fitId: string;
  humanLabel: OpsMatchingFitLabel | null;
  humanReason?: string | null;
};

export const OPS_MATCHING_FIT_HUMAN_LABEL_MUTATION_KEY = [
  "opsMatching",
  "fitHumanLabelMutation",
] as const;

export function buildPendingOpsMatchingFitHumanLabelIds(
  mutations: readonly OpsMatchingFitHumanLabelMutationInput[]
) {
  return new Set(mutations.map((mutation) => mutation.fitId));
}

function applyFitHumanLabelFields<
  TFit extends Pick<
    OpsMatchingFitItem,
    | "effectiveLabel"
    | "fitId"
    | "humanLabel"
    | "humanReason"
    | "humanReviewedAt"
    | "humanReviewedBy"
  >,
>(fit: TFit, update: OpsMatchingFitHumanLabelUpdateResponse): TFit {
  if (fit.fitId !== update.fitId) return fit;
  return {
    ...fit,
    effectiveLabel: update.effectiveLabel,
    humanLabel: update.humanLabel,
    humanReason: update.humanReason,
    humanReviewedAt: update.humanReviewedAt,
    humanReviewedBy: update.humanReviewedBy,
  };
}

export function applyOpsMatchingFitHumanLabelToTalent(
  talent: OpsMatchingTalentItem,
  update: OpsMatchingFitHumanLabelUpdateResponse
) {
  if (!talent.fit || talent.fit.fitId !== update.fitId) return talent;
  return {
    ...talent,
    fit: applyFitHumanLabelFields(talent.fit, update),
  };
}

export function applyOpsMatchingFitHumanLabelToFitList(
  current: OpsMatchingFitListResponse | undefined,
  update: OpsMatchingFitHumanLabelUpdateResponse
) {
  if (!current) return current;
  return {
    ...current,
    items: current.items.map((item) => {
      if (item.fitId !== update.fitId) return item;
      return {
        ...applyFitHumanLabelFields(item, update),
        talent: applyOpsMatchingFitHumanLabelToTalent(item.talent, update),
      };
    }),
  };
}

export function applyOpsMatchingFitHumanLabelToTalentList<
  TResponse extends
    | OpsMatchingTalentListResponse
    | OpsMatchingTalentPoolListResponse,
>(
  current: TResponse | undefined,
  update: OpsMatchingFitHumanLabelUpdateResponse
) {
  if (!current) return current;
  return {
    ...current,
    items: current.items.map((talent) =>
      applyOpsMatchingFitHumanLabelToTalent(talent, update)
    ),
  } as TResponse;
}

export function applyOpsMatchingFitHumanLabelToTalentFits(
  current: OpsMatchingTalentFitsResponse | undefined,
  update: OpsMatchingFitHumanLabelUpdateResponse
) {
  if (!current) return current;
  return {
    ...current,
    items: current.items.map((item) =>
      item.fitId === update.fitId
        ? {
            ...applyFitHumanLabelFields(item, update),
            talent: applyOpsMatchingFitHumanLabelToTalent(item.talent, update),
          }
        : item
    ),
  };
}

export function applyOpsMatchingFitHumanLabelToReviewBoard(
  current: OpsMatchingReviewBoardResponse | undefined,
  update: OpsMatchingFitHumanLabelUpdateResponse
) {
  if (!current) return current;
  return {
    ...current,
    items: current.items.map((item) => ({
      ...item,
      talent: applyOpsMatchingFitHumanLabelToTalent(item.talent, update),
    })),
  };
}

export function applyOpsMatchingFitHumanLabelToProgress(
  current: OpsMatchingProgressResponse | undefined,
  update: OpsMatchingFitHumanLabelUpdateResponse
) {
  if (!current?.fit || current.fit.fitId !== update.fitId) return current;
  return {
    ...current,
    fit: applyFitHumanLabelFields(current.fit, update),
  };
}

export type OpsMatchingReviewStageMutationInput = {
  emailMode?: InternalConnectionConfirmationEmailMode;
  roleId: string;
  stage: Exclude<OpsMatchingReviewStageId, "recommended">;
  talentId: string;
};

export const OPS_MATCHING_REVIEW_STAGE_MUTATION_KEY = [
  "opsMatching",
  "reviewStageMutation",
] as const;

export function buildPendingOpsMatchingReviewStageMap(
  mutations: readonly OpsMatchingReviewStageMutationInput[],
  roleId: string
) {
  const pendingStageByTalentId = new Map<
    string,
    Exclude<OpsMatchingReviewStageId, "recommended">
  >();

  for (const mutation of mutations) {
    if (mutation.roleId !== roleId) continue;
    pendingStageByTalentId.set(mutation.talentId, mutation.stage);
  }

  return pendingStageByTalentId;
}

export function applyOpsMatchingReviewStageUpdate(
  current: OpsMatchingReviewBoardResponse | undefined,
  update: OpsMatchingReviewStageUpdateResponse
) {
  if (!current || current.roleId !== update.roleId) return current;

  return {
    ...current,
    items: current.items.map((item) =>
      item.talent.userId === update.talentId
        ? {
            ...item,
            stage: update.stage,
            talent: {
              ...item.talent,
              tags: update.tags,
            },
          }
        : item
    ),
  };
}
