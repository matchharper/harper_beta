import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  sendHarperWorkspaceSlackMessage,
  storeHarperWorkspaceConversationMessage,
} from "@/lib/org/slackHarper";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, maxLength = 6_000) {
  return String(value ?? "").replaceAll("\u0000", "").trim().slice(0, maxLength);
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json().catch(() => ({}))) as {
      message?: unknown;
      runId?: unknown;
    };
    const runId = text(body.runId, 100);
    let message = text(body.message);
    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: run, error: runError } = await (
      admin.from("company_context_runs" as any) as any
    )
      .select(
        "id, role_id, status, trigger_reason, result, role:company_roles!inner(company_workspace_id, information, is_expired, expires_at, source_type, status, internal_role:company_internal_roles!inner(is_auto))"
      )
      .eq("id", runId)
      .maybeSingle();
    if (runError) throw runError;
    if (!run) {
      return NextResponse.json({ error: "Company run not found" }, { status: 404 });
    }
    if (
      run.trigger_reason !== "post_calibration_12h" ||
      !["running", "succeeded"].includes(String(run.status))
    ) {
      return NextResponse.json(
        { error: "Run is not eligible for a post-calibration notice" },
        { status: 409 }
      );
    }

    const result = record(run.result);
    const calibrationId = text(result.calibrationId, 100);
    const existingNotice = record(result.companyNotice);
    const idempotencyKey = `post_calibration_review:${calibrationId}`;
    const role = Array.isArray(run.role) ? run.role[0] : run.role;
    const internalRole = Array.isArray(role?.internal_role)
      ? role.internal_role[0]
      : role?.internal_role;
    const workspaceId = text(role?.company_workspace_id, 100);
    if (!calibrationId || !workspaceId || internalRole?.is_auto !== true) {
      return NextResponse.json(
        { error: "Run is missing its eligible Role or calibration scope" },
        { status: 409 }
      );
    }
    const { data: eligible, error: eligibleError } = await (admin.rpc as any)(
      "company_role_is_calibration_eligible_v1",
      { p_role_id: run.role_id }
    );
    if (eligibleError) throw eligibleError;
    if (eligible !== true) {
      return NextResponse.json(
        { error: "Role is no longer eligible for an automatic notice" },
        { status: 409 }
      );
    }
    const { data: calibration, error: calibrationError } = await (
      admin.from("company_role_calibrations" as any) as any
    )
      .select("id, role_id, status, payload")
      .eq("id", calibrationId)
      .eq("role_id", run.role_id)
      .maybeSingle();
    if (calibrationError) throw calibrationError;
    const delivery = record(record(calibration?.payload).delivery);
    if (
      !calibration ||
      !["sent", "completed"].includes(String(calibration.status)) ||
      delivery.status !== "sent" ||
      !text(delivery.sentAt, 100)
    ) {
      return NextResponse.json(
        { error: "Calibration has no first Slack delivery receipt" },
        { status: 409 }
      );
    }

    const existingMessageId = Number(existingNotice.companyMessageId);
    if (!message && Number.isSafeInteger(existingMessageId) && existingMessageId > 0) {
      const { data: storedMessage, error: storedMessageError } = await (
        admin.from("company_messages" as any) as any
      )
        .select("content")
        .eq("id", existingMessageId)
        .eq("company_workspace_id", workspaceId)
        .eq("role_id", run.role_id)
        .maybeSingle();
      if (storedMessageError) throw storedMessageError;
      message = text(storedMessage?.content);
    }
    if (!message) {
      return NextResponse.json(
        { error: "message is required for the first delivery" },
        { status: 400 }
      );
    }

    let companyMessageId =
      Number.isSafeInteger(existingMessageId) && existingMessageId > 0
        ? existingMessageId
        : null;
    let orgStatus = text(existingNotice.orgStatus, 40) === "sent" ? "sent" : "failed";
    let orgError: string | null = null;
    if (orgStatus !== "sent") {
      try {
        const stored = await storeHarperWorkspaceConversationMessage({
          calibrationId,
          idempotencyKey,
          roleId: run.role_id,
          runId,
          text: message,
          workspaceId,
        });
        companyMessageId = stored.messageId;
        orgStatus = "sent";
      } catch (error) {
        orgError = error instanceof Error ? error.message : "org_delivery_failed";
      }
    }

    let slackStatus =
      text(existingNotice.slackStatus, 40) === "sent" ? "sent" : "failed";
    let slackMessageTs = text(existingNotice.slackMessageTs, 100) || null;
    let slackError: string | null = null;
    // Keep /org as the durable source of the exact company-visible copy. If
    // that write fails, do not create a Slack-only message that a later retry
    // could no longer reproduce byte-for-byte.
    if (slackStatus !== "sent" && orgStatus === "sent") {
      const receipts: Array<{ slackMessageTs: string }> = [];
      try {
        const delivered = await sendHarperWorkspaceSlackMessage({
          idempotencyKey,
          messageMetadata: {
            postCalibrationReview: { calibrationId, idempotencyKey, runId },
            source: "post_calibration_review",
          },
          onPosted: (receipt) => receipts.push(receipt),
          recordConversationMessage: false,
          roleId: run.role_id,
          text: message,
          unfurlLinks: false,
          unfurlMedia: false,
          workspaceId,
        });
        slackStatus = delivered ? "sent" : "not_configured";
        slackMessageTs = receipts[0]?.slackMessageTs || slackMessageTs;
      } catch (error) {
        slackError = error instanceof Error ? error.message : "slack_delivery_failed";
      }
    }

    const status =
      orgStatus === "sent" && slackStatus === "sent"
        ? "sent"
        : orgStatus === "sent" && slackStatus === "not_configured"
          ? "not_configured"
          : orgStatus === "sent" || slackStatus === "sent"
            ? "partial"
            : "failed";
    const deliveryError = [orgError, slackError].filter(Boolean).join("; ") || null;
    const { data: notice, error: noticeError } = await (admin.rpc as any)(
      "record_post_calibration_company_notice_v1",
      {
        p_company_message_id: companyMessageId,
        p_error: deliveryError,
        p_org_status: orgStatus,
        p_run_id: runId,
        p_slack_message_ts: slackMessageTs,
        p_slack_status: slackStatus,
        p_status: status,
      }
    );
    if (noticeError) throw noticeError;

    return NextResponse.json({
      message,
      notice,
      ok: status !== "failed",
      status,
    });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to deliver post-calibration company notice"
    );
  }
}
