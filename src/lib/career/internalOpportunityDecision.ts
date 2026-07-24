import type { CareerHistoryOpportunity } from "@/components/career/types";

export type CareerInternalOpportunityDecisionAction = "revert" | "stop_process";

export const INTERNAL_OPPORTUNITY_DECISION_REASON_MAX_LENGTH = 1000;

export function normalizeInternalOpportunityDecisionReason(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized
    ? normalized.slice(0, INTERNAL_OPPORTUNITY_DECISION_REASON_MAX_LENGTH)
    : null;
}

type InternalOpportunityDecisionState = Pick<
  CareerHistoryOpportunity,
  | "feedback"
  | "feedbackAt"
  | "isInternal"
  | "savedStage"
  | "sourceType"
  | "status"
> & {
  internalProgress?: Pick<
    NonNullable<CareerHistoryOpportunity["internalProgress"]>,
    "acceptedAt" | "stage"
  > | null;
};

const ACCEPTANCE_REVERSAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACCEPTANCE_REVERSIBLE_STAGES = new Set(["accepted"]);

export function getInternalOpportunityDecisionAvailability(
  item: InternalOpportunityDecisionState,
  now = Date.now()
) {
  if (!item.isInternal && item.sourceType !== "internal") {
    return { canRevert: false, canStopProcess: false };
  }

  if (item.feedback === "negative") {
    return {
      canRevert: item.status.trim().toLowerCase() !== "ended",
      canStopProcess: false,
    };
  }

  if (item.feedback !== "positive") {
    return { canRevert: false, canStopProcess: false };
  }

  if (item.savedStage === "closed") {
    return { canRevert: false, canStopProcess: false };
  }

  const stage = item.internalProgress?.stage ?? null;
  const acceptedAtMs = item.feedbackAt
    ? Date.parse(item.feedbackAt)
    : Number.NaN;
  const elapsedMs = now - acceptedAtMs;
  const isBeforePostAcceptanceStage =
    stage === null || ACCEPTANCE_REVERSIBLE_STAGES.has(stage);

  return {
    canRevert:
      Number.isFinite(elapsedMs) &&
      elapsedMs >= 0 &&
      elapsedMs < ACCEPTANCE_REVERSAL_WINDOW_MS &&
      isBeforePostAcceptanceStage,
    canStopProcess: true,
  };
}
