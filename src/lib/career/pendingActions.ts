export type CareerPendingActionReference =
  | { id: string; kind: "company_request" }
  | { id: string; kind: "internal_fit_question" }
  | { id: string; kind: "internal_opportunity" };

export type CareerPendingCallAction = {
  callRequest: {
    companyLogoUrl: string | null;
    companyName: string;
    createdAt: string;
    id: string;
    opportunityId: string;
    questions: string[];
    reason: string | null;
    resumePromptNeeded: boolean;
    roleId: string;
    roleTitle: string;
    status: string;
    updatedAt: string;
  };
  id: string;
  kind: "internal_opportunity_call";
};

export type CareerPendingCompanyRequestAction = {
  companyName: string;
  expiresAt: string;
  id: string;
  kind: "company_request";
  prompt: string;
  requestMode: "question" | "resume";
  resumeRequestToken: string | null;
  roleId: string;
  roleTitle: string;
};

export type CareerPendingFitQuestionAction = {
  id: string;
  kind: "internal_fit_question";
  prompt: string;
};

export type CareerPendingInternalOpportunityAction = {
  companyLogoUrl: string | null;
  companyName: string;
  id: string;
  kind: "internal_opportunity";
  recommendationSummary: string | null;
  roleId: string;
  roleTitle: string;
};

export type CareerPendingAction =
  | CareerPendingCallAction
  | CareerPendingCompanyRequestAction
  | CareerPendingFitQuestionAction
  | CareerPendingInternalOpportunityAction;

const PENDING_ACTION_REFERENCE_KINDS = new Set([
  "company_request",
  "internal_fit_question",
  "internal_opportunity",
]);

export function normalizeCareerPendingActionReference(
  value: unknown
): CareerPendingActionReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id =
    typeof record.id === "string" ? record.id.trim().slice(0, 160) : "";
  const kind =
    typeof record.kind === "string" ? record.kind.trim().slice(0, 80) : "";
  if (!id || !PENDING_ACTION_REFERENCE_KINDS.has(kind)) return null;
  if (!/^[\p{L}\p{N}._:-]+$/u.test(id)) return null;
  return { id, kind } as CareerPendingActionReference;
}

export function toCareerPendingActionReference(
  action: Exclude<CareerPendingAction, CareerPendingCallAction>
): CareerPendingActionReference {
  return { id: action.id, kind: action.kind };
}
