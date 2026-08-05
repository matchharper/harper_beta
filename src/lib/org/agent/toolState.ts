import type { OrgAgentPromptContext } from "@/lib/org/agent/context";
import type {
  OrgAgentMessageAction,
  OrgAgentMessageMetadata,
} from "@/lib/org/agent/types";
import type { OrgRole, OrgWorkspace } from "@/lib/org/server";
import {
  isCompanyDetailsLongTextKey,
  type CompanyDataKey,
  type CompanyDetailsLongTextKey,
} from "@/lib/org/agent/companyDataCatalog";
import type { ResolvedCompanyDataChange } from "@/lib/org/agent/companyDataMutation";

type RequestChange = NonNullable<
  OrgAgentMessageMetadata["requestChanges"]
>[number];

export type OrgAgentToolResultMetadata = NonNullable<
  OrgAgentMessageMetadata["toolResults"]
>[number];

export type OrgAgentToolExecutionState = {
  activatedMoreData: Array<{
    activatedAt: string;
    activatedByUserMessageId: number;
    fullTextKeys: CompanyDetailsLongTextKey[];
    kind: "company_details" | "members" | "workspace_memory";
    scopeKey: string;
  }>;
  actions: OrgAgentMessageAction[];
  candidateConnectionConfirmations: NonNullable<
    OrgAgentMessageMetadata["candidateConnectionConfirmations"]
  >;
  company: OrgWorkspace;
  completeLongTextTargets: Set<string>;
  fullRoleRequestIds: Set<string>;
  internalTokenCorrectionCount: number;
  observedLongTextFingerprints: Map<string, string>;
  pendingFullRoleRequestIds: Set<string>;
  preferenceDisclosure: {
    attempted: boolean;
    evidence: string[];
  };
  requestChanges: RequestChange[];
  requiredPresentationText: string | null;
  roleById: Map<string, OrgRole>;
  stagedProposal: null | {
    changes: ResolvedCompanyDataChange[];
    eventContent: string;
    preview: string;
    summary: string;
  };
  terminalReply: string | null;
  terminalMutationUsed: boolean;
  toolResults: OrgAgentToolResultMetadata[];
  updateProposalRef: null | { proposalId: string; summary: string };
  updateSummaries: string[];
};

export const ORG_AGENT_FAILED_MUTATION_REPLY =
  "요청하신 변경은 적용되지 않았습니다. 내용을 다시 확인한 뒤 시도해 주세요.";

/**
 * A failed mutation is a server-authoritative outcome. Do not let a
 * model-authored final message accidentally turn it into a success claim.
 */
export function enforceOrgAgentTerminalMutationOutcome(
  state: OrgAgentToolExecutionState,
  modelReply: string
) {
  const mutationFailed =
    state.terminalMutationUsed &&
    state.toolResults.some((result) => result.status === "error");

  return mutationFailed
    ? state.terminalReply || ORG_AGENT_FAILED_MUTATION_REPLY
    : modelReply;
}

export function createOrgAgentToolExecutionState(
  context: OrgAgentPromptContext
): OrgAgentToolExecutionState {
  const state: OrgAgentToolExecutionState = {
    activatedMoreData: [],
    actions: [],
    candidateConnectionConfirmations: [],
    company: { ...context.workspace },
    completeLongTextTargets: new Set(),
    fullRoleRequestIds: new Set(context.completeRoleRequestIds),
    internalTokenCorrectionCount: 0,
    observedLongTextFingerprints: new Map(),
    pendingFullRoleRequestIds: new Set(),
    preferenceDisclosure: { attempted: false, evidence: [] },
    requestChanges: [],
    requiredPresentationText: null,
    roleById: new Map(context.roles.map((role) => [role.roleId, { ...role }])),
    stagedProposal: null,
    terminalReply: null,
    terminalMutationUsed: false,
    toolResults: [],
    updateProposalRef: null,
    updateSummaries: [],
  };
  for (const observation of context.defaultLongTextObservations ?? []) {
    markOrgAgentLongTextComplete({
      key: observation.key,
      observedValue: observation.value,
      roleId: observation.roleId,
      state,
    });
  }
  for (const [key, marker] of Object.entries(
    context.retainedMoreData?.companyDetails?.fields ?? {}
  )) {
    if (marker.complete && isCompanyDetailsLongTextKey(key)) {
      markOrgAgentLongTextComplete({
        key,
        observedValue:
          context.retainedMoreData?.companyDetails?.values[key] ?? null,
        state,
      });
    }
  }
  if (context.retainedMoreData?.workspaceMemory?.complete) {
    markOrgAgentLongTextComplete({
      key: "workspace_memory",
      observedValue: context.retainedMoreData.workspaceMemory.content ?? null,
      state,
    });
  }
  return state;
}

function longTextTarget(key: CompanyDataKey, roleId?: string | null) {
  return `${key}:${roleId ?? "workspace"}`;
}

/**
 * Fingerprints the exact application value that was made visible to the model.
 * Long-text fields are strings or null, but the tagged JSON fallback keeps the
 * comparison deterministic if a catalog type is expanded later.
 */
export function fingerprintOrgAgentObservedValue(value: unknown) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return `string:${JSON.stringify(value)}`;
  return `${typeof value}:${JSON.stringify(value)}`;
}

export function markOrgAgentLongTextComplete(args: {
  key: CompanyDataKey;
  observedValue: unknown;
  roleId?: string | null;
  state: OrgAgentToolExecutionState;
}) {
  const target = longTextTarget(args.key, args.roleId);
  args.state.completeLongTextTargets.add(target);
  args.state.observedLongTextFingerprints.set(
    target,
    fingerprintOrgAgentObservedValue(args.observedValue)
  );
}

export function isOrgAgentLongTextComplete(args: {
  currentValue: unknown;
  key: CompanyDataKey;
  roleId: string | null;
  state: OrgAgentToolExecutionState;
}) {
  const target = longTextTarget(args.key, args.roleId);
  return (
    args.state.completeLongTextTargets.has(target) &&
    args.state.observedLongTextFingerprints.get(target) ===
      fingerprintOrgAgentObservedValue(args.currentValue)
  );
}

/**
 * read_role and update_data may be emitted in one parallel tool batch. Promote
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
