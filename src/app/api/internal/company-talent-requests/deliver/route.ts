import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { sendHarperSlackThreadReply } from "@/lib/org/slackHarper";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function mirrorRelayToRoleConversation(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  relayBody: string;
  request: {
    company_workspace_id: string;
    id: string;
    role?: { name?: string | null } | Array<{ name?: string | null }> | null;
    role_id?: string | null;
    source_message?:
      | { conversation_id?: string | null }
      | Array<{ conversation_id?: string | null }>
      | null;
  };
}) {
  const roleId = String(args.request.role_id ?? "").trim();
  if (!roleId) return;
  const sourceMessage = Array.isArray(args.request.source_message)
    ? args.request.source_message[0]
    : args.request.source_message;
  const sourceConversationId = String(
    sourceMessage?.conversation_id ?? ""
  ).trim();
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

  if (!conversation || conversation.id === sourceConversationId) return;

  const { data: existing, error: existingError } = await (
    args.admin.from("company_messages" as any) as any
  )
    .select("id")
    .eq("conversation_id", conversation.id)
    .contains("metadata", {
      requestId: args.request.id,
      source: "company_talent_request_relay",
    })
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;

  const { data: mirrored, error: mirroredError } = await (
    args.admin.from("company_messages" as any) as any
  )
    .insert({
      company_user_id: null,
      company_workspace_id: args.request.company_workspace_id,
      content: args.relayBody,
      conversation_id: conversation.id,
      created_at: now,
      mentions: [],
      message_type: "chat",
      metadata: {
        requestId: args.request.id,
        source: "company_talent_request_relay",
      },
      model: null,
      role: "assistant",
      role_id: roleId,
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
    .eq("id", conversation.id);
  if (updateError) throw updateError;
}

export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json().catch(() => ({}))) as {
      requestId?: unknown;
    };
    const requestId = String(body.requestId ?? "").trim();
    if (!requestId) {
      return NextResponse.json(
        { error: "requestId is required" },
        { status: 400 }
      );
    }
    const admin = getSupabaseAdmin();
    const { data: request, error } = await (
      admin.from("company_talent_requests" as any) as any
    )
      .select(
        "id, company_workspace_id, role_id, workflow_status, role:company_roles(name), source_message:company_messages!company_talent_requests_source_company_message_id_fkey(conversation_id, slack_thread_id), deliveries:contact_queue(payload, type)"
      )
      .eq("id", requestId)
      .maybeSingle();
    if (error) throw error;
    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    const deliveryQueue = Array.isArray(request.deliveries)
      ? request.deliveries.find(
          (item: { type?: string }) =>
            item.type === "company_request_company_delivery"
        )
      : null;
    const deliveryPayload = deliveryQueue?.payload as
      | { delivery?: { body?: unknown } }
      | undefined;
    const relayBody = String(deliveryPayload?.delivery?.body ?? "").trim();
    if (request.workflow_status === "delivered") {
      if (relayBody) {
        await mirrorRelayToRoleConversation({ admin, relayBody, request });
      }
      return NextResponse.json({ ok: true, idempotent: true });
    }
    if (request.workflow_status === "review_required") {
      return NextResponse.json({ ok: true, status: "review_required" });
    }
    if (request.workflow_status !== "relay_queued") {
      return NextResponse.json({ ok: true, status: request.workflow_status });
    }
    if (!relayBody) {
      return NextResponse.json(
        { error: "Relay body has not been prepared" },
        { status: 409 }
      );
    }
    const { data: stagePending, error: stageError } = await (admin.rpc as any)(
      "company_talent_request_stage_is_pending_v1",
      { p_request_id: request.id }
    );
    if (stageError) throw stageError;
    if (stagePending !== true) {
      const { data: held, error: holdError } = await (admin.rpc as any)(
        "store_company_talent_relay_body_v1",
        {
          p_body: relayBody,
          p_request_id: request.id,
        }
      );
      if (holdError) throw holdError;
      return NextResponse.json({
        ok: true,
        status: held?.workflow_status ?? "review_required",
      });
    }

    let slackMessageTs: string | null = null;
    let slackBotUserId: string | null = null;
    const sourceMessage = Array.isArray(request.source_message)
      ? request.source_message[0]
      : request.source_message;
    const sourceSlackThreadId = String(
      sourceMessage?.slack_thread_id ?? ""
    ).trim();
    if (sourceSlackThreadId) {
      const posted = await sendHarperSlackThreadReply({
        idempotencyKey: request.id,
        text: relayBody,
        threadId: sourceSlackThreadId,
        workspaceId: request.company_workspace_id,
      });
      slackMessageTs = posted.slackMessageTs;
      slackBotUserId = posted.botUserId;
    }

    const { data: finalized, error: finalizeError } = await (admin.rpc as any)(
      "finalize_company_talent_delivery_v1",
      {
        p_request_id: request.id,
        p_slack_bot_user_id: slackBotUserId,
        p_slack_message_ts: slackMessageTs,
      }
    );
    if (finalizeError) throw finalizeError;
    await mirrorRelayToRoleConversation({ admin, relayBody, request });
    return NextResponse.json({ ok: true, result: finalized });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to deliver company talent request relay"
    );
  }
}
