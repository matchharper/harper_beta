import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { sendHarperSlackThreadReply } from "@/lib/org/slackHarper";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        "id, company_workspace_id, workflow_status, source_message:company_messages!company_talent_requests_source_company_message_id_fkey(slack_thread_id), deliveries:contact_queue(payload, type)"
      )
      .eq("id", requestId)
      .maybeSingle();
    if (error) throw error;
    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (request.workflow_status === "delivered") {
      return NextResponse.json({ ok: true, idempotent: true });
    }
    if (request.workflow_status === "review_required") {
      return NextResponse.json({ ok: true, status: "review_required" });
    }
    if (request.workflow_status !== "relay_queued") {
      return NextResponse.json({ ok: true, status: request.workflow_status });
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
    return NextResponse.json({ ok: true, result: finalized });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to deliver company talent request relay"
    );
  }
}
