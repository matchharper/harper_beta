import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { enqueueCareerAgentReply, type CareerAgentReplyJob } from "../agentReplyQueue";
import { CareerAgentReplyUnavailable } from "../agentReplyError";
import { CareerReplyContinuation, type CareerReplyCheckpoint } from "../capabilities/runtime";
import { careerCheckpointIsReady } from "../agentContinuation";
import { cancelCareerTurnWork, CareerTurnCancelled } from "../turnCancellation.server";
import { readWork, type WorkScope } from "./store";
import type { TalentMessageRow } from "@/lib/talentOnboarding/models";
import { createCareerInvocationActivity } from "./activity";
import { readCareerInbox } from "./inbox";

export async function publishCareerInvocations(args: { admin: TalentAdminClient; userId?: string; conversationId?: string }, publish: (job:CareerAgentReplyJob)=>Promise<unknown> = enqueueCareerAgentReply) {
  const { data, error } = await (args.admin.rpc as any)("claim_career_invocations", {
    p_limit: 20, p_user: args.userId ?? null, p_conversation: args.conversationId ?? null,
  });
  if (error) throw error;
  const results = await Promise.allSettled((data ?? []).map((row: any) => publish({
    userId: row.user_id, conversationId: row.conversation_id, replyId: `invocation:${row.id}`, invocationId: row.id,
  })));
  return { dispatched: results.filter(r => r.status === "fulfilled").length, deferred: results.filter(r => r.status === "rejected").length };
}

export async function processCareerInvocation(scope: WorkScope, invocationId: string) {
  const deadlineAt = Date.now() + 430_000;
  let currentId: string | false | void = invocationId;
  do {
    currentId = await processInvocation(scope, currentId, deadlineAt);
  } while (typeof currentId === "string" && Date.now() < deadlineAt);
  if (typeof currentId === "string") {
    // The next inbox already exists durably, including the completion/admission race.
    await publishCareerInvocations(scope);
    return false;
  }
  return currentId;
}

async function processInvocation(scope: WorkScope, invocationId: string, deadlineAt: number): Promise<string | false | void> {
  const db = scope.admin.from.bind(scope.admin) as any;
  const found = await db("talent_external_operations").select("*").eq("id", invocationId)
    .eq("user_id", scope.userId).eq("conversation_id", scope.conversationId).eq("kind", "career_invocation").maybeSingle();
  if (found.error) throw found.error;
  const invocation = found.data;
  if (!invocation || invocation.status === "completed") return;
  const workId = invocation.parent_id as string | undefined;
  const inboxId = !workId && Array.isArray(invocation.request.input_message_ids) ? invocationId : undefined;
  const replyId = `invocation:${invocation.id}`;
  const complete = async (cancelled = false) => {
    if (inboxId) {
      const { data, error } = await (scope.admin.rpc as any)("finish_career_inbox", {
        p_user_id: scope.userId, p_conversation_id: scope.conversationId, p_invocation_id: inboxId, p_cancelled: cancelled,
      });
      if (error) throw error;
      // The current queue delivery belongs to this inbox. Its successor needs
      // its own wakeup if the immediate continuation yields or this worker dies.
      if (data) await publishCareerInvocations(scope);
      return (data ?? undefined) as string | undefined;
    }
    const { error } = await db("talent_external_operations").update({ status: "completed", result: {}, updated_at: new Date().toISOString() })
      .eq("id", invocationId).eq("user_id", scope.userId);
    if (error) throw error;
  };
  if (Array.isArray(invocation.request.cancel_reply_ids)) {
    for (const id of invocation.request.cancel_reply_ids) {
      await cancelCareerTurnWork({ ...scope, replyId: id });
    }
    await complete(); return;
  }
  if (typeof invocation.request.cleanup_browser_session === "string") {
    const { executeUseBrowser } = await import("../browser/tool");
    const result = await executeUseBrowser({ action: "close", session_id: invocation.request.cleanup_browser_session },
      { ...scope, requestId: `cleanup:${invocationId}`, deadlineAt: Date.now() });
    if (result.session?.status !== "closed") throw new Error("Browser cleanup is not yet confirmed");
    await complete(); return;
  }
  const work = workId ? await readWork(scope, workId) : undefined;
  if (work && ["completed", "cancelled"].includes(work.status)) {
    const { releaseWorkBrowsers } = await import("./resources");
    await releaseWorkBrowsers(scope, work.id, work.status === "cancelled");
    await complete(); return;
  }
  if (work && invocation.request.cleanup === true) {
    const { releaseWorkBrowsers } = await import("./resources");
    await releaseWorkBrowsers(scope, work.id);
    await complete(); return;
  }
  const sourceId = Number(invocation.request.source_message_id);
  const sourceResult = await scope.admin.from("talent_messages").select("*").eq("id", sourceId)
    .eq("user_id", scope.userId).eq("conversation_id", scope.conversationId).eq("role", "user").maybeSingle();
  if (sourceResult.error) throw sourceResult.error;
  if (!sourceResult.data) {
    if (inboxId) throw new Error("Conversation input source unavailable");
    await complete(); return;
  }
  const source = sourceResult.data as TalentMessageRow;
  const saved = await db(workId ? "talent_agent_work_runtime" : "talent_agent_runtime").select("state")
    .eq(workId ? "work_id" : "conversation_id", workId ?? scope.conversationId).eq("user_id", scope.userId).maybeSingle();
  if (saved.error) throw saved.error;
  if (saved.data?.state?.completedReplyIds?.[replyId] !== undefined) return await complete();
  const checkpoint = saved.data?.state?.checkpoints?.[replyId] as CareerReplyCheckpoint | undefined;
  const resumeDependenciesPending = Boolean(checkpoint && !await careerCheckpointIsReady(scope.admin, scope.userId, checkpoint));
  if (resumeDependenciesPending && (!inboxId || !(await readCareerInbox(scope, inboxId)).messages.length)) return false;
  const { runCareerChatTurn } = await import("../chatTurn");
  const activity = createCareerInvocationActivity(scope, invocationId);
  try {
    await runCareerChatTurn({ ...scope, existingSourceMessage: source, userMessage: null, agentReplyId: replyId,
      workId, workRevision: work?.revision,
      inboxId, resumeDependenciesPending,
      ...(workId ? { assistantMessagePayload: { careerWorkId: workId } } : {}),
      deadlineAt,
      // The invocation itself is the outbox; checkpoint-first crash is recoverable.
      onAgentCheckpoint: checkpoint => activity.checkpoint(checkpoint),
      onAgentTurnStarted: claimId => activity.start(claimId),
      onThinkingLog: (_status, logs) => activity.record(logs),
    });
    await activity.flush();
    return await complete();
  } catch (error) {
    await activity.flush();
    if (error instanceof CareerReplyContinuation) {
      return inboxId && (await readCareerInbox(scope, inboxId)).messages.length ? inboxId : false;
    }
    if (error instanceof CareerTurnCancelled) return await complete(true);
    if (error instanceof CareerAgentReplyUnavailable) return error.completed ? await complete() : false;
    if (!(error instanceof CareerAgentReplyUnavailable)) {
      await db("talent_external_operations").update({ result: { last_error: error instanceof Error ? error.message : "Execution interrupted", failed_at: new Date().toISOString() } })
        .eq("id", invocationId).eq("user_id", scope.userId);
    }
    throw error;
  }
}
