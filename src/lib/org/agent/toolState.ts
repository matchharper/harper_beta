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
  contactDraftRef: NonNullable<
    OrgAgentMessageMetadata["contactDraftRef"]
  > | null;
  company: OrgWorkspace;
  completeLongTextTargets: Set<string>;
  fullRoleRequestIds: Set<string>;
  internalTokenCorrectionCount: number;
  observedLongTextFingerprints: Map<string, string>;
  openedUrls: Set<string>;
  pendingFullRoleRequestIds: Set<string>;
  preferredRoleId: string | null;
  requestChanges: RequestChange[];
  requiredPresentationText: string | null;
  requiredSlackContinuationLink: string | null;
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
  "역할을 삭제하거나 상태를 변경하지 못했어요. 역할과 현재 상태를 다시 확인한 뒤 시도해 주세요. 후보자 추천이나 진행 중인 연결에는 변화가 없어요.";

export const ORG_AGENT_FAILED_CONTACT_REPLY =
  "후보자에게 요청을 보내지 못했어요. 대상 후보자와 역할, 요청 내용을 다시 확인해 주세요. 이메일이나 Harper 채팅으로 전달된 내용은 없어요.";

export const ORG_AGENT_FAILED_CANDIDATE_DECISION_REPLY =
  "후보자 연결 결정의 최종 결과를 확인하지 못했어요. 소개 이메일이나 후보자 안내가 전달됐을 수 있으니 바로 다시 시도하지 말고, 후보자의 현재 상태와 메일을 먼저 확인해 주세요.";

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
      "change_role_status",
      "contact_talent",
      "decide_candidate_connection",
      "manage_interview_availability",
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
    finalTerminalResult.status === "success" &&
    state.requiredSlackContinuationLink
  ) {
    const requiredLink = state.requiredSlackContinuationLink;
    const match = requiredLink.match(/^<([^|>]+)\|([^>]+)>$/);
    const fallback = state.terminalReply?.trim() ?? "";
    let reply = modelReply.trim() || fallback;

    if (match) {
      const [, url, label] = match;
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      reply = reply
        .replace(new RegExp(`<${escapedUrl}(?:\\|[^>]*)?>`, "g"), requiredLink)
        .replace(
          new RegExp(`\\[[^\\]]+\\]\\(${escapedUrl}\\)`, "g"),
          requiredLink
        );
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const sentinel = "\u0000HARPER_ROLE_CONTINUATION_LINK\u0000";
      reply = reply
        .replaceAll(requiredLink, sentinel)
        .replace(
          new RegExp(
            `(^|\\n)[ \\t]*(?:#{1,6}[ \\t]+)?(?:\\*\\*|__|\\*)?${escapedLabel}(?:\\*\\*|__|\\*)?[ \\t]*(?=\\n|$)`,
            "g"
          ),
          "$1"
        )
        .replaceAll(sentinel, requiredLink)
        .replace(/\n{3,}/g, "\n\n");
    }

    const firstRequiredLinkIndex = reply.indexOf(requiredLink);
    if (firstRequiredLinkIndex >= 0) {
      const before = reply.slice(0, firstRequiredLinkIndex);
      const after = reply
        .slice(firstRequiredLinkIndex + requiredLink.length)
        .replaceAll(requiredLink, "")
        .replace(/\n{3,}/g, "\n\n");
      reply = `${before}${requiredLink}${after}`.trim();
    } else {
      reply = [reply, requiredLink].filter(Boolean).join("\n\n");
    }
    return reply;
  }
  if (
    finalTerminalResult.name === "decide_candidate_connection" &&
    state.terminalReply
  ) {
    return state.terminalReply;
  }
  if (
    finalTerminalResult.name === "contact_talent" &&
    state.requiredPresentationText &&
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
    contactDraftRef: null,
    company: { ...args.workspace },
    completeLongTextTargets: new Set(),
    fullRoleRequestIds: new Set(args.completeRoleRequestIds ?? []),
    internalTokenCorrectionCount: 0,
    observedLongTextFingerprints: new Map(),
    openedUrls: new Set(),
    pendingFullRoleRequestIds: new Set(),
    preferredRoleId: null,
    requestChanges: [],
    requiredPresentationText: null,
    requiredSlackContinuationLink: null,
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
