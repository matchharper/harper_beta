import {
  deliverCompanyTalentRelay,
  mirrorRelayToRoleConversation,
} from "@/lib/companyTalentRequests/delivery";
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

export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json().catch(() => ({}))) as {
      relayId?: unknown;
      requestId?: unknown;
    };
    const requestId = String(body.requestId ?? "").trim();
    const relayId = String(body.relayId ?? "").trim();
    if (!requestId && !relayId) {
      return NextResponse.json(
        { error: "requestId or relayId is required" },
        { status: 400 }
      );
    }
    const admin = getSupabaseAdmin();
    let request: any = null;
    if (relayId) {
      return NextResponse.json(
        await deliverCompanyTalentRelay({ admin, relayId, requestId })
      );
    }
    const requestResult = await (
      admin.from("company_talent_requests" as any) as any
    )
      .select(
        "id, company_workspace_id, role_id, recommendation_id, talent_id, workflow_status, role:company_roles(name), source_message:company_messages!company_talent_requests_source_company_message_id_fkey(conversation_id, slack_thread_id), deliveries:contact_queue(payload, type)"
      )
      .eq("id", requestId)
      .maybeSingle();
    if (requestResult.error) throw requestResult.error;
    request = requestResult.data;
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
