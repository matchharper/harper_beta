import type { User } from "@supabase/supabase-js";
import {
  readOrgAgentCandidateContext,
  readOrgAgentRoleFeed,
  type OrgAgentPromptContext,
  type OrgAgentRoleFeedEventType,
} from "@/lib/org/agent/context";
import type { OrgAgentConversationRow } from "@/lib/org/agent/store";
import type {
  OrgAgentMention,
  OrgAgentMessageAction,
  OrgAgentMessageMetadata,
} from "@/lib/org/agent/types";
import {
  type OrgAgentMeetingTopic,
  type OrgAgentRequestImpact,
  type OrgAgentToolName,
} from "@/lib/org/agent/tools";
import {
  updateOrgRoleRequestOnly,
  updateOrgWorkspaceRequestOnly,
} from "@/lib/org/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

type RequestChange = NonNullable<
  OrgAgentMessageMetadata["requestChanges"]
>[number];

type ToolResultMetadata = NonNullable<
  OrgAgentMessageMetadata["toolResults"]
>[number];

export type OrgAgentToolExecutionState = {
  actions: OrgAgentMessageAction[];
  companyRequest: string | null;
  requestChanges: RequestChange[];
  roleRequest: string | null;
  toolResults: ToolResultMetadata[];
};

export class OrgAgentToolInputError extends Error {}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => normalizeText(item)).filter(Boolean))
  ).slice(0, maxItems);
}

function sanitizeRequest(value: unknown) {
  const text = normalizeText(value)
    .replaceAll("\u0000", "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n");
  if (!text) {
    throw new OrgAgentToolInputError("nextRequest must not be empty");
  }
  if (text.length > 6_000) {
    throw new OrgAgentToolInputError(
      "nextRequest exceeds 6,000 characters; preserve the criteria in a shorter complete request"
    );
  }
  return text;
}

function parseImpact(value: unknown): OrgAgentRequestImpact {
  if (
    value === "hard_filter" ||
    value === "soft_preference" ||
    value === "calibration_note"
  ) {
    return value;
  }
  throw new OrgAgentToolInputError(
    "impact must be hard_filter, soft_preference, or calibration_note"
  );
}

function parseRequestUpdateInput(value: unknown) {
  const record = asRecord(value);
  const nextRequest = sanitizeRequest(record.nextRequest);
  const changeSummary = normalizeText(record.changeSummary).slice(0, 500);
  if (!changeSummary) {
    throw new OrgAgentToolInputError("changeSummary is required");
  }
  return {
    changeSummary,
    impact: parseImpact(record.impact),
    nextRequest,
    referencedTalentIds: stringArray(record.referencedTalentIds, 3),
  };
}

function ensureNoNewCandidateReference(args: {
  currentRequest: string | null;
  mentions: OrgAgentMention[];
  nextRequest: string;
}) {
  const current = normalizeText(args.currentRequest).toLocaleLowerCase();
  const next = args.nextRequest.toLocaleLowerCase();
  const references = args.mentions.flatMap((mention) => [
    normalizeText(mention.talentId),
    normalizeText(mention.displayName),
  ]);

  for (const reference of references) {
    const normalized = reference.toLocaleLowerCase();
    if (
      normalized.length >= 2 &&
      next.includes(normalized) &&
      !current.includes(normalized)
    ) {
      throw new OrgAgentToolInputError(
        "nextRequest must express objective criteria and must not add candidate names or talent IDs"
      );
    }
  }
}

function createRequestUpdatedAction(args: {
  changeSummary: string;
  scope: "company" | "role";
}): OrgAgentMessageAction {
  return {
    id: crypto.randomUUID(),
    kind: "request_updated",
    label:
      args.scope === "role" ? "역할 기준 업데이트됨" : "회사 기준 업데이트됨",
    payload: {
      changeSummary: args.changeSummary,
      scope: args.scope,
    },
  };
}

function createMeetingAction(args: {
  reason: string;
  topic: OrgAgentMeetingTopic;
}): OrgAgentMessageAction {
  return {
    id: crypto.randomUUID(),
    kind: "schedule_meeting",
    label: "Harper 팀에 미팅 요청",
    payload: {
      reason: args.reason,
      topic: args.topic,
    },
  };
}

function recordResult(
  state: OrgAgentToolExecutionState,
  result: ToolResultMetadata
) {
  state.toolResults.push(result);
}

function parseMeetingTopic(value: unknown): OrgAgentMeetingTopic {
  if (
    value === "new_role" ||
    value === "custom_search" ||
    value === "workflow_question" ||
    value === "pricing_or_contract" ||
    value === "integration" ||
    value === "other"
  ) {
    return value;
  }
  throw new OrgAgentToolInputError("schedule_meeting topic is invalid");
}

function parseEventTypes(value: unknown) {
  const allowed = new Set<OrgAgentRoleFeedEventType>([
    "recommended",
    "accepted",
    "rejected",
    "note",
    "stage_changed",
  ]);
  return stringArray(value, 5).filter(
    (item): item is OrgAgentRoleFeedEventType =>
      allowed.has(item as OrgAgentRoleFeedEventType)
  );
}

export function createOrgAgentToolExecutionState(
  context: OrgAgentPromptContext
): OrgAgentToolExecutionState {
  return {
    actions: [],
    companyRequest: context.workspace.request,
    requestChanges: [],
    roleRequest: context.role.request,
    toolResults: [],
  };
}

export function getOrgAgentToolStatusLabel(args: {
  name: OrgAgentToolName;
  status: "done" | "error" | "running";
}) {
  const labels: Record<OrgAgentToolName, [string, string, string]> = {
    read_candidate_context: [
      "후보자 정보를 더 확인하는 중",
      "후보자 정보 확인 완료",
      "후보자 정보를 확인하지 못했습니다",
    ],
    read_role_feed: [
      "이전 역할 피드를 읽는 중",
      "이전 역할 피드 확인 완료",
      "이전 역할 피드를 읽지 못했습니다",
    ],
    schedule_meeting: [
      "미팅 요청 버튼을 준비하는 중",
      "미팅 요청 버튼 준비 완료",
      "미팅 요청 버튼을 준비하지 못했습니다",
    ],
    update_company_request: [
      "회사 전체 인재 기준을 업데이트하는 중",
      "회사 전체 인재 기준 업데이트 완료",
      "회사 전체 인재 기준을 업데이트하지 못했습니다",
    ],
    update_role_request: [
      "역할 추천 기준을 업데이트하는 중",
      "역할 추천 기준 업데이트 완료",
      "역할 추천 기준을 업데이트하지 못했습니다",
    ],
  };
  const index = args.status === "running" ? 0 : args.status === "done" ? 1 : 2;
  return labels[args.name][index];
}

export async function executeOrgAgentTool(args: {
  admin: SupabaseAdminClient;
  callId: string;
  conversation: OrgAgentConversationRow;
  input: unknown;
  mentions: OrgAgentMention[];
  name: OrgAgentToolName;
  state: OrgAgentToolExecutionState;
  user: User;
}): Promise<Record<string, unknown>> {
  if (args.name === "update_role_request") {
    const input = parseRequestUpdateInput(args.input);
    ensureNoNewCandidateReference({
      currentRequest: args.state.roleRequest,
      mentions: args.mentions,
      nextRequest: input.nextRequest,
    });
    if (normalizeText(args.state.roleRequest) === input.nextRequest) {
      recordResult(args.state, {
        callId: args.callId,
        name: args.name,
        status: "unchanged",
        summary: input.changeSummary,
      });
      return {
        changeSummary: input.changeSummary,
        impact: input.impact,
        scope: "active_role",
        status: "already_reflected",
      };
    }

    const result = await updateOrgRoleRequestOnly({
      expectedRequest: args.state.roleRequest,
      request: input.nextRequest,
      roleId: args.conversation.role_id,
      user: args.user,
      workspaceId: args.conversation.company_workspace_id,
    });
    const change: RequestChange = {
      after: result.role.request,
      before: result.previousRequest,
      changeSummary: input.changeSummary,
      scope: "role",
    };
    args.state.roleRequest = result.role.request;
    args.state.requestChanges.push(change);
    args.state.actions.push(
      createRequestUpdatedAction({
        changeSummary: input.changeSummary,
        scope: "role",
      })
    );
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "success",
      summary: input.changeSummary,
    });
    return {
      changeSummary: input.changeSummary,
      impact: input.impact,
      referencedTalentIds: input.referencedTalentIds,
      scope: "active_role",
      status: "updated",
      updatedAt: result.role.updatedAt,
    };
  }

  if (args.name === "update_company_request") {
    const input = parseRequestUpdateInput(args.input);
    ensureNoNewCandidateReference({
      currentRequest: args.state.companyRequest,
      mentions: args.mentions,
      nextRequest: input.nextRequest,
    });
    if (normalizeText(args.state.companyRequest) === input.nextRequest) {
      recordResult(args.state, {
        callId: args.callId,
        name: args.name,
        status: "unchanged",
        summary: input.changeSummary,
      });
      return {
        changeSummary: input.changeSummary,
        impact: input.impact,
        scope: "company_wide",
        status: "already_reflected",
      };
    }

    const result = await updateOrgWorkspaceRequestOnly({
      expectedRequest: args.state.companyRequest,
      request: input.nextRequest,
      user: args.user,
      workspaceId: args.conversation.company_workspace_id,
    });
    const change: RequestChange = {
      after: result.workspace.request,
      before: result.previousRequest,
      changeSummary: input.changeSummary,
      scope: "company",
    };
    args.state.companyRequest = result.workspace.request;
    args.state.requestChanges.push(change);
    args.state.actions.push(
      createRequestUpdatedAction({
        changeSummary: input.changeSummary,
        scope: "company",
      })
    );
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "success",
      summary: input.changeSummary,
    });
    return {
      changeSummary: input.changeSummary,
      impact: input.impact,
      referencedTalentIds: input.referencedTalentIds,
      scope: "company_wide",
      status: "updated",
      updatedAt: result.workspace.updatedAt,
    };
  }

  if (args.name === "schedule_meeting") {
    const input = asRecord(args.input);
    const topic = parseMeetingTopic(input.topic);
    const reason = normalizeText(input.reason).slice(0, 800);
    if (!reason) throw new OrgAgentToolInputError("reason is required");
    const existing = args.state.actions.find(
      (action) => action.kind === "schedule_meeting"
    );
    if (!existing) {
      args.state.actions.push(createMeetingAction({ reason, topic }));
    }
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: existing ? "unchanged" : "success",
      summary: reason,
    });
    return {
      buttonLabel: "Harper 팀에 미팅 요청",
      reason,
      status: existing ? "cta_already_created" : "cta_created",
      suggestedMessage: normalizeText(input.suggestedMessage).slice(0, 300),
      topic,
      userMustClickToSend: true,
    };
  }

  if (args.name === "read_role_feed") {
    const input = asRecord(args.input);
    const before = normalizeText(input.before) || null;
    if (before && !Number.isFinite(Date.parse(before))) {
      throw new OrgAgentToolInputError("before must be a valid ISO timestamp");
    }
    const limitValue = Number(input.limit ?? 20);
    const result = await readOrgAgentRoleFeed({
      admin: args.admin,
      before,
      eventTypes: parseEventTypes(input.eventTypes),
      limit: Number.isFinite(limitValue) ? limitValue : 20,
      roleId: args.conversation.role_id,
      talentIds: stringArray(input.talentIds, 5),
    });
    recordResult(args.state, {
      callId: args.callId,
      name: args.name,
      status: "success",
      summary: "현재 역할의 추가 피드를 조회함",
    });
    return {
      activity: result.text,
      nextBefore: result.nextBefore,
      scope: "active_role_only",
      status: "ok",
    };
  }

  const input = asRecord(args.input);
  const talentIds = stringArray(input.talentIds, 3);
  if (talentIds.length === 0) {
    throw new OrgAgentToolInputError("talentIds must contain 1-3 IDs");
  }
  const candidateContext = await readOrgAgentCandidateContext({
    admin: args.admin,
    includeFeed: input.includeFeed === true,
    roleId: args.conversation.role_id,
    talentIds,
  });
  recordResult(args.state, {
    callId: args.callId,
    name: args.name,
    status: "success",
    summary: `${talentIds.length}명 후보자 정보를 조회함`,
  });
  return {
    candidateContext,
    scope: "active_role_pipeline_only",
    status: "ok",
  };
}
