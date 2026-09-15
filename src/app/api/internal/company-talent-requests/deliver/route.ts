import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  sendHarperSlackThreadReply,
  sendHarperWorkspaceSlackMessage,
} from "@/lib/org/slackHarper";
import { getCompanyTalentRelaySlackDestination } from "@/lib/companyTalentRequests/slackDelivery";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function mirrorRelayToRoleConversation(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  relayBody: string;
  relayId?: string | null;
  request: {
    company_workspace_id: string;
    id: string;
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
          requestId: args.request.id,
          roleId,
          talentId: String(args.request.talent_id ?? "").trim(),
        },
        relayId: args.relayId,
        requestId: args.request.id,
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

export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json().catch(() => ({}))) as {
      relayId?: unknown;
      requestId?: unknown;
    };
    const requestId = String(body.requestId ?? "").trim();
    const relayId = String(body.relayId ?? "").trim();
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
        "id, company_workspace_id, role_id, talent_id, workflow_status, role:company_roles(name), source_message:company_messages!company_talent_requests_source_company_message_id_fkey(conversation_id, slack_thread_id), deliveries:contact_queue(payload, type)"
      )
      .eq("id", requestId)
      .maybeSingle();
    if (error) throw error;
    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (relayId) {
      const { data: relay, error: relayError } = await (
        admin.from("company_talent_relays" as any) as any
      )
        .select(
          "id, company_talent_request_id, deliveries:contact_queue(type,status,sent_at,payload)"
        )
        .eq("id", relayId)
        .eq("company_talent_request_id", requestId)
        .maybeSingle();
      if (relayError) throw relayError;
      if (!relay) {
        return NextResponse.json({ error: "Relay not found" }, { status: 404 });
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
      const relayBody = String(deliveryPayload.body ?? "").trim();
      if (relayDelivery?.status === "sent") {
        if (relayBody) {
          await mirrorRelayToRoleConversation({
            admin,
            relayBody,
            relayId,
            request,
          });
        }
        return NextResponse.json({ ok: true, idempotent: true });
      }
      if (relayDelivery?.status === "cancelled" || !relayBody) {
        return NextResponse.json(
          { error: "Relay body has not been prepared" },
          { status: 409 }
        );
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

      const { data: finalized, error: finalizeError } = await (
        admin.rpc as any
      )("finalize_company_talent_relay_delivery_v1", {
        p_relay_id: relayId,
        p_slack_bot_user_id: slackBotUserId,
        p_slack_message_ts: slackMessageTs,
      });
      if (finalizeError) throw finalizeError;
      await mirrorRelayToRoleConversation({
        admin,
        relayBody,
        relayId,
        request,
      });
      console.info("[company-talent-relay] delivered", {
        relayId,
        requestId,
        slackThread: slackDestination.kind === "thread",
      });
      return NextResponse.json({ ok: true, result: finalized });
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
    const { data: targetActive, error: targetError } = await (admin.rpc as any)(
      "company_talent_request_target_is_active_v1",
      { p_request_id: request.id }
    );
    if (targetError) throw targetError;
    if (targetActive !== true) {
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
    const slackDestination = getCompanyTalentRelaySlackDestination(
      sourceMessage?.slack_thread_id
    );
    if (slackDestination.kind === "thread") {
      const posted = await sendHarperSlackThreadReply({
        idempotencyKey: request.id,
        text: relayBody,
        threadId: slackDestination.threadId,
        workspaceId: request.company_workspace_id,
      });
      slackMessageTs = posted.slackMessageTs;
      slackBotUserId = posted.botUserId;
    } else {
      await sendHarperWorkspaceSlackMessage({
        idempotencyKey: request.id,
        recordConversationMessage: false,
        roleId: request.role_id,
        text: relayBody,
        workspaceId: request.company_workspace_id,
      });
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
