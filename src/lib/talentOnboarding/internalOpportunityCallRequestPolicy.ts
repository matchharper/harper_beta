export const INTERNAL_OPPORTUNITY_CALL_REQUEST_MAX_AGE_MS =
  7 * 24 * 60 * 60 * 1000;

const TERMINAL_INTERNAL_OPPORTUNITY_COMPANY_DECISION_STAGES = new Set([
  "connected",
  "process_stopped",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const isFreshInternalOpportunityCallRequest = (
  createdAt: string,
  nowMs = Date.now()
) => {
  const createdAtMs = Date.parse(createdAt);
  return (
    Number.isFinite(createdAtMs) &&
    nowMs - createdAtMs < INTERNAL_OPPORTUNITY_CALL_REQUEST_MAX_AGE_MS
  );
};

export const isTerminalInternalOpportunityCompanyDecisionStage = (
  stage: unknown
) =>
  typeof stage === "string" &&
  TERMINAL_INTERNAL_OPPORTUNITY_COMPANY_DECISION_STAGES.has(
    stage.trim().toLowerCase()
  );

export const isTerminalInternalOpportunityCompanyDecision = (
  metadata: unknown
) => {
  if (!isRecord(metadata)) return false;
  return (
    isTerminalInternalOpportunityCompanyDecisionStage(metadata.stage) ||
    metadata.contactDirectly === true ||
    metadata.introRequested === true
  );
};
