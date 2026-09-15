export type CandidateContactLifecycleAction =
  | "create_draft"
  | "revise_draft"
  | "schedule"
  | "immediate"
  | "cancel";

export type CandidateContactTargetMode =
  | "exact_batch"
  | "exact_singular"
  | "presented_drafts";

export function resolveCandidateContactTargetMode(args: {
  items: unknown;
  presentedDrafts: unknown;
}): CandidateContactTargetMode {
  if (args.presentedDrafts === true) return "presented_drafts";
  return args.items === undefined ? "exact_singular" : "exact_batch";
}

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
