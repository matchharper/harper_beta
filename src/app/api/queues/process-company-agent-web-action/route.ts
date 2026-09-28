import { deliverCompanyContactEventMessages } from "@/lib/org/agent/contactEvent.server";
import { timingSafeEqual } from "node:crypto";
import { assertOrgWorkspacePermission } from "@/lib/org/server";
import { handleCallback, type MessageMetadata } from "@vercel/queue";
import {
  OrgAgentWebActionSupersededError,
  runOrgAgentWebActionTurn,
} from "@/lib/org/agent/chat";
import type { OrgAgentConversationRow } from "@/lib/org/agent/store";
import { markOrgAgentWebActionQueueDispatched } from "@/lib/org/agent/webActionTurn";
import { parseCompanyAgentWebActionQueueMessage } from "@/lib/org/agent/webActionQueue";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_ATTEMPTS = 5;

class WebActionQueuePermanentError extends Error {}
class WebActionQueueRetryError extends Error {
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
}

async function processMessage(raw: unknown, metadata: Pick<MessageMetadata, "messageId">) {
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
    if (job.action_name === "candidate_contact_received") {
      await assertOrgWorkspacePermission({
        admin,
        user,
        workspaceId: job.company_workspace_id,
        permission: "manage_candidates",
      });
    }
    const result = await runOrgAgentWebActionTurn({
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
    });
    if (job.action_name === "candidate_contact_received") {
      await deliverCompanyContactEventMessages({
        jobId: message.jobId,
        messageIds: [result.progressMessageId, result.terminalMessageId],
        roleId: clean(job.role_id) || null,
        slackThreadId: clean(job.action_context?.slackThreadId) || null,
        workspaceId: job.company_workspace_id,
      });
    }
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

const queueCallback = handleCallback(processMessage, {
  retry: (error, metadata) => {
    if (error instanceof WebActionQueuePermanentError) {
      console.error("[org-agent/web-action:permanent]", error);
      return { acknowledge: true };
    }
    if (error instanceof WebActionQueueRetryError) {
      return { afterSeconds: error.retryAfterSeconds };
    }
    return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
  },
  visibilityTimeoutSeconds: 390,
});

export async function POST(request: Request) {
  if (process.env.HARPER_LOCAL_E2E !== "1") return queueCallback(request);
  const expected = Buffer.from(process.env.INTERNAL_WORKER_API_SECRET || "");
  const actual = Buffer.from((request.headers.get("authorization") || "").replace(/^Bearer /, ""));
  if (!expected.length || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await processMessage(await request.json(), { messageId: `local-e2e:${crypto.randomUUID()}` });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Local queue failed" }, { status: 503 });
  }
}
