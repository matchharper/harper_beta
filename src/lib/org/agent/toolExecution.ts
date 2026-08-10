import type { User } from "@supabase/supabase-js";
import {
  getOrgAgentMoreData,
  getOrgAgentTalents,
  readOrgAgentRole,
  readOrgAgentTalent,
  readOrgAgentTalents,
  type OrgAgentAdminClient,
} from "@/lib/org/agent/data";
import {
  COMPANY_DETAILS_LONG_TEXT_KEYS,
  companyDataTargetKey,
  isCompanyDetailsLongTextKey,
  type CompanyDataKey,
} from "@/lib/org/agent/companyDataCatalog";
import {
  assertCompanyDataProposalSnapshotUnchanged,
  buildCompanyAgentEventContent,
  CompanyDataMutationError,
  fetchCompanyDataSnapshot,
  mergeCompanyDataProposalRevision,
  parseCompanyDataChanges,
  resolveCompanyDataMutation,
  type ResolvedCompanyDataChange,
} from "@/lib/org/agent/companyDataMutation";
import type { OrgAgentConversationRow } from "@/lib/org/agent/store";
import {
  fetchOrgAgentConversationHistory,
  OrgAgentConversationHistoryCursorError,
  type OrgAgentConversationHistoryScope,
} from "@/lib/org/agent/conversationHistory";
import { hasPendingOrgAgentUpdateProposal } from "@/lib/org/agent/proposals";
import { parseReadTalentIds } from "@/lib/org/agent/readTalentInput";
import type { OrgAgentToolName } from "@/lib/org/agent/tools";
import { resolveOrgAgentUpdateDataMode } from "@/lib/org/agent/updateDataMode";
import {
  assertOrgAgentToolAvailable,
  OrgAgentToolInputError,
} from "@/lib/org/agent/toolAvailability";
import type {
  OrgAgentCandidateConnectionMethod,
  OrgAgentCandidateDecision,
  OrgAgentCandidateDecisionConfirmation,
  OrgAgentReadAudience,
} from "@/lib/org/agent/types";
import {
  createOrgAgentToolExecutionState,
  isOrgAgentLongTextComplete,
  markOrgAgentLongTextComplete,
  promoteOrgAgentToolReadVisibility,
  type OrgAgentToolExecutionState,
  type OrgAgentToolResultMetadata,
} from "@/lib/org/agent/toolState";
import { setOrgCandidateStage } from "@/lib/org/server";
import {
  changeCompanyTalentRequest,
  enqueueCompanyTalentRequest,
  fetchBlockingCompanyTalentRequestForWorkspace,
} from "@/lib/companyTalentRequests/server";
import { formatOrgAgentKstDateTime } from "@/lib/org/agent/dateTime";
import {
  executeSharedOpenUrl,
  executeSharedWebSearch,
} from "@/lib/agentTools/web";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

export { createOrgAgentToolExecutionState, promoteOrgAgentToolReadVisibility };
export { OrgAgentToolInputError };
export type { OrgAgentToolExecutionState };

function text(value: unknown) {
  return String(value ?? "").trim();
}

function formatKstDateTime(value: unknown) {
  const formatted = formatOrgAgentKstDateTime(value, { includeYear: true });
  return formatted ? `${formatted} KST` : "예정 시각 확인 중";
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function has(object: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function boundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.trunc(parsed), min), max)
    : fallback;
}

function requiredText(value: unknown, field: string, maxLength: number) {
  const normalized = text(value);
  if (!normalized) {
    throw new OrgAgentToolInputError(`${field} is required`);
  }
  if (normalized.length > maxLength) {
    throw new OrgAgentToolInputError(
      `${field} exceeds ${maxLength.toLocaleString()} characters`
    );
  }
  return normalized;
}

function nullableTextField(
  input: Record<string, unknown>,
  field: string,
  maxLength: number
) {
  if (!has(input, field)) return { present: false as const, value: undefined };
  if (input[field] === null) return { present: true as const, value: null };
  const value = String(input[field] ?? "")
    .replaceAll("\u0000", "")
    .trim();
  if (value.length > maxLength) {
    throw new OrgAgentToolInputError(
      `${field} exceeds ${maxLength.toLocaleString()} characters`
    );
  }
  return { present: true as const, value: value || null };
}

function booleanField(
  input: Record<string, unknown>,
  field: string,
  fallback: boolean
) {
  return typeof input[field] === "boolean" ? input[field] : fallback;
}

function emailArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    throw new OrgAgentToolInputError("introEmails must be an array");
  }
  const items = Array.from(
    new Set(
      value
        .map(text)
        .map((item) => item.toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, maxItems);
  if (items.some((item) => item.length > 320)) {
    throw new OrgAgentToolInputError(
      "Each introduction email must be at most 320 characters"
    );
  }
  if (items.some((item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))) {
    throw new OrgAgentToolInputError(
      "Each introduction email must be a valid email address"
    );
  }
  return items;
}

function candidateDecision(value: unknown): OrgAgentCandidateDecision {
  const decision = requiredText(value, "decision", 20);
  if (decision !== "accept" && decision !== "decline") {
    throw new OrgAgentToolInputError("decision must be accept or decline");
  }
  return decision;
}

function candidateConnectionMethod(
  value: unknown
): OrgAgentCandidateConnectionMethod | null {
  const method = text(value);
  if (!method) return null;
  if (method !== "intro_email" && method !== "direct_contact") {
    throw new OrgAgentToolInputError(
      "connectionMethod must be intro_email or direct_contact"
    );
  }
  return method;
}

type OrgAgentRoleLifecycleStatus = "active" | "paused" | "ended";

const ORG_AGENT_ROLE_STATUS_COPY: Record<
  OrgAgentRoleLifecycleStatus,
  { effect: string; label: string }
> = {
  active: {
    effect:
      "역할의 채용을 진행하며 Harper가 주기적으로 적합한 인재를 연결합니다.",
    label: "진행",
  },
  paused: {
    effect:
      "역할은 열어두지만 추가 후보 추천을 중단합니다. 현재 진행 중인 후보자와 연결은 그대로 유지합니다.",
    label: "중단",
  },
  ended: {
    effect:
      "역할을 종료 상태로 바꾸고 추가 추천을 중단합니다. 후보자 화면은 역할 종료로 해석하지만, 기존 후보 단계와 회사 요청은 이 변경만으로 모두 자동 종료되지 않습니다.",
    label: "종료",
  },
};

function roleLifecycleStatus(value: unknown): OrgAgentRoleLifecycleStatus {
  const status = requiredText(value, "status", 20);
  if (status !== "active" && status !== "paused" && status !== "ended") {
    throw new OrgAgentToolInputError("status must be active, paused, or ended");
  }
  return status;
}

function roleOrThrow(state: OrgAgentToolExecutionState, roleIdValue: unknown) {
  const roleId = requiredText(roleIdValue, "roleId", 100);
  const role = state.roleById.get(roleId);
  if (!role)
    throw new OrgAgentToolInputError("Role not found in this workspace");
  return role;
}

function recordResult(
  state: OrgAgentToolExecutionState,
  result: OrgAgentToolResultMetadata
) {
  state.toolResults.push(result);
}

type BlockingCompanyTalentRequest = {
  blocksNewRequest?: boolean;
  cancelable?: boolean;
  label?: string | null;
  requestId?: string | null;
  roleId?: string | null;
  roleName?: string | null;
  scheduledAt?: string | null;
  status?: string | null;
  topic?: string | null;
};

function blockingCompanyTalentRequest(
  requestHistory: BlockingCompanyTalentRequest[],
  roleId: string
) {
  return (
    requestHistory.find(
      (request) => request.blocksNewRequest && request.roleId === roleId
    ) ?? null
  );
}

function existingCompanyTalentRequestResult(args: {
  callId: string;
  candidateName: string;
  existingRequest: BlockingCompanyTalentRequest | null;
  kind: "question" | "resume";
  name: OrgAgentToolName;
  requestContext: string;
  roleName: string;
  state: OrgAgentToolExecutionState;
}) {
  const existing = args.existingRequest;
  const candidateName = args.candidateName || "후보자분";
  const existingRoleName = text(existing?.roleName) || args.roleName;
  const existingTopic = text(existing?.topic);
  const existingStatus = text(existing?.status) || "처리 중";
  const cancelable = Boolean(existing?.cancelable);
  const existingDescription = existing
    ? `${existingRoleName} 포지션 관련${existingTopic ? ` “${existingTopic}”` : ""} 요청이 ${existingStatus} 상태로 남아 있습니다.`
    : "이미 다른 확인 요청이 진행 중입니다.";
  const conflictSummary = `${candidateName}께 ${existingDescription}`;
  args.state.terminalReply = cancelable
    ? `${conflictSummary} 새 요청은 접수하지 않았습니다. 기존 요청을 취소하고 이번 요청으로 새로 접수할까요?`
    : `${conflictSummary} 새 요청은 접수하지 않았습니다. 기존 요청은 이미 발송이 시작됐거나 답변을 처리 중이어서 지금 취소하거나 교체할 수 없습니다.`;
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "unchanged",
    summary: cancelable
      ? "기존 후보자 요청 확인·교체 여부 확인 필요"
      : "기존 후보자 요청 진행 중",
  });
  return {
    existingRequest: existing
      ? {
          cancelable,
          kind: text(existing.label),
          requestId: text(existing.requestId),
          roleName: existingRoleName,
          scheduledAt: text(existing.scheduledAt),
          status: existingStatus,
          topic: existingTopic,
        }
      : null,
    instruction: cancelable
      ? "No new request was queued. Explain the existing request for this company, role, and candidate, then ask whether to cancel it and replace it with the newly requested question. Do not claim cancellation or replacement before the company confirms."
      : "No new request was queued. Explain that another unresolved request already exists and cannot currently be cancelled or replaced. Do not reveal another workspace or its request details.",
    newRequestQueued: false,
    requested: {
      kind: args.kind,
      roleName: args.roleName,
      topic: args.requestContext,
    },
    status: "already_pending",
    userMessage: args.state.terminalReply,
  };
}

export function getOrgAgentToolStatusLabel(args: {
  name: OrgAgentToolName;
  status: "done" | "error" | "running";
}) {
  const labels: Record<OrgAgentToolName, [string, string, string]> = {
    web_search: [
      "웹에서 확인하는 중",
      "웹 검색 완료",
      "웹 검색을 완료하지 못했습니다",
    ],
    open_url: [
      "링크를 읽는 중",
      "링크 확인 완료",
      "링크를 읽지 못했습니다",
    ],
    get_talents: [
      "후보자를 찾는 중",
      "후보자 검색 완료",
      "후보자를 찾지 못했습니다",
    ],
    read_role: [
      "포지션과 진행 현황을 읽는 중",
      "포지션 확인 완료",
      "포지션을 읽지 못했습니다",
    ],
    read_talent: [
      "후보자와 진행 현황을 읽는 중",
      "후보자 확인 완료",
      "후보자를 읽지 못했습니다",
    ],
    get_more_data: [
      "추가 회사 정보를 읽는 중",
      "추가 회사 정보 확인 완료",
      "추가 회사 정보를 읽지 못했습니다",
    ],
    read_conversation_history: [
      "이전 대화를 읽는 중",
      "이전 대화 확인 완료",
      "이전 대화를 읽지 못했습니다",
    ],
    update_data: [
      "요청하신 변경을 확인하는 중",
      "변경 요청 확인 완료",
      "변경 요청을 처리하지 못했습니다",
    ],
    change_role_status: [
      "역할 상태를 변경하는 중",
      "역할 상태 변경 완료",
      "역할 상태를 변경하지 못했습니다",
    ],
    contact_talent: [
      "후보자 요청을 준비하는 중",
      "후보자 요청 준비 완료",
      "후보자 요청을 준비하지 못했습니다",
    ],
    change_talent_contact: [
      "후보자 요청 변경을 확인하는 중",
      "후보자 요청 변경 완료",
      "후보자 요청을 변경하지 못했습니다",
    ],
    prepare_candidate_connection: [
      "후보자 연결 결정 정보를 확인하는 중",
      "후보자 연결 결정 정보 확인 완료",
      "후보자 연결 결정 정보를 확인하지 못했습니다",
    ],
    decide_candidate_connection: [
      "후보자 연결 결정을 반영하는 중",
      "후보자 연결 결정 반영 완료",
      "후보자 연결 결정을 반영하지 못했습니다",
    ],
  };
  const index = args.status === "running" ? 0 : args.status === "done" ? 1 : 2;
  return labels[args.name][index];
}

async function executeGetTalents(args: {
  admin: OrgAgentAdminClient;
  audience: OrgAgentReadAudience;
  input: Record<string, unknown>;
  user: User;
  workspaceId: string;
}) {
  return getOrgAgentTalents({
    admin: args.admin,
    audience: args.audience,
    limit: boundedInteger(args.input.limit, 10, 1, 20),
    offset: boundedInteger(args.input.offset, 0, 0, 200),
    query: requiredText(args.input.query, "query", 200),
    roleId: text(args.input.roleId) || null,
    searchProfile: booleanField(args.input, "searchProfile", false),
    user: args.user,
    workspaceId: args.workspaceId,
  });
}

async function executeReadTalent(args: {
  admin: OrgAgentAdminClient;
  audience: OrgAgentReadAudience;
  input: Record<string, unknown>;
  user: User;
  workspaceId: string;
}) {
  const talentIds = parseReadTalentIds(args.input);
  return readOrgAgentTalents({
    admin: args.admin,
    audience: args.audience,
    includeProfile: booleanField(args.input, "includeProfile", false),
    progressLimit: boundedInteger(args.input.progressLimit, 10, 1, 30),
    roleId: text(args.input.roleId) || null,
    talentIds,
    user: args.user,
    workspaceId: args.workspaceId,
  });
}

async function executeReadRole(args: {
  admin: OrgAgentAdminClient;
  audience: OrgAgentReadAudience;
  input: Record<string, unknown>;
  state: OrgAgentToolExecutionState;
  user: User;
  workspaceId: string;
}) {
  const roleId = text(args.input.roleId) || null;
  const exactTitle = text(args.input.exactTitle) || null;
  if (Boolean(roleId) === Boolean(exactTitle)) {
    throw new OrgAgentToolInputError(
      "Provide exactly one of roleId or exactTitle"
    );
  }
  if (roleId && !args.state.roleById.has(roleId)) {
    throw new OrgAgentToolInputError("Role not found in this workspace");
  }
  const allowedIncludes = [
    "criteria",
    "memory",
    "pipeline",
    "description",
  ] as const;
  const include = Array.isArray(args.input.include)
    ? Array.from(new Set(args.input.include.map(text).filter(Boolean)))
    : [];
  if (include.some((value) => !allowedIncludes.includes(value as any))) {
    throw new OrgAgentToolInputError(
      `include must contain only: ${allowedIncludes.join(", ")}`
    );
  }
  const result = await readOrgAgentRole({
    admin: args.admin,
    audience: args.audience,
    exactTitle,
    include: include as Array<(typeof allowedIncludes)[number]>,
    peopleLimit: boundedInteger(args.input.peopleLimit, 10, 1, 20),
    peopleOffset: boundedInteger(args.input.peopleOffset, 0, 0, 200),
    recentUpdateLimit: boundedInteger(args.input.recentUpdateLimit, 10, 0, 20),
    roleId,
    stage: text(args.input.stage) || null,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  // A read and a write can appear in the same parallel tool-call batch. The
  // model has not seen this result yet, so chat.ts promotes this ID only after
  // the whole batch finishes and before the next completion.
  if (!result.role?.roleId) return result;
  const resolvedRoleId = result.role.roleId;
  if (result.fieldCompleteness.role_request.complete) {
    args.state.pendingFullRoleRequestIds.add(resolvedRoleId);
    markOrgAgentLongTextComplete({
      key: "role_request",
      observedValue: result.role?.request ?? null,
      roleId: resolvedRoleId,
      state: args.state,
    });
  }
  if (result.fieldCompleteness.role_memory.complete) {
    markOrgAgentLongTextComplete({
      key: "role_memory",
      observedValue: result.memory?.content ?? null,
      roleId: resolvedRoleId,
      state: args.state,
    });
  }
  if (result.fieldCompleteness.role_description.complete) {
    markOrgAgentLongTextComplete({
      key: "role_description",
      observedValue: result.role?.description ?? null,
      roleId: resolvedRoleId,
      state: args.state,
    });
  }
  return result;
}

async function executeReadConversationHistory(args: {
  admin: OrgAgentAdminClient;
  conversation: OrgAgentConversationRow;
  currentUserMessageId: number;
  input: Record<string, unknown>;
  slackThreadId: string | null;
}): Promise<Record<string, unknown>> {
  const scope = text(args.input.scope) as OrgAgentConversationHistoryScope;
  if (scope !== "current_thread" && scope !== "workspace") {
    throw new OrgAgentToolInputError(
      "scope must be current_thread or workspace"
    );
  }
  const cursor = text(args.input.cursor) || null;
  if (cursor && cursor.length > 500) {
    throw new OrgAgentToolInputError("cursor exceeds 500 characters");
  }
  if (scope === "current_thread" && !cursor) {
    throw new OrgAgentToolInputError(
      "current_thread requires the exact next_cursor from recent_conversation or the previous result"
    );
  }
  try {
    return (await fetchOrgAgentConversationHistory({
      admin: args.admin,
      conversationId: args.conversation.id,
      currentSlackThreadId: args.slackThreadId,
      currentUserMessageId: args.currentUserMessageId,
      cursor,
      limit: boundedInteger(args.input.limit, 20, 1, 30),
      scope,
      workspaceId: args.conversation.company_workspace_id,
    })) as unknown as Record<string, unknown>;
  } catch (error) {
    if (error instanceof OrgAgentConversationHistoryCursorError) {
      throw new OrgAgentToolInputError(error.message);
    }
    throw error;
  }
}

function moreDataKinds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new OrgAgentToolInputError("kinds must be an array");
  }
  const allowed = ["members", "company_details", "workspace_memory"] as const;
  const kinds = Array.from(new Set(value.map(text).filter(Boolean)));
  if (
    kinds.length < 1 ||
    kinds.length > 3 ||
    kinds.some((kind) => !allowed.includes(kind as any))
  ) {
    throw new OrgAgentToolInputError(
      `kinds must contain 1-3 of: ${allowed.join(", ")}`
    );
  }
  return kinds as Array<(typeof allowed)[number]>;
}

function moreDataFullTextKeys(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new OrgAgentToolInputError("fullTextKeys must be an array");
  }
  const keys = Array.from(new Set(value.map(text).filter(Boolean)));
  if (
    keys.length > COMPANY_DETAILS_LONG_TEXT_KEYS.length ||
    keys.some((key) => !isCompanyDetailsLongTextKey(key))
  ) {
    throw new OrgAgentToolInputError(
      `fullTextKeys accepts only: ${COMPANY_DETAILS_LONG_TEXT_KEYS.join(", ")}`
    );
  }
  return keys.filter(isCompanyDetailsLongTextKey);
}

async function executeGetMoreData(args: {
  admin: OrgAgentAdminClient;
  currentUserMessageId: number;
  input: Record<string, unknown>;
  scopeKey: string;
  state: OrgAgentToolExecutionState;
  workspaceId: string;
}) {
  const kinds = moreDataKinds(args.input.kinds);
  const fullTextKeys = moreDataFullTextKeys(args.input.fullTextKeys);
  if (fullTextKeys.length > 0 && !kinds.includes("company_details")) {
    throw new OrgAgentToolInputError(
      "fullTextKeys requires company_details in kinds"
    );
  }
  const result = await getOrgAgentMoreData({
    admin: args.admin,
    fullTextKeys,
    kinds,
    workspaceId: args.workspaceId,
  });

  if (result.companyDetails) {
    for (const [key, marker] of Object.entries(result.companyDetails.fields)) {
      if (isCompanyDetailsLongTextKey(key) && marker.complete) {
        markOrgAgentLongTextComplete({
          key,
          observedValue: result.companyDetails.values[key] ?? null,
          state: args.state,
        });
      }
    }
  }
  if (result.workspaceMemory?.complete) {
    markOrgAgentLongTextComplete({
      key: "workspace_memory",
      observedValue: result.workspaceMemory.content ?? null,
      state: args.state,
    });
  }
  const activatedAt = new Date().toISOString();
  for (const kind of kinds) {
    args.state.activatedMoreData = args.state.activatedMoreData.filter(
      (activation) => activation.kind !== kind
    );
    args.state.activatedMoreData.push({
      activatedAt,
      activatedByUserMessageId: args.currentUserMessageId,
      fullTextKeys: kind === "company_details" ? fullTextKeys : [],
      kind,
      scopeKey: args.scopeKey,
    });
  }
  // Return the structured value so the shared serializer can preserve
  // completeness markers. Retention is recorded separately in message
  // metadata and does not need to be repeated in the model payload.
  return result;
}

function asRpcResult(value: unknown) {
  return record(value);
}

async function executeProposalAction(args: {
  admin: OrgAgentAdminClient;
  callId: string;
  currentUserMessageId: number;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  scopeKey: string;
  state: OrgAgentToolExecutionState;
  workspaceId: string;
}) {
  const proposalId = requiredText(args.input.proposalId, "proposalId", 100);
  const action = requiredText(args.input.proposalAction, "proposalAction", 20);
  if (action !== "apply" && action !== "reject" && action !== "preview") {
    throw new OrgAgentToolInputError(
      "proposalAction must be apply, reject, or preview"
    );
  }
  const { data, error } = await (args.admin.rpc as any)(
    "resolve_company_agent_update_proposal_v1",
    {
      p_action: action,
      p_current_user_message_id: args.currentUserMessageId,
      p_proposal_id: proposalId,
      p_scope_key: args.scopeKey,
      p_workspace_id: args.workspaceId,
    }
  );
  if (error) throw error;
  const result = asRpcResult(data);
  const status = text(result.status) || "not_found";
  if (status === "preview" || status === "needs_repreview") {
    args.state.updateProposalRef = {
      proposalId,
      summary: text(result.summary) || "확인 대기 중인 변경",
    };
    args.state.requiredPresentationText =
      text(result.presentation_text) || text(result.preview) || null;
  }
  if (status === "applied") {
    const summary = text(result.summary) || "확인한 변경 반영";
    args.state.terminalReply = `반영했습니다. ${summary}`;
    args.state.updateSummaries.push(summary);
    args.state.actions.push({
      id: crypto.randomUUID(),
      kind: "entity_updated",
      label: "회사 정보 업데이트됨",
      payload: { changeSummary: summary, scope: "company" },
    });
  }
  if (status === "rejected") {
    args.state.terminalReply = "알겠습니다. 변경안은 적용하지 않았습니다.";
  } else if (status === "preview" || status === "needs_repreview") {
    args.state.terminalReply =
      text(result.presentation_text) ||
      text(result.preview) ||
      "확인 대기 중인 변경안을 다시 보여드릴게요.";
  } else if (status === "expired") {
    args.state.terminalReply =
      "변경안의 확인 시간이 지나 적용하지 않았습니다. 원하시면 현재 내용을 다시 확인해 새 변경안을 만들게요.";
  } else if (status === "stale") {
    args.state.terminalReply =
      "그 사이 정보가 바뀌어 이전 변경안은 적용하지 않았습니다. 최신 내용을 다시 확인해 주세요.";
  } else if (status === "not_found") {
    args.state.terminalReply =
      "확인 대기 중인 변경안을 찾지 못했습니다. 변경 내용을 다시 말씀해 주세요.";
  }
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status:
      status === "applied" || status === "rejected" || status === "preview"
        ? "success"
        : "unchanged",
    summary: text(result.summary) || `변경안 ${status}`,
  });
  return result;
}

async function fetchBaseProposal(args: {
  admin: OrgAgentAdminClient;
  proposalId: string;
  scopeKey: string;
  workspaceId: string;
}) {
  const { data, error } = await (
    args.admin.from("company_agent_update_proposals" as any) as any
  )
    .select("id, status, scope_key, payload, preview, summary, expires_at")
    .eq("id", args.proposalId)
    .eq("workspace_id", args.workspaceId)
    .maybeSingle();
  if (error) throw error;
  const row = data ? record(data) : null;
  if (
    !row ||
    row.status !== "pending" ||
    text(row.scope_key) !== args.scopeKey ||
    new Date(text(row.expires_at)).getTime() <= Date.now()
  ) {
    throw new OrgAgentToolInputError(
      "baseProposalId must identify the active pending proposal in this conversation"
    );
  }
  const payload = record(row.payload);
  const changes = Array.isArray(payload.changes)
    ? (payload.changes.map(record) as unknown as ResolvedCompanyDataChange[])
    : [];
  if (changes.length === 0) {
    throw new OrgAgentToolInputError(
      "The base proposal has no reusable changes"
    );
  }
  if (changes.some((change) => !text(change.preview))) {
    throw new OrgAgentToolInputError(
      "This older pending proposal cannot be revised safely. Reject it and create a new proposal."
    );
  }
  return {
    changes,
    preview: text(row.preview),
    summary: text(row.summary),
  };
}

async function executeUpdateData(args: {
  actorLabel: string;
  admin: OrgAgentAdminClient;
  callId: string;
  currentUserMessageId: number;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  scopeKey: string;
  source: "chat" | "slack";
  state: OrgAgentToolExecutionState;
  workspaceId: string;
}) {
  if (args.state.terminalMutationUsed) {
    throw new OrgAgentToolInputError(
      "update_data may be called only once per user turn"
    );
  }
  const mode = resolveOrgAgentUpdateDataMode(args.input);
  args.state.terminalMutationUsed = true;
  if (mode === "proposal") {
    return executeProposalAction(args);
  }

  const parsed = parseCompanyDataChanges({
    changes: args.input.changes,
    summary: args.input.summary,
  });
  if (parsed.changes.some((change) => change.key === "role_status")) {
    throw new OrgAgentToolInputError(
      "Use change_role_status for Role lifecycle changes"
    );
  }
  const baseProposalId = text(args.input.baseProposalId) || null;
  let baseProposal: Awaited<ReturnType<typeof fetchBaseProposal>> | null = null;
  if (baseProposalId) {
    baseProposal = await fetchBaseProposal({
      admin: args.admin,
      proposalId: baseProposalId,
      scopeKey: args.scopeKey,
      workspaceId: args.workspaceId,
    });
  }
  const snapshot = await fetchCompanyDataSnapshot({
    admin: args.admin,
    changes: [
      ...parsed.changes,
      ...(baseProposal?.changes.map((change) => ({
        key: change.key,
        kind: "rewrite" as const,
        roleId: change.role_id,
        value: change.value,
      })) ?? []),
    ],
    workspaceId: args.workspaceId,
  });
  if (baseProposal) {
    assertCompanyDataProposalSnapshotUnchanged({
      changes: baseProposal.changes,
      snapshot,
    });
    for (const change of baseProposal.changes) {
      const target = companyDataTargetKey(change.key, change.role_id);
      const current = snapshot.get(target);
      if (!current) {
        throw new CompanyDataMutationError(
          "stale_base_proposal",
          "The pending proposal target is no longer available"
        );
      }
      snapshot.set(target, {
        ...current,
        ...(change.expected_physical
          ? { expected_physical: change.expected_physical }
          : { expected: change.expected ?? null }),
        value: change.value,
      });
    }
  }
  const resolved = resolveCompanyDataMutation({
    ...parsed,
    isComplete: (
      key: CompanyDataKey,
      roleId: string | null,
      currentValue: unknown
    ) =>
      isOrgAgentLongTextComplete({
        currentValue,
        key,
        roleId,
        state: args.state,
      }),
    snapshot,
  });
  let changes = resolved.changes;
  let preview = resolved.preview;
  let summary = resolved.summary;
  if (baseProposal) {
    const merged = mergeCompanyDataProposalRevision({
      baseChanges: baseProposal.changes,
      revisedChanges: changes,
      roleNamesById: Object.fromEntries(
        Array.from(args.state.roleById, ([roleId, role]) => [roleId, role.name])
      ),
    });
    changes = merged.changes;
    preview = merged.preview;
    summary = merged.summary;
    if (changes.length > 12) {
      throw new OrgAgentToolInputError(
        "The revised proposal would exceed the 12-change batch limit"
      );
    }
  }
  if (changes.length === 0) {
    args.state.terminalReply = "이미 같은 내용으로 반영되어 있습니다.";
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "unchanged",
      summary,
    });
    return { status: "already_reflected", summary };
  }
  const eventContent = buildCompanyAgentEventContent({
    actorLabel: args.actorLabel,
    summary,
  });
  if (resolved.confirmationRequired || baseProposal) {
    if (!baseProposalId && (await hasPendingOrgAgentUpdateProposal(args))) {
      args.state.terminalReply =
        "이미 확인을 기다리는 변경안이 있습니다. 그 변경안을 고칠지, 취소하고 새로 만들지 알려주세요.";
      return {
        status: "pending_proposal_exists",
        instruction:
          "Ask whether to revise the existing proposal or reject it before making a new one.",
      };
    }
    args.state.stagedProposal = {
      changes,
      eventContent,
      preview,
      summary,
    };
    args.state.terminalReply = `알겠습니다. ${summary} 내용을 아래와 같이 수정할까요?`;
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "success",
      summary: `${summary} 확인 대기`,
    });
    return {
      preview,
      status: "confirmation_required",
      summary,
    };
  }

  const { data, error } = await (args.admin.rpc as any)(
    "apply_company_data_changes_v1",
    {
      p_changes: changes,
      p_event_content: eventContent,
      p_source: args.source,
      p_workspace_id: args.workspaceId,
    }
  );
  if (error) throw error;
  const result = asRpcResult(data);
  const status = text(result.status);
  if (status === "conflict") {
    throw new OrgAgentToolInputError(
      "The data changed while this update was being prepared. Read it again before retrying."
    );
  }
  if (status === "updated") {
    args.state.terminalReply = `반영했습니다. ${summary}`;
    args.state.updateSummaries.push(summary);
    args.state.actions.push({
      id: crypto.randomUUID(),
      kind: "entity_updated",
      label: "회사 정보 업데이트됨",
      payload: {
        changeSummary: summary,
        scope: changes.some((change) => change.role_id === null)
          ? "company"
          : "role",
      },
    });
  }
  if (status === "already_reflected") {
    args.state.terminalReply = "이미 같은 내용으로 반영되어 있습니다.";
  }
  if (status !== "updated" && status !== "already_reflected") {
    throw new Error("Unexpected company data update result");
  }
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: status === "updated" ? "success" : "unchanged",
    summary,
  });
  return { ...result, summary };
}

async function executeChangeRoleStatus(args: {
  actorLabel: string;
  admin: OrgAgentAdminClient;
  callId: string;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  source: "chat" | "slack";
  state: OrgAgentToolExecutionState;
  workspaceId: string;
}) {
  if (args.state.terminalMutationUsed) {
    throw new OrgAgentToolInputError(
      "change_role_status may be called only once and must be the only tool in this turn"
    );
  }
  args.state.terminalMutationUsed = true;

  const role = roleOrThrow(args.state, args.input.roleId);
  const status = roleLifecycleStatus(args.input.status);
  const copy = ORG_AGENT_ROLE_STATUS_COPY[status];
  const summary = `${role.name} 역할 상태: ${copy.label}`;
  const parsed = parseCompanyDataChanges({
    changes: [
      {
        key: "role_status",
        kind: "rewrite",
        roleId: role.roleId,
        value: status,
      },
    ],
    summary,
  });
  const snapshot = await fetchCompanyDataSnapshot({
    admin: args.admin,
    changes: parsed.changes,
    workspaceId: args.workspaceId,
  });
  const resolved = resolveCompanyDataMutation({
    ...parsed,
    isComplete: () => true,
    snapshot,
  });

  if (resolved.changes.length === 0) {
    args.state.terminalReply = `${role.name} 역할은 이미 ${copy.label} 상태입니다. ${copy.effect}`;
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "unchanged",
      summary,
    });
    return {
      effect: copy.effect,
      roleName: role.name,
      roleStatus: status,
      status: "already_reflected",
      summary,
    };
  }

  const { data, error } = await (args.admin.rpc as any)(
    "apply_company_data_changes_v1",
    {
      p_changes: resolved.changes,
      p_event_content: buildCompanyAgentEventContent({
        actorLabel: args.actorLabel,
        summary,
      }),
      p_source: args.source,
      p_workspace_id: args.workspaceId,
    }
  );
  if (error) throw error;
  const result = asRpcResult(data);
  const resultStatus = text(result.status);
  if (resultStatus === "conflict") {
    throw new OrgAgentToolInputError(
      "The Role status changed while this update was being prepared. Read the Role again before retrying."
    );
  }
  if (resultStatus !== "updated" && resultStatus !== "already_reflected") {
    throw new Error("Unexpected Role status update result");
  }

  const changed = resultStatus === "updated";
  const currentRole = args.state.roleById.get(role.roleId);
  if (currentRole) {
    args.state.roleById.set(role.roleId, { ...currentRole, status });
  }
  args.state.terminalReply = changed
    ? `${role.name} 역할을 ${copy.label} 상태로 변경했습니다. ${copy.effect}`
    : `${role.name} 역할은 이미 ${copy.label} 상태입니다. ${copy.effect}`;
  if (changed) {
    args.state.updateSummaries.push(summary);
    args.state.actions.push({
      id: crypto.randomUUID(),
      kind: "entity_updated",
      label: "역할 상태 업데이트됨",
      payload: { changeSummary: summary, scope: "role" },
    });
  }
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: changed ? "success" : "unchanged",
    summary,
  });
  return {
    effect: copy.effect,
    roleName: role.name,
    roleStatus: status,
    status: resultStatus,
    summary,
  };
}

async function executeCompanyTalentRequest(args: {
  admin: OrgAgentAdminClient;
  callId: string;
  currentUserMessageId: number;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  slackThreadId: string | null;
  source: "chat" | "slack";
  state: OrgAgentToolExecutionState;
  user: User;
  workspaceId: string;
}) {
  if (args.state.terminalMutationUsed) {
    throw new OrgAgentToolInputError(
      `${args.name} may be called only once and must be the only tool in this turn`
    );
  }
  args.state.terminalMutationUsed = true;

  const kindValue = requiredText(args.input.kind, "kind", 20);
  if (kindValue !== "question" && kindValue !== "resume") {
    throw new OrgAgentToolInputError("kind must be question or resume");
  }
  const kind: "question" | "resume" = kindValue;
  const deliveryModeValue = text(args.input.deliveryMode) || "standard";
  if (deliveryModeValue !== "standard" && deliveryModeValue !== "immediate") {
    throw new OrgAgentToolInputError(
      "deliveryMode must be standard or immediate"
    );
  }
  const deliveryMode: "standard" | "immediate" = deliveryModeValue;
  const role = roleOrThrow(args.state, args.input.roleId);
  const talentId = requiredText(args.input.talentId, "talentId", 100);
  const requestContext =
    kind === "resume"
      ? `${role.name} 포지션 검토를 위한 최신 이력서 공유 가능 여부 확인`
      : requiredText(args.input.requestContext, "requestContext", 800);
  const talent = await readOrgAgentTalent({
    admin: args.admin,
    audience: "caller",
    includeProfile: false,
    roleId: role.roleId,
    talentId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const position = talent.positions.find(
    (item) => item.roleId === role.roleId && item.stage === "pending_connection"
  );
  if (!position) {
    throw new OrgAgentToolInputError(
      "후보자가 현재 이 포지션의 연결 대기 상태가 아니라 대신 연락할 수 없습니다."
    );
  }
  if (!text(talent.candidate.email)) {
    args.state.terminalReply =
      "현재 Harper가 후보자분께 연락할 수 있는 이메일을 확인하지 못해 대신 문의를 보내지 못했습니다. 후보자 상세의 프로필 정보를 먼저 확인해 주시고, 가능한 다른 연락 경로가 있다면 직접 연락해 주세요.";
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "error",
      summary: "후보자 연락 이메일 없음",
    });
    return {
      status: "contact_unavailable",
      userMessage: args.state.terminalReply,
    };
  }

  if (kind === "resume") {
    const { data: documents, error: documentError } = await (
      args.admin.from("talent_documents" as any) as any
    )
      .select("id, is_public")
      .eq("talent_id", talentId)
      .eq("kind", "resume")
      .eq("is_primary", true)
      .limit(1);
    if (documentError) throw documentError;
    const primary = documents?.[0] as
      | { id: string; is_public: boolean }
      | undefined;
    if (primary?.is_public) {
      throw new OrgAgentToolInputError(
        "이미 후보자 프로필에서 확인할 수 있는 이력서가 있습니다. 후보자 상세의 이력서를 안내해 주세요."
      );
    }
  }

  const existingRequest = blockingCompanyTalentRequest(
    talent.requestHistory as BlockingCompanyTalentRequest[],
    role.roleId
  );
  if (existingRequest) {
    return existingCompanyTalentRequestResult({
      callId: args.callId,
      candidateName: text(talent.candidate.name),
      existingRequest,
      kind,
      name: args.name,
      requestContext,
      roleName: role.name,
      state: args.state,
    });
  }

  let request;
  try {
    request = await enqueueCompanyTalentRequest({
      admin: args.admin as any,
      deliveryMode,
      expectsDocument: kind === "resume",
      recommendationId: position.recommendationId,
      requestContext,
      roleId: role.roleId,
      sourceCompanyMessageId: args.currentUserMessageId,
      talentId,
      workspaceId: args.workspaceId,
    });
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error);
    const isExistingRequestConflict =
      message.includes("company_talent_request_already_active") ||
      message.includes(
        "company_talent_requests_workspace_role_talent_open_uidx"
      ) ||
      (message.includes("contact_queue_type_recommendation_uidx") &&
        String(
          error && typeof error === "object" && "code" in error
            ? error.code
            : ""
        ) === "23505");
    if (isExistingRequestConflict) {
      const refreshedTalent = await readOrgAgentTalent({
        admin: args.admin,
        audience: "caller",
        includeProfile: false,
        roleId: role.roleId,
        talentId,
        user: args.user,
        workspaceId: args.workspaceId,
      });
      const refreshedExistingRequest = blockingCompanyTalentRequest(
        refreshedTalent.requestHistory as BlockingCompanyTalentRequest[],
        role.roleId
      );
      const existingRequest =
        refreshedExistingRequest ??
        (await fetchBlockingCompanyTalentRequestForWorkspace({
          admin: args.admin as any,
          roleId: role.roleId,
          talentId,
          workspaceId: args.workspaceId,
        }));
      return existingCompanyTalentRequestResult({
        callId: args.callId,
        candidateName: text(refreshedTalent.candidate.name),
        existingRequest,
        kind,
        name: args.name,
        requestContext,
        roleName: role.name,
        state: args.state,
      });
    }
    throw error;
  }

  const deliveryCopy =
    deliveryMode === "immediate"
      ? "요청하신 대로 표준 20분 대기와 KST 발송 시간 제한을 건너뛰고, 발송 시스템이 가져가는 즉시 이메일과 Harper 채팅으로 한 번 전달합니다. 아직 후보자 전달 완료를 의미하지 않으며, 처리가 바로 시작되므로 취소 가능 시간이 없을 수 있습니다."
      : `${formatKstDateTime(request.candidateDeliveryScheduledAt)}에 이메일과 Harper 채팅으로 한 번 전달할 예정이며, 그전에는 취소할 수 있습니다.`;
  args.state.terminalReply =
    kind === "resume"
      ? `${text(talent.candidate.name) || "후보자분"}께 ${text(args.state.company.companyName) || "회사"}의 ${role.name} 포지션 검토를 위한 최신 이력서 공유 요청을 접수했습니다. ${deliveryCopy} 아직 업로드 완료를 의미하는 단계는 아닙니다. 후보자분이 이력서를 올리면 이 대화로 알려드리겠습니다. 답변이나 업로드는 선택이며, Harper가 자동으로 재촉하지는 않습니다.`
      : `${text(talent.candidate.name) || "후보자분"}께 ${text(args.state.company.companyName) || "회사"}에서 ${role.name} 포지션과 관련해 확인하는 질문이라는 점을 공개하고, “${requestContext}”라는 질문을 대신 전달하도록 접수했습니다. ${deliveryCopy} 아직 후보자 답변을 의미하는 단계는 아닙니다. 답이 오면 이 대화로 전달드리겠습니다. 답변은 후보자분의 선택이며, Harper가 자동으로 재촉하지는 않습니다.`;
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary:
      deliveryMode === "immediate"
        ? kind === "resume"
          ? "후보자 이력서 요청 즉시 발송"
          : "후보자 확인 요청 즉시 발송"
        : kind === "resume"
          ? "후보자 이력서 요청 대기열 생성"
          : "후보자 확인 요청 대기열 생성",
  });
  return {
    requestId: request.id,
    scheduledAt: request.candidateDeliveryScheduledAt,
    status: deliveryMode === "immediate" ? "immediate" : "queued",
    userMessage: args.state.terminalReply,
  };
}

async function executeChangeTalentContact(args: {
  admin: OrgAgentAdminClient;
  callId: string;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  state: OrgAgentToolExecutionState;
  user: User;
  workspaceId: string;
}) {
  if (args.state.terminalMutationUsed) {
    throw new OrgAgentToolInputError(
      `${args.name} may be called only once and must be the only tool in this turn`
    );
  }
  args.state.terminalMutationUsed = true;

  const action = requiredText(args.input.action, "action", 20);
  if (action !== "cancel" && action !== "immediate") {
    throw new OrgAgentToolInputError("action must be cancel or immediate");
  }
  const role = roleOrThrow(args.state, args.input.roleId);
  const talentId = requiredText(args.input.talentId, "talentId", 100);
  const requestId = requiredText(args.input.requestId, "requestId", 100);
  const talent = await readOrgAgentTalent({
    admin: args.admin,
    audience: "caller",
    includeProfile: false,
    roleId: role.roleId,
    talentId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const pendingRequest = talent.requestHistory.find(
    (item) => item.requestId === requestId
  );
  if (!pendingRequest) {
    throw new OrgAgentToolInputError(
      "이 후보자와 포지션에서 해당 문의 요청을 찾지 못했습니다. 최신 요청 이력을 다시 확인해 주세요."
    );
  }
  if (!pendingRequest.cancelable) {
    args.state.terminalReply =
      action === "cancel"
        ? "이 문의는 이미 발송 처리가 시작됐거나 종료되어 취소할 수 없습니다. 현재 상태를 다시 확인해 주세요."
        : "이 문의는 이미 발송 처리가 시작됐거나 종료되어 즉시 발송으로 변경할 수 없습니다. 현재 상태를 다시 확인해 주세요.";
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "error",
      summary:
        action === "cancel"
          ? "후보자 문의 취소 불가 상태"
          : "후보자 문의 즉시 발송 변경 불가 상태",
    });
    return {
      status: "not_changeable",
      userMessage: args.state.terminalReply,
    };
  }

  let changed: Awaited<ReturnType<typeof changeCompanyTalentRequest>>;
  try {
    changed = await changeCompanyTalentRequest({
      action,
      admin: args.admin as any,
      requestId,
      roleId: role.roleId,
      talentId,
      workspaceId: args.workspaceId,
    });
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error);
    if (
      message.includes("company_talent_request_not_cancellable") ||
      message.includes("company_talent_request_not_changeable")
    ) {
      args.state.terminalReply =
        action === "cancel"
          ? "확인하는 사이 발송 처리가 시작되어 이 문의는 취소하지 못했습니다. 현재 상태를 다시 확인해 주세요."
          : "확인하는 사이 발송 처리가 시작되어 이 문의를 즉시 발송으로 변경하지 못했습니다. 현재 상태를 다시 확인해 주세요.";
      recordResult(args.state, {
        callId: args.callId,
        name: args.name,
        status: "error",
        summary:
          action === "cancel"
            ? "후보자 문의 발송 시작으로 취소 실패"
            : "후보자 문의 발송 시작으로 즉시 변경 실패",
      });
      return {
        status: "not_changeable",
        userMessage: args.state.terminalReply,
      };
    }
    throw error;
  }

  if (action === "immediate") {
    args.state.terminalReply =
      pendingRequest.deliveryStatus === "failed"
        ? `${text(talent.candidate.name) || "후보자분"}께 드릴 ${role.name} 포지션 관련 문의를 같은 요청으로 즉시 재시도하도록 변경했습니다. 표준 20분 대기와 KST 08:00–20:00 발송 시간 제한을 적용하지 않고, 발송 시스템이 가져가는 대로 이메일과 Harper 채팅으로 전달합니다. 아직 후보자 전달 완료를 의미하는 단계는 아닙니다. 실패 상태는 외부 전송 직후 기록만 실패한 경우도 포함할 수 있어 중복 전달 가능성이 있으며, 답이 오면 이 대화로 알려드리겠습니다.`
        : `${text(talent.candidate.name) || "후보자분"}께 드릴 ${role.name} 포지션 관련 문의를 즉시 발송하도록 변경했습니다. 표준 20분 대기와 KST 08:00–20:00 발송 시간 제한을 적용하지 않고, 발송 시스템이 가져가는 대로 이메일과 Harper 채팅으로 전달합니다. 아직 후보자 전달 완료를 의미하는 단계는 아니며, 답이 오면 이 대화로 알려드리겠습니다.`;
  } else {
    args.state.terminalReply =
      pendingRequest.deliveryStatus === "failed"
        ? `${text(talent.candidate.name) || "후보자분"}께 보낸 ${role.name} 포지션 관련 문의의 남은 발송 처리를 종료했습니다. 이 요청으로 추가 이메일이나 Harper 채팅을 보내지 않습니다. 다만 실패 상태는 외부 전송 직후 기록만 실패한 경우도 포함할 수 있어, 이전 전달 여부는 발송 기록을 별도로 확인해야 합니다.`
        : `${text(talent.candidate.name) || "후보자분"}께 보낼 예정이던 ${role.name} 포지션 관련 문의를 취소했습니다. 후보자에게 이메일이나 Harper 채팅으로 전달되지 않습니다.`;
  }
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary:
      action === "cancel"
        ? "후보자 문의 발송 취소"
        : "후보자 문의 즉시 발송 변경",
  });
  return {
    requestId,
    scheduledAt: changed.status === "immediate" ? changed.scheduledAt : null,
    status: changed.status,
    userMessage: args.state.terminalReply,
  };
}

async function readPendingCandidateDecisionTarget(args: {
  admin: OrgAgentAdminClient;
  roleId: string;
  talentId: string;
  user: User;
  workspaceId: string;
}) {
  const talent = await readOrgAgentTalent({
    admin: args.admin,
    audience: "caller",
    includeProfile: false,
    roleId: args.roleId,
    talentId: args.talentId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const pendingPositions = talent.positions.filter(
    (position) =>
      position.roleId === args.roleId && position.stage === "pending_connection"
  );
  if (pendingPositions.length === 0) {
    throw new OrgAgentToolInputError(
      "후보자가 현재 이 포지션의 연결 대기 상태가 아니라 수락하거나 거절할 수 없습니다."
    );
  }
  if (pendingPositions.length > 1) {
    throw new OrgAgentToolInputError(
      "이 후보자와 포지션에 연결 대기 항목이 여러 개 있어 안전하게 결정할 수 없습니다. 후보자 화면에서 처리해 주세요."
    );
  }
  return { position: pendingPositions[0], talent };
}

function stageCandidateDecisionContext(args: {
  actorId: string;
  connectionMethod: OrgAgentCandidateConnectionMethod | null;
  decision: OrgAgentCandidateDecision;
  introEmails: string[];
  reason: string | null;
  recommendationId: string;
  roleId: string;
  slackThreadId: string | null;
  state: OrgAgentToolExecutionState;
  talentId: string;
}) {
  const context: OrgAgentCandidateDecisionConfirmation = {
    actorId: args.actorId,
    connectionMethod: args.connectionMethod,
    decision: args.decision,
    introEmails: args.introEmails,
    reason: args.reason,
    recommendationId: args.recommendationId,
    roleId: args.roleId,
    slackThreadId: args.slackThreadId,
    talentId: args.talentId,
  };
  args.state.candidateConnectionConfirmations.push(context);
  return context;
}

async function executePrepareCandidateConnection(args: {
  actorId: string;
  admin: OrgAgentAdminClient;
  callId: string;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  slackThreadId: string | null;
  state: OrgAgentToolExecutionState;
  user: User;
  workspaceId: string;
}) {
  const current = roleOrThrow(args.state, args.input.roleId);
  const talentId = requiredText(args.input.talentId, "talentId", 100);
  const decision = candidateDecision(args.input.decision);
  const connectionMethod = candidateConnectionMethod(
    args.input.connectionMethod
  );
  const reason = nullableTextField(args.input, "reason", 2_000);
  if (decision === "decline" && connectionMethod) {
    throw new OrgAgentToolInputError(
      "connectionMethod can only be used with an accept decision"
    );
  }
  if (decision === "decline" && has(args.input, "introEmails")) {
    throw new OrgAgentToolInputError(
      "introEmails can only be used with an accept decision"
    );
  }
  if (!connectionMethod && has(args.input, "introEmails")) {
    throw new OrgAgentToolInputError(
      "introEmails requires connectionMethod intro_email"
    );
  }
  if (connectionMethod === "direct_contact" && has(args.input, "introEmails")) {
    throw new OrgAgentToolInputError(
      "introEmails can only be used with connectionMethod intro_email"
    );
  }

  const { position, talent } = await readPendingCandidateDecisionTarget({
    admin: args.admin,
    roleId: current.roleId,
    talentId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const requesterEmail = text(args.user.email).toLowerCase() || null;
  const suppliedIntroEmails = has(args.input, "introEmails")
    ? emailArray(args.input.introEmails, 10)
    : [];
  const introEmails =
    connectionMethod === "intro_email"
      ? suppliedIntroEmails.length > 0
        ? suppliedIntroEmails
        : requesterEmail
          ? [requesterEmail]
          : []
      : [];
  stageCandidateDecisionContext({
    actorId: args.actorId,
    connectionMethod,
    decision,
    introEmails,
    reason: reason.present ? reason.value : null,
    recommendationId: position.recommendationId,
    roleId: current.roleId,
    slackThreadId: args.slackThreadId,
    state: args.state,
    talentId,
  });
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary:
      decision === "accept"
        ? "후보자 연결 수락 판단 컨텍스트 조회"
        : "후보자 연결 거절 판단 컨텍스트 조회",
  });
  return {
    candidateEmail: talent.candidate.email,
    candidateName: talent.candidate.name,
    connectionMethod,
    decision,
    directContactAvailable: decision === "accept",
    introEmailAvailable:
      decision === "accept" &&
      Boolean(text(talent.candidate.email)) &&
      Boolean(introEmails.length > 0 || requesterEmail),
    introEmails,
    reason: reason.present ? reason.value : null,
    requesterEmail,
    status: "decision_context_ready",
  };
}

async function executeCandidateConnectionDecision(args: {
  admin: OrgAgentAdminClient;
  callId: string;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  state: OrgAgentToolExecutionState;
  user: User;
  workspaceId: string;
}) {
  args.state.terminalMutationUsed = true;
  const current = roleOrThrow(args.state, args.input.roleId);
  const decision = candidateDecision(args.input.decision);
  const talentId = requiredText(args.input.talentId, "talentId", 100);
  const reason = nullableTextField(args.input, "reason", 2_000);
  const requestedConnectionMethod = candidateConnectionMethod(
    args.input.connectionMethod
  );
  if (decision === "decline" && requestedConnectionMethod) {
    throw new OrgAgentToolInputError(
      "connectionMethod can only be used with an accept decision"
    );
  }
  if (decision === "decline" && has(args.input, "introEmails")) {
    throw new OrgAgentToolInputError(
      "introEmails can only be used with an accept decision"
    );
  }
  if (
    requestedConnectionMethod === "direct_contact" &&
    has(args.input, "introEmails")
  ) {
    throw new OrgAgentToolInputError(
      "introEmails can only be used with connectionMethod intro_email"
    );
  }
  if (!requestedConnectionMethod && has(args.input, "introEmails")) {
    throw new OrgAgentToolInputError(
      "introEmails requires connectionMethod intro_email"
    );
  }
  const suppliedIntroEmails = has(args.input, "introEmails")
    ? emailArray(args.input.introEmails, 10)
    : null;
  const requesterEmail = text(args.user.email).toLowerCase();
  const { position, talent } = await readPendingCandidateDecisionTarget({
    admin: args.admin,
    roleId: current.roleId,
    talentId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const connectionMethod =
    decision === "accept" ? requestedConnectionMethod : null;
  const finalReason = reason.present ? reason.value : null;
  if (decision === "decline") {
    const result = await setOrgCandidateStage({
      expectedPreviousStage: "pending_connection",
      recommendationId: position.recommendationId,
      roleId: current.roleId,
      stage: "process_stopped",
      stopNote: finalReason,
      talentId,
      user: args.user,
      workspaceId: args.workspaceId,
    });
    const changeSummary = "연결 대기 후보자의 프로세스를 중단했습니다.";
    args.state.updateSummaries.push(changeSummary);
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "success",
      summary: changeSummary,
    });
    return {
      changeSummary,
      decision,
      roleId: result.roleId,
      stage: result.stage,
      status: "updated",
      talentId: result.talentId,
    };
  }

  if (!connectionMethod) {
    throw new OrgAgentToolInputError(
      "The user must choose CC introduction or direct contact before accepting"
    );
  }
  const introEmails =
    connectionMethod === "intro_email"
      ? suppliedIntroEmails?.length
        ? suppliedIntroEmails
        : requesterEmail
          ? [requesterEmail]
          : []
      : null;
  if (connectionMethod === "intro_email" && !text(talent.candidate.email)) {
    throw new OrgAgentToolInputError(
      "후보자 이메일이 없어 CC 연결 메일을 보낼 수 없습니다. 직접 연락을 선택해 주세요."
    );
  }
  if (connectionMethod === "intro_email" && !introEmails?.length) {
    throw new OrgAgentToolInputError(
      "A requester or company recipient email is needed for a warm introduction"
    );
  }

  const result = await setOrgCandidateStage({
    acceptReason: finalReason,
    contactDirectly: connectionMethod === "direct_contact",
    expectedPreviousStage: "pending_connection",
    introEmails,
    recommendationId: position.recommendationId,
    roleId: current.roleId,
    stage: "connected",
    talentId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const changeSummary =
    connectionMethod === "intro_email"
      ? "연결 대기 후보자에게 소개 메일을 보내 연결을 시작했습니다."
      : "연결 대기 후보자를 연결됨으로 옮겼습니다. 회사에서 직접 연락해야 합니다.";
  args.state.updateSummaries.push(changeSummary);
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary: changeSummary,
  });
  return {
    changeSummary,
    connectionMethod,
    decision,
    roleId: result.roleId,
    stage: result.stage,
    status: "updated",
    talentId: result.talentId,
  };
}

/**
 * Executes one validated model tool call. This is the only bridge between
 * function-calling and application services.
 */
export async function executeOrgAgentTool(args: {
  actorId: string;
  actorLabel: string;
  admin: OrgAgentAdminClient;
  audience: OrgAgentReadAudience;
  callId: string;
  conversation: OrgAgentConversationRow;
  currentUserMessageId: number;
  input: unknown;
  name: OrgAgentToolName;
  scopeKey: string;
  slackThreadId: string | null;
  source: "chat" | "slack";
  state: OrgAgentToolExecutionState;
  user: User;
  userMessage?: string;
}): Promise<Record<string, unknown>> {
  assertOrgAgentToolAvailable(args.name);
  const input = record(args.input);
  const workspaceId = args.conversation.company_workspace_id;
  let result: Record<string, unknown>;

  if (args.name === "web_search") {
    result = await executeSharedWebSearch(input);
  } else if (args.name === "open_url") {
    result = (await executeSharedOpenUrl({
      admin: args.admin as unknown as TalentAdminClient,
      enableLinkedinApify: true,
      input,
    })) as Record<string, unknown>;
  } else if (args.name === "get_talents") {
    result = await executeGetTalents({
      admin: args.admin,
      audience: args.audience,
      input,
      user: args.user,
      workspaceId,
    });
  } else if (args.name === "read_talent") {
    result = await executeReadTalent({
      admin: args.admin,
      audience: args.audience,
      input,
      user: args.user,
      workspaceId,
    });
  } else if (args.name === "read_role") {
    result = await executeReadRole({
      admin: args.admin,
      audience: args.audience,
      input,
      state: args.state,
      user: args.user,
      workspaceId,
    });
  } else if (args.name === "get_more_data") {
    result = await executeGetMoreData({
      admin: args.admin,
      currentUserMessageId: args.currentUserMessageId,
      input,
      scopeKey: args.scopeKey,
      state: args.state,
      workspaceId,
    });
  } else if (args.name === "read_conversation_history") {
    result = await executeReadConversationHistory({
      admin: args.admin,
      conversation: args.conversation,
      currentUserMessageId: args.currentUserMessageId,
      input,
      slackThreadId: args.slackThreadId,
    });
  } else if (args.name === "update_data") {
    try {
      return await executeUpdateData({
        actorLabel: args.actorLabel,
        admin: args.admin,
        callId: args.callId,
        currentUserMessageId: args.currentUserMessageId,
        input,
        name: args.name,
        scopeKey: args.scopeKey,
        source: args.source,
        state: args.state,
        workspaceId,
      });
    } catch (error) {
      if (error instanceof CompanyDataMutationError) {
        throw new OrgAgentToolInputError(`${error.code}: ${error.message}`);
      }
      throw error;
    }
  } else if (args.name === "change_role_status") {
    try {
      return await executeChangeRoleStatus({
        actorLabel: args.actorLabel,
        admin: args.admin,
        callId: args.callId,
        input,
        name: args.name,
        source: args.source,
        state: args.state,
        workspaceId,
      });
    } catch (error) {
      if (error instanceof CompanyDataMutationError) {
        throw new OrgAgentToolInputError(`${error.code}: ${error.message}`);
      }
      throw error;
    }
  } else if (args.name === "contact_talent") {
    return executeCompanyTalentRequest({
      admin: args.admin,
      callId: args.callId,
      currentUserMessageId: args.currentUserMessageId,
      input,
      name: args.name,
      slackThreadId: args.slackThreadId,
      source: args.source,
      state: args.state,
      user: args.user,
      workspaceId,
    });
  } else if (args.name === "change_talent_contact") {
    return executeChangeTalentContact({
      admin: args.admin,
      callId: args.callId,
      input,
      name: args.name,
      state: args.state,
      user: args.user,
      workspaceId,
    });
  } else if (args.name === "prepare_candidate_connection") {
    return executePrepareCandidateConnection({
      actorId: args.actorId,
      admin: args.admin,
      callId: args.callId,
      input,
      name: args.name,
      slackThreadId: args.slackThreadId,
      state: args.state,
      user: args.user,
      workspaceId,
    });
  } else {
    return executeCandidateConnectionDecision({
      admin: args.admin,
      callId: args.callId,
      input,
      name: args.name,
      state: args.state,
      user: args.user,
      workspaceId,
    });
  }

  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary:
      args.name === "web_search"
        ? "웹 검색"
        : args.name === "open_url"
          ? "링크 조회"
          : args.name === "get_talents"
        ? "후보자 검색"
        : args.name === "read_talent"
          ? "후보자 상세 조회"
          : args.name === "read_role"
            ? "포지션 상세 조회"
            : args.name === "get_more_data"
              ? "추가 회사 정보 조회"
              : "이전 대화 조회",
  });
  return result;
}
