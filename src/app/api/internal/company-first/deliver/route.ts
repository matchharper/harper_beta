import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { sendHarperWorkspaceSlackMessage } from "@/lib/org/slackHarper";
import type { HarperSlackBlock } from "@/lib/org/slackChoiceButtons";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";

type OutboxRow = {
  attempt_count: number;
  blocks: unknown;
  candidate_ids: string[];
  channel_id: string;
  company_workspace_id: string;
  id: string;
  idempotency_key: string;
  message_text: string;
  role_ids: string[];
  run_id: string;
  status: string;
};

function blocks(value: unknown): HarperSlackBlock[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.filter(
    (item): item is HarperSlackBlock =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
}

async function markFailed(
  admin: ReturnType<typeof getSupabaseAdmin>,
  row: OutboxRow,
  error: unknown
) {
  const attempt = Math.max(1, Number(row.attempt_count ?? 0));
  const retryMinutes = Math.min(60, 2 ** Math.min(6, attempt));
  const availableAt = new Date(
    Date.now() + retryMinutes * 60_000
  ).toISOString();
  await (admin.from("company_first_slack_outbox" as any) as any)
    .update({
      available_at: availableAt,
      last_error: String(error instanceof Error ? error.message : error).slice(
        0,
        2_000
      ),
      status: "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "sending");
}

async function finishRunWhenDelivered(
  admin: ReturnType<typeof getSupabaseAdmin>,
  runId: string
) {
  const { data: outboxRows, error: outboxError } = await (
    admin.from("company_first_slack_outbox" as any) as any
  )
    .select("status")
    .eq("run_id", runId);
  if (outboxError) throw outboxError;
  const statuses = (outboxRows ?? []).map(
    (row: { status: string }) => row.status
  );
  if (
    statuses.length === 0 ||
    statuses.some((status: string) =>
      ["pending", "failed", "sending"].includes(status)
    )
  )
    return;
  const deliveryStatus = statuses.every((status: string) => status === "sent")
    ? "sent"
    : statuses.every((status: string) => status === "canceled")
      ? "canceled"
      : "partially_canceled";

  const { data: run, error: runError } = await (
    admin.from("company_first_search_runs" as any) as any
  )
    .select("result")
    .eq("id", runId)
    .eq("status", "delivery_pending")
    .maybeSingle();
  if (runError) throw runError;
  if (!run) return;
  const result =
    run.result && typeof run.result === "object" && !Array.isArray(run.result)
      ? run.result
      : {};
  const now = new Date().toISOString();
  const { error: finishError } = await (
    admin.from("company_first_search_runs" as any) as any
  )
    .update({
      finished_at: now,
      result: { ...result, deliveryStatus },
      status: "succeeded",
      updated_at: now,
    })
    .eq("id", runId)
    .eq("status", "delivery_pending");
  if (finishError) throw finishError;
}

export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json().catch(() => ({}))) as {
      outboxId?: unknown;
    };
    const outboxId = String(body.outboxId ?? "").trim();
    if (!outboxId) {
      return NextResponse.json(
        { error: "outboxId is required" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const staleClaim = new Date(Date.now() - 15 * 60_000).toISOString();
    await (admin.from("company_first_slack_outbox" as any) as any)
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", outboxId)
      .eq("status", "sending")
      .lt("claimed_at", staleClaim);

    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await (
      admin.from("company_first_slack_outbox" as any) as any
    )
      .update({
        claimed_at: now,
        last_error: null,
        status: "sending",
        updated_at: now,
      })
      .eq("id", outboxId)
      .in("status", ["pending", "failed"])
      .lte("available_at", now)
      .select(
        "id, run_id, company_workspace_id, channel_id, idempotency_key, candidate_ids, role_ids, message_text, blocks, status, attempt_count"
      )
      .maybeSingle();
    if (claimError) throw claimError;

    if (!claimed) {
      const { data: existing, error: existingError } = await (
        admin.from("company_first_slack_outbox" as any) as any
      )
        .select("status")
        .eq("id", outboxId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) {
        return NextResponse.json(
          { error: "Outbox not found" },
          { status: 404 }
        );
      }
      if (existing.status === "sent") {
        return NextResponse.json({
          ok: true,
          status: "sent",
          idempotent: true,
        });
      }
      return NextResponse.json(
        { ok: false, status: existing.status },
        { status: 409 }
      );
    }

    const row = claimed as OutboxRow;
    // Supabase cannot express an atomic increment in update(). Re-read the claimed
    // count and persist the increment while this row is exclusively `sending`.
    row.attempt_count = Number(row.attempt_count ?? 0) + 1;
    await (admin.from("company_first_slack_outbox" as any) as any)
      .update({ attempt_count: row.attempt_count })
      .eq("id", row.id)
      .eq("status", "sending");

    const { data: deliverable, error: deliverableError } = await (
      admin.rpc as any
    )("company_first_outbox_is_deliverable_v1", {
      p_outbox_id: row.id,
    });
    if (deliverableError) {
      await markFailed(admin, row, deliverableError);
      throw deliverableError;
    }
    if (deliverable !== true) {
      await (admin.from("company_first_slack_outbox" as any) as any)
        .update({
          last_error: "candidate state changed before Slack delivery",
          status: "canceled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "sending");
      await finishRunWhenDelivered(admin, row.run_id);
      return NextResponse.json({ ok: true, status: "canceled" });
    }

    const { data: channel, error: channelError } = await (
      admin.from("company_slack_channels" as any) as any
    )
      .select("slack_channel_id")
      .eq("id", row.channel_id)
      .eq("company_workspace_id", row.company_workspace_id)
      .eq("is_enabled", true)
      .maybeSingle();
    if (channelError) {
      await markFailed(admin, row, channelError);
      throw channelError;
    }
    if (!channel?.slack_channel_id) {
      const error = new Error(
        "Company-first Slack channel is no longer available"
      );
      await markFailed(admin, row, error);
      throw error;
    }

    let slackMessageTs: string | null = null;
    try {
      const sent = await sendHarperWorkspaceSlackMessage({
        blocks: blocks(row.blocks),
        channelId: channel.slack_channel_id,
        idempotencyKey: row.idempotency_key,
        onPosted: (receipt) => {
          slackMessageTs = receipt.slackMessageTs;
        },
        recordConversationMessage: true,
        roleId: row.role_ids.length === 1 ? row.role_ids[0] : null,
        text: row.message_text,
        workspaceId: row.company_workspace_id,
      });
      if (!sent)
        throw new Error("No eligible Slack destination accepted the message");
    } catch (error) {
      await markFailed(admin, row, error);
      throw error;
    }

    const sentAt = new Date().toISOString();
    const { error: sentError } = await (
      admin.from("company_first_slack_outbox" as any) as any
    )
      .update({
        last_error: null,
        sent_at: sentAt,
        slack_message_ts: slackMessageTs,
        status: "sent",
        updated_at: sentAt,
      })
      .eq("id", row.id)
      .eq("status", "sending");
    if (sentError) throw sentError;
    await finishRunWhenDelivered(admin, row.run_id);
    return NextResponse.json({ ok: true, status: "sent" });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to deliver Company-first Slack outbox"
    );
  }
}
