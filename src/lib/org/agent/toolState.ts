import type { OrgAgentPromptContext } from "@/lib/org/agent/context";
import type {
  OrgAgentMessageAction,
  OrgAgentMessageMetadata,
} from "@/lib/org/agent/types";
import type { OrgRole, OrgWorkspace } from "@/lib/org/server";

type RequestChange = NonNullable<
  OrgAgentMessageMetadata["requestChanges"]
>[number];

export type OrgAgentToolResultMetadata = NonNullable<
  OrgAgentMessageMetadata["toolResults"]
>[number];

export type OrgAgentToolExecutionState = {
  actions: OrgAgentMessageAction[];
  company: OrgWorkspace;
  fullRoleRequestIds: Set<string>;
  pendingFullRoleRequestIds: Set<string>;
  requestChanges: RequestChange[];
  roleById: Map<string, OrgRole>;
  toolResults: OrgAgentToolResultMetadata[];
  updateSummaries: string[];
};

export function createOrgAgentToolExecutionState(
  context: OrgAgentPromptContext
): OrgAgentToolExecutionState {
  return {
    actions: [],
    company: { ...context.workspace },
    fullRoleRequestIds: new Set(context.completeRoleRequestIds),
    pendingFullRoleRequestIds: new Set(),
    requestChanges: [],
    roleById: new Map(context.roles.map((role) => [role.roleId, { ...role }])),
    toolResults: [],
    updateSummaries: [],
  };
}

/**
 * read_role and update_role may be emitted in one parallel tool batch. Promote
 * visibility only between model completions so a write cannot pretend the
 * model has already seen a sibling read result.
 */
export function promoteOrgAgentToolReadVisibility(
  state: OrgAgentToolExecutionState
) {
  for (const roleId of state.pendingFullRoleRequestIds) {
    state.fullRoleRequestIds.add(roleId);
  }
  state.pendingFullRoleRequestIds.clear();
}
