import { OrgAgentToolInputError } from "@/lib/org/agent/toolAvailability";

function has(object: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function resolveOrgAgentUpdateDataMode(
  input: Record<string, unknown>
): "changes" | "proposal" {
  const hasChanges = has(input, "changes");
  const hasProposalId = has(input, "proposalId");
  const hasProposalAction = has(input, "proposalAction");

  // A complete proposal reference is authoritative. Some models repeat the
  // proposed changes and summary when confirming; resolving the stored
  // proposal remains safe because the RPC ignores those extra draft fields and
  // applies only the exact server-side proposal the user already reviewed.
  if (hasProposalId && hasProposalAction) return "proposal";
  if (hasProposalId || hasProposalAction) {
    throw new OrgAgentToolInputError(
      "proposalId and proposalAction must be provided together for an existing proposal. To create a new preview, omit both proposal fields and send changes."
    );
  }
  if (hasChanges) return "changes";
  throw new OrgAgentToolInputError(
    "update_data requires changes, or proposalId with proposalAction"
  );
}
