import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  ensureOrgAgentConversation,
  ensureOrgRoleCreationConversation,
} from "@/lib/org/agent/store";
import { publishCompanyAgentWebActionJob } from "@/lib/org/agent/webActionQueue";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type JsonObject = Record<string, unknown>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function enqueueOrgAgentWebActionTurn(args: {
  actionContext: JsonObject;
  actionName: string;
  idempotencyKey: string;
  roleId?: string | null;
  user: User;
  workspaceId: string;
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
    ? await ensureOrgRoleCreationConversation({
        allowCompletedRole: true,
        roleId,
        user: args.user,
        workspaceId,
      })
    : await ensureOrgAgentConversation({ user: args.user, workspaceId });
  const admin = scoped.admin;
  const { data, error } = await (admin.rpc as any)(
    "enqueue_company_agent_web_action_v1",
    {
      p_action_context: actionContext,
      p_action_name: actionName,
      p_actor_user_id: args.user.id,
      p_company_workspace_id: workspaceId,
      p_conversation_id: scoped.conversation.id,
      p_idempotency_key: idempotencyKey,
      p_role_id: roleId,
    }
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const jobId = clean(row?.job_id);
  if (!jobId)
    throw new Error("Company agent web-action enqueue returned no job");

  const dispatched = await dispatchOrgAgentWebActionJob({ admin, jobId });

  return { created: row?.created === true, dispatched, jobId };
}

export async function dispatchOrgAgentWebActionJob(args: {
  admin?: ReturnType<typeof getSupabaseAdmin>;
  jobId: string;
}) {
  const jobId = clean(args.jobId);
  if (!jobId) throw new Error("Company agent web-action job id is required");
  const admin = args.admin ?? getSupabaseAdmin();
  const { data: job, error: jobError } = await (
    admin.from("company_agent_web_action_jobs" as any) as any
  )
    .select("queue_dispatch_attempt_count, status")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job || !["queued", "retry"].includes(clean(job.status))) return false;

  try {
    await publishCompanyAgentWebActionJob(jobId);
    const now = new Date().toISOString();
    const { error: dispatchError } = await (
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
      .in("status", ["queued", "retry"]);
    if (dispatchError) throw dispatchError;
    return true;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 1_000)
        : "Queue publish failed";
    const attempts = Number(job.queue_dispatch_attempt_count ?? 0) + 1;
    const terminal = attempts >= 5;
    const { error: markError } = await (
      admin.from("company_agent_web_action_jobs" as any) as any
    )
      .update({
        queue_dispatch_attempt_count: attempts,
        queue_dispatch_status: terminal ? "failed" : "retry",
        queue_last_error: message,
        queue_next_attempt_at: new Date(
          Date.now() + Math.min(300, 2 ** attempts * 15) * 1_000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .in("status", ["queued", "retry"]);
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
