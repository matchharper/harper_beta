import {
  isOrgAgentToolName,
  type OrgAgentToolName,
} from "@/lib/org/agent/tools";

export class OrgAgentToolInputError extends Error {}

/** Must run before parsing input or touching application state. */
export function assertOrgAgentToolAvailable(name: OrgAgentToolName) {
  if (!isOrgAgentToolName(name)) {
    throw new OrgAgentToolInputError("This tool is not available");
  }
}
