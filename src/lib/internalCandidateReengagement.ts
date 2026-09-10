import "server-only";

import { randomUUID } from "crypto";
import type { User } from "@supabase/supabase-js";
import {
  createCompanyTalentContactDraft,
  scheduleCompanyTalentContact,
} from "@/lib/companyTalentRequests/server";
import { generateCandidateContactDraft } from "@/lib/companyTalentRequests/copy";
import type { OrgStageId } from "@/lib/org/server";

type AdminClient = any;

export type CandidateReengagementResolution =
  | "ask_candidate"
  | "company_confirmed";

export type CandidateReengagementRequired = {
  candidateName: string;
  currentStage: string;
  ok: true;
  requestedStage: OrgStageId;
  roleId: string;
  roleName: string;
  status: "candidate_reengagement_required";
  talentId: string;
};

function text(value: unknown, maxLength = 2_000) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

const BUILT_IN_STAGE_LABELS: Partial<Record<OrgStageId, string>> = {
  connected: "연결됨",
  final_offer: "최종 오퍼",
  pending_connection: "연결 대기",
};

export async function internalCandidatePairIsClosed(args: {
  admin: AdminClient;
  recommendationId?: string | null;
  roleId: string;
  talentId: string;
}) {
  let query = args.admin
    .from("talent_opportunity_recommendation")
    .select("id, saved_stage, updated_at")
    .eq("role_id", args.roleId)
    .eq("talent_id", args.talentId)
    .eq("saved_stage", "closed")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (args.recommendationId) {
    query = query.eq("id", args.recommendationId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return {
    closed: Array.isArray(data) && data.length > 0,
    recommendationId:
      text(
        (Array.isArray(data) ? data[0]?.id : null) ?? args.recommendationId
      ) || null,
  };
}

export function candidateReengagementAppliesToStage(stage: string) {
  return (
    stage === "pending_connection" ||
    stage === "connected" ||
    stage === "final_offer" ||
    stage.startsWith("custom:")
  );
}

export function internalCandidateRoleIsOpen(role: {
  is_expired?: unknown;
  status?: unknown;
}) {
  const status = text(role.status, 80).toLowerCase();
  return !["ended", "deleted"].includes(status) && role.is_expired !== true;
}

async function reengagementStageLabel(args: {
  admin: AdminClient;
  roleId: string;
  stage: OrgStageId;
}) {
  const builtIn = BUILT_IN_STAGE_LABELS[args.stage];
  if (builtIn) return builtIn;
  if (!args.stage.startsWith("custom:")) return "진행 중";
  const stageId = args.stage.slice("custom:".length).trim();
  const { data, error } = await args.admin
    .from("ops_matching_role_stages")
    .select("label")
    .eq("id", stageId)
    .eq("role_id", args.roleId)
    .maybeSingle();
  if (error) throw error;
  return text(data?.label, 80) || "다음 프로세스";
}

async function insertProgress(args: {
  actorEmail?: string | null;
  actorUserId?: string | null;
  admin: AdminClient;
  eventKey?: string | null;
  kind: string;
  metadata: Record<string, unknown>;
  recommendationId: string | null;
  roleId: string;
  talentId: string;
  text: string;
}) {
  const metadata = {
    ...args.metadata,
    ...(args.eventKey ? { eventKey: args.eventKey } : {}),
  };
  const { error } = await args.admin.from("talent_progress").insert({
    company_user_id: args.actorUserId ?? null,
    kind: args.kind,
    metadata,
    recommendation_id: args.recommendationId,
    role_id: args.roleId,
    talent_id: args.talentId,
    text: args.text,
    user_id: args.actorEmail ?? "harper",
  });
  if (error?.code === "23505" && args.eventKey) return;
  if (error) throw error;
}

export async function recordCandidateReengagementRequired(args: {
  actorEmail?: string | null;
  actorUserId?: string | null;
  actionKey?: string | null;
  admin: AdminClient;
  currentStage: string;
  recommendationId: string;
  roleId: string;
  stage: OrgStageId;
  talentId: string;
}) {
  const stageLabel = await reengagementStageLabel(args);
  await insertProgress({
    actorEmail: args.actorEmail,
    actorUserId: args.actorUserId,
    admin: args.admin,
    eventKey: args.actionKey
      ? `candidate-reengagement-required:${args.actionKey}`
      : null,
    kind: "internal_process_reengagement_required",
    metadata: {
      currentStage: args.currentStage,
      requestedStage: args.stage,
      requestedStageLabel: stageLabel,
      status: "waiting_for_company_direction",
    },
    recommendationId: args.recommendationId,
    roleId: args.roleId,
    talentId: args.talentId,
    text: `회사가 후보자를 ${stageLabel} 단계로 진행해달라고 요청했지만, 후보자에게 종료 안내가 전달된 상태여서 다시 연결받을 의향을 먼저 확인할지 회사의 결정을 기다리고 있습니다.`,
  });
}

export async function confirmCandidateReengagementByCompany(args: {
  actorEmail?: string | null;
  actorUserId?: string | null;
  actionKey?: string | null;
  admin: AdminClient;
  recommendationId: string;
  roleId: string;
  stage: OrgStageId;
  talentId: string;
}) {
  const stageLabel = await reengagementStageLabel(args);
  const confirmedAt = new Date().toISOString();
  const eventKey = args.actionKey
    ? `candidate-reengagement-confirmed:${args.actionKey}`
    : null;
  const { data, error } = await args.admin.rpc(
    "confirm_internal_candidate_reengagement_v1",
    {
      p_actor_email: args.actorEmail ?? null,
      p_actor_user_id: args.actorUserId ?? null,
      p_metadata: {
        confirmationContext: "company_reported_direct_candidate_confirmation",
        confirmedAt,
        consentSource: "company_confirmed",
        ...(eventKey ? { eventKey } : {}),
        requestedStage: args.stage,
        requestedStageLabel: stageLabel,
        stage: args.stage,
      },
      p_recommendation_id: args.recommendationId,
      p_role_id: args.roleId,
      p_stage: args.stage,
      p_talent_id: args.talentId,
      p_text: `회사가 후보자에게 다시 진행 의향을 직접 확인했다고 알려 종료 상태를 복구하고 ${stageLabel} 단계 진행을 계속합니다.`,
    }
  );
  if (error) throw error;
  return data === true;
}

export async function recordCandidateReengagementRequested(args: {
  actorEmail?: string | null;
  actorUserId?: string | null;
  admin: AdminClient;
  recommendationId: string;
  requestContext: string;
  requestId: string;
  roleId: string;
  stage: OrgStageId;
  status: "draft" | "waiting_for_candidate_reply";
  talentId: string;
}) {
  const stageLabel = await reengagementStageLabel(args);
  await insertProgress({
    actorEmail: args.actorEmail,
    actorUserId: args.actorUserId,
    admin: args.admin,
    eventKey: `candidate-reengagement-requested:${args.requestId}:${args.status}`,
    kind: "internal_process_reengagement_requested",
    metadata: {
      requestContext: args.requestContext,
      requestId: args.requestId,
      requestedStage: args.stage,
      requestedStageLabel: stageLabel,
      status: args.status,
    },
    recommendationId: args.recommendationId,
    roleId: args.roleId,
    talentId: args.talentId,
    text:
      args.status === "draft"
        ? `회사가 Harper에게 후보자의 재진행 의사를 물어봐 달라고 요청했습니다. ${stageLabel} 단계로 다시 진행할 의향을 확인하는 연락 초안을 회사가 검토하고 있습니다.`
        : `회사의 요청으로 Harper가 후보자에게 ${stageLabel} 단계로 다시 진행할 의향이 있는지 확인하기로 했습니다. 후보자의 답변을 기다리고 있습니다.`,
  });
}

async function ensureHiddenSourceMessage(args: {
  actorUserId?: string | null;
  admin: AdminClient;
  content: string;
  metadata: Record<string, unknown>;
  roleId: string;
  workspaceId: string;
}) {
  const conversationSelect =
    "id, company_workspace_id, role_id, created_at, updated_at";
  let { data: conversation, error: conversationError } = await args.admin
    .from("company_conversations")
    .select(conversationSelect)
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", args.roleId)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) {
    const now = new Date().toISOString();
    const inserted = await args.admin
      .from("company_conversations")
      .insert({
        company_workspace_id: args.workspaceId,
        created_at: now,
        metadata: { phase: "completed", scope: "role_creation" },
        role_id: args.roleId,
        title: null,
        updated_at: now,
      })
      .select(conversationSelect)
      .single();
    if (inserted.error?.code === "23505") {
      const raced = await args.admin
        .from("company_conversations")
        .select(conversationSelect)
        .eq("company_workspace_id", args.workspaceId)
        .eq("role_id", args.roleId)
        .single();
      if (raced.error) throw raced.error;
      conversation = raced.data;
    } else if (inserted.error) {
      throw inserted.error;
    } else {
      conversation = inserted.data;
    }
  }

  const now = new Date().toISOString();
  const { data: message, error: messageError } = await args.admin
    .from("company_messages")
    .insert({
      company_user_id: args.actorUserId ?? null,
      company_workspace_id: args.workspaceId,
      content: args.content,
      conversation_id: conversation.id,
      created_at: now,
      mentions: [],
      message_type: "candidate_reengagement",
      metadata: args.metadata,
      role: "user",
      role_id: args.roleId,
      status: "completed",
      thinking_logs: [],
    })
    .select("id")
    .single();
  if (messageError) throw messageError;
  return Number(message.id);
}

export async function requestCandidateReengagement(args: {
  actorEmail?: string | null;
  actorUserId?: string | null;
  admin: AdminClient;
  recommendationId: string;
  roleId: string;
  stage?: OrgStageId | null;
  talentId: string;
  workspaceId: string;
}) {
  const stage = args.stage ?? "pending_connection";
  const closed = await internalCandidatePairIsClosed(args);
  if (!closed.closed) {
    throw new Error("candidate_reengagement_no_longer_required");
  }

  const requestSelect =
    "id, intent, request_context, resume_stage, workflow_status, draft_revision";
  const loadExistingRequest = async (args_: {
    intent?: "candidate_reengagement";
    statuses: string[];
  }) => {
    let query = args.admin
      .from("company_talent_requests")
      .select(requestSelect)
      .eq("company_workspace_id", args.workspaceId)
      .eq("role_id", args.roleId)
      .eq("talent_id", args.talentId)
      .in("workflow_status", args_.statuses)
      .is("talent_source_message_id", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (args_.intent) query = query.eq("intent", args_.intent);
    return query.maybeSingle();
  };
  const preSendRequest = await loadExistingRequest({
    statuses: ["draft", "queued", "failed"],
  });
  if (preSendRequest.error) throw preSendRequest.error;
  const activeReengagementRequest = preSendRequest.data
    ? null
    : await loadExistingRequest({
        intent: "candidate_reengagement",
        statuses: ["awaiting_talent", "relay_queued", "review_required"],
      });
  if (activeReengagementRequest?.error) {
    throw activeReengagementRequest.error;
  }
  const existing =
    preSendRequest.data ?? activeReengagementRequest?.data ?? null;
  if (existing) {
    if (
      existing.intent !== "candidate_reengagement" ||
      text(existing.resume_stage) !== stage
    ) {
      throw new Error("company_talent_request_already_active");
    }
    if (existing.workflow_status === "draft") {
      const scheduled = await scheduleCompanyTalentContact({
        admin: args.admin,
        deliveryMode: "standard",
        expectedRevision: Number(existing.draft_revision),
        requestId: text(existing.id),
        roleId: args.roleId,
        talentId: args.talentId,
        workspaceId: args.workspaceId,
      });
      await recordCandidateReengagementRequested({
        actorEmail: args.actorEmail,
        actorUserId: args.actorUserId,
        admin: args.admin,
        recommendationId: args.recommendationId,
        requestContext:
          text(existing.request_context) || "후보자의 재진행 의사 확인",
        requestId: text(existing.id),
        roleId: args.roleId,
        stage,
        status: "waiting_for_candidate_reply",
        talentId: args.talentId,
      });
      return scheduled;
    }
    if (["queued", "awaiting_talent"].includes(existing.workflow_status)) {
      await recordCandidateReengagementRequested({
        actorEmail: args.actorEmail,
        actorUserId: args.actorUserId,
        admin: args.admin,
        recommendationId: args.recommendationId,
        requestContext:
          text(existing.request_context) || "후보자의 재진행 의사 확인",
        requestId: text(existing.id),
        roleId: args.roleId,
        stage,
        status: "waiting_for_candidate_reply",
        talentId: args.talentId,
      });
    }
    return {
      requestId: text(existing.id),
      revision: Number(existing.draft_revision),
      scheduledAt: null,
      status: existing.workflow_status,
    };
  }

  const [roleResult, talentResult, workspaceResult, settingResult, stageLabel] =
    await Promise.all([
      args.admin
        .from("company_roles")
        .select("name, status, is_expired, expires_at")
        .eq("role_id", args.roleId)
        .eq("company_workspace_id", args.workspaceId)
        .maybeSingle(),
      args.admin
        .from("talent_users")
        .select("name, email")
        .eq("user_id", args.talentId)
        .maybeSingle(),
      args.admin
        .from("company_workspace")
        .select("company_name")
        .eq("company_workspace_id", args.workspaceId)
        .maybeSingle(),
      args.admin
        .from("talent_setting")
        .select("preferred_locale")
        .eq("user_id", args.talentId)
        .maybeSingle(),
      reengagementStageLabel({
        admin: args.admin,
        roleId: args.roleId,
        stage,
      }),
    ]);
  for (const result of [
    roleResult,
    talentResult,
    workspaceResult,
    settingResult,
  ]) {
    if (result.error) throw result.error;
  }
  if (!roleResult.data || !talentResult.data || !workspaceResult.data) {
    throw new Error("candidate_reengagement_target_not_found");
  }
  if (!internalCandidateRoleIsOpen(roleResult.data)) {
    throw new Error("candidate_reengagement_role_not_open");
  }
  if (!text(talentResult.data.email, 320)) {
    throw new Error("candidate_reengagement_email_not_found");
  }

  const requestContext = `${text(roleResult.data.name, 180) || "해당 역할"}의 채용 과정을 ${stageLabel} 단계로 다시 이어가는 데 관심이 있는지 확인`;
  const requestId = randomUUID();
  const sourceMessageId = await ensureHiddenSourceMessage({
    actorUserId: args.actorUserId,
    admin: args.admin,
    content: requestContext,
    metadata: {
      candidateReengagement: true,
      recommendationId: args.recommendationId,
      requestedStage: stage,
      talentId: args.talentId,
    },
    roleId: args.roleId,
    workspaceId: args.workspaceId,
  });
  const draftCopy = await generateCandidateContactDraft({
    candidateName: text(talentResult.data.name, 160),
    companyName: text(workspaceResult.data.company_name, 160) || "채용 회사",
    kind: "question",
    locale: text(settingResult.data?.preferred_locale, 10) || "ko",
    profileUrl: null,
    requestContext,
    requestId,
    roleName: text(roleResult.data.name, 180) || "해당 역할",
  });
  const draft = await createCompanyTalentContactDraft({
    admin: args.admin,
    body: draftCopy.body,
    expectsDocument: false,
    id: requestId,
    intent: "candidate_reengagement",
    recommendationId: args.recommendationId,
    requestContext: draftCopy.requestContext,
    resumeStage: stage,
    roleId: args.roleId,
    sourceCompanyMessageId: sourceMessageId,
    subject: draftCopy.subject,
    talentId: args.talentId,
    workspaceId: args.workspaceId,
  });

  const scheduled = await scheduleCompanyTalentContact({
    admin: args.admin,
    deliveryMode: "standard",
    expectedRevision: Number(draft.draft_revision),
    requestId,
    roleId: args.roleId,
    talentId: args.talentId,
    workspaceId: args.workspaceId,
  });
  await recordCandidateReengagementRequested({
    actorEmail: args.actorEmail,
    actorUserId: args.actorUserId,
    admin: args.admin,
    recommendationId: args.recommendationId,
    requestContext: draftCopy.requestContext,
    requestId,
    roleId: args.roleId,
    stage,
    status: "waiting_for_candidate_reply",
    talentId: args.talentId,
  });
  return scheduled;
}

export function reengagementActor(user: User) {
  return {
    actorEmail: text(user.email, 320) || null,
    actorUserId: text(user.id, 100) || null,
  };
}
