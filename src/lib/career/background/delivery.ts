import { careerContactSourceIds } from "./sourceCoverage";
import { changedTalentSchedules } from "../meetings/server";
import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentToolDefinition } from "@/lib/talentOnboarding/tools";
import { ensureReplyAlias } from "@/lib/email/runtime/store";
import { renderReplyEmail } from "@/lib/email/runtime/format";
import { getDefaultResendFromEmail, sendResendEmail } from "@/lib/email/send";
import { normalizeEmailAddress } from "@/lib/email/parse";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import {
  assertCareerSourceEventsCurrent,
  CareerSourceChangedError,
} from "../schedules/server";
import { resumeCareerAgentAfterWork } from "../agentContinuation";
import { send } from "@vercel/queue";
import { scheduleCareerDevelopmentJob } from "../developmentQueue.server";

export const CAREER_DELIVERY_SOURCE_IDS = {
  type: "array", items: { type: "string" },
  description: "Required when this invocation has pending daily sources: exact source IDs covered by this message. Use [] when none are covered. Include only the updates/reminders actually communicated; receipt tracking does not infer coverage from an email being sent. Omit for messages unrelated to pending daily sources.",
};
export const CAREER_DELIVERY_TOPIC = "career-agent-email-v1";
const pending = new Set(["queued", "retry", "sending"]);
const terminal = new Set([
  "sent",
  "cancelled",
  "context_changed",
  "delivery_unknown",
]);

async function rpc(
  admin: TalentAdminClient,
  name: string,
  input: Record<string, unknown>
) {
  const { data, error } = await (admin.rpc as any)(name, input);
  if (error) throw error;
  return data;
}
function deliveryResult(status: string, deliveryId: string) {
  return {
    status,
    deliveryId,
    ...(pending.has(status)
      ? {
          careerContinuation: {
            kind: "email_delivery" as const,
            id: deliveryId,
          },
        }
      : {}),
  };
}
async function wakeParent(admin: TalentAdminClient, receipt: any) {
  const conversationId = receipt.payload?.conversationId;
  let replyId = receipt.payload?.parentReplyId;
  if (!replyId) {
    const run = await (admin.from as any)("opportunity_discovery_run")
      .select("trigger_payload")
      .eq("id", receipt.discovery_run_id)
      .eq("talent_id", receipt.talent_id)
      .maybeSingle();
    if (run.error) throw run.error;
    replyId = run.data?.trigger_payload?.agentInvocation?.replyId;
  }
  if (conversationId && replyId)
    await resumeCareerAgentAfterWork({
      admin,
      userId: receipt.talent_id,
      conversationId,
      replyId,
    });
}
async function finishResult(
  admin: TalentAdminClient,
  receipt: any,
  status: string
) {
  if (terminal.has(status)) {
    try {
      await wakeParent(admin, receipt);
    } catch (error) {
      // Checkpoint recovery also scans terminal children. A queue failure must
      // not turn a real provider receipt into a reported send failure.
      console.error("[career-email] Parent continuation dispatch failed", {
        deliveryId: receipt.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return deliveryResult(status, receipt.id);
}
async function laterUserMessages(
  admin: TalentAdminClient,
  userId: string,
  conversationId: string,
  cursor: number
) {
  const { data, error } = await admin
    .from("talent_messages")
    .select("id,content,created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .eq("role", "user")
    .gt("id", cursor)
    .order("id");
  if (error) throw error;
  return data ?? [];
}
const messageText = (messages: Awaited<ReturnType<typeof laterUserMessages>>) =>
  messages
    .map(
      (row) =>
        `User message ${row.id} (${formatLlmDateTime(row.created_at)} Asia/Seoul):\n${row.content}`
    )
    .join("\n\n");

export async function deliverCareerEmailReceipt(
  admin: TalentAdminClient,
  deliveryId: string
) {
  const claimId = crypto.randomUUID();
  const receipt = await rpc(admin, "claim_career_agent_email", {
    p_delivery_id: deliveryId,
    p_claim_id: claimId,
  });
  if (!receipt) return deliveryResult("queued", deliveryId);
  if (receipt.payload.resendEmailId) {
    try {
      await rpc(admin, "finish_career_agent_email", {
        p_delivery_id: deliveryId,
      });
    } catch (error) {
      console.error("[career-email] Sent receipt audit will recover", {
        deliveryId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return finishResult(admin, receipt, "sent");
  }
  if (terminal.has(receipt.status))
    return finishResult(admin, receipt, receipt.status);
  const payload = receipt.payload;
  try {
    const runRead = await (admin.from as any)("opportunity_discovery_run")
      .select("*")
      .eq("id", receipt.discovery_run_id)
      .eq("talent_id", receipt.talent_id)
      .single();
    if (runRead.error) throw runRead.error;
    if (!["handed_off", "completed"].includes(runRead.data.status)) {
      const { error } = await admin
        .from("talent_opportunity_delivery")
        .update({
          status: "cancelled",
          error_message: "Career invocation is no longer active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId)
        .eq("payload->>claimId", claimId);
      if (error) throw error;
      return finishResult(admin, receipt, "cancelled");
    }
    await assertCareerSourceEventsCurrent({ admin, run: runRead.data });
    const changedAppointments = await changedTalentSchedules({ admin, userId: receipt.talent_id, versions: payload.meetingScheduleVersions });
    if (changedAppointments) {
      const { error } = await admin.from("talent_opportunity_delivery").update({ status: "context_changed", error_message: "Appointment changed before delivery", updated_at: new Date().toISOString() }).eq("id", deliveryId).eq("payload->>claimId", claimId);
      if (error) throw error;
      return finishResult(admin, receipt, "context_changed");
    }
    const companyFollowups =
      runRead.data.trigger_payload?.companyRequestFollowups?.filter((target: any) => {
        const source = runRead.data.trigger_payload?.sourceEvents?.find((e: any) =>
          e.sourceKind === "company_followup" && e.sourceId === target.followupId);
        return !source?.dailySourceId || (payload.sourceIds ?? []).includes(source.dailySourceId);
      });
    if (Array.isArray(companyFollowups) && companyFollowups.length) {
      const allowed = await rpc(admin, "begin_company_followup_delivery_v1", {
        p_talent: receipt.talent_id,
        p_ids: companyFollowups.map((target: any) => target.followupId),
        p_revisions: companyFollowups.map((target: any) => target.revision),
        p_run: receipt.discovery_run_id,
      });
      if (!allowed) {
        const { error } = await admin
          .from("talent_opportunity_delivery")
          .update({
            status: "cancelled",
            error_message: "Company follow-up changed before delivery",
            updated_at: new Date().toISOString(),
          })
          .eq("id", deliveryId)
          .eq("payload->>claimId", claimId);
        if (error) throw error;
        return finishResult(admin, receipt, "cancelled");
      }
    }
    const [
      { data: talent, error: talentError },
      { data: setting, error: settingError },
    ] = await Promise.all([
      admin
        .from("talent_users")
        .select("email,deleted_at")
        .eq("user_id", receipt.talent_id)
        .single(),
      admin
        .from("talent_setting")
        .select("profile_visibility,get_external_recommendation,get_internal_recommendation,status")
        .eq("user_id", receipt.talent_id)
        .maybeSingle(),
    ]);
    if (talentError || settingError) throw talentError ?? settingError;
    const external =
      runRead.data.trigger_payload?.contactScope === "external_recommendations";
    const checkIn = runRead.data.trigger_payload?.contactScope === "career_check_in";
    const internalAllowed = setting?.get_internal_recommendation !== false && setting?.profile_visibility !== "dont_share";
    const externalAllowed = setting?.get_external_recommendation !== false && setting?.status !== "stopped";
    if (
      (checkIn && !internalAllowed && !externalAllowed) ||
      !talent ||
      talent.deleted_at ||
      normalizeEmailAddress(talent.email) !== payload.emailPayload.to ||
      (external &&
        (setting?.get_external_recommendation === false ||
          setting?.status === "stopped")) ||
      (runRead.data.trigger_payload?.contactScope === "matching" &&
        setting?.profile_visibility === "dont_share")
    ) {
      const { error } = await admin
        .from("talent_opportunity_delivery")
        .update({
          status: "cancelled",
          error_message:
            "Current recipient or notification scope is unavailable",
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId)
        .eq("payload->>claimId", claimId);
      if (error) throw error;
      return finishResult(admin, receipt, "cancelled");
    }
    // Every attempt, including a recovered retry, respects user messages that
    // arrived after this exact body was prepared. Only the original agent may
    // authorize retrying the same body after interpreting the new context.
    const later = await laterUserMessages(
      admin,
      receipt.talent_id,
      payload.conversationId,
      Number(
        payload.sourceMessageCursor ??
          runRead.data.trigger_payload?.agentInvocation?.sourceMessageCursor ??
          0
      )
    );
    if (later.length) {
      const { error } = await admin
        .from("talent_opportunity_delivery")
        .update({
          status: "context_changed",
          error_message: "New user messages arrived after email preparation",
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId)
        .eq("payload->>claimId", claimId);
      if (error) throw error;
      return finishResult(admin, receipt, "context_changed");
    }
    // Cancellation or another sender's claim can arrive during source reads.
    const allowed = await rpc(admin, "begin_career_agent_email_attempt", {
      p_delivery_id: deliveryId, p_claim_id: claimId,
    });
    if (!allowed) {
      const current = await admin.from("talent_opportunity_delivery").select("*").eq("id", deliveryId).single();
      if (current.error) throw current.error;
      return finishResult(admin, current.data, current.data.status);
    }
    const sent = await sendResendEmail({
      ...payload.emailPayload,
      signal: AbortSignal.timeout(60_000),
    });
    if (!sent.id) throw new Error("Email provider returned no receipt");
    // Save the irreversible provider receipt before secondary audit writes.
    await rpc(admin, "record_career_agent_email_receipt", {
      p_delivery_id: deliveryId,
      p_idempotency_key: payload.emailPayload.idempotencyKey,
      p_provider_id: sent.id,
    });
    await rpc(admin, "finish_career_agent_email", {
      p_delivery_id: deliveryId,
    });
    return finishResult(admin, receipt, "sent");
  } catch (error) {
    if (error instanceof CareerSourceChangedError) {
      const cancelled = await admin
        .from("talent_opportunity_delivery")
        .update({
          status: "cancelled",
          error_message: error.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId)
        .eq("payload->>claimId", claimId);
      if (cancelled.error) throw cancelled.error;
      await rpc(admin, "cancel_career_background_run", {
        p_run_id: receipt.discovery_run_id,
        p_reason: error.message,
      });
      return finishResult(admin, receipt, "cancelled");
    }
    const current = await admin
      .from("talent_opportunity_delivery")
      .select("status,payload")
      .eq("id", deliveryId)
      .single();
    if (current.error) throw current.error;
    if (
      current.data.status === "sent" ||
      (current.data.payload as any)?.resendEmailId
    )
      return finishResult(admin, receipt, "sent");
    const status =
      (current.data.payload as any)?.cancelRequested ||
      current.data.status === "cancelled"
        ? "cancelled"
        : "retry";
    const saved = await admin
      .from("talent_opportunity_delivery")
      .update({
        status,
        error_message:
          error instanceof Error ? error.message : "Delivery failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", deliveryId)
      .eq("payload->>claimId", claimId)
      .neq("status", "sent");
    if (saved.error) throw saved.error;
    return finishResult(admin, receipt, status);
  }
}

async function enqueueDelivery(admin: TalentAdminClient, deliveryId: string) {
  const key = `career-email:${deliveryId}:${Math.floor(Date.now() / 120000)}`;
  if (
    !scheduleCareerDevelopmentJob(key, async () => {
      await deliverCareerEmailReceipt(admin, deliveryId);
    })
  )
    await send(
      CAREER_DELIVERY_TOPIC,
      { deliveryId },
      { idempotencyKey: key, retentionSeconds: 86400 }
    );
}
async function requestDeliveryRecovery(
  admin: TalentAdminClient,
  deliveryId: string
) {
  try {
    await enqueueDelivery(admin, deliveryId);
  } catch (error) {
    // The outbox and parent checkpoint are durable. Dispatch failure must not
    // abandon the original turn; the periodic recovery uses this same receipt.
    console.error("[career-email] Delivery dispatch failed", {
      deliveryId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
export async function recoverCareerEmailDeliveries(admin: TalentAdminClient) {
  const { data, error } = await admin
    .from("talent_opportunity_delivery")
    .select("id,status,payload")
    .eq("payload->>runContract", "career_agent_v1")
    .in("status", ["queued", "retry", "sending", "sent"])
    .is("payload->>auditCompletedAt", null)
    .order("updated_at")
    .limit(20);
  if (error) throw error;
  for (const row of data ?? []) await enqueueDelivery(admin, row.id);
  return { inspected: data?.length ?? 0 };
}
export function formatCareerEmailReceipt(receipt: any) {
  if (!receipt) return "This invocation has no prepared email.";
  return [
    `Candidate email ${receipt.id}; ${receipt.status}. Times: Asia/Seoul.`,
    receipt.payload?.resendEmailId
      ? `Provider receipt: ${receipt.payload.resendEmailId}; readership is unknown.`
      : "No stored provider receipt. If an attempt already occurred, this does not prove non-delivery.",
    receipt.status === "sent" ? "This email is also saved in the candidate’s Career history." : "",
    receipt.payload?.sourceIds?.length ? `Communicated pending source IDs: ${receipt.payload.sourceIds.join(", ")}.` : "",
    receipt.sent_at ? `Sent: ${formatLlmDateTime(receipt.sent_at)}` : "",
    receipt.error_message ? `Execution detail: ${receipt.error_message}` : "",
    `Prepared subject: ${receipt.payload?.emailPayload?.subject ?? ""}`,
    `Prepared body:\n${receipt.payload?.bodyMarkdown ?? ""}`,
    "Retry preserves this exact subject, body, recipient and provider key. Cancel stops future attempts; it cannot recall an already delivered message.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const CAREER_DELIVERY_TOOLS: Record<string, TalentToolDefinition> = {
  deliver_career_email: {
    name: "deliver_career_email",
    channels: ["chat"],
    description:
      TOOL_DESCRIPTIONS.deliver_career_email,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["deliver", "read", "retry", "cancel"],
        },
        sourceIds: CAREER_DELIVERY_SOURCE_IDS,
        subject: { type: "string" },
        body: { type: "string", description: "Finished Markdown email body. Use actual line breaks for paragraphs and descriptive Markdown links instead of displaying raw URLs, e.g. [포지션](https://matchharper.com/jobs/<job-id>) with the actual URL; the body is rendered directly as email, without chat cards." },
      },
      additionalProperties: false,
    },
    async execute(input, context) {
      if (
        !context?.admin ||
        !context.userId ||
        !context.conversationId ||
        !context.backgroundInvocation ||
        !context.agentClaimId ||
        !context.resumeRequestId
      )
        throw new Error(
          "Candidate email delivery requires a trusted background invocation"
        );
      const admin = context.admin as TalentAdminClient,
        invocation = context.backgroundInvocation;
      const action = input.action ?? "deliver";
      if (!["deliver", "read", "retry", "cancel"].includes(String(action)))
        throw new Error("Unknown email action");
      const identity = {
        p_user_id: context.userId,
        p_conversation_id: context.conversationId,
        p_run_id: invocation.runId,
        p_reply_id: context.resumeRequestId,
        p_claim_id: context.agentClaimId,
      };
      const readReceipt = () =>
        rpc(admin, "control_career_agent_email", {
          ...identity,
          p_action: "read",
          p_source_message_cursor: invocation.sourceMessageCursor,
        });
      if (action === "read" || action === "cancel") {
        const receipt = await rpc(admin, "control_career_agent_email", {
          ...identity,
          p_action: action,
          p_source_message_cursor: invocation.sourceMessageCursor,
        });
        if (!receipt)
          return {
            status: "not_prepared",
            modelOutput: formatCareerEmailReceipt(null),
          };
        if (pending.has(receipt.status))
          await requestDeliveryRecovery(admin, receipt.id);
        return {
          ...(await finishResult(admin, receipt, receipt.status)),
          modelOutput: formatCareerEmailReceipt(receipt),
        };
      }
      const later = await laterUserMessages(
        admin,
        context.userId,
        context.conversationId,
        invocation.sourceMessageCursor
      );
      if (later.length) {
        invocation.sourceMessageCursor = later[later.length - 1].id;
        return {
          status: "context_changed",
          modelOutput: [
            "No new send attempt. Interpret these user messages before deciding whether to deliver, retry the prepared body, cancel, or do nothing.",
            messageText(later),
            formatCareerEmailReceipt(await readReceipt()),
          ].join("\n\n"),
        };
      }
      const changedAppointments = await changedTalentSchedules({ admin, userId: context.userId, versions: invocation.meetingScheduleVersions });
      if (changedAppointments) return { status: "context_changed", modelOutput: `No send attempt. Appointments changed; read their current versions before deciding what to do.\n${changedAppointments}` };
      let receipt: any;
      if (action === "retry") {
        receipt = await rpc(admin, "control_career_agent_email", {
          ...identity,
          p_action: "retry",
          p_source_message_cursor: invocation.sourceMessageCursor,
        });
        if (!receipt)
          return {
            status: "not_prepared",
            modelOutput: formatCareerEmailReceipt(null),
          };
      } else {
        if (
          typeof input.subject !== "string" ||
          typeof input.body !== "string" ||
          !input.subject.trim() ||
          !input.body.trim()
        )
          throw new Error("Subject and body are required for delivery");
        const sourceRun = await (admin.from as any)("opportunity_discovery_run").select("trigger_payload")
          .eq("id", invocation.runId).eq("talent_id", context.userId).single();
        if (sourceRun.error) throw sourceRun.error;
        const sourceIds = careerContactSourceIds(sourceRun.data, input.sourceIds);
        const { data: talent, error } = await admin
          .from("talent_users")
          .select("email,deleted_at")
          .eq("user_id", context.userId)
          .single();
        if (error) throw error;
        const to = normalizeEmailAddress(talent.email);
        if (!to || talent.deleted_at)
          return {
            status: "unavailable",
            modelOutput:
              "No email prepared: this candidate has no available recipient address.",
          };
        const replyTo = await ensureReplyAlias(
          admin,
          context.userId,
          context.conversationId
        );
        const emailPayload = {
          from: getDefaultResendFromEmail(),
          to,
          replyTo,
          subject: input.subject,
          ...renderReplyEmail(input.body, { footer: true }),
          idempotencyKey: `career-agent/${invocation.runId}`,
        };
        receipt = await rpc(admin, "reserve_career_agent_email", {
          ...identity,
          p_payload: {
            emailPayload,
            bodyMarkdown: input.body,
            sourceIds,
            meetingScheduleVersions: invocation.meetingScheduleVersions,
            sourceMessageCursor: invocation.sourceMessageCursor,
            parentReplyId: context.resumeRequestId,
          },
        });
      }
      if (action === "retry" && receipt.status === "retry" && invocation.meetingScheduleVersions) {
        const { data, error } = await admin.from("talent_opportunity_delivery")
          .update({ payload: { ...receipt.payload, meetingScheduleVersions: invocation.meetingScheduleVersions } })
          .eq("id", receipt.id).eq("talent_id", context.userId).eq("status", "retry")
          .eq("updated_at", receipt.updated_at).select("*").maybeSingle();
        if (error) throw error;
        if (!data) return { status: "context_changed", modelOutput: "Delivery changed concurrently. Read its current receipt before continuing." };
        receipt = data;
      }
      const result = await deliverCareerEmailReceipt(admin, receipt.id);
      if (pending.has(result.status))
        await requestDeliveryRecovery(admin, receipt.id);
      // A source cancellation may have retired this invocation's claim. Read
      // only the receipt already authorized above, without requiring it active.
      const saved = await admin
        .from("talent_opportunity_delivery")
        .select("*")
        .eq("id", receipt.id)
        .eq("talent_id", context.userId)
        .eq("discovery_run_id", invocation.runId)
        .eq("payload->>runContract", "career_agent_v1")
        .single();
      if (saved.error) throw saved.error;
      return { ...result, modelOutput: formatCareerEmailReceipt(saved.data) };
    },
  },
};
