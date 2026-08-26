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
  isCompanySideLlmDataKey,
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
  OrgAgentMeetingScheduleConfirmation,
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
import {
  createOrgRoleReviewStages,
  deleteEmptyOrgRoleReviewStage,
  setOrgCandidateStage,
  updateOrgRoleCriteria,
  updateOrgRoleReviewStage,
  updateOrgRole,
  type OrgStageId,
} from "@/lib/org/server";
import { canStopOrgCandidateProcess } from "@/lib/org/candidateDecision";
import { humanizeOrgStage } from "@/lib/org/pipelineStage";
import {
  getOrgRoleLifecycleUpdate,
  getOrgRoleStatusPresentation,
} from "@/lib/org/roleStatus";
import {
  applyOrgRoleCriteriaEdits,
  parseOrgRoleCriteria,
} from "@/lib/org/roleCriteria";
import {
  changeCompanyTalentRequest,
  createCompanyTalentContactDraft,
  createCompanyTalentResumeUploadToken,
  enqueueCompanyTalentRequest,
  fetchBlockingCompanyTalentRequestForWorkspace,
  fetchCompanyTalentContact,
  reviseCompanyTalentContactDraft,
  scheduleCompanyTalentContact,
} from "@/lib/companyTalentRequests/server";
import {
  generateCandidateContactDraft,
  reviseCandidateContactDraft,
} from "@/lib/companyTalentRequests/copy";
import { candidateContactDraftPresentation } from "@/lib/companyTalentRequests/presentation";
import { formatOrgAgentKstDateTime } from "@/lib/org/agent/dateTime";
import {
  executeSharedOpenUrl,
  executeSharedWebSearch,
} from "@/lib/agentTools/web";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  startSlackRoleCreation,
  type SlackRoleCreationExecutionContext,
} from "@/lib/org/agent/slackRoleCreation";
import {
  formatPreparedMeetingScheduleConfirmation,
  type PreparedMeetingScheduleDraft,
} from "@/lib/meetings/scheduleDraft";
import {
  createMeetingScheduleDraft,
  prepareMeetingScheduleDraft,
} from "@/lib/meetings/scheduleDraftServer";
import {
  buildOrgMeetingAvailabilityUrl,
  buildOrgMeetingScheduleUrl,
  formatSlackLink,
} from "@/lib/org/slackMessages";
import { jsonValuesEqual } from "@/lib/jsonValue";
import {
  formatMeetingAvailabilitySummary,
  MeetingAvailabilityValidationError,
} from "@/lib/meetings/availability";
import { applyMeetingAvailabilityEdits } from "@/lib/meetings/availabilityEdits";
import {
  fetchMeetingAvailability,
  saveMeetingAvailability,
} from "@/lib/meetings/availabilityServer";

export { createOrgAgentToolExecutionState, promoteOrgAgentToolReadVisibility };
export { OrgAgentToolInputError };
export type { OrgAgentToolExecutionState };

function text(value: unknown) {
  return String(value ?? "").trim();
}

function externalQueryKey(value: unknown) {
  return text(value).replace(/\s+/g, " ").toLocaleLowerCase();
}

function externalUrlKey(value: unknown) {
  return text(value);
}

function meetingAvailabilityActionLink(args: {
  source: "chat" | "slack";
  workspaceId: string;
}) {
  const url = buildOrgMeetingAvailabilityUrl(args.workspaceId);
  return args.source === "slack"
    ? formatSlackLink(url, "스케줄 열기")
    : `[스케줄 열기](${url})`;
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
  if (
    method !== "intro_email" &&
    method !== "direct_contact" &&
    method !== "schedule_interview"
  ) {
    throw new OrgAgentToolInputError(
      "connectionMethod must be intro_email, direct_contact, or schedule_interview"
    );
  }
  return method;
}

type OrgAgentRoleLifecycleStatus = "active" | "paused" | "ended" | "deleted";

const ORG_AGENT_ROLE_STATUS_COPY: Record<
  OrgAgentRoleLifecycleStatus,
  { effect: string; expectation: string; nextProcess: string }
> = {
  active: {
    effect: "Harper가 이 역할에 맞는 후보자를 계속 찾아 추천해요.",
    expectation:
      "역할의 기준과 팀의 선호도를 바탕으로 후보자를 살펴보고, 회사와 역할을 소개해 연결 의사를 확인한 분이 생기면 알려드릴게요.",
    nextProcess:
      "새 후보자가 추천되면 프로필과 Harper의 추천 이유를 검토한 뒤 연결을 수락할지 거절할지 알려 주세요.",
  },
  paused: {
    effect:
      "새 후보자 추천은 멈추지만, 기존 후보자와 진행 중인 연결은 그대로 유지해요.",
    expectation:
      "중단한 동안에는 새로운 추천이 오지 않으며, 이미 검토 중이거나 연결된 후보자는 현재 단계에서 계속 관리할 수 있어요.",
    nextProcess:
      "다시 채용을 시작하고 싶을 때 말씀해 주시면 같은 역할과 기준으로 매칭을 이어갈게요.",
  },
  ended: {
    effect:
      "새 후보자 추천은 멈추고 후보자 화면에는 역할이 종료된 것으로 표시돼요. 기존 후보자 단계와 회사 요청은 자동으로 종료되지 않아요.",
    expectation:
      "이미 검토 중이거나 연결된 후보자, 후보자에게 보낸 질문은 그대로 남기 때문에 필요한 결정은 각각 마무리해 주셔야 해요.",
    nextProcess:
      "남아 있는 후보자나 요청을 함께 정리하고 싶다면 말씀해 주세요. 현재 상태를 확인해 다음 결정을 도와드릴게요.",
  },
  deleted: {
    effect: "역할을 삭제하고 새 후보자 추천을 멈춰요.",
    expectation:
      "Roles와 후보자 기회 화면에서 더 이상 진행 중인 역할로 보이지 않아요. 기존 후보자 단계와 회사 요청은 자동으로 모두 종료되지 않아요.",
    nextProcess:
      "남아 있는 후보자나 요청이 있다면 각각의 실제 결과에 맞게 마무리해 주세요.",
  },
};

function roleLifecycleStatus(value: unknown): OrgAgentRoleLifecycleStatus {
  const status = requiredText(value, "status", 20);
  if (
    status !== "active" &&
    status !== "paused" &&
    status !== "ended" &&
    status !== "deleted"
  ) {
    throw new OrgAgentToolInputError(
      "status must be active, paused, ended, or deleted"
    );
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
  draftBody?: string | null;
  draftRevision?: number | null;
  draftSubject?: string | null;
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
    ? `${existingRoleName} 역할 관련${existingTopic ? ` “${existingTopic}”` : ""} 요청이 ${existingStatus} 상태로 남아 있어요.`
    : "이미 다른 확인 요청이 진행 중이에요.";
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
    start_role_creation: [
      "새 역할 작성 스레드를 여는 중",
      "새 역할 작성 스레드 준비 완료",
      "새 역할 작성 스레드를 열지 못했습니다",
    ],
    web_search: [
      "웹에서 확인하는 중",
      "웹 검색 완료",
      "웹 검색을 완료하지 못했습니다",
    ],
    open_url: ["링크를 읽는 중", "링크 확인 완료", "링크를 읽지 못했습니다"],
    get_talents: [
      "후보자를 찾는 중",
      "후보자 검색 완료",
      "후보자를 찾지 못했습니다",
    ],
    read_role: [
      "역할과 진행 현황을 읽는 중",
      "역할 확인 완료",
      "역할을 읽지 못했습니다",
    ],
    read_talent: [
      "후보자와 진행 현황을 읽는 중",
      "후보자 확인 완료",
      "후보자를 읽지 못했습니다",
    ],
    get_more_data: [
      "회사 정보를 읽는 중",
      "회사 정보 확인 완료",
      "회사 정보를 읽지 못했습니다",
    ],
    read_conversation_history: [
      "이전 대화를 읽는 중",
      "이전 대화 확인 완료",
      "이전 대화를 읽지 못했습니다",
    ],
    update_role_criteria: [
      "역할 평가 기준을 수정하는 중",
      "역할 평가 기준 수정 완료",
      "역할 평가 기준을 수정하지 못했습니다",
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
    manage_role_pipeline_stages: [
      "파이프라인 단계를 변경하는 중",
      "파이프라인 단계 변경 완료",
      "파이프라인 단계를 변경하지 못했습니다",
    ],
    contact_talent: [
      "후보자 요청을 준비하는 중",
      "후보자 요청 준비 완료",
      "후보자 요청을 준비하지 못했습니다",
    ],
    move_candidate_stage: [
      "후보자 파이프라인 단계를 변경하는 중",
      "후보자 파이프라인 단계 변경 완료",
      "후보자 파이프라인 단계를 변경하지 못했습니다",
    ],
    manage_interview_availability: [
      "인터뷰 가능 시간을 저장하는 중",
      "인터뷰 가능 시간 저장 완료",
      "인터뷰 가능 시간을 저장하지 못했습니다",
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
    args.state.terminalReply = `변경 내용을 저장했어요. ${summary}`;
    args.state.updateSummaries.push(summary);
    args.state.actions.push({
      id: crypto.randomUUID(),
      kind: "entity_updated",
      label: "변경 내용 저장 완료",
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

async function executeUpdateRoleCriteria(args: {
  actorLabel: string;
  callId: string;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  source: "chat" | "slack";
  state: OrgAgentToolExecutionState;
  user: User;
  workspaceId: string;
}) {
  if (args.state.terminalMutationUsed) {
    throw new OrgAgentToolInputError(
      "update_role_criteria may be called only once and must be the only mutation in this turn"
    );
  }
  args.state.terminalMutationUsed = true;
  const role = roleOrThrow(args.state, args.input.roleId);
  const hasReplacement = has(args.input, "criteria");
  const hasEdits = has(args.input, "edits");
  if (hasReplacement === hasEdits) {
    throw new OrgAgentToolInputError(
      "Provide exactly one of criteria or edits"
    );
  }
  let criteria;
  let editCounts:
    | { added: number; deleted: number; updated: number }
    | undefined;
  let expectedCriteria: unknown = undefined;
  if (hasReplacement) {
    try {
      criteria = parseOrgRoleCriteria(args.input.criteria);
    } catch (error) {
      throw new OrgAgentToolInputError(
        error instanceof Error ? error.message : "Invalid role criteria"
      );
    }
  } else {
    // Apply the patch to the authoritative criteria snapshot that built this
    // turn. Passing the same snapshot to the RPC prevents a concurrent edit
    // from being silently overwritten.
    expectedCriteria = role.criteria;
    try {
      const applied = applyOrgRoleCriteriaEdits(
        expectedCriteria,
        args.input.edits
      );
      criteria = applied.criteria;
      editCounts = applied.counts;
    } catch (error) {
      throw new OrgAgentToolInputError(
        error instanceof Error ? error.message : "Invalid role criteria edits"
      );
    }
  }

  const result = await updateOrgRoleCriteria({
    actorLabel: args.actorLabel,
    criteria,
    expectedCriteria,
    roleId: role.roleId,
    source: args.source,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const changed = result.status === "updated";
  const currentRole = args.state.roleById.get(role.roleId);
  if (currentRole) {
    args.state.roleById.set(role.roleId, { ...currentRole, criteria });
  }
  const editSummary = editCounts
    ? [
        editCounts.added > 0 ? `추가 ${editCounts.added}개` : "",
        editCounts.updated > 0 ? `수정 ${editCounts.updated}개` : "",
        editCounts.deleted > 0 ? `삭제 ${editCounts.deleted}개` : "",
      ]
        .filter(Boolean)
        .join(", ")
    : "전체 교체";
  const summary = `${role.name} 역할 평가 기준 ${editSummary} (총 ${criteria.length}개)`;
  args.state.terminalReply = changed
    ? `${role.name} 역할의 Evaluation Criteria를 저장했어요. ${editSummary}, 총 ${criteria.length}개예요. Hiring Brief와 Context for Harper는 바꾸지 않았어요.`
    : "이미 같은 Evaluation Criteria가 저장되어 있어 바뀐 내용은 없어요.";
  if (changed) {
    args.state.updateSummaries.push(summary);
    args.state.actions.push({
      id: crypto.randomUUID(),
      kind: "entity_updated",
      label: "Evaluation Criteria 저장 완료",
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
    criteriaCount: criteria.length,
    ...(editCounts ? { editCounts } : {}),
    mode: editCounts ? "edits" : "replace",
    status: result.status,
    summary,
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
  if (parsed.changes.some((change) => !isCompanySideLlmDataKey(change.key))) {
    throw new OrgAgentToolInputError(
      "This field is not exposed to the company-side LLM"
    );
  }
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
    args.state.terminalReply = `변경 내용을 저장했어요. ${summary}`;
    args.state.updateSummaries.push(summary);
    args.state.actions.push({
      id: crypto.randomUUID(),
      kind: "entity_updated",
      label: "변경 내용 저장 완료",
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
  user: User;
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
  const statusLabel = getOrgRoleStatusPresentation(status).label;
  const summary = `${role.name} 역할 상태: ${statusLabel}`;

  if (status === "deleted") {
    const lifecycle = getOrgRoleLifecycleUpdate("delete");
    await updateOrgRole({
      isExpired: lifecycle.isExpired,
      roleId: role.roleId,
      source: args.source,
      status: lifecycle.status,
      user: args.user,
      workspaceId: args.workspaceId,
    });
    const currentRole = args.state.roleById.get(role.roleId);
    if (currentRole) {
      args.state.roleById.set(role.roleId, { ...currentRole, status });
    }
    args.state.terminalReply = `${role.name} 역할을 삭제했어요. ${copy.effect}\n\n${copy.expectation}\n\n${copy.nextProcess}`;
    args.state.updateSummaries.push(summary);
    args.state.actions.push({
      id: crypto.randomUUID(),
      kind: "entity_updated",
      label: "역할 삭제 완료",
      payload: { changeSummary: summary, scope: "role" },
    });
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "success",
      summary,
    });
    return {
      effect: copy.effect,
      expectation: copy.expectation,
      nextProcess: copy.nextProcess,
      roleName: role.name,
      roleStatus: status,
      status: "updated",
      summary,
    };
  }

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
    args.state.terminalReply = `${role.name} 역할은 이미 ${statusLabel} 상태예요. ${copy.effect}\n\n${copy.expectation}\n\n${copy.nextProcess}`;
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "unchanged",
      summary,
    });
    return {
      effect: copy.effect,
      expectation: copy.expectation,
      nextProcess: copy.nextProcess,
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
    ? `${role.name} 역할을 ${statusLabel} 상태로 바꿨어요. ${copy.effect}\n\n${copy.expectation}\n\n${copy.nextProcess}`
    : `${role.name} 역할은 이미 ${statusLabel} 상태예요. ${copy.effect}\n\n${copy.expectation}\n\n${copy.nextProcess}`;
  if (changed) {
    args.state.updateSummaries.push(summary);
    args.state.actions.push({
      id: crypto.randomUUID(),
      kind: "entity_updated",
      label: "역할 상태 저장 완료",
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
    expectation: copy.expectation,
    nextProcess: copy.nextProcess,
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
      ? `${role.name} 역할 검토를 위한 최신 이력서 공유 가능 여부 확인`
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
      "후보자가 현재 이 역할의 연결 대기 상태가 아니어서 대신 연락할 수 없어요."
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
      ? "요청하신 대로 대기 시간과 KST 발송 시간 제한 없이 이메일과 Harper 채팅 전달을 바로 시작해요. 아직 전달 완료를 의미하지 않으며, 처리가 시작되면 취소하지 못할 수 있어요."
      : `${formatKstDateTime(request.candidateDeliveryScheduledAt)}에 이메일과 Harper 채팅으로 한 번 전달할 예정이며, 그전에는 취소할 수 있어요.`;
  args.state.terminalReply =
    kind === "resume"
      ? `${text(talent.candidate.name) || "후보자분"}께 ${text(args.state.company.companyName) || "회사"}의 ${role.name} 역할 검토를 위한 최신 이력서 공유 요청을 준비했어요. ${deliveryCopy} 아직 업로드가 끝난 것은 아니에요. 후보자가 이력서를 올리면 이 대화로 알려드릴게요. 답변이나 업로드는 선택이며, Harper가 자동으로 재촉하지 않아요.`
      : `${text(talent.candidate.name) || "후보자분"}께 ${text(args.state.company.companyName) || "회사"}에서 ${role.name} 역할과 관련해 확인하는 질문이라고 밝히고, “${requestContext}”를 대신 전달하도록 준비했어요. ${deliveryCopy} 아직 후보자가 답한 것은 아니에요. 답이 오면 이 대화로 알려드릴게요. 답변은 후보자의 선택이며, Harper가 자동으로 재촉하지 않아요.`;
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
          ? "후보자 이력서 요청 예약"
          : "후보자 확인 요청 예약",
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
      "이 후보자와 역할에서 해당 문의 요청을 찾지 못했어요. 최신 요청 이력을 다시 확인해 주세요."
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
        ? `${text(talent.candidate.name) || "후보자분"}께 드릴 ${role.name} 역할 관련 문의를 바로 다시 전달하도록 바꿨어요. 이메일과 Harper 채팅 전달을 곧 시작하지만 아직 완료된 것은 아니에요. 이전 시도가 실제로 전달된 뒤 기록만 실패했을 수도 있어 중복 전달 가능성이 있어요. 답이 오면 이 대화로 알려드릴게요.`
        : `${text(talent.candidate.name) || "후보자분"}께 드릴 ${role.name} 역할 관련 문의를 바로 전달하도록 바꿨어요. 이메일과 Harper 채팅 전달을 곧 시작하지만 아직 완료된 것은 아니에요. 답이 오면 이 대화로 알려드릴게요.`;
  } else {
    args.state.terminalReply =
      pendingRequest.deliveryStatus === "failed"
        ? `${text(talent.candidate.name) || "후보자분"}께 보낸 ${role.name} 역할 관련 문의의 남은 전달을 중단했어요. 이 요청으로 추가 이메일이나 Harper 채팅을 보내지 않아요. 다만 이전 시도가 실제로 전달된 뒤 기록만 실패했을 수도 있어, 이전 전달 여부는 별도로 확인해야 해요.`
        : `${text(talent.candidate.name) || "후보자분"}께 보낼 예정이던 ${role.name} 역할 관련 문의를 취소했어요. 후보자에게 이메일이나 Harper 채팅으로 전달되지 않아요.`;
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

function requiredPositiveInteger(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new OrgAgentToolInputError(`${field} must be a positive integer`);
  }
  return parsed;
}

function candidateResumeUploadUrl(args: {
  requestId: string;
  talentId: string;
}) {
  const origin =
    text(process.env.NEXT_PUBLIC_SITE_URL) ||
    text(process.env.NEXT_PUBLIC_APP_URL) ||
    "https://matchharper.com";
  const url = new URL("/career/profile", origin);
  url.searchParams.set("profileSection", "links");
  url.searchParams.set(
    "resumeRequest",
    createCompanyTalentResumeUploadToken(args)
  );
  return url.toString();
}

function candidateResumeUploadUrlFromDraft(body: string) {
  const match = body.match(
    /https?:\/\/[^\s<>"']+\/career\/profile\?[^\s<>"']*resumeRequest=[^\s<>"']+/
  );
  if (!match) {
    throw new OrgAgentToolInputError(
      "이력서 요청 초안에 필수 업로드 링크가 없어 수정할 수 없습니다. 현재 요청을 취소하고 새 초안을 만들어 주세요."
    );
  }
  return match[0];
}

async function wasContactDraftImmediatelyPresented(args: {
  admin: OrgAgentAdminClient;
  contactId: string;
  conversationId: string;
  currentUserMessageId: number;
  revision: number;
  slackThreadId: string | null;
  source: "chat" | "slack";
}) {
  let query = (args.admin.from("company_messages" as any) as any)
    .select("metadata")
    .eq("conversation_id", args.conversationId)
    .eq("role", "assistant")
    .eq("status", "completed")
    .lt("id", args.currentUserMessageId)
    .order("id", { ascending: false })
    .limit(1);
  query =
    args.source === "slack"
      ? query
          .eq("message_type", "slack")
          .eq("slack_thread_id", args.slackThreadId)
      : query.eq("message_type", "chat");
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  const ref = record(record(data).metadata).contactDraftRef;
  const parsedRef = record(ref);
  return (
    text(parsedRef.contactId) === args.contactId &&
    Number(parsedRef.revision) === args.revision
  );
}

function normalizedDecisionEmails(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => text(item).toLowerCase()).filter(Boolean))
  ).sort();
}

function sameDecisionEmails(left: unknown, right: unknown) {
  const normalizedLeft = normalizedDecisionEmails(left);
  const normalizedRight = normalizedDecisionEmails(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((email, index) => email === normalizedRight[index])
  );
}

function meetingDraftConfirmation(
  draft: PreparedMeetingScheduleDraft
): OrgAgentMeetingScheduleConfirmation {
  return {
    additionalMessage: draft.additionalMessage,
    availabilityVersion: draft.availability?.version ?? null,
    config: draft.config,
    draftBlocker: draft.draftBlocker,
  };
}

function sameMeetingDraft(
  left: OrgAgentMeetingScheduleConfirmation | null,
  right: unknown
) {
  if (!left) return right === null || right === undefined;
  const parsed = record(right);
  return jsonValuesEqual(left, parsed);
}

async function immediatelyPresentedCandidateDecision(args: {
  actorId: string;
  admin: OrgAgentAdminClient;
  conversationId: string;
  currentUserMessageId: number;
  decision: OrgAgentCandidateDecision;
  introEmails: string[] | null;
  meetingDraft: OrgAgentMeetingScheduleConfirmation | null | undefined;
  reason: string | null | undefined;
  recommendationId: string;
  requestedConnectionMethod: OrgAgentCandidateConnectionMethod | null;
  roleId: string;
  slackThreadId: string | null;
  source: "chat" | "slack";
  talentId: string;
}) {
  let query = (args.admin.from("company_messages" as any) as any)
    .select("metadata")
    .eq("conversation_id", args.conversationId)
    .eq("role", "assistant")
    .eq("status", "completed")
    .lt("id", args.currentUserMessageId)
    .order("id", { ascending: false })
    .limit(1);
  query =
    args.source === "slack"
      ? query
          .eq("message_type", "slack")
          .eq("slack_thread_id", args.slackThreadId)
      : query.eq("message_type", "chat");
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  const confirmations = record(
    record(data).metadata
  ).candidateConnectionConfirmations;
  if (!Array.isArray(confirmations)) return null;
  const confirmation = confirmations
    .map((value) => record(value))
    .findLast((value) => {
      if (
        text(value.actorId) !== args.actorId ||
        text(value.decision) !== args.decision ||
        text(value.recommendationId) !== args.recommendationId ||
        text(value.roleId) !== args.roleId ||
        text(value.talentId) !== args.talentId
      ) {
        return false;
      }
      const connectionMethod = candidateConnectionMethod(
        value.connectionMethod
      );
      if (
        args.requestedConnectionMethod &&
        connectionMethod !== args.requestedConnectionMethod
      ) {
        return false;
      }
      if (
        args.introEmails &&
        !sameDecisionEmails(value.introEmails, args.introEmails)
      ) {
        return false;
      }
      if (
        args.meetingDraft !== undefined &&
        !sameMeetingDraft(args.meetingDraft, value.meetingDraft)
      ) {
        return false;
      }
      const confirmationReason = text(value.reason) || null;
      return (
        args.reason === undefined ||
        (text(args.reason) || null) === confirmationReason
      );
    });
  if (!confirmation) return null;
  const connectionMethod = candidateConnectionMethod(
    confirmation.connectionMethod
  );
  const confirmationReason = text(confirmation.reason) || null;
  return {
    connectionMethod,
    introEmails: normalizedDecisionEmails(confirmation.introEmails),
    meetingDraft:
      connectionMethod === "schedule_interview"
        ? (confirmation.meetingDraft as unknown as OrgAgentMeetingScheduleConfirmation)
        : null,
    reason: confirmationReason,
  };
}

function candidateDecisionConfirmationText(args: {
  availabilityActionLink: string;
  candidateEmail: string;
  candidateName: string;
  connectionMethod: OrgAgentCandidateConnectionMethod | null;
  decision: OrgAgentCandidateDecision;
  introEmails: string[];
  meetingDraft: PreparedMeetingScheduleDraft | null;
  previousStage: string;
  roleName: string;
}) {
  if (args.decision === "decline") {
    if (args.previousStage !== "pending_connection") {
      return `${args.candidateName}님과 진행 중인 ${args.roleName} 역할의 연결을 종료하려고 해요.\n\n종료하면 Harper가 후보자에게 회사가 더 진행하지 않기로 했다고 안내하고, 이 후보자는 해당 역할의 연결 과정에서 더 이상 진행되지 않아요. 이미 보낸 소개 이메일이나 회사의 직접 연락, 후보자에게 보이거나 전달된 종료 안내는 회수할 수 없어요.\n\n남겨주신 이유는 후보자에게 그대로 전하지 않고 다음 추천 기준에 참고할게요. 연결 종료를 진행할까요?`;
    }
    return `${args.candidateName}님과 ${args.roleName} 역할의 연결을 이번에는 진행하지 않으시려는 것으로 이해했어요.\n\n연결을 거절하면 회사가 더 진행하지 않기로 했다는 종료 결정이 후보자에게 표시되고, Harper가 후보자에게 배려 있게 안내해요. 이후 이 후보자는 해당 역할의 연결 과정에서 더 이상 진행되지 않으며, 후보자에게 보이거나 전달된 안내는 회수할 수 없어요.\n\n연결 거절 이유는 후보자에게 그대로 전하지 않고 다음 추천을 더 정확하게 하는 데 참고할게요. ${args.candidateName}님과의 연결을 거절할까요?`;
  }
  if (args.connectionMethod === "direct_contact") {
    return `${args.candidateName}님과 ${args.roleName} 역할의 연결을 시작할게요.\n\n직접 연락 방식을 선택하면 후보자를 연결됨 상태로 바꾸지만 Harper가 소개 이메일을 보내지는 않아요. 회사에서 후보자에게 직접 연락해 인사하고 다음 일정을 조율해 주셔야 해요.\n\n직접 연락 방식으로 연결할까요?`;
  }
  if (args.connectionMethod === "schedule_interview" && args.meetingDraft) {
    return formatPreparedMeetingScheduleConfirmation({
      availabilityActionLink: args.availabilityActionLink,
      candidateName: args.candidateName,
      draft: args.meetingDraft,
    });
  }
  const recipients = args.introEmails.filter(
    (email) => email !== args.candidateEmail.toLowerCase()
  );
  if (recipients.length === 0) {
    return `${args.candidateName}님과 ${args.roleName} 역할의 연결을 시작하면 Harper가 후보자와 회사 담당자에게 소개 이메일을 보내고, 양측이 같은 이메일에서 인사와 다음 일정을 이어갈 수 있게 도와드려요.\n\n현재 함께 연결할 회사 수신자가 없어 아직 진행할 수 없어요. 소개 이메일을 받을 회사 담당자 이메일을 알려 주세요.`;
  }
  return `${args.candidateName}님과 ${args.roleName} 역할의 연결을 시작할게요.\n\n소개 이메일 방식을 선택하면 Harper가 후보자와 ${recipients.join(", ")}에게 소개 이메일을 바로 보내고, 서로 인사한 뒤 같은 이메일에서 다음 일정을 조율할 수 있게 연결해요. 보낸 이메일은 회수할 수 없어요.\n\n소개 이메일을 보내고 연결할까요?`;
}

async function executeCandidateContactLifecycle(args: {
  admin: OrgAgentAdminClient;
  callId: string;
  conversation: OrgAgentConversationRow;
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
      "contact_talent may be called only once and must be the only terminal tool in this turn"
    );
  }
  args.state.terminalMutationUsed = true;

  const action = requiredText(args.input.action, "action", 30);
  if (
    action !== "create_draft" &&
    action !== "revise_draft" &&
    action !== "schedule" &&
    action !== "immediate" &&
    action !== "cancel"
  ) {
    throw new OrgAgentToolInputError(
      "action must be create_draft, revise_draft, schedule, immediate, or cancel"
    );
  }

  if (action === "create_draft") {
    const kindValue = requiredText(args.input.kind, "kind", 20);
    if (kindValue !== "question" && kindValue !== "resume") {
      throw new OrgAgentToolInputError("kind must be question or resume");
    }
    const kind: "question" | "resume" = kindValue;
    const role = roleOrThrow(args.state, args.input.roleId);
    args.state.preferredRoleId = role.roleId;
    const talentId = requiredText(args.input.talentId, "talentId", 100);
    const requestContext =
      kind === "resume"
        ? `${role.name} 역할 검토를 위한 최신 이력서 공유 가능 여부 확인`
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
      (item) =>
        item.roleId === role.roleId && item.stage === "pending_connection"
    );
    if (!position) {
      throw new OrgAgentToolInputError(
        "후보자가 현재 이 역할의 연결 대기 상태가 아니어서 대신 연락할 수 없어요."
      );
    }
    if (!text(talent.candidate.email)) {
      args.state.terminalReply =
        "현재 Harper가 후보자분께 연락할 수 있는 이메일을 확인하지 못해 초안을 만들지 못했습니다. 아직 접수되거나 발송된 내용은 없습니다.";
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
      const { data: documents, error } = await (
        args.admin.from("talent_documents" as any) as any
      )
        .select("id, is_public")
        .eq("talent_id", talentId)
        .eq("kind", "resume")
        .eq("is_primary", true)
        .limit(1);
      if (error) throw error;
      if (documents?.[0]?.is_public) {
        throw new OrgAgentToolInputError(
          "이미 후보자 프로필에서 회사가 확인할 수 있는 이력서가 있습니다."
        );
      }
    }

    const existingRequest =
      blockingCompanyTalentRequest(
        talent.requestHistory as BlockingCompanyTalentRequest[],
        role.roleId
      ) ??
      (await fetchBlockingCompanyTalentRequestForWorkspace({
        admin: args.admin as any,
        roleId: role.roleId,
        talentId,
        workspaceId: args.workspaceId,
      }));
    if (existingRequest) {
      if (
        text(existingRequest.draftBody) &&
        text(existingRequest.draftSubject) &&
        Number(existingRequest.draftRevision) > 0
      ) {
        const contactId = text(existingRequest.requestId);
        const revision = Number(existingRequest.draftRevision);
        args.state.contactDraftRef = { contactId, revision };
        args.state.requiredPresentationText = candidateContactDraftPresentation(
          {
            body: String(existingRequest.draftBody),
            candidateName: text(talent.candidate.name),
            revision,
            roleName: text(existingRequest.roleName) || role.name,
            subject: String(existingRequest.draftSubject),
          }
        );
        args.state.terminalReply =
          "이 후보자와 역할에 이미 확인 중인 문구가 있어 새 초안을 만들지 않고 현재 문구를 다시 보여드려요.";
        recordResult(args.state, {
          callId: args.callId,
          name: args.name,
          status: "unchanged",
          summary: "기존 후보자 연락 초안 재표시",
        });
        return {
          contactId,
          revision,
          status: "draft",
          userMessage: args.state.terminalReply,
        };
      }
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

    const requestId = crypto.randomUUID();
    const { data: setting, error: settingError } = await (
      args.admin.from("talent_setting" as any) as any
    )
      .select("preferred_locale")
      .eq("user_id", talentId)
      .maybeSingle();
    if (settingError) throw settingError;
    const profileUrl =
      kind === "resume"
        ? candidateResumeUploadUrl({ requestId, talentId })
        : null;
    const draftCopy = await generateCandidateContactDraft({
      candidateName: text(talent.candidate.name),
      companyName: text(args.state.company.companyName) || "채용 회사",
      kind,
      locale: text(setting?.preferred_locale) || null,
      profileUrl,
      requestContext,
      requestId,
      roleName: role.name,
    });
    let draft;
    try {
      draft = await createCompanyTalentContactDraft({
        admin: args.admin as any,
        body: draftCopy.body,
        expectsDocument: kind === "resume",
        id: requestId,
        recommendationId: position.recommendationId,
        requestContext: draftCopy.requestContext,
        roleId: role.roleId,
        sourceCompanyMessageId: args.currentUserMessageId,
        subject: draftCopy.subject,
        talentId,
        workspaceId: args.workspaceId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !message.includes("company_talent_request_already_active") &&
        !message.includes(
          "company_talent_requests_workspace_role_talent_open_uidx"
        )
      ) {
        throw error;
      }
      const existing = await fetchBlockingCompanyTalentRequestForWorkspace({
        admin: args.admin as any,
        roleId: role.roleId,
        talentId,
        workspaceId: args.workspaceId,
      });
      if (
        !existing ||
        !text(existing.draftBody) ||
        !text(existing.draftSubject) ||
        Number(existing.draftRevision) < 1
      ) {
        return existingCompanyTalentRequestResult({
          callId: args.callId,
          candidateName: text(talent.candidate.name),
          existingRequest: existing,
          kind,
          name: args.name,
          requestContext,
          roleName: role.name,
          state: args.state,
        });
      }
      draft = {
        delivery_body: existing.draftBody,
        delivery_subject: existing.draftSubject,
        draft_revision: existing.draftRevision,
        id: existing.requestId,
      };
    }
    const contactId = text(draft.id);
    const revision = Number(draft.draft_revision);
    args.state.contactDraftRef = { contactId, revision };
    args.state.requiredPresentationText = candidateContactDraftPresentation({
      body: String(draft.delivery_body),
      candidateName: text(talent.candidate.name),
      revision,
      roleName: role.name,
      subject: String(draft.delivery_subject),
    });
    args.state.terminalReply =
      "후보자에게 보낼 전체 문구를 초안으로 저장했어요. 아직 후보자에게 보내지 않았어요.";
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "success",
      summary: "후보자 연락 초안 작성",
    });
    return {
      contactId,
      revision,
      status: "draft",
      userMessage: args.state.terminalReply,
    };
  }

  const contactId = requiredText(args.input.contactId, "contactId", 100);
  const contact = await fetchCompanyTalentContact({
    admin: args.admin as any,
    requestId: contactId,
    workspaceId: args.workspaceId,
  });
  if (!contact) {
    throw new OrgAgentToolInputError(
      "해당 후보자 연락 요청을 이 회사에서 찾지 못했습니다."
    );
  }
  args.state.preferredRoleId = text(contact.role_id) || null;
  const candidateName = text(contact.candidateName) || "후보자분";
  const roleName = text(contact.roleName) || "해당 역할";

  if (action === "revise_draft") {
    const expectedRevision = requiredPositiveInteger(
      args.input.expectedRevision,
      "expectedRevision"
    );
    const editInstruction = requiredText(
      args.input.editInstruction,
      "editInstruction",
      2_000
    );
    if (contact.workflow_status !== "draft") {
      throw new OrgAgentToolInputError(
        "발송 등록된 문구는 그 자리에서 수정할 수 없습니다. 취소 가능하면 먼저 취소한 뒤 새 초안을 만들어야 합니다."
      );
    }
    if (contact.draft_revision !== expectedRevision) {
      throw new OrgAgentToolInputError(
        "초안이 그사이 바뀌었어요. 최신 문구를 다시 확인한 뒤 수정해 주세요."
      );
    }
    const kind = contact.expects_document ? "resume" : "question";
    const profileUrl =
      kind === "resume"
        ? candidateResumeUploadUrlFromDraft(String(contact.delivery_body ?? ""))
        : null;
    const revisedCopy = await reviseCandidateContactDraft({
      current: {
        body: String(contact.delivery_body ?? ""),
        requestContext: contact.request_context,
        subject: String(contact.delivery_subject ?? ""),
      },
      editInstruction,
      kind,
      profileUrl,
      requestId: contact.id,
    });
    const revised = await reviseCompanyTalentContactDraft({
      admin: args.admin as any,
      body: revisedCopy.body,
      expectedRevision,
      requestContext: revisedCopy.requestContext,
      requestId: contact.id,
      subject: revisedCopy.subject,
      workspaceId: args.workspaceId,
    });
    args.state.contactDraftRef = {
      contactId: revised.id,
      revision: revised.draft_revision,
    };
    args.state.requiredPresentationText = candidateContactDraftPresentation({
      body: String(revised.delivery_body),
      candidateName,
      revision: revised.draft_revision,
      roleName,
      subject: String(revised.delivery_subject),
    });
    args.state.terminalReply =
      "요청하신 수정을 초안에 저장했어요. 아직 후보자에게 보내지 않았어요.";
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "success",
      summary: "후보자 연락 초안 수정",
    });
    return {
      contactId: revised.id,
      revision: revised.draft_revision,
      status: "draft_revised",
      userMessage: args.state.terminalReply,
    };
  }

  if (action === "schedule") {
    const expectedRevision = requiredPositiveInteger(
      args.input.expectedRevision,
      "expectedRevision"
    );
    const deliveryModeValue = text(args.input.deliveryMode) || "standard";
    if (deliveryModeValue !== "standard" && deliveryModeValue !== "immediate") {
      throw new OrgAgentToolInputError(
        "deliveryMode must be standard or immediate"
      );
    }
    if (contact.workflow_status !== "draft") {
      throw new OrgAgentToolInputError(
        "초안 상태의 연락만 발송 등록할 수 있습니다. 이 요청의 현재 상태를 확인해 주세요."
      );
    }
    if (contact.draft_revision !== expectedRevision) {
      throw new OrgAgentToolInputError(
        "확인하신 뒤 초안이 바뀌었어요. 최신 문구를 다시 보여드린 뒤 확인받아야 해요."
      );
    }
    const immediatelyPresented = await wasContactDraftImmediatelyPresented({
      admin: args.admin,
      contactId: contact.id,
      conversationId: args.conversation.id,
      currentUserMessageId: args.currentUserMessageId,
      revision: contact.draft_revision,
      slackThreadId: args.slackThreadId,
      source: args.source,
    });
    if (!immediatelyPresented) {
      args.state.contactDraftRef = {
        contactId: contact.id,
        revision: contact.draft_revision,
      };
      args.state.requiredPresentationText = candidateContactDraftPresentation({
        body: String(contact.delivery_body ?? ""),
        candidateName,
        revision: contact.draft_revision,
        roleName,
        subject: String(contact.delivery_subject ?? ""),
      });
      args.state.terminalReply =
        "직전 Harper 답변에서 보여드린 최신 문구에 대한 확인이 아니어서 보내지 않았어요. 현재 문구를 다시 보여드려요.";
      recordResult(args.state, {
        callId: args.callId,
        name: args.name,
        status: "unchanged",
        summary: "정확한 초안 재확인 필요",
      });
      return {
        contactId: contact.id,
        revision: contact.draft_revision,
        status: "confirmation_required",
        userMessage: args.state.terminalReply,
      };
    }
    const scheduled = await scheduleCompanyTalentContact({
      admin: args.admin as any,
      deliveryMode: deliveryModeValue,
      expectedRevision,
      requestId: contact.id,
      roleId: contact.role_id,
      talentId: contact.talent_id,
      workspaceId: args.workspaceId,
    });
    args.state.contactDraftRef = {
      contactId: contact.id,
      revision: contact.draft_revision,
    };
    args.state.terminalReply =
      deliveryModeValue === "immediate"
        ? `${candidateName}님께 확인하신 ${roleName} 관련 문구를 바로 보내도록 준비했어요. 이메일과 Harper 채팅 전달을 곧 시작하지만 아직 완료된 것은 아니에요.\n\n후보자는 답하거나, 답하기 어렵다고 하거나, 답하지 않을 수 있어요. Harper가 자동으로 재촉하지는 않으며, 답변이 오면 의미를 바꾸지 않고 정리해 이 대화에서 알려드릴게요.`
        : `${candidateName}님께 확인하신 ${roleName} 관련 문구를 ${formatKstDateTime(scheduled.scheduledAt)}에 보낼 예정이에요. 이메일과 Harper 채팅으로 한 번 전달하며, 아직 전달이 끝난 것은 아니에요.\n\n후보자는 답하거나, 답하기 어렵다고 하거나, 답하지 않을 수 있어요. Harper가 자동으로 재촉하지는 않으며, 답변이 오면 의미를 바꾸지 않고 정리해 이 대화에서 알려드릴게요.`;
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "success",
      summary:
        deliveryModeValue === "immediate"
          ? "후보자 연락 즉시 발송 등록"
          : "후보자 연락 발송 등록",
    });
    return {
      contactId: contact.id,
      revision: contact.draft_revision,
      scheduledAt: scheduled.scheduledAt,
      status: scheduled.status,
      userMessage: args.state.terminalReply,
    };
  }

  if (action === "immediate" && contact.workflow_status === "draft") {
    throw new OrgAgentToolInputError(
      "아직 확인받지 않은 초안은 바로 보낼 수 없습니다. 먼저 전체 문구를 보여드리고 명시적인 승인을 받아야 합니다."
    );
  }

  const changeAction = action === "immediate" ? "immediate" : "cancel";
  let changed: Awaited<ReturnType<typeof changeCompanyTalentRequest>>;
  try {
    changed = await changeCompanyTalentRequest({
      action: changeAction,
      admin: args.admin as any,
      requestId: contact.id,
      roleId: contact.role_id,
      talentId: contact.talent_id,
      workspaceId: args.workspaceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("company_talent_request_not_cancellable") ||
      message.includes("company_talent_request_not_changeable")
    ) {
      args.state.terminalReply =
        action === "immediate"
          ? "확인하는 사이 발송 처리가 시작되어 이 요청의 발송 시간을 앞당기지 못했습니다. 현재 전달 상태를 다시 확인해 주세요."
          : "확인하는 사이 발송 처리가 시작되어 이 요청은 취소하지 못했습니다.";
      recordResult(args.state, {
        callId: args.callId,
        name: args.name,
        status: "error",
        summary:
          action === "immediate"
            ? "후보자 연락 즉시 발송 변경 불가"
            : "후보자 연락 취소 불가",
      });
      return {
        status: "not_changeable",
        userMessage: args.state.terminalReply,
      };
    }
    throw error;
  }
  if (action === "immediate") {
    args.state.contactDraftRef = {
      contactId: contact.id,
      revision: contact.draft_revision,
    };
    args.state.terminalReply = `${candidateName}님께 보낼 예정이던 ${roleName} 관련 요청을 지금 바로 전달하도록 바꿨어요. 확인하신 제목과 본문은 그대로 유지되며, 이메일과 Harper 채팅 전달을 곧 시작하지만 아직 완료된 것은 아니에요. 답변이 오면 의미를 바꾸지 않고 정리해 이 대화에서 알려드릴게요.`;
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "success",
      summary: "후보자 연락 즉시 발송 변경",
    });
    return {
      contactId: contact.id,
      scheduledAt: "scheduledAt" in changed ? changed.scheduledAt : null,
      status: changed.status,
      userMessage: args.state.terminalReply,
    };
  }
  args.state.contactDraftRef = null;
  args.state.terminalReply =
    contact.workflow_status === "draft"
      ? `${candidateName}님께 보낼 ${roleName} 관련 초안을 취소했어요. 후보자에게 전달된 내용은 없어요.`
      : `${candidateName}님께 보낼 예정이던 ${roleName} 관련 요청을 취소했어요. 이 요청으로 추가 이메일이나 Harper 채팅을 보내지 않아요.`;
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary: "후보자 연락 취소",
  });
  return {
    contactId: contact.id,
    status: changed.status,
    userMessage: args.state.terminalReply,
  };
}

function normalizePipelineStageLabel(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function customPipelineStageDbId(value: unknown) {
  const stage = text(value);
  return stage.startsWith("custom:") ? stage.slice("custom:".length) : "";
}

function activeCompanyPipelineStage(value: unknown, field: string): OrgStageId {
  const stage = requiredText(value, field, 100) as OrgStageId;
  if (
    stage !== "connected" &&
    stage !== "final_offer" &&
    !stage.startsWith("custom:")
  ) {
    throw new OrgAgentToolInputError(
      `${field} must be connected, final_offer, or an exact custom:<id> stage`
    );
  }
  return stage;
}

async function executeManageRolePipelineStages(args: {
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
      "manage_role_pipeline_stages may be called only once and must be the only tool in this turn"
    );
  }
  args.state.terminalMutationUsed = true;
  const role = roleOrThrow(args.state, args.input.roleId);
  const action = requiredText(args.input.action, "action", 20);
  if (action !== "add" && action !== "rename" && action !== "delete") {
    throw new OrgAgentToolInputError("action must be add, rename, or delete");
  }

  let stages: Array<{ label: string; status: string }> = [];
  let summary = "";
  if (action === "add") {
    if (!Array.isArray(args.input.labels)) {
      throw new OrgAgentToolInputError("labels is required for action=add");
    }
    if (args.input.labels.length < 1 || args.input.labels.length > 6) {
      throw new OrgAgentToolInputError("labels must contain one to six items");
    }
    if (has(args.input, "label") || has(args.input, "stageId")) {
      throw new OrgAgentToolInputError(
        "action=add accepts labels and must omit label and stageId"
      );
    }
    const labels = args.input.labels.map((value, index) => {
      const label = normalizePipelineStageLabel(value);
      if (!label) {
        throw new OrgAgentToolInputError(`labels[${index}] is required`);
      }
      if (label.length > 40) {
        throw new OrgAgentToolInputError(
          `labels[${index}] must contain at most 40 characters`
        );
      }
      return label;
    });
    const result = await createOrgRoleReviewStages({
      labels,
      roleId: role.roleId,
      user: args.user,
      workspaceId: args.workspaceId,
    });
    stages = result.stages.map((stage) => ({
      label: stage.label,
      status: stage.status,
    }));
    const created = stages.filter((stage) => stage.status === "created");
    summary =
      created.length > 0
        ? `${role.name} 파이프라인에 ${created.map((stage) => stage.label).join(", ")} 단계 추가`
        : `${role.name} 파이프라인 단계가 이미 모두 존재함`;
  } else {
    if (has(args.input, "labels")) {
      throw new OrgAgentToolInputError(`action=${action} must omit labels`);
    }
    const customStageId = customPipelineStageDbId(args.input.stageId);
    if (!customStageId) {
      throw new OrgAgentToolInputError(
        "stageId must be an exact custom:<id> value from read_role"
      );
    }
    const { data: existing, error: existingError } = await (
      args.admin.from("ops_matching_role_stages" as any) as any
    )
      .select("id, label")
      .eq("id", customStageId)
      .eq("role_id", role.roleId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) {
      throw new OrgAgentToolInputError(
        "The custom stage no longer exists for this Role. Read the pipeline again before retrying."
      );
    }
    const previousLabel = normalizePipelineStageLabel(existing.label);
    if (action === "rename") {
      const label = requiredText(args.input.label, "label", 40).replace(
        /\s+/g,
        " "
      );
      const result = await updateOrgRoleReviewStage({
        label,
        roleId: role.roleId,
        stageId: customStageId,
        user: args.user,
        workspaceId: args.workspaceId,
      });
      const unchanged = previousLabel === result.stage.label;
      stages = [
        {
          label: result.stage.label,
          status: unchanged ? "already_reflected" : "renamed",
        },
      ];
      summary = unchanged
        ? `${role.name} 파이프라인 단계 이름이 이미 ${result.stage.label}`
        : `${role.name} 파이프라인 단계 이름: ${previousLabel} → ${result.stage.label}`;
    } else {
      if (has(args.input, "label")) {
        throw new OrgAgentToolInputError("action=delete must omit label");
      }
      await deleteEmptyOrgRoleReviewStage({
        roleId: role.roleId,
        stageId: customStageId,
        user: args.user,
        workspaceId: args.workspaceId,
      });
      stages = [{ label: previousLabel, status: "deleted" }];
      summary = `${role.name} 파이프라인에서 ${previousLabel} 단계 삭제`;
    }
  }

  args.state.terminalReply = `${summary}. 후보자 단계와 연락 상태, 역할 정보는 변경하지 않았습니다.`;
  args.state.updateSummaries.push(summary);
  args.state.actions.push({
    id: crypto.randomUUID(),
    kind: "entity_updated",
    label: "파이프라인 단계 업데이트됨",
    payload: { changeSummary: summary, scope: "role" },
  });
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary,
  });
  return {
    action,
    roleName: role.name,
    stages,
    status: stages.every((stage) =>
      ["already_exists", "already_reflected"].includes(stage.status)
    )
      ? "already_reflected"
      : "updated",
    summary,
  };
}

async function executeMoveCandidateStage(args: {
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
      "move_candidate_stage may be called only once and must be the only tool in this turn"
    );
  }
  args.state.terminalMutationUsed = true;
  const role = roleOrThrow(args.state, args.input.roleId);
  const talentId = requiredText(args.input.talentId, "talentId", 100);
  const expectedCurrentStage = activeCompanyPipelineStage(
    args.input.expectedCurrentStageId,
    "expectedCurrentStageId"
  );
  const targetStage = activeCompanyPipelineStage(
    args.input.targetStageId,
    "targetStageId"
  );
  const talent = await readOrgAgentTalent({
    admin: args.admin,
    audience: "company_safe",
    includeProfile: false,
    roleId: role.roleId,
    talentId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const position = talent.positions
    .filter((item) => item.roleId === role.roleId)
    .sort(
      (left, right) =>
        String(right.updatedAt).localeCompare(String(left.updatedAt)) ||
        String(right.recommendationId).localeCompare(
          String(left.recommendationId)
        )
    )[0];
  if (!position) {
    throw new OrgAgentToolInputError(
      "The candidate is not visible in this Role's pipeline"
    );
  }
  const currentStage = activeCompanyPipelineStage(
    position.stage,
    "currentStageId"
  );
  const candidateName = text(talent.candidate.name) || "후보자";
  if (currentStage === targetStage) {
    const stageLabel = position.stageLabel || humanizeOrgStage(targetStage);
    const summary = `${candidateName} 후보자는 이미 ${stageLabel} 단계`;
    args.state.terminalReply = `${summary}입니다. 후보자에게 별도 연락은 보내지 않았습니다.`;
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "unchanged",
      summary,
    });
    return {
      candidateName,
      previousStageLabel: stageLabel,
      roleName: role.name,
      stageLabel,
      status: "already_reflected",
    };
  }
  if (currentStage !== expectedCurrentStage) {
    throw new OrgAgentToolInputError(
      "The candidate stage changed while this move was being prepared. Read the Role pipeline again before retrying."
    );
  }

  const targetCustomStageId = customPipelineStageDbId(targetStage);
  let targetStageLabel = humanizeOrgStage(targetStage);
  if (targetCustomStageId) {
    const { data: target, error: targetError } = await (
      args.admin.from("ops_matching_role_stages" as any) as any
    )
      .select("label")
      .eq("id", targetCustomStageId)
      .eq("role_id", role.roleId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) {
      throw new OrgAgentToolInputError(
        "The destination stage no longer exists for this Role. Read the pipeline again before retrying."
      );
    }
    targetStageLabel = normalizePipelineStageLabel(target.label);
  }
  const previousStageLabel =
    position.stageLabel || humanizeOrgStage(currentStage);
  await setOrgCandidateStage({
    expectedPreviousStage: expectedCurrentStage,
    recommendationId: position.recommendationId,
    roleId: role.roleId,
    stage: targetStage,
    talentId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const summary = `${candidateName} 후보자: ${previousStageLabel} → ${targetStageLabel}`;
  args.state.terminalReply = `${summary}로 옮겼습니다. 후보자에게 이메일이나 Harper 메시지를 보내거나 인터뷰를 예약하지는 않았습니다.`;
  args.state.updateSummaries.push(summary);
  args.state.actions.push({
    id: crypto.randomUUID(),
    kind: "entity_updated",
    label: "후보자 단계 업데이트됨",
    payload: { changeSummary: summary, scope: "role" },
  });
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary,
  });
  return {
    candidateName,
    previousStageLabel,
    roleName: role.name,
    stageLabel: targetStageLabel,
    status: "updated",
  };
}

async function readCandidateDecisionTarget(args: {
  admin: OrgAgentAdminClient;
  decision: OrgAgentCandidateDecision;
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
  const matchingPositions = talent.positions
    .filter(
      (position) =>
        position.roleId === args.roleId &&
        (args.decision === "decline"
          ? canStopOrgCandidateProcess(position.stage)
          : position.stage === "pending_connection" ||
            position.stage === "process_stopped")
    )
    .sort(
      (left, right) =>
        String(right.updatedAt).localeCompare(String(left.updatedAt)) ||
        String(right.recommendationId).localeCompare(
          String(left.recommendationId)
        )
    );
  if (matchingPositions.length === 0) {
    throw new OrgAgentToolInputError(
      args.decision === "accept"
        ? "후보자가 현재 이 역할의 연결 대기 또는 프로세스 종료 상태가 아니라 연결을 시작할 수 없어요."
        : "후보자가 현재 이 역할에서 종료할 수 있는 회사 측 진행 상태가 아니에요."
    );
  }
  const position = matchingPositions[0];
  if (position.stage === "process_stopped" && !position.candidateAccepted) {
    throw new OrgAgentToolInputError(
      "후보자의 기존 연결 수락을 확인할 수 없어 종료된 프로세스를 회사 요청만으로 다시 연결할 수 없습니다."
    );
  }
  return {
    position,
    reactivation: position.stage === "process_stopped",
    talent,
  };
}

function stageCandidateDecisionContext(args: {
  actorId: string;
  connectionMethod: OrgAgentCandidateConnectionMethod | null;
  decision: OrgAgentCandidateDecision;
  introEmails: string[];
  meetingDraft: OrgAgentMeetingScheduleConfirmation | null;
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
    meetingDraft: args.meetingDraft,
    reason: args.reason,
    recommendationId: args.recommendationId,
    roleId: args.roleId,
    slackThreadId: args.slackThreadId,
    talentId: args.talentId,
  };
  args.state.candidateConnectionConfirmations.push(context);
  return context;
}

async function executeManageInterviewAvailability(args: {
  callId: string;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  source: "chat" | "slack";
  state: OrgAgentToolExecutionState;
  user: User;
  workspaceId: string;
}) {
  if (args.state.terminalMutationUsed) {
    throw new OrgAgentToolInputError(
      "manage_interview_availability may be called only once and must be the only mutation in this turn"
    );
  }
  args.state.terminalMutationUsed = true;

  const currentResult = await fetchMeetingAvailability({
    user: args.user,
    workspaceId: args.workspaceId,
  });
  let next;
  try {
    next = applyMeetingAvailabilityEdits({
      current: currentResult.availability,
      input: args.input,
    });
  } catch (error) {
    if (error instanceof MeetingAvailabilityValidationError) {
      throw new OrgAgentToolInputError(error.message);
    }
    throw error;
  }

  const comparableCurrent = currentResult.availability
    ? {
        dateOverrides: currentResult.availability.dateOverrides,
        timezone: currentResult.availability.timezone,
        weeklyRules: currentResult.availability.weeklyRules,
      }
    : null;
  const unchanged = Boolean(
    comparableCurrent && jsonValuesEqual(comparableCurrent, next)
  );
  const saved = unchanged
    ? currentResult
    : await saveMeetingAvailability({
        availability: next,
        expectedVersion: currentResult.availability?.version ?? null,
        user: args.user,
        workspaceId: args.workspaceId,
      });
  if (!saved.availability) {
    throw new OrgAgentToolInputError(
      "인터뷰 가능 시간을 저장한 뒤 다시 불러오지 못했습니다."
    );
  }

  const summary = formatMeetingAvailabilitySummary(saved.availability);
  const actionLink = meetingAvailabilityActionLink({
    source: args.source,
    workspaceId: args.workspaceId,
  });
  const changeSummary = unchanged
    ? `미팅 가능 시간 유지: ${summary}`
    : `미팅 가능 시간 설정: ${summary}`;
  args.state.terminalReply = [
    unchanged
      ? `말씀하신 시간은 이미 그대로 설정되어 있어요. 앞으로도 설정된 시간(${summary})을 기준으로 가능한 일정을 찾을게요.`
      : `좋아요. 앞으로 다음 시간을 기준으로 가능한 일정을 찾을게요: ${summary}`,
    "",
    `날짜별로 빼둘 시간이 있다면 ${actionLink}에서 정할 수 있어요. 이 시간을 바탕으로 누구와 미팅을 잡으면 될지 말씀해 주시면 바로 이어갈게요. 아직 후보자에게 연락한 것은 없어요.`,
  ].join("\n");
  if (!unchanged) {
    args.state.updateSummaries.push(changeSummary);
    args.state.actions.push({
      id: crypto.randomUUID(),
      kind: "entity_updated",
      label: "인터뷰 가능 시간 저장 완료",
      payload: { changeSummary, scope: "company" },
    });
  }
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: unchanged ? "unchanged" : "success",
    summary: changeSummary,
  });
  return {
    availabilityVersion: saved.availability.version,
    meetingAvailabilityUrl: buildOrgMeetingAvailabilityUrl(args.workspaceId),
    nextProcess:
      "If one candidate and Role are clear from the visible conversation, ask whether Harper should prepare that person's meeting options now. Otherwise ask who the user would like to meet.",
    responseGuidance:
      "Acknowledge the hours as the times Harper will use. Do not say availability was saved, do not enumerate internal non-actions, and do not require a magic retry phrase. The only useful boundary is that no candidate has been contacted yet.",
    status: unchanged ? "unchanged" : "updated",
    summary,
    timezone: saved.availability.timezone,
  };
}

async function executePrepareCandidateConnection(args: {
  actorId: string;
  actorLabel: string;
  admin: OrgAgentAdminClient;
  callId: string;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  slackThreadId: string | null;
  source: "chat" | "slack";
  state: OrgAgentToolExecutionState;
  user: User;
  workspaceId: string;
}) {
  const current = roleOrThrow(args.state, args.input.roleId);
  args.state.preferredRoleId = current.roleId;
  const talentId = requiredText(args.input.talentId, "talentId", 100);
  const decision = candidateDecision(args.input.decision);
  const requestedConnectionMethod = candidateConnectionMethod(
    args.input.connectionMethod
  );
  const reason = nullableTextField(args.input, "reason", 2_000);
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
    requestedConnectionMethod !== "intro_email" &&
    has(args.input, "introEmails")
  ) {
    throw new OrgAgentToolInputError(
      "introEmails can only be used with connectionMethod intro_email"
    );
  }

  const connectionMethod =
    decision === "accept" ? (requestedConnectionMethod ?? "intro_email") : null;
  const { position, reactivation, talent } = await readCandidateDecisionTarget({
    admin: args.admin,
    decision,
    roleId: current.roleId,
    talentId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const requesterEmail = text(args.user.email).toLowerCase() || null;
  const candidateEmail = text(talent.candidate.email).toLowerCase();
  const suppliedIntroEmails = has(args.input, "introEmails")
    ? emailArray(args.input.introEmails, 10)
    : [];
  const introEmails =
    connectionMethod === "intro_email"
      ? (suppliedIntroEmails.length > 0
          ? suppliedIntroEmails
          : requesterEmail
            ? [requesterEmail]
            : []
        ).filter((email) => email !== candidateEmail)
      : [];
  const preparedMeetingDraft =
    connectionMethod === "schedule_interview"
      ? await prepareMeetingScheduleDraft({
          actorLabel: args.actorLabel,
          additionalMessage: args.input.meetingAdditionalMessage,
          additionalMessageVisibility:
            args.input.meetingAdditionalMessageVisibility,
          admin: args.admin,
          attendeeEmails: has(args.input, "meetingAttendeeEmails")
            ? emailArray(args.input.meetingAttendeeEmails, 10)
            : [],
          candidateName: text(talent.candidate.name) || "후보자",
          companyName: text(args.state.company.companyName) || "Company",
          durationMinutes: args.input.meetingDurationMinutes,
          title: args.input.meetingTitle,
          user: args.user,
          workspaceId: args.workspaceId,
        })
      : null;
  const meetingAvailabilityUrl = buildOrgMeetingAvailabilityUrl(
    args.workspaceId
  );
  const meetingDraftBlocked = Boolean(preparedMeetingDraft?.draftBlocker);
  if (!meetingDraftBlocked) {
    stageCandidateDecisionContext({
      actorId: args.actorId,
      connectionMethod,
      decision,
      introEmails,
      meetingDraft: preparedMeetingDraft
        ? meetingDraftConfirmation(preparedMeetingDraft)
        : null,
      reason: reason.present ? reason.value : null,
      recommendationId: position.recommendationId,
      roleId: current.roleId,
      slackThreadId: args.slackThreadId,
      state: args.state,
      talentId,
    });
  }
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary: meetingDraftBlocked
      ? "인터뷰 일정 요청 전 선행 설정 필요"
      : decision === "accept"
        ? "후보자 연결 수락 판단 컨텍스트 조회"
        : "후보자 연결 거절 판단 컨텍스트 조회",
  });
  return {
    candidateEmail: talent.candidate.email,
    candidateName: talent.candidate.name,
    closureNotificationDelivered:
      position.processClosureNotification?.status === "sent",
    closureNotificationDeliveredAt:
      position.processClosureNotification?.deliveredAt ?? null,
    closureNotificationSentChannel:
      position.processClosureNotification?.sentChannel ?? null,
    connectionMethod,
    currentStage: position.stage,
    decision,
    directContactAvailable: decision === "accept",
    introEmailAvailable:
      decision === "accept" &&
      Boolean(text(talent.candidate.email)) &&
      introEmails.length > 0,
    introEmails,
    meetingDraft: preparedMeetingDraft
      ? meetingDraftConfirmation(preparedMeetingDraft)
      : null,
    meetingScheduleConfirmation: preparedMeetingDraft
      ? formatPreparedMeetingScheduleConfirmation({
          availabilityActionLink: meetingAvailabilityActionLink({
            source: args.source,
            workspaceId: args.workspaceId,
          }),
          candidateName: text(talent.candidate.name) || "후보자",
          draft: preparedMeetingDraft,
        })
      : null,
    meetingAvailabilityUrl,
    reason: reason.present ? reason.value : null,
    requesterEmail,
    reactivation,
    status: meetingDraftBlocked
      ? "meeting_setup_required"
      : "decision_context_ready",
  };
}

async function executeCandidateConnectionDecision(args: {
  actorId: string;
  actorLabel: string;
  admin: OrgAgentAdminClient;
  callId: string;
  conversation: OrgAgentConversationRow;
  currentUserMessageId: number;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  slackThreadId: string | null;
  source: "chat" | "slack";
  state: OrgAgentToolExecutionState;
  user: User;
  workspaceId: string;
}) {
  args.state.terminalMutationUsed = true;
  const current = roleOrThrow(args.state, args.input.roleId);
  args.state.preferredRoleId = current.roleId;
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
    requestedConnectionMethod !== "intro_email" &&
    has(args.input, "introEmails")
  ) {
    throw new OrgAgentToolInputError(
      "introEmails can only be used with connectionMethod intro_email"
    );
  }
  const suppliedIntroEmails = has(args.input, "introEmails")
    ? emailArray(args.input.introEmails, 10)
    : null;
  const requesterEmail = text(args.user.email).toLowerCase();
  const { position, reactivation, talent } = await readCandidateDecisionTarget({
    admin: args.admin,
    decision,
    roleId: current.roleId,
    talentId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const candidateEmail = text(talent.candidate.email).toLowerCase();
  const proposedConnectionMethod =
    decision === "accept" ? (requestedConnectionMethod ?? "intro_email") : null;
  const proposedIntroEmails =
    proposedConnectionMethod === "intro_email"
      ? (suppliedIntroEmails?.length
          ? suppliedIntroEmails
          : requesterEmail
            ? [requesterEmail]
            : []
        ).filter((email) => email !== candidateEmail)
      : [];
  const proposedReason = reason.present ? reason.value : null;
  const hasMeetingDraftInput = [
    "meetingAdditionalMessage",
    "meetingAdditionalMessageVisibility",
    "meetingAttendeeEmails",
    "meetingDurationMinutes",
    "meetingTitle",
  ].some((key) => has(args.input, key));
  const proposedMeetingDraft =
    proposedConnectionMethod === "schedule_interview"
      ? await prepareMeetingScheduleDraft({
          actorLabel: args.actorLabel,
          additionalMessage: args.input.meetingAdditionalMessage,
          additionalMessageVisibility:
            args.input.meetingAdditionalMessageVisibility,
          admin: args.admin,
          attendeeEmails: has(args.input, "meetingAttendeeEmails")
            ? emailArray(args.input.meetingAttendeeEmails, 10)
            : [],
          candidateName: text(talent.candidate.name) || "후보자",
          companyName: text(args.state.company.companyName) || "Company",
          durationMinutes: args.input.meetingDurationMinutes,
          title: args.input.meetingTitle,
          user: args.user,
          workspaceId: args.workspaceId,
        })
      : null;
  if (proposedMeetingDraft?.draftBlocker) {
    args.state.terminalReply = formatPreparedMeetingScheduleConfirmation({
      availabilityActionLink: meetingAvailabilityActionLink({
        source: args.source,
        workspaceId: args.workspaceId,
      }),
      candidateName: text(talent.candidate.name) || "후보자",
      draft: proposedMeetingDraft,
    });
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "unchanged",
      summary: "인터뷰 일정 요청 전 선행 설정 필요",
    });
    return {
      candidateName: talent.candidate.name,
      connectionMethod: proposedConnectionMethod,
      decision,
      draftBlocker: proposedMeetingDraft.draftBlocker,
      meetingAvailabilityUrl: buildOrgMeetingAvailabilityUrl(args.workspaceId),
      meetingDraft: meetingDraftConfirmation(proposedMeetingDraft),
      status: "meeting_setup_required",
      userMessage: args.state.terminalReply,
    };
  }
  const confirmed = await immediatelyPresentedCandidateDecision({
    actorId: args.actorId,
    admin: args.admin,
    conversationId: args.conversation.id,
    currentUserMessageId: args.currentUserMessageId,
    decision,
    introEmails:
      suppliedIntroEmails === null
        ? null
        : proposedConnectionMethod === "intro_email"
          ? proposedIntroEmails
          : [],
    meetingDraft:
      proposedConnectionMethod === "schedule_interview" && !hasMeetingDraftInput
        ? undefined
        : proposedMeetingDraft
          ? meetingDraftConfirmation(proposedMeetingDraft)
          : null,
    reason: reason.present ? proposedReason : undefined,
    recommendationId: position.recommendationId,
    requestedConnectionMethod,
    roleId: current.roleId,
    slackThreadId: args.slackThreadId,
    source: args.source,
    talentId,
  });
  if (!confirmed) {
    stageCandidateDecisionContext({
      actorId: args.actorId,
      connectionMethod: proposedConnectionMethod,
      decision,
      introEmails: proposedIntroEmails,
      meetingDraft: proposedMeetingDraft
        ? meetingDraftConfirmation(proposedMeetingDraft)
        : null,
      reason: proposedReason,
      recommendationId: position.recommendationId,
      roleId: current.roleId,
      slackThreadId: args.slackThreadId,
      state: args.state,
      talentId,
    });
    args.state.terminalReply = candidateDecisionConfirmationText({
      availabilityActionLink: meetingAvailabilityActionLink({
        source: args.source,
        workspaceId: args.workspaceId,
      }),
      candidateEmail,
      candidateName: text(talent.candidate.name) || "후보자",
      connectionMethod: proposedConnectionMethod,
      decision,
      introEmails: proposedIntroEmails,
      meetingDraft: proposedMeetingDraft,
      previousStage: position.stage,
      roleName: current.name,
    });
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "unchanged",
      summary:
        decision === "accept"
          ? "후보자 연결 수락 재확인 필요"
          : "후보자 연결 거절 재확인 필요",
    });
    return {
      candidateName: talent.candidate.name,
      connectionMethod: proposedConnectionMethod,
      decision,
      introEmails: proposedIntroEmails,
      status: "confirmation_required",
      userMessage: args.state.terminalReply,
    };
  }
  const connectionMethod =
    decision === "accept"
      ? (confirmed.connectionMethod ?? "intro_email")
      : null;
  const finalReason = reason.present ? reason.value : confirmed.reason;
  const candidateName = text(talent.candidate.name) || "후보자";
  if (decision === "decline") {
    const result = await setOrgCandidateStage({
      expectedPreviousStage: position.stage,
      recommendationId: position.recommendationId,
      roleId: current.roleId,
      stage: "process_stopped",
      stopNote: finalReason,
      talentId,
      user: args.user,
      workspaceId: args.workspaceId,
    });
    const changeSummary =
      position.stage === "pending_connection"
        ? `${candidateName}님과의 연결을 거절했어요. 회사가 더 진행하지 않기로 했다는 종료 결정이 후보자에게 표시되고 Harper가 이를 안내해요.`
        : `${candidateName}님과 진행 중이던 연결을 종료했어요. 이전에 보낸 소개 이메일이나 회사의 직접 연락은 회수되지 않으며, Harper가 후보자에게 종료를 안내해요.`;
    args.state.updateSummaries.push(changeSummary);
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "success",
      summary: changeSummary,
    });
    return {
      candidateName,
      changeSummary,
      decision,
      nextProcess:
        "Harper가 후보자에게 회사가 이번 연결을 더 진행하지 않기로 했다고 안내하고, 이 후보자는 해당 역할의 연결 과정에서 더 이상 진행되지 않아요.",
      previousStage: position.stage,
      responseGuidance:
        "결정이 후보자에게 어떻게 안내되고 이후 매칭에 어떻게 반영되는지 다정하고 분명하게 설명하세요.",
      roleId: result.roleId,
      roleName: current.name,
      stage: result.stage,
      status: "updated",
      talentId: result.talentId,
    };
  }

  if (connectionMethod === "schedule_interview") {
    const confirmedDraft = confirmed.meetingDraft;
    if (!confirmedDraft) {
      args.state.terminalReply =
        "앞서 확인한 미팅 정보를 다시 찾지 못했어요. 후보자에게는 아직 연락하지 않았으니, 미팅 조율을 한 번만 다시 요청해 주세요.";
      throw new OrgAgentToolInputError(
        "확인된 인터뷰 일정 기본안을 찾지 못했어요. 현재 설정을 다시 확인해 주세요."
      );
    }
    let draftWriteStarted = false;
    try {
      const currentDraft = await prepareMeetingScheduleDraft({
        actorLabel: args.actorLabel,
        additionalMessage: confirmedDraft.additionalMessage?.sourceText,
        additionalMessageVisibility:
          confirmedDraft.additionalMessage?.visibility ?? "both",
        admin: args.admin,
        attendeeEmails: confirmedDraft.config.companyAttendees.map(
          (attendee) => attendee.email
        ),
        candidateName,
        companyName: text(args.state.company.companyName) || "Company",
        durationMinutes: confirmedDraft.config.durationMinutes,
        title: confirmedDraft.config.title,
        user: args.user,
        workspaceId: args.workspaceId,
      });
      if (currentDraft.draftBlocker) {
        args.state.terminalReply = formatPreparedMeetingScheduleConfirmation({
          availabilityActionLink: meetingAvailabilityActionLink({
            source: args.source,
            workspaceId: args.workspaceId,
          }),
          candidateName,
          draft: currentDraft,
        });
        recordResult(args.state, {
          callId: args.callId,
          name: args.name,
          status: "unchanged",
          summary: "인터뷰 일정 요청 전 선행 설정 필요",
        });
        return {
          candidateName,
          connectionMethod,
          decision,
          draftBlocker: currentDraft.draftBlocker,
          meetingAvailabilityUrl: buildOrgMeetingAvailabilityUrl(
            args.workspaceId
          ),
          meetingDraft: meetingDraftConfirmation(currentDraft),
          status: "meeting_setup_required",
        };
      }

      draftWriteStarted = true;
      const schedule = await createMeetingScheduleDraft({
        admin: args.admin,
        draft: currentDraft,
        recommendationId: position.recommendationId,
        roleId: current.roleId,
        sourceCompanyMessageId: args.currentUserMessageId,
        talentId,
        workspaceId: args.workspaceId,
      });
      const result = await setOrgCandidateStage({
        acceptReason: finalReason,
        expectedPreviousStage: position.stage,
        recommendationId: position.recommendationId,
        roleId: current.roleId,
        scheduleInterview: true,
        stage: "connected",
        talentId,
        user: args.user,
        workspaceId: args.workspaceId,
      });
      const changeSummary = `${candidateName}님과 연결했고, ${currentDraft.config.durationMinutes}분 미팅 정보를 준비해두었어요. 아직 ${candidateName}님께 일정 선택 메일은 보내지 않았어요.`;
      args.state.updateSummaries.push(changeSummary);
      recordResult(args.state, {
        callId: args.callId,
        name: args.name,
        status: "success",
        summary: changeSummary,
      });
      return {
        candidateName,
        changeSummary,
        connectionMethod,
        decision,
        draftBlocker: null,
        meetingDraft: meetingDraftConfirmation(currentDraft),
        nextProcess:
          "일정 화면에서 후보자에게 보낼 이메일을 확인하고 보내면, 후보자가 가능한 시간을 고를 수 있어요.",
        responseGuidance:
          "Say naturally that the candidate is connected and the meeting details are ready. Include the schedule link and explain that the user can review the candidate email there before sending it. Do not use the words 일정 요청 초안, 연결 상태, locale, public link, or enumerate everything that has not been created. State only that the candidate has not received the email yet.",
        roleId: result.roleId,
        roleName: current.name,
        scheduleAlreadyExisted: schedule.alreadyExisted,
        scheduleId: schedule.scheduleId,
        meetingScheduleUrl: buildOrgMeetingScheduleUrl(
          args.workspaceId,
          schedule.scheduleId
        ),
        stage: result.stage,
        status: "updated",
        talentId: result.talentId,
      };
    } catch (error) {
      if (!args.state.terminalReply) {
        args.state.terminalReply = draftWriteStarted
          ? "미팅 정보를 준비하던 중 결과를 끝까지 확인하지 못했어요. 중복 연락을 막기 위해 바로 다시 시도하지 말고, Inbox에서 현재 일정을 먼저 확인해 주세요. 후보자에게 메일이 보내졌다는 확인은 없어요."
          : "미팅 정보를 다시 확인하지 못했어요. 후보자에게는 아직 연락하지 않았으니, 가능 시간과 참석자를 확인한 뒤 다시 요청해 주세요.";
      }
      throw error;
    }
  }

  const introEmails =
    connectionMethod === "intro_email" ? confirmed.introEmails : null;
  if (connectionMethod === "intro_email" && !candidateEmail) {
    throw new OrgAgentToolInputError(
      "후보자 이메일이 없어 Email intro를 사용할 수 없어요."
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
    expectedPreviousStage: position.stage,
    introEmails,
    recommendationId: position.recommendationId,
    roleId: current.roleId,
    stage: "connected",
    talentId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const changeSummary =
    reactivation && connectionMethod === "intro_email"
      ? position.processClosureNotification?.status === "sent"
        ? "종료 안내가 이미 전달된 후보자의 프로세스를 다시 열고 소개 이메일을 보냈어요. 이미 표시되거나 전달된 종료 안내는 회수할 수 없어요. 이후 대화에서 회사의 상황이 바뀐 점을 직접 설명해 주세요."
        : "Harper의 별도 종료 안내를 중단하고 소개 이메일을 보냈어요. 다만 이전 종료 결정이 후보자 화면에 이미 표시됐을 수 있으므로 이후 대화에서 상황이 바뀐 점을 배려 있게 설명해 주세요."
      : reactivation
        ? position.processClosureNotification?.status === "sent"
          ? "종료 안내가 이미 전달된 후보자를 다시 연결됨으로 표시했어요. Harper는 소개 이메일을 보내지 않았어요. 회사에서 직접 연락하며 이미 안내된 종료 결정과 상황이 바뀐 점을 솔직하게 설명해 주세요."
          : "Harper의 별도 종료 안내를 중단하고 후보자를 다시 연결됨으로 표시했어요. Harper는 소개 이메일을 보내지 않았어요. 이전 종료 결정이 후보자 화면에 이미 표시됐을 수 있으므로 회사에서 직접 연락해 상황이 바뀐 점을 설명해 주세요."
        : connectionMethod === "intro_email"
          ? `${candidateName}님과 연결해드렸어요. Harper가 ${candidateName}님과 선택한 회사 수신자에게 소개 이메일을 보냈어요.`
          : `${candidateName}님과 연결해드렸어요. Harper는 소개 이메일을 보내지 않았으니 회사에서 직접 연락해 주세요.`;
  args.state.updateSummaries.push(changeSummary);
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary: changeSummary,
  });
  return {
    candidateName,
    changeSummary,
    closureNotificationDelivered:
      position.processClosureNotification?.status === "sent",
    closureNotificationDeliveredAt:
      position.processClosureNotification?.deliveredAt ?? null,
    closureNotificationSentChannel:
      position.processClosureNotification?.sentChannel ?? null,
    connectionMethod,
    decision,
    nextProcess:
      connectionMethod === "intro_email"
        ? "후보자와 선택한 회사 담당자가 같은 소개 이메일에서 인사하고 다음 일정을 직접 조율해요."
        : "Harper가 소개 이메일을 보내지 않았으므로 회사에서 후보자에게 직접 연락해 인사하고 다음 일정을 조율해 주세요.",
    responseGuidance:
      "연결이 실제로 어떻게 시작됐고 이제 양측이 무엇을 하면 되는지 설명한 뒤, 사람다운 축하와 기대의 말을 덧붙이세요.",
    roleId: result.roleId,
    roleName: current.name,
    reactivation,
    stage: result.stage,
    status: "updated",
    talentId: result.talentId,
    warmClosing: reactivation
      ? "이번 연결이 서로에게 좋은 방향으로 이어질 수 있도록 상황이 달라진 점을 후보자에게 배려 있게 설명해 주세요."
      : "서로에게 좋은 기회가 되길 바랄게요 :)",
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
  slackExecutionContext?: SlackRoleCreationExecutionContext | null;
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

  if (args.name === "start_role_creation") {
    if (args.source !== "slack" || !args.slackExecutionContext) {
      throw new OrgAgentToolInputError(
        "start_role_creation is available only in an active Slack turn"
      );
    }
    if (args.state.terminalMutationUsed) {
      throw new OrgAgentToolInputError(
        "start_role_creation may be called only once and must be the only tool in this turn"
      );
    }
    args.state.terminalMutationUsed = true;
    const roleTitle = requiredText(
      args.input && input.roleTitle,
      "roleTitle",
      200
    );
    const contextMessageCount = Number(input.contextMessageCount);
    if (
      !Number.isSafeInteger(contextMessageCount) ||
      contextMessageCount < 1 ||
      contextMessageCount > 12
    ) {
      throw new OrgAgentToolInputError(
        "contextMessageCount must be an integer between 1 and 12"
      );
    }
    const started = await startSlackRoleCreation({
      actorLabel: args.actorLabel,
      contextMessageCount,
      execution: args.slackExecutionContext,
      roleTitle,
      sourceConversation: args.conversation,
      sourceCurrentMessageId: args.currentUserMessageId,
      sourceSlackThreadId: args.slackThreadId,
      user: args.user,
      workspaceId,
    });
    args.state.requiredSlackContinuationLink = `<${started.threadPermalink}|새로운 채용 등록 이어가기>`;
    args.state.terminalReply = [
      `${started.roleTitle} 역할 등록을 함께 시작할게요.`,
      "",
      "보내주신 내용은 새 역할 대화로 옮겨 두었어요. 역할 정보와 원하는 매칭 기준은 그곳에서 이어서 정리해요.",
      "",
      args.state.requiredSlackContinuationLink,
      "",
      "등록 과정이 끝나고 나면 바로 좋은 인재분들과의 연결을 도와드리기 시작할게요 :)",
    ].join("\n");
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "success",
      summary: `${started.roleTitle} 역할 작성 스레드 시작`,
    });
    return {
      roleId: started.roleId,
      roleTitle: started.roleTitle,
      requiredContinuationLink: args.state.requiredSlackContinuationLink,
      responseExample: [
        `네, ${started.roleTitle} 역할 등록을 함께 시작할게요.`,
        "",
        "역할 등록은 새 역할 대화에서 이어갈게요. 방금 보내주신 내용도 함께 옮겨 두었어요.",
        "",
        args.state.requiredSlackContinuationLink,
        "",
        "그 대화에서 역할 정보와 어떤 기준으로 인재를 매칭하길 원하시는지 이야기해 주실수록 좋아요. 등록 과정이 끝나고 나면 바로 좋은 인재분들과의 연결을 도와드리기 시작할게요 :)",
      ].join("\n"),
      responseGuidance: [
        "Harper가 함께 채용을 준비하는 파트너처럼 사용자의 요청을 자연스럽게 받아 주세요.",
        "역할 등록을 현재 대화가 아닌 새 역할 대화에서 이어간다는 점과, 방금 받은 관련 내용도 옮겨졌다는 점을 설명해 주세요.",
        "새 대화에서 역할 정보와 매칭 기준을 더 알려 주면 왜 도움이 되는지 짧게 안내해 주세요.",
        "역할이 이미 등록됐거나 후보자 연결이 이미 시작됐다고 말하지 마세요. 대신 등록 과정이 끝나면 바로 좋은 인재분들과의 연결을 돕기 시작한다고 안내해 주세요.",
        "스레드 생성, 처리 중, 잠시 후 같은 시스템 상태 보고 문구를 쓰지 마세요.",
        "requiredContinuationLink를 제외한 제목이나 본문에는 '새로운 채용 등록 이어가기' 문구를 반복하지 마세요.",
      ].join(" "),
      status: "started",
      threadPermalink: started.threadPermalink,
      webUrl: started.webUrl,
    };
  } else if (args.name === "web_search") {
    result = await executeSharedWebSearch(input, {
      admin: args.admin as unknown as TalentAdminClient,
    });
    args.state.successfulWebSearchQueries.add(externalQueryKey(input.query));
  } else if (args.name === "open_url") {
    result = (await executeSharedOpenUrl({
      admin: args.admin as unknown as TalentAdminClient,
      input,
    })) as Record<string, unknown>;
    args.state.openedUrls.add(externalUrlKey(input.url));
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
  } else if (args.name === "update_role_criteria") {
    return executeUpdateRoleCriteria({
      actorLabel: args.actorLabel,
      callId: args.callId,
      input,
      name: args.name,
      source: args.source,
      state: args.state,
      user: args.user,
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
        user: args.user,
        workspaceId,
      });
    } catch (error) {
      if (error instanceof CompanyDataMutationError) {
        throw new OrgAgentToolInputError(`${error.code}: ${error.message}`);
      }
      throw error;
    }
  } else if (args.name === "contact_talent") {
    return executeCandidateContactLifecycle({
      admin: args.admin,
      callId: args.callId,
      conversation: args.conversation,
      currentUserMessageId: args.currentUserMessageId,
      input,
      name: args.name,
      slackThreadId: args.slackThreadId,
      source: args.source,
      state: args.state,
      user: args.user,
      workspaceId,
    });
  } else if (args.name === "manage_role_pipeline_stages") {
    return executeManageRolePipelineStages({
      admin: args.admin,
      callId: args.callId,
      input,
      name: args.name,
      state: args.state,
      user: args.user,
      workspaceId,
    });
  } else if (args.name === "move_candidate_stage") {
    return executeMoveCandidateStage({
      admin: args.admin,
      callId: args.callId,
      input,
      name: args.name,
      state: args.state,
      user: args.user,
      workspaceId,
    });
  } else if (args.name === "manage_interview_availability") {
    return executeManageInterviewAvailability({
      callId: args.callId,
      input,
      name: args.name,
      source: args.source,
      state: args.state,
      user: args.user,
      workspaceId,
    });
  } else if (args.name === "prepare_candidate_connection") {
    return executePrepareCandidateConnection({
      actorId: args.actorId,
      actorLabel: args.actorLabel,
      admin: args.admin,
      callId: args.callId,
      input,
      name: args.name,
      slackThreadId: args.slackThreadId,
      source: args.source,
      state: args.state,
      user: args.user,
      workspaceId,
    });
  } else {
    return executeCandidateConnectionDecision({
      actorId: args.actorId,
      actorLabel: args.actorLabel,
      admin: args.admin,
      callId: args.callId,
      conversation: args.conversation,
      currentUserMessageId: args.currentUserMessageId,
      input,
      name: args.name,
      slackThreadId: args.slackThreadId,
      source: args.source,
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
                ? "역할 상세 조회"
                : args.name === "get_more_data"
                  ? "회사 정보 조회"
                  : "이전 대화 조회",
  });
  return result;
}
