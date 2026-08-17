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
  openedUrls: Set<string>;
  pendingFullRoleRequestIds: Set<string>;
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
  successfulWebSearchQueries: Set<string>;
  updateProposalRef: null | { proposalId: string; summary: string };
  updateSummaries: string[];
};

export const ORG_AGENT_FAILED_UPDATE_REPLY =
  "요청하신 변경은 적용되지 않았습니다. 내용을 다시 확인한 뒤 시도해 주세요.";

export const ORG_AGENT_FAILED_ROLE_STATUS_REPLY =
  "역할 상태를 변경하지 못했습니다. 역할과 현재 상태를 다시 확인한 뒤 시도해 주세요. 후보 추천이나 진행 중인 연결에는 변화가 없습니다.";

export const ORG_AGENT_FAILED_CONTACT_REPLY =
  "후보자분께 요청을 접수하지 못했습니다. 대상 후보자와 포지션, 요청 내용을 다시 확인한 뒤 요청해 주세요. 아직 후보자분께는 이메일이나 Harper 채팅이 전달되지 않았습니다.";

export const ORG_AGENT_FAILED_CONTACT_CHANGE_REPLY =
  "후보자 문의 요청을 변경하지 못했습니다. 최신 발송 상태를 다시 확인해 주세요.";

export const ORG_AGENT_FAILED_CANDIDATE_DECISION_REPLY =
  "후보자 연결 결정을 반영하지 못했습니다. 후보자가 아직 연결 대기 상태인지와 직전 확인 내용이 현재 답변과 일치하는지 확인한 뒤 다시 시도해 주세요. 상태 변경이나 연결 메일 발송은 이루어지지 않았습니다.";

/**
 * A failed mutation is a server-authoritative outcome. Do not let a
 * model-authored final message accidentally turn it into a success claim.
 */
export function enforceOrgAgentTerminalMutationOutcome(
  state: OrgAgentToolExecutionState,
  modelReply: string
) {
  const finalTerminalResult = state.toolResults.findLast((result) =>
    [
      "start_role_creation",
      "change_talent_contact",
      "change_role_status",
      "contact_talent",
      "decide_candidate_connection",
      "manage_role_pipeline_stages",
      "move_candidate_stage",
      "update_data",
      "update_role_criteria",
    ].includes(result.name)
  );
  if (!finalTerminalResult) {
    return modelReply;
  }
  if (
    finalTerminalResult.name === "start_role_creation" &&
    state.terminalReply
  ) {
    return state.terminalReply;
  }
  if (
    finalTerminalResult.name === "change_talent_contact" &&
    state.terminalReply
  ) {
    return state.terminalReply;
  }
  if (finalTerminalResult.status !== "error") return modelReply;
  const failedResult = finalTerminalResult;
  if (state.terminalReply) return state.terminalReply;
  if (failedResult.name === "contact_talent") {
    return ORG_AGENT_FAILED_CONTACT_REPLY;
  }
  if (failedResult.name === "change_talent_contact") {
    return ORG_AGENT_FAILED_CONTACT_CHANGE_REPLY;
  }
  if (failedResult.name === "decide_candidate_connection") {
    return ORG_AGENT_FAILED_CANDIDATE_DECISION_REPLY;
  }
  if (failedResult.name === "change_role_status") {
    return ORG_AGENT_FAILED_ROLE_STATUS_REPLY;
  }
  return ORG_AGENT_FAILED_UPDATE_REPLY;
}

export function createOrgAgentToolExecutionState(
  context: OrgAgentPromptContext
): OrgAgentToolExecutionState {
  const state = createOrgAgentToolExecutionStateFromSnapshot({
    completeRoleRequestIds: context.completeRoleRequestIds,
    roles: context.roles,
    workspace: context.workspace,
  });
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

/**
 * Builds the runtime bookkeeping state from already-loaded authoritative rows.
 * Debug and inspection paths can use this without paying for the full prompt,
 * recent conversation, retained-data, and pipeline context reads.
 */
export function createOrgAgentToolExecutionStateFromSnapshot(args: {
  completeRoleRequestIds?: string[];
  roles: OrgAgentPromptContext["roles"];
  workspace: OrgAgentPromptContext["workspace"];
}): OrgAgentToolExecutionState {
  const state: OrgAgentToolExecutionState = {
    activatedMoreData: [],
    actions: [],
    candidateConnectionConfirmations: [],
    company: { ...args.workspace },
    completeLongTextTargets: new Set(),
    fullRoleRequestIds: new Set(args.completeRoleRequestIds ?? []),
    internalTokenCorrectionCount: 0,
    observedLongTextFingerprints: new Map(),
    openedUrls: new Set(),
    pendingFullRoleRequestIds: new Set(),
    requestChanges: [],
    requiredPresentationText: null,
    roleById: new Map(args.roles.map((role) => [role.roleId, { ...role }])),
    stagedProposal: null,
    terminalReply: null,
    terminalMutationUsed: false,
    toolResults: [],
    successfulWebSearchQueries: new Set(),
    updateProposalRef: null,
    updateSummaries: [],
  };
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
