export type CandidateContactLifecycleAction =
  | "create_draft"
  | "revise_draft"
  | "schedule"
  | "immediate"
  | "cancel";

export function resolveCandidateContactLifecycleAction(args: {
  action: CandidateContactLifecycleAction;
  deliveryMode: "standard" | "immediate";
  workflowStatus: string;
}): CandidateContactLifecycleAction {
  if (
    args.action === "schedule" &&
    args.deliveryMode === "immediate" &&
    ["queued", "failed"].includes(args.workflowStatus)
  ) {
    return "immediate";
  }
  return args.action;
}
