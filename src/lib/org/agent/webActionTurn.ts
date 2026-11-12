import { deferOrgResponseWork } from "../requestScope.server";
import { traceStageStep } from "@/lib/org/stageTiming.server";
import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  ensureOrgAgentConversation,
  ensureOrgRoleCreationConversation,
} from "@/lib/org/agent/store";
import { chooseWebActionConversation } from "@/lib/org/agent/webActionConversation";
import { publishCompanyAgentWebActionJob } from "@/lib/org/agent/webActionQueue";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type JsonObject = Record<string, unknown>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

/**
 * Events that join one company Harper run when they come in quick succession
 * (D12): the run collects them for this many seconds, then starts once. Stage
 * moves join too, so a bulk decision wakes Harper once.
 */
export const BATCHED_WEB_ACTIONS: Readonly<Record<string, number>> = {
  company_intro_decision: 45,
  candidate_stage_changed: 45,
};

/** The normal dispatcher resumes interrupted work under its original job ID. */
export async function recoverOrgAgentWebActionJobs(admin = getSupabaseAdmin()) {
  const { data, error } = await (admin.rpc as any)("recover_company_agent_web_action_jobs_v1", {
    p_stale_after_seconds: 1860, p_max_attempts: 5, p_limit: 20,
  });
  if (error) throw error;
  // A published message can disappear before a claim (for example when the
  // development SDK exhausts its redeliveries). Use the consumer's 1860s
  // visibility window before recovering an unclaimed publication as well.
  const cutoff = new Date(Date.now() - 1860_000).toISOString();
  const { data: abandoned, error: readError } = await (admin.from("company_agent_web_action_jobs" as any) as any)
    .select("id")
    .in("status", ["queued", "retry"])
    .eq("queue_dispatch_status", "dispatched")
    .lt("queue_dispatched_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(20);
  if (readError) throw readError;
  if (!abandoned?.length) return Number(data ?? 0);
  const now = new Date().toISOString();
  const { data: recovered, error: recoverError } = await (admin.from("company_agent_web_action_jobs" as any) as any)
    .update({ queue_dispatch_status: "pending", queue_next_attempt_at: now, updated_at: now })
    .in("id", abandoned.map((job: { id: string }) => job.id))
    .in("status", ["queued", "retry"])
    .eq("queue_dispatch_status", "dispatched")
    .lt("queue_dispatched_at", cutoff)
    .select("id");
  if (recoverError) throw recoverError;
  return Number(data ?? 0) + (recovered?.length ?? 0);
}

export async function enqueueOrgAgentWebActionTurn(args: {
  actionContext: JsonObject;
  actionName: string;
  idempotencyKey: string;
  roleId?: string | null;
  user: User;
  workspaceId: string;
  dispatch?: boolean;
  conversationId?: string;
}) {
  const workspaceId = clean(args.workspaceId);
  const roleId = clean(args.roleId) || null;
  const actionName = clean(args.actionName);
  const idempotencyKey = clean(args.idempotencyKey);
  if (!workspaceId || !actionName || !idempotencyKey) {
    throw new Error("Invalid company agent web-action enqueue request");
  }
  const serializedContext = JSON.stringify(args.actionContext);
  if (serializedContext.length > 32_000) {
    throw new Error("Company agent web-action context is too large");
  }
  const actionContext = JSON.parse(serializedContext) as JsonObject;

  const scoped = roleId
    ? await traceStageStep("enqueueOrgAgentWebActionTurn:51", async () => (ensureOrgRoleCreationConversation({
        allowCompletedRole: true,
        roleId,
        user: args.user,
        workspaceId,
      })))
    : await traceStageStep("enqueueOrgAgentWebActionTurn:57", async () => (ensureOrgAgentConversation({ user: args.user, workspaceId })));
  const admin = scoped.admin;
  let conversation = scoped.conversation;
  if (args.conversationId) {
    const { data, error } = await traceStageStep("enqueueOrgAgentWebActionTurn:61", async () => ((admin.from("company_conversations" as any) as any)
      .select("id,role_id").eq("id", args.conversationId)
      .eq("company_workspace_id", workspaceId).single()));
    if (error) throw error;
    // The authenticated scope above verifies the related Role.
    conversation = chooseWebActionConversation(conversation, data, roleId);
  }
  const batchWindowSeconds = BATCHED_WEB_ACTIONS[actionName];
  const { data, error } = await traceStageStep("enqueueOrgAgentWebActionTurn:68", async () => ((admin.rpc as any)(
    batchWindowSeconds ? "enqueue_company_agent_web_action_batched_v1" : "enqueue_company_agent_web_action_v1",
    {
      p_action_context: actionContext,
      p_action_name: actionName,
      p_actor_user_id: args.user.id,
      p_company_workspace_id: workspaceId,
      p_conversation_id: conversation.id,
      p_idempotency_key: idempotencyKey,
      p_role_id: conversation.role_id,
      ...(batchWindowSeconds ? { p_window_seconds: batchWindowSeconds } : {}),
    }
  )));
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const jobId = clean(row?.job_id);
  if (!jobId)
    throw new Error("Company agent web-action enqueue returned no job");

  const deferred = args.dispatch !== false && deferOrgResponseWork(async () => {
    await dispatchOrgAgentWebActionJob({ admin, jobId });
  });
  const dispatched = args.dispatch === false || deferred ? false : await traceStageStep("enqueueOrgAgentWebActionTurn:86", async () => (dispatchOrgAgentWebActionJob({ admin, jobId })));

  return { created: row?.created === true, dispatched, jobId };
}

export async function dispatchOrgAgentWebActionJob(args: {
  admin?: ReturnType<typeof getSupabaseAdmin>;
  jobId: string;
}) {
  const jobId = clean(args.jobId);
  if (!jobId) throw new Error("Company agent web-action job id is required");
  const admin = args.admin ?? getSupabaseAdmin();
  const { data: job, error: jobError } = await traceStageStep("dispatchOrgAgentWebActionJob:98", async () => ((
    admin.from("company_agent_web_action_jobs" as any) as any
  )
    .select("queue_dispatch_attempt_count, status, updated_at")
    .eq("id", jobId)
    .maybeSingle()));
  if (jobError) throw jobError;
  if (!job || !["queued", "retry"].includes(clean(job.status))) return false;

  try {
    await traceStageStep("dispatchOrgAgentWebActionJob:108", async () => (publishCompanyAgentWebActionJob(jobId)));
    const now = new Date().toISOString();
    const { error: dispatchError } = await traceStageStep("dispatchOrgAgentWebActionJob:110", async () => ((
      admin.from("company_agent_web_action_jobs" as any) as any
    )
      .update({
        queue_dispatch_attempt_count: 0,
        queue_dispatch_status: "dispatched",
        queue_dispatched_at: now,
        queue_last_error: null,
        queue_next_attempt_at: now,
        updated_at: now,
      })
      .eq("id", jobId)
      .in("status", ["queued", "retry"])
      // A fast consumer may already have deferred the job for recovery.
      .eq("updated_at", job.updated_at)));
    if (dispatchError) throw dispatchError;
    return true;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 1_000)
        : "Queue publish failed";
    const attempts = Number(job.queue_dispatch_attempt_count ?? 0) + 1;
    const terminal = attempts >= 5;
    const { error: markError } = await traceStageStep("dispatchOrgAgentWebActionJob:132", async () => ((
      admin.from("company_agent_web_action_jobs" as any) as any
    )
      .update({
        queue_dispatch_attempt_count: attempts,
        queue_dispatch_status: terminal ? "failed" : "retry",
        ...(terminal ? { status: "failed", last_error: message } : {}),
        queue_last_error: message,
        queue_next_attempt_at: new Date(
          Date.now() + Math.min(300, 2 ** attempts * 15) * 1_000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .in("status", ["queued", "retry"])));
    if (markError) {
      console.error("[org-agent/web-action:mark-dispatch-retry]", markError);
    }
    console.error("[org-agent/web-action:dispatch]", { error: message, jobId });
    return false;
  }
}

export async function markOrgAgentWebActionQueueDispatched(jobIdValue: string) {
  const jobId = clean(jobIdValue);
  if (!jobId) return;
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await (
    admin.from("company_agent_web_action_jobs" as any) as any
  )
    .update({
      queue_dispatch_status: "dispatched",
      queue_dispatched_at: now,
      queue_last_error: null,
      updated_at: now,
    })
    .eq("id", jobId);
  if (error) throw error;
}

/** Queue delivery retries are finite in development; the job ledger also owns
 * the wake-up while this job waits for an earlier turn or its batching window. */
export async function deferOrgAgentWebActionQueue(jobId: string, afterSeconds: number) {
  const admin = getSupabaseAdmin();
  const now = new Date();
  const { error } = await (admin.from("company_agent_web_action_jobs" as any) as any)
    .update({
      queue_dispatch_status: "pending",
      queue_next_attempt_at: new Date(now.getTime() + afterSeconds * 1000).toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", jobId)
    .in("status", ["queued", "retry"]);
  if (error) throw error;
}
