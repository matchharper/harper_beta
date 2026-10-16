import "server-only";
import { sendProactiveHiringOverview } from "@/lib/ops/autoIntroToCompanyNotifications";
import { deliverCompanyContactEventMessages } from "./contactEvent.server";
import { assertOrgRoleAccess, assertOrgWorkspacePermission } from "@/lib/org/server";
import { OrgAgentWebActionSupersededError, runOrgAgentWebActionTurn } from "./chat";
import type { OrgAgentConversationRow } from "./store";
import { markOrgAgentWebActionQueueDispatched } from "./webActionTurn";
import { parseCompanyAgentWebActionQueueMessage } from "./webActionQueue";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { runCompanyProactiveReview } from "./proactiveReview.server";
import { deliverCompanyMessageBatch } from "./companyMessageDelivery.server";

import { runRoleSearchKickoff, continueRoleSearchKickoff } from "./roleSearchKickoff.server";

const MAX_ATTEMPTS = 5;

export class WebActionQueuePermanentError extends Error {}
export class WebActionQueueRetryError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds = 10
  ) {
    super(message);
  }
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function retryDelay(attempt: number) {
  return Math.min(300, 2 ** Math.max(1, attempt) * 5);
}

async function markRetry(args: {
  attemptCount: number;
  error: unknown;
  jobId: string;
}) {
  const admin = getSupabaseAdmin();
  const message =
    args.error instanceof Error
      ? args.error.message.slice(0, 1_000)
      : "Company agent web-action turn failed";
  const exhausted = args.attemptCount >= MAX_ATTEMPTS;
  const delay = retryDelay(args.attemptCount);
  const { error } = await (
    admin.from("company_agent_web_action_jobs" as any) as any
  )
    .update({
      last_error: message,
      locked_at: null,
      locked_by: null,
      next_attempt_at: new Date(Date.now() + delay * 1_000).toISOString(),
      status: exhausted ? "failed" : "retry",
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.jobId)
    .eq("status", "processing");
  if (error) throw error;
  if (!exhausted) throw new WebActionQueueRetryError(message, delay);
  throw new WebActionQueuePermanentError(message);
}

export async function processCompanyAgentWebActionJob(raw: unknown, metadata: { messageId: string }) {
  const message = parseCompanyAgentWebActionQueueMessage(raw);
  if (!message) {
    throw new WebActionQueuePermanentError(
      "Invalid company agent web-action message"
    );
  }
  const admin = getSupabaseAdmin();
  await markOrgAgentWebActionQueueDispatched(message.jobId);
  const { data, error } = await (admin.rpc as any)(
    "claim_company_agent_web_action_v1",
    {
      p_job_id: message.jobId,
      p_max_attempts: MAX_ATTEMPTS,
      p_stale_after_seconds: 360,
      p_worker_id: `vercel-queue:${metadata.messageId}`,
    }
  );
  if (error) throw error;
  const job = Array.isArray(data) ? data[0] : data;
  if (!job) {
    const { data: current, error: currentError } = await (
      admin.from("company_agent_web_action_jobs" as any) as any
    )
      .select("attempt_count, locked_at, next_attempt_at, status")
      .eq("id", message.jobId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current || current.status === "failed") throw new WebActionQueuePermanentError("Company event is missing or exhausted its retries");
    if (
      !current ||
      [
        "completed_silent",
        "completed_message",
        "superseded",
        "failed",
      ].includes(clean(current.status))
    ) {
      return;
    }
    throw new WebActionQueueRetryError(
      "Company agent conversation already has an active turn",
      clean(current.status) === "processing" ? 10 : 5
    );
  }

  try {
    const [{ data: conversation, error: conversationError }, authResult] =
      await Promise.all([
        (admin.from("company_conversations" as any) as any)
          .select(
            "id, company_workspace_id, role_id, title, last_message_at, last_message_id, summary_cursor_message_id, metadata, created_at, updated_at"
          )
          .eq("id", job.conversation_id)
          .single(),
        admin.auth.admin.getUserById(job.actor_user_id),
      ]);
    if (conversationError) throw conversationError;
    if (authResult.error || !authResult.data.user) {
      throw authResult.error || new Error("Web-action actor account not found");
    }
    const user = authResult.data.user;
    if (conversation.company_workspace_id !== job.company_workspace_id) {
      throw new Error("Company event conversation workspace mismatch");
    }
    const relatedRoleId = clean(job.action_context?.relatedRoleId) || clean(job.role_id) || clean(conversation.role_id) || null;
    const assertEventAccess = async () => {
      if (relatedRoleId) await assertOrgRoleAccess({
        admin, user, workspaceId: job.company_workspace_id, roleId: relatedRoleId,
      });
      if (["candidate_contact_received", "company_update"].includes(job.action_name)) {
        await assertOrgWorkspacePermission({ admin, user, workspaceId: job.company_workspace_id, permission: "manage_candidates" });
      }
    };
    await assertEventAccess();
    const { getOrgWorkspaceLocale } = await import("../workspaceLocale.server");
    const { data: companyUser, error: companyUserError } = await admin.from("company_users")
      .select("locale").eq("user_id", user.id).maybeSingle();
    if (companyUserError) throw companyUserError;
    const responseLocale: "ko" | "en" | "auto" = job.action_context?.responseLocale === "ko" || job.action_context?.responseLocale === "en"
      ? job.action_context.responseLocale
      : job.action_name === "company_update" || job.action_name === "proactive_recruiting_review" || job.action_name === "role_search_kickoff"
      ? await getOrgWorkspaceLocale(job.company_workspace_id, admin)
      : companyUser?.locale === "ko" || companyUser?.locale === "en" ? companyUser.locale : "auto";
    const turnArgs = {
      actionContext:
        job.action_context && typeof job.action_context === "object"
          ? job.action_context
          : {},
      actionName: clean(job.action_name),
      actorLabel:
        clean(user.user_metadata?.full_name) ||
        clean(user.user_metadata?.name) ||
        clean(user.email) ||
        "회사 사용자",
      anchorMessageId: Number(job.anchor_message_id),
      conversation: conversation as OrgAgentConversationRow,
      jobId: message.jobId,
      roleId: clean(job.role_id) || null,
      user,
      responseLocale,
    };
    const isProactive = job.action_name === "proactive_recruiting_review";
    const isResearch = job.action_name === "role_search_kickoff";
    const result = isResearch ? await runRoleSearchKickoff(turnArgs)
      : isProactive ? await runCompanyProactiveReview(turnArgs) : await runOrgAgentWebActionTurn(turnArgs);
    {
      await assertEventAccess();
      const assertProactiveDeliveryCurrent = async () => {
        if (!isProactive) return;
        if (!job.action_context?.deadlineAt || Date.now() >= Date.parse(job.action_context.deadlineAt)) throw new OrgAgentWebActionSupersededError();
        const { data: newer, error } = await admin.from("company_messages").select("id")
          .eq("company_workspace_id", job.company_workspace_id).eq("role", "user").in("message_type", ["chat", "slack"])
          .gt("id", job.anchor_message_id).limit(1);
        if (error) throw error;
        if (newer?.length) throw new OrgAgentWebActionSupersededError();
      };
      // Independent of the model's message/silent decision; always precedes its batch.
      if (isProactive) {
        await assertProactiveDeliveryCurrent();
        const { data: channel, error } = await admin.from("company_slack_channels")
          .select("slack_channel_id").eq("id", job.action_context?.channelDbId)
          .eq("company_workspace_id", job.company_workspace_id).eq("is_enabled", true).single();
        if (error) throw error;
        await sendProactiveHiringOverview({ workspaceId: job.company_workspace_id, channelId: channel.slack_channel_id });
      }
      if ("batchId" in result && typeof result.batchId === "string") {
        await deliverCompanyMessageBatch({ batchId: result.batchId, workspaceId: job.company_workspace_id,
          assertCanStart: assertProactiveDeliveryCurrent });
      } else await deliverCompanyContactEventMessages({
        jobId: message.jobId,
        messageIds: [result.progressMessageId, result.terminalMessageId],
        roleId: relatedRoleId,
        slackThreadId: clean(job.action_context?.slackThreadId) || null,
        workspaceId: job.company_workspace_id,
        pendingRelayId: job.action_context?.contactPendingDelivery === true ? clean(job.action_context?.relayId) : undefined,
        candidateIds: job.action_context?.facts?.candidateIds,
      });
    }
    if (isResearch) await continueRoleSearchKickoff({
      jobId: message.jobId, workspaceId: job.company_workspace_id, roleId: relatedRoleId!,
    });
    const now = new Date().toISOString();
    const { error: completeError } = await (
      admin.from("company_agent_web_action_jobs" as any) as any
    )
      .update({
        completed_at: now,
        last_error: null,
        locked_at: null,
        locked_by: null,
        progress_message_id: result.progressMessageId,
        status: result.outcome,
        terminal_message_id: result.terminalMessageId,
        updated_at: now,
      })
      .eq("id", message.jobId)
      .eq("status", "processing");
    if (completeError) throw completeError;
  } catch (error) {
    if (error instanceof OrgAgentWebActionSupersededError) {
      const now = new Date().toISOString();
      const { error: supersedeError } = await (
        admin.from("company_agent_web_action_jobs" as any) as any
      )
        .update({
          completed_at: now,
          last_error: "superseded_by_newer_conversation_event",
          locked_at: null,
          locked_by: null,
          status: "superseded",
          updated_at: now,
        })
        .eq("id", message.jobId)
        .eq("status", "processing");
      if (supersedeError) throw supersedeError;
      return;
    }
    return markRetry({
      attemptCount: Number(job.attempt_count ?? 1),
      error,
      jobId: message.jobId,
    });
  }
}

