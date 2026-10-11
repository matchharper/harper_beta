import "server-only";
import { dispatchOrgAgentWebActionJob } from "@/lib/org/agent/webActionTurn";
import {
  sendHarperSlackThreadReply,
  sendHarperWorkspaceSlackMessage,
} from "@/lib/org/slackHarper";
import { getCompanyTalentRelaySlackDestination } from "./slackDelivery";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { getOrgPublicSiteUrl } from "@/lib/org/slackMessages";

export async function mirrorRelayToRoleConversation(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  relayBody: string;
  relayId?: string | null;
  request: {
    company_workspace_id: string;
    id?: string | null;
    recommendation_id?: string | null;
    role?: { name?: string | null } | Array<{ name?: string | null }> | null;
    role_id?: string | null;
    talent_id?: string | null;
    source_message?:
      | { conversation_id?: string | null }
      | Array<{ conversation_id?: string | null }>
      | null;
  };
}) {
  const roleId = String(args.request.role_id ?? "").trim();
  if (!roleId) return;
  if (args.relayId) {
    const { data: job, error } = await (
      args.admin.from("company_agent_web_action_jobs" as any) as any
    )
      .select("id")
      .eq("idempotency_key", `candidate-contact:${args.relayId}`)
      .maybeSingle();
    if (error) throw error;
    if (job)
      await dispatchOrgAgentWebActionJob({ admin: args.admin, jobId: job.id });
  }
  const role = Array.isArray(args.request.role)
    ? args.request.role[0]
    : args.request.role;
  const now = new Date().toISOString();
  const conversationSelect =
    "id, company_workspace_id, role_id, title, last_message_at, last_message_id, summary_cursor_message_id, metadata, created_at, updated_at";
  let { data: conversation, error: conversationError } = await (
    args.admin.from("company_conversations" as any) as any
  )
    .select(conversationSelect)
    .eq("company_workspace_id", args.request.company_workspace_id)
    .eq("role_id", roleId)
    .maybeSingle();
  if (conversationError) throw conversationError;

  if (!conversation) {
    const inserted = await (
      args.admin.from("company_conversations" as any) as any
    )
      .insert({
        company_workspace_id: args.request.company_workspace_id,
        created_at: now,
        metadata: {
          confirmedAssigneeUserId: null,
          confirmedSlackChannelIds: [],
          pendingConfirmationMessageId: null,
          phase: "completed",
          scope: "role_creation",
        },
        role_id: roleId,
        title: String(role?.name ?? "").trim() || "역할 대화",
        updated_at: now,
      })
      .select(conversationSelect)
      .maybeSingle();
    if (inserted.error && inserted.error.code !== "23505") {
      throw inserted.error;
    }
    conversation = inserted.data;
    if (!conversation) {
      const raced = await (
        args.admin.from("company_conversations" as any) as any
      )
        .select(conversationSelect)
        .eq("company_workspace_id", args.request.company_workspace_id)
        .eq("role_id", roleId)
        .single();
      if (raced.error) throw raced.error;
      conversation = raced.data;
    }
  }

  const sourceMessage = Array.isArray(args.request.source_message)
    ? args.request.source_message[0]
    : args.request.source_message;
  const sourceConversationId = String(
    sourceMessage?.conversation_id ?? ""
  ).trim();
  let sourceConversation: typeof conversation = null;
  if (sourceConversationId) {
    const source = await (
      args.admin.from("company_conversations" as any) as any
    )
      .select(conversationSelect)
      .eq("id", sourceConversationId)
      .eq("company_workspace_id", args.request.company_workspace_id)
      .maybeSingle();
    if (source.error) throw source.error;
    sourceConversation = source.data;
  }

  const destinations = Array.from(
    new Map(
      [sourceConversation, conversation]
        .filter(Boolean)
        .map((item) => [String(item.id), item])
    ).values()
  );
  if (destinations.length === 0) return;

  const relayMetadata = args.relayId
    ? {
        candidateRelayRef: {
          relayId: args.relayId,
          recommendationId: String(args.request.recommendation_id ?? "").trim(),
          ...(args.request.id ? { requestId: args.request.id } : {}),
          roleId,
          talentId: String(args.request.talent_id ?? "").trim(),
        },
        relayId: args.relayId,
        recommendationId: String(args.request.recommendation_id ?? "").trim(),
        ...(args.request.id ? { requestId: args.request.id } : {}),
        source: "company_talent_relay",
      }
    : {
        requestId: args.request.id,
        source: "company_talent_request_relay",
      };

  for (const destination of destinations) {
    const { data: existing, error: existingError } = await (
      args.admin.from("company_messages" as any) as any
    )
      .select("id")
      .eq("conversation_id", destination.id)
      .contains("metadata", relayMetadata)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) continue;

    const { data: mirrored, error: mirroredError } = await (
      args.admin.from("company_messages" as any) as any
    )
      .insert({
        company_user_id: null,
        company_workspace_id: args.request.company_workspace_id,
        content: args.relayBody,
        conversation_id: destination.id,
        created_at: now,
        mentions: [],
        message_type: "chat",
        metadata: relayMetadata,
        model: null,
        role: "assistant",
        role_id: destination.role_id ?? roleId,
        status: "completed",
        thinking_logs: [],
      })
      .select("id, created_at")
      .single();
    if (mirroredError) throw mirroredError;

    const { error: updateError } = await (
      args.admin.from("company_conversations" as any) as any
    )
      .update({
        last_message_at: mirrored.created_at,
        last_message_id: mirrored.id,
        updated_at: mirrored.created_at,
      })
      .eq("id", destination.id);
    if (updateError) throw updateError;
  }
}

export async function deliverCompanyTalentRelay(args: {
  relayId: string;
  requestId?: string;
  admin?: ReturnType<typeof getSupabaseAdmin>;
}) {
  const admin = args.admin ?? getSupabaseAdmin();
  const relayId = args.relayId;
  const requestId = args.requestId ?? "";
  let request: any = null;
  const { data: relay, error: relayError } = await (
    admin.from("company_talent_relays" as any) as any
  )
    .select(
      "id, relay_content, document_id, company_talent_request_id, recommendation_id, deliveries:contact_queue(type,status,sent_at,payload)"
    )
    .eq("id", relayId)
    .maybeSingle();
  if (relayError) throw relayError;
  if (!relay) {
    throw new Error("Relay not found");
  }
  if (
    requestId &&
    relay.company_talent_request_id &&
    relay.company_talent_request_id !== requestId
  ) {
    throw new Error("Relay request does not match");
  }
  const relayRequestId = String(
    relay.company_talent_request_id ?? requestId ?? ""
  ).trim();
  if (relayRequestId) {
    const requestResult = await (
      admin.from("company_talent_requests" as any) as any
    )
      .select(
        "id, company_workspace_id, role_id, recommendation_id, talent_id, workflow_status, role:company_roles(name), source_message:company_messages!company_talent_requests_source_company_message_id_fkey(conversation_id, slack_thread_id), deliveries:contact_queue(payload, type)"
      )
      .eq("id", relayRequestId)
      .maybeSingle();
    if (requestResult.error) throw requestResult.error;
    request = requestResult.data;
  } else {
    const recommendationResult = await (
      admin.from("talent_opportunity_recommendation" as any) as any
    )
      .select(
        "id, role_id, talent_id, role:company_roles!inner(name,company_workspace_id)"
      )
      .eq("id", relay.recommendation_id)
      .maybeSingle();
    if (recommendationResult.error) throw recommendationResult.error;
    const recommendation = recommendationResult.data;
    const role = Array.isArray(recommendation?.role)
      ? recommendation.role[0]
      : recommendation?.role;
    if (recommendation && role) {
      request = {
        company_workspace_id: role.company_workspace_id,
        deliveries: [],
        id: null,
        recommendation_id: recommendation.id,
        role,
        role_id: recommendation.role_id,
        source_message: null,
        talent_id: recommendation.talent_id,
        workflow_status: null,
      };
    }
  }
  if (!request) {
    throw new Error("Relay relationship not found");
  }
  const relayDelivery = Array.isArray(relay.deliveries)
    ? relay.deliveries.find(
        (item: Record<string, unknown>) =>
          item.type === "company_contact_company_delivery"
      )
    : null;
  const relayPayload =
    relayDelivery?.payload && typeof relayDelivery.payload === "object"
      ? (relayDelivery.payload as Record<string, unknown>)
      : {};
  const deliveryPayload =
    relayPayload.delivery && typeof relayPayload.delivery === "object"
      ? (relayPayload.delivery as Record<string, unknown>)
      : {};
  let relayBody = String(deliveryPayload.body ?? "").trim();
  if (!relayBody && relayDelivery?.status !== "cancelled") {
    // Relay content is already composed by the candidate's original LLM.
    // Do not re-interpret or classify it in a second copy-generation call.
    const role = Array.isArray(request.role) ? request.role[0] : request.role;
    const { data: talent, error: talentError } = await admin
      .from("talent_users")
      .select("name")
      .eq("user_id", request.talent_id)
      .single();
    if (talentError) throw talentError;
    const parts = [
      `${talent?.name || "후보자"} · ${role?.name || "회사 연락"}`,
      String(relay.relay_content ?? "").trim(),
    ];
    if (relay.document_id) {
      const { data: document, error: documentError } = await admin
        .from("talent_documents")
        .select("file_name")
        .or("origin_type.is.null,origin_type.neq.harper_generated_resume")
        .eq("id", relay.document_id)
        .eq("talent_id", request.talent_id)
        .eq("is_public", true)
        .eq("is_deleted", false)
        .maybeSingle();
      if (documentError) throw documentError;
      if (document)
        parts.push(
          `첨부: ${document.file_name}\n${getOrgPublicSiteUrl()}/org/jobs?roleId=${request.role_id}&view=pipeline&talentId=${request.talent_id}&recommendationId=${request.recommendation_id}`
        );
    }
    relayBody = parts.filter(Boolean).join("\n\n");
    const stored = await (admin.rpc as any)(
      "store_company_talent_relay_body_v2",
      { p_relay_id: relayId, p_body: relayBody }
    );
    if (stored.error) throw stored.error;
  }
  if (relayDelivery?.status === "sent") {
    if (relayBody) {
      await mirrorRelayToRoleConversation({
        admin,
        relayBody,
        relayId,
        request,
      });
    }
    return { ok: true, idempotent: true };
  }
  if (relayDelivery?.status === "cancelled" || !relayBody) {
    throw new Error("Relay body has not been prepared");
  }

  let slackMessageTs: string | null = null;
  let slackBotUserId: string | null = null;
  const sourceMessage = Array.isArray(request.source_message)
    ? request.source_message[0]
    : request.source_message;
  const slackDestination = getCompanyTalentRelaySlackDestination(
    sourceMessage?.slack_thread_id
  );
  if (slackDestination.kind === "thread") {
    const posted = await sendHarperSlackThreadReply({
      idempotencyKey: relayId,
      text: relayBody,
      threadId: slackDestination.threadId,
      workspaceId: request.company_workspace_id,
    });
    slackMessageTs = posted.slackMessageTs;
    slackBotUserId = posted.botUserId;
  } else {
    await sendHarperWorkspaceSlackMessage({
      idempotencyKey: relayId,
      recordConversationMessage: false,
      roleId: request.role_id,
      text: relayBody,
      workspaceId: request.company_workspace_id,
    });
  }

  const { data: finalized, error: finalizeError } = await (admin.rpc as any)(
    "finalize_company_talent_relay_delivery_v1",
    {
      p_relay_id: relayId,
      p_slack_bot_user_id: slackBotUserId,
      p_slack_message_ts: slackMessageTs,
    }
  );
  if (finalizeError) throw finalizeError;
  await mirrorRelayToRoleConversation({
    admin,
    relayBody,
    relayId,
    request,
  });
  console.info("[company-talent-relay] delivered", {
    relayId,
    requestId: request.id ?? null,
    slackThread: slackDestination.kind === "thread",
  });
  return { ok: true, result: finalized };
}
