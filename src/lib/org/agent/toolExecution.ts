import type { User } from "@supabase/supabase-js";
import {
  getOrgAgentMoreData,
  getOrgAgentTalents,
  readOrgAgentRole,
  readOrgAgentTalent,
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
import { hasPendingOrgAgentUpdateProposal } from "@/lib/org/agent/proposals";
import type { OrgAgentToolName } from "@/lib/org/agent/tools";
import {
  assertOrgAgentToolAvailable,
  OrgAgentToolInputError,
} from "@/lib/org/agent/toolAvailability";
import type { OrgAgentReadAudience } from "@/lib/org/agent/types";
import {
  createOrgAgentToolExecutionState,
  isOrgAgentLongTextComplete,
  markOrgAgentLongTextComplete,
  promoteOrgAgentToolReadVisibility,
  type OrgAgentToolExecutionState,
  type OrgAgentToolResultMetadata,
} from "@/lib/org/agent/toolState";
import { setOrgCandidateStage } from "@/lib/org/server";
import { enqueueCompanyTalentRequest } from "@/lib/companyTalentRequests/server";

export { createOrgAgentToolExecutionState, promoteOrgAgentToolReadVisibility };
export { OrgAgentToolInputError };
export type { OrgAgentToolExecutionState };

function text(value: unknown) {
  return String(value ?? "").trim();
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
  const items = Array.from(new Set(value.map(text).filter(Boolean))).slice(
    0,
    maxItems
  );
  if (items.some((item) => item.length > 320)) {
    throw new OrgAgentToolInputError(
      "Each introduction email must be at most 320 characters"
    );
  }
  return items;
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

export function getOrgAgentToolStatusLabel(args: {
  name: OrgAgentToolName;
  status: "done" | "error" | "running";
}) {
  const labels: Record<OrgAgentToolName, [string, string, string]> = {
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
    update_data: [
      "요청하신 변경을 확인하는 중",
      "변경 요청 확인 완료",
      "변경 요청을 처리하지 못했습니다",
    ],
    contact_talent: [
      "후보자에게 확인 요청을 준비하는 중",
      "후보자 확인 요청 준비 완료",
      "후보자 확인 요청을 준비하지 못했습니다",
    ],
    request_talent_resume: [
      "이력서 요청을 준비하는 중",
      "이력서 요청 준비 완료",
      "이력서 요청을 준비하지 못했습니다",
    ],
    prepare_candidate_connection: [
      "후보자 연결 방식을 확인하는 중",
      "후보자 연결 확인 준비 완료",
      "후보자 연결 확인을 준비하지 못했습니다",
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
  return readOrgAgentTalent({
    admin: args.admin,
    audience: args.audience,
    includeProfile: booleanField(args.input, "includeProfile", false),
    progressLimit: boundedInteger(args.input.progressLimit, 10, 1, 30),
    roleId: text(args.input.roleId) || null,
    talentId: requiredText(args.input.talentId, "talentId", 100),
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

function proposalMode(input: Record<string, unknown>) {
  const hasChanges = has(input, "changes");
  const hasProposal = has(input, "proposalId") || has(input, "proposalAction");
  if (hasChanges === hasProposal) {
    throw new OrgAgentToolInputError(
      "Use exactly one update_data mode: changes, or proposalId with proposalAction"
    );
  }
  return hasChanges ? "changes" : "proposal";
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
  if (has(args.input, "summary") || has(args.input, "baseProposalId")) {
    throw new OrgAgentToolInputError(
      "proposal mode does not accept summary or baseProposalId"
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
  args.state.terminalMutationUsed = true;
  if (proposalMode(args.input) === "proposal") {
    return executeProposalAction(args);
  }

  const parsed = parseCompanyDataChanges({
    changes: args.input.changes,
    summary: args.input.summary,
  });
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

async function executeCompanyTalentRequest(args: {
  admin: OrgAgentAdminClient;
  callId: string;
  conversation: OrgAgentConversationRow;
  currentUserMessageId: number;
  input: Record<string, unknown>;
  mode: "document" | "text";
  name: OrgAgentToolName;
  slackThreadId: string | null;
  source: "chat" | "slack";
  state: OrgAgentToolExecutionState;
  user: User;
  userMessage: string;
  workspaceId: string;
}) {
  if (args.state.terminalMutationUsed) {
    throw new OrgAgentToolInputError(
      `${args.name} may be called only once and must be the only tool in this turn`
    );
  }
  args.state.terminalMutationUsed = true;

  const explicitRequestPattern =
    args.mode === "document"
      ? /물어봐|확인해|연락해|문의해|받아(?:줘|주세요|서)|요청해|그렇게\s*해|진행해|해줘|해주세요|ask|request|get\s+(?:it|the\s+resume)|go\s+ahead|please\s+do|yes\b/i
      : /물어봐|확인해|연락해|문의해|그렇게\s*해|진행해|해줘|해주세요|ask|check|contact|reach\s+out|go\s+ahead|please\s+do|yes\b/i;
  const { data: previousAssistant, error: previousAssistantError } = await (
    args.admin.from("company_messages" as any) as any
  )
    .select("content")
    .eq("conversation_id", args.conversation.id)
    .eq("role", "assistant")
    .lt("id", args.currentUserMessageId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousAssistantError) throw previousAssistantError;
  const previousText = text(previousAssistant?.content);
  const offeredBefore =
    args.mode === "document"
      ? /(?:프로필|profile)/i.test(previousText) &&
        /(?:이력서|resume)/i.test(previousText) &&
        /원하시면|필요하시면|그렇게\s*할까요|대신\s*(?:요청|확인|문의)|if\s+you(?:'d|\s+would)\s+like|shall\s+i|i\s+can\s+(?:ask|request)/i.test(
          previousText
        )
      : /원하시면|필요하시면|그렇게\s*할까요|대신\s*(?:연락|확인|문의)|if\s+you(?:'d|\s+would)\s+like|shall\s+i|i\s+can\s+(?:ask|check|contact)/i.test(
          previousText
        );
  if (!explicitRequestPattern.test(args.userMessage) || !offeredBefore) {
    args.state.terminalReply =
      args.mode === "document"
        ? "후보자 프로필의 경력과 등록 자료를 먼저 확인해 주세요. 현재 확인 가능한 내용만으로 부족하다면 제가 후보자분께 부담 없이 최신 이력서를 요청하고, 등록되면 이 대화로 알려드릴 수 있어요. 그렇게 할까요?"
        : "현재 확인된 정보만으로 확답하기 어렵다면 제가 후보자분께 부담 없게 한 번 확인하고, 답이 오면 이 대화로 전달드릴 수 있어요. 그렇게 할까요?";
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "error",
      summary: "후보자 연락 전 회사 확인 필요",
    });
    return {
      status: "confirmation_required",
      userMessage: args.state.terminalReply,
    };
  }
  const role = roleOrThrow(args.state, args.input.roleId);
  const talentId = requiredText(args.input.talentId, "talentId", 100);
  const requestContext =
    args.mode === "document"
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

  if (args.mode === "document") {
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

  let request;
  try {
    request = await enqueueCompanyTalentRequest({
      admin: args.admin as any,
      expectsDocument: args.mode === "document",
      recommendationId: position.recommendationId,
      requestContext,
      roleId: role.roleId,
      sourceCompanyMessageId: args.currentUserMessageId,
      talentId,
      workspaceId: args.workspaceId,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("company_talent_request_already_active")
    ) {
      throw new OrgAgentToolInputError(
        "이 후보자에게는 이미 답변을 기다리는 확인 요청이 있습니다. 다른 회사나 질문 내용은 공개할 수 없으며, 기존 요청이 끝난 뒤 다시 시도해 주세요."
      );
    }
    throw error;
  }

  args.state.terminalReply =
    args.mode === "document"
      ? "후보자분께 부담이 가지 않도록 이력서 공유를 한 번 요청할게요. 이메일과 Harper 채팅으로 전달하고, 업로드되면 이 대화로 알려드리겠습니다. 답변이나 업로드는 선택이라 오지 않을 수도 있어요."
      : "후보자분께 부담이 가지 않도록 한 번 확인을 요청할게요. 이메일과 Harper 채팅으로 전달하고, 답이 오면 이 대화로 알려드리겠습니다. 답변은 선택이라 오지 않을 수도 있어요.";
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary:
      args.mode === "document"
        ? "후보자 이력서 요청 대기열 생성"
        : "후보자 확인 요청 대기열 생성",
  });
  return {
    requestId: request.id,
    status: "queued",
    userMessage: args.state.terminalReply,
  };
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
  const recommendationId = requiredText(
    args.input.recommendationId,
    "recommendationId",
    100
  );
  const talent = await readOrgAgentTalent({
    admin: args.admin,
    audience: "caller",
    includeProfile: false,
    roleId: current.roleId,
    talentId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  if (
    !talent.positions.some(
      (position) => position.recommendationId === recommendationId
    )
  ) {
    throw new OrgAgentToolInputError(
      "recommendationId does not belong to this candidate and role"
    );
  }

  const confirmation = {
    actorId: args.actorId,
    recommendationId,
    roleId: current.roleId,
    slackThreadId: args.slackThreadId,
    talentId,
  };
  if (
    !args.state.candidateConnectionConfirmations.some(
      (item) =>
        item.actorId === confirmation.actorId &&
        item.recommendationId === confirmation.recommendationId &&
        item.roleId === confirmation.roleId &&
        item.slackThreadId === confirmation.slackThreadId &&
        item.talentId === confirmation.talentId
    )
  ) {
    args.state.candidateConnectionConfirmations.push(confirmation);
  }
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary: "후보자 연결 방식 확인 준비",
  });
  return {
    candidateEmail: talent.candidate.email,
    candidateName: talent.candidate.name,
    nextStep:
      "Explain the email recipients and connection choices, then ask for confirmation without changing the candidate yet.",
    requesterEmail: text(args.user.email).toLowerCase() || null,
    status: "ready_for_confirmation",
  };
}

async function hasPriorCandidateConnectionConfirmation(args: {
  actorId: string;
  admin: OrgAgentAdminClient;
  conversation: OrgAgentConversationRow;
  currentUserMessageId: number;
  recommendationId: string;
  roleId: string;
  slackThreadId: string | null;
  talentId: string;
}) {
  const { data, error } = await (
    args.admin.from("company_messages" as any) as any
  )
    .select("id, metadata, slack_thread_id")
    .eq("conversation_id", args.conversation.id)
    .eq("role", "assistant")
    .lt("id", args.currentUserMessageId)
    .order("id", { ascending: false })
    .limit(60);
  if (error) throw error;

  return (data ?? []).some((row: Record<string, unknown>) => {
    const rowThreadId = text(row.slack_thread_id) || null;
    if (rowThreadId !== args.slackThreadId) return false;
    const confirmations = record(row.metadata).candidateConnectionConfirmations;
    if (!Array.isArray(confirmations)) return false;
    return confirmations.some((value) => {
      const confirmation = record(value);
      return (
        text(confirmation.actorId) === args.actorId &&
        text(confirmation.recommendationId) === args.recommendationId &&
        text(confirmation.roleId) === args.roleId &&
        text(confirmation.talentId) === args.talentId &&
        (text(confirmation.slackThreadId) || null) === args.slackThreadId
      );
    });
  });
}

async function executeCandidateConnectionDecision(args: {
  actorId: string;
  admin: OrgAgentAdminClient;
  callId: string;
  conversation: OrgAgentConversationRow;
  currentUserMessageId: number;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  slackThreadId: string | null;
  state: OrgAgentToolExecutionState;
  user: User;
  workspaceId: string;
}) {
  const current = roleOrThrow(args.state, args.input.roleId);
  const decision = requiredText(args.input.decision, "decision", 20);
  if (decision !== "accept" && decision !== "decline") {
    throw new OrgAgentToolInputError("decision must be accept or decline");
  }
  const talentId = requiredText(args.input.talentId, "talentId", 100);
  const recommendationId = requiredText(
    args.input.recommendationId,
    "recommendationId",
    100
  );
  if (args.input.confirmed !== true) {
    throw new OrgAgentToolInputError(
      "The user must explicitly confirm the candidate connection decision first"
    );
  }
  const reason = nullableTextField(args.input, "reason", 2_000);

  if (decision === "decline") {
    const result = await setOrgCandidateStage({
      expectedPreviousStage: "pending_connection",
      recommendationId,
      roleId: current.roleId,
      stage: "process_stopped",
      stopNote: reason.present ? reason.value : null,
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

  const hasConfirmation = await hasPriorCandidateConnectionConfirmation({
    actorId: args.actorId,
    admin: args.admin,
    conversation: args.conversation,
    currentUserMessageId: args.currentUserMessageId,
    recommendationId,
    roleId: current.roleId,
    slackThreadId: args.slackThreadId,
    talentId,
  });
  if (!hasConfirmation) {
    throw new OrgAgentToolInputError(
      "The candidate connection must be explained and confirmed in a previous assistant reply before it can be sent"
    );
  }

  const connectionMethod = text(args.input.connectionMethod) || "intro_email";
  if (
    connectionMethod !== "intro_email" &&
    connectionMethod !== "direct_contact"
  ) {
    throw new OrgAgentToolInputError(
      "connectionMethod must be intro_email or direct_contact"
    );
  }
  if (connectionMethod === "direct_contact" && has(args.input, "introEmails")) {
    throw new OrgAgentToolInputError(
      "introEmails can only be used with connectionMethod intro_email"
    );
  }
  const requestedIntroEmails = has(args.input, "introEmails")
    ? emailArray(args.input.introEmails, 10)
    : [];
  const requesterEmail = text(args.user.email).toLowerCase();
  const introEmails =
    connectionMethod === "intro_email"
      ? requestedIntroEmails.length > 0
        ? requestedIntroEmails
        : requesterEmail
          ? [requesterEmail]
          : []
      : null;
  if (connectionMethod === "intro_email" && !introEmails?.length) {
    throw new OrgAgentToolInputError(
      "A requester or company recipient email is needed for a warm introduction"
    );
  }

  const result = await setOrgCandidateStage({
    acceptReason: reason.present ? reason.value : null,
    contactDirectly: connectionMethod === "direct_contact",
    expectedPreviousStage: "pending_connection",
    introEmails,
    recommendationId,
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

  if (args.name === "get_talents") {
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
    const sharedInformation = Array.isArray(result.harperSharedInformation)
      ? result.harperSharedInformation
      : [];
    args.state.preferenceDisclosure = {
      attempted: true,
      evidence: sharedInformation
        .map((item) => text(record(item).value))
        .filter(Boolean),
    };
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
  } else if (
    args.name === "contact_talent" ||
    args.name === "request_talent_resume"
  ) {
    return executeCompanyTalentRequest({
      admin: args.admin,
      callId: args.callId,
      conversation: args.conversation,
      currentUserMessageId: args.currentUserMessageId,
      input,
      mode: args.name === "contact_talent" ? "text" : "document",
      name: args.name,
      slackThreadId: args.slackThreadId,
      source: args.source,
      state: args.state,
      user: args.user,
      userMessage: text(args.userMessage),
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
      actorId: args.actorId,
      admin: args.admin,
      callId: args.callId,
      conversation: args.conversation,
      currentUserMessageId: args.currentUserMessageId,
      input,
      name: args.name,
      slackThreadId: args.slackThreadId,
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
      args.name === "get_talents"
        ? "후보자 검색"
        : args.name === "read_talent"
          ? "후보자 상세 조회"
          : args.name === "read_role"
            ? "포지션 상세 조회"
            : "추가 회사 정보 조회",
  });
  return result;
}
