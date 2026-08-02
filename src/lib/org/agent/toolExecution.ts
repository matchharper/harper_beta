import type { User } from "@supabase/supabase-js";
import {
  getOrgAgentTalents,
  readOrgAgentRole,
  readOrgAgentTalent,
  type OrgAgentAdminClient,
} from "@/lib/org/agent/data";
import type { OrgAgentConversationRow } from "@/lib/org/agent/store";
import type { OrgAgentMessageAction } from "@/lib/org/agent/types";
import type { OrgAgentToolName } from "@/lib/org/agent/tools";
import {
  createOrgAgentToolExecutionState,
  promoteOrgAgentToolReadVisibility,
  type OrgAgentToolExecutionState,
  type OrgAgentToolResultMetadata,
} from "@/lib/org/agent/toolState";
import {
  updateOrgRole,
  updateOrgRoleRequestOnly,
  updateOrgWorkspace,
  updateOrgWorkspaceRequestOnly,
  setOrgCandidateStage,
} from "@/lib/org/server";

export { createOrgAgentToolExecutionState, promoteOrgAgentToolReadVisibility };
export type { OrgAgentToolExecutionState };

export class OrgAgentToolInputError extends Error {}

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

function stringArray(
  value: unknown,
  allowed: readonly string[],
  maxItems: number
) {
  if (!Array.isArray(value)) {
    throw new OrgAgentToolInputError("employmentTypes must be an array");
  }
  const items = Array.from(new Set(value.map(text).filter(Boolean))).slice(
    0,
    maxItems
  );
  if (items.some((item) => !allowed.includes(item))) {
    throw new OrgAgentToolInputError(
      `employmentTypes must contain only: ${allowed.join(", ")}`
    );
  }
  return items;
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

function updateAction(args: {
  changeSummary: string;
  scope: "company" | "role";
}): OrgAgentMessageAction {
  return {
    id: crypto.randomUUID(),
    kind: "entity_updated",
    label:
      args.scope === "company"
        ? "회사 정보 업데이트됨"
        : "포지션 정보 업데이트됨",
    payload: {
      changeSummary: args.changeSummary,
      scope: args.scope,
    },
  };
}

function addSuccessfulUpdate(args: {
  callId: string;
  changeSummary: string;
  name: OrgAgentToolName;
  scope: "company" | "role";
  state: OrgAgentToolExecutionState;
}) {
  args.state.actions.push(
    updateAction({
      changeSummary: args.changeSummary,
      scope: args.scope,
    })
  );
  args.state.updateSummaries.push(args.changeSummary);
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary: args.changeSummary,
  });
}

function addRequestChange(args: {
  after: string | null;
  before: string | null;
  changeSummary: string;
  scope: "company" | "role";
  state: OrgAgentToolExecutionState;
}) {
  if (args.before === args.after) return;
  args.state.requestChanges.push({
    after: args.after,
    before: args.before,
    changeSummary: args.changeSummary,
    scope: args.scope,
  });
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
    update_company: [
      "회사 정보를 업데이트하는 중",
      "회사 정보 업데이트 완료",
      "회사 정보를 업데이트하지 못했습니다",
    ],
    update_role: [
      "포지션 정보를 업데이트하는 중",
      "포지션 정보 업데이트 완료",
      "포지션 정보를 업데이트하지 못했습니다",
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
  input: Record<string, unknown>;
  workspaceId: string;
}) {
  return getOrgAgentTalents({
    admin: args.admin,
    limit: boundedInteger(args.input.limit, 10, 1, 20),
    offset: boundedInteger(args.input.offset, 0, 0, 200),
    query: requiredText(args.input.query, "query", 200),
    roleId: text(args.input.roleId) || null,
    workspaceId: args.workspaceId,
  });
}

async function executeReadTalent(args: {
  admin: OrgAgentAdminClient;
  input: Record<string, unknown>;
  workspaceId: string;
}) {
  return readOrgAgentTalent({
    admin: args.admin,
    includeProfile: booleanField(args.input, "includeProfile", false),
    progressLimit: boundedInteger(args.input.progressLimit, 10, 1, 30),
    roleId: text(args.input.roleId) || null,
    talentId: requiredText(args.input.talentId, "talentId", 100),
    workspaceId: args.workspaceId,
  });
}

async function executeReadRole(args: {
  admin: OrgAgentAdminClient;
  input: Record<string, unknown>;
  state: OrgAgentToolExecutionState;
  workspaceId: string;
}) {
  const role = roleOrThrow(args.state, args.input.roleId);
  const result = await readOrgAgentRole({
    admin: args.admin,
    includeDescription: booleanField(args.input, "includeDescription", true),
    peopleLimit: boundedInteger(args.input.peopleLimit, 10, 1, 20),
    peopleOffset: boundedInteger(args.input.peopleOffset, 0, 0, 200),
    recentUpdateLimit: boundedInteger(args.input.recentUpdateLimit, 10, 0, 20),
    roleId: role.roleId,
    stage: text(args.input.stage) || null,
    workspaceId: args.workspaceId,
  });
  // A read and a write can appear in the same parallel tool-call batch. The
  // model has not seen this result yet, so chat.ts promotes this ID only after
  // the whole batch finishes and before the next completion.
  args.state.pendingFullRoleRequestIds.add(role.roleId);
  return result;
}

async function executeUpdateCompany(args: {
  callId: string;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  state: OrgAgentToolExecutionState;
  user: User;
  workspaceId: string;
}) {
  const changeSummary = requiredText(
    args.input.changeSummary,
    "changeSummary",
    500
  );
  const description = nullableTextField(
    args.input,
    "companyDescription",
    8_000
  );
  const pitch = nullableTextField(args.input, "pitch", 8_000);
  const request = nullableTextField(args.input, "request", 6_000);
  if (!description.present && !pitch.present && !request.present) {
    throw new OrgAgentToolInputError(
      "update_company needs at least one changed field"
    );
  }

  const before = args.state.company;
  const next = {
    companyDescription: description.present
      ? description.value
      : before.companyDescription,
    pitch: pitch.present ? pitch.value : before.pitch,
    request: request.present ? request.value : before.request,
  };
  const unchanged =
    next.companyDescription === before.companyDescription &&
    next.pitch === before.pitch &&
    next.request === before.request;
  if (unchanged) {
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "unchanged",
      summary: changeSummary,
    });
    return { changeSummary, status: "already_reflected" };
  }

  const result =
    request.present && !description.present && !pitch.present
      ? await updateOrgWorkspaceRequestOnly({
          expectedRequest: before.request,
          request: next.request,
          user: args.user,
          workspaceId: args.workspaceId,
        })
      : await updateOrgWorkspace({
          companyDescription: next.companyDescription,
          pitch: next.pitch,
          request: next.request,
          user: args.user,
          workspaceId: args.workspaceId,
        });
  args.state.company = result.workspace;
  addRequestChange({
    after: result.workspace.request,
    before: before.request,
    changeSummary,
    scope: "company",
    state: args.state,
  });
  addSuccessfulUpdate({
    callId: args.callId,
    changeSummary,
    name: args.name,
    scope: "company",
    state: args.state,
  });
  return {
    changeSummary,
    company: result.workspace,
    status: "updated",
  };
}

async function executeUpdateRole(args: {
  callId: string;
  input: Record<string, unknown>;
  name: OrgAgentToolName;
  state: OrgAgentToolExecutionState;
  user: User;
  workspaceId: string;
}) {
  const current = roleOrThrow(args.state, args.input.roleId);
  const changeSummary = requiredText(
    args.input.changeSummary,
    "changeSummary",
    500
  );
  const name = nullableTextField(args.input, "name", 200);
  if (name.present && name.value === null) {
    throw new OrgAgentToolInputError("name cannot be cleared");
  }
  const description = nullableTextField(args.input, "description", 20_000);
  const externalJdUrl = nullableTextField(args.input, "externalJdUrl", 2_000);
  const locationText = nullableTextField(args.input, "locationText", 300);
  const request = nullableTextField(args.input, "request", 6_000);
  const workMode = nullableTextField(args.input, "workMode", 20);
  const status = nullableTextField(args.input, "status", 30);
  if (request.present && !args.state.fullRoleRequestIds.has(current.roleId)) {
    throw new OrgAgentToolInputError(
      "The role request was compacted. Call read_role for this role before replacing request."
    );
  }
  if (
    workMode.present &&
    workMode.value !== null &&
    !["onsite", "hybrid", "remote"].includes(workMode.value)
  ) {
    throw new OrgAgentToolInputError(
      "workMode must be onsite, hybrid, remote, or null"
    );
  }
  if (
    status.present &&
    (status.value === null ||
      !["top_priority", "active", "paused", "ended"].includes(status.value))
  ) {
    throw new OrgAgentToolInputError(
      "status must be top_priority, active, paused, or ended"
    );
  }
  const employmentTypes = has(args.input, "employmentTypes")
    ? stringArray(
        args.input.employmentTypes,
        ["full_time", "part_time", "internship", "contract"],
        4
      )
    : undefined;
  const supplied =
    name.present ||
    description.present ||
    externalJdUrl.present ||
    locationText.present ||
    request.present ||
    workMode.present ||
    status.present ||
    employmentTypes !== undefined;
  if (!supplied) {
    throw new OrgAgentToolInputError(
      "update_role needs at least one changed field"
    );
  }

  const unchanged =
    (!name.present || name.value === current.name) &&
    (!description.present || description.value === current.description) &&
    (!externalJdUrl.present || externalJdUrl.value === current.externalJdUrl) &&
    (!locationText.present || locationText.value === current.locationText) &&
    (!request.present || request.value === current.request) &&
    (!workMode.present || workMode.value === current.workMode) &&
    (!status.present || status.value === current.status) &&
    (employmentTypes === undefined ||
      (employmentTypes.length === current.employmentTypes.length &&
        employmentTypes.every((value) =>
          current.employmentTypes.includes(value)
        )));
  if (unchanged) {
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "unchanged",
      summary: changeSummary,
    });
    return {
      changeSummary,
      roleId: current.roleId,
      status: "already_reflected",
    };
  }

  const requestOnly =
    request.present &&
    !name.present &&
    !description.present &&
    !externalJdUrl.present &&
    !locationText.present &&
    !workMode.present &&
    !status.present &&
    employmentTypes === undefined;
  const result = requestOnly
    ? await updateOrgRoleRequestOnly({
        expectedRequest: current.request,
        request: request.value,
        roleId: current.roleId,
        user: args.user,
        workspaceId: args.workspaceId,
      })
    : await updateOrgRole({
        ...(description.present && { description: description.value }),
        ...(employmentTypes !== undefined && { employmentTypes }),
        ...(externalJdUrl.present && { externalJdUrl: externalJdUrl.value }),
        ...(locationText.present && { locationText: locationText.value }),
        ...(name.present && { name: name.value }),
        ...(request.present && { request: request.value }),
        roleId: current.roleId,
        ...(status.present && { status: status.value }),
        user: args.user,
        ...(workMode.present && { workMode: workMode.value }),
        workspaceId: args.workspaceId,
      });

  args.state.roleById.set(current.roleId, result.role);
  addRequestChange({
    after: result.role.request,
    before: current.request,
    changeSummary,
    scope: "role",
    state: args.state,
  });
  addSuccessfulUpdate({
    callId: args.callId,
    changeSummary,
    name: args.name,
    scope: "role",
    state: args.state,
  });
  return {
    changeSummary,
    role: result.role,
    status: "updated",
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
    includeProfile: false,
    roleId: current.roleId,
    talentId,
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
  admin: OrgAgentAdminClient;
  callId: string;
  conversation: OrgAgentConversationRow;
  currentUserMessageId: number;
  input: unknown;
  name: OrgAgentToolName;
  slackThreadId: string | null;
  state: OrgAgentToolExecutionState;
  user: User;
}): Promise<Record<string, unknown>> {
  const input = record(args.input);
  const workspaceId = args.conversation.company_workspace_id;
  let result: Record<string, unknown>;

  if (args.name === "get_talents") {
    result = await executeGetTalents({
      admin: args.admin,
      input,
      workspaceId,
    });
  } else if (args.name === "read_talent") {
    result = await executeReadTalent({
      admin: args.admin,
      input,
      workspaceId,
    });
  } else if (args.name === "read_role") {
    result = await executeReadRole({
      admin: args.admin,
      input,
      state: args.state,
      workspaceId,
    });
  } else if (args.name === "update_company") {
    return executeUpdateCompany({
      callId: args.callId,
      input,
      name: args.name,
      state: args.state,
      user: args.user,
      workspaceId,
    });
  } else if (args.name === "update_role") {
    return executeUpdateRole({
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
          : "포지션 상세 조회",
  });
  return result;
}
