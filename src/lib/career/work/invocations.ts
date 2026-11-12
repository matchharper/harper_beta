import { readCareerInboxContext } from "../chatInputCache.server";
import type { RunCareerChatTurnArgs } from "../chatTurn";
import { ownsCareerExecution } from "../executionEnvironment";
import { createDelegatedTurnAdapter } from "./output";
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
import type { ExternalOperation } from "../externalOperations/store";

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

export type CareerInvocationDelivery = Pick<RunCareerChatTurnArgs, "onLiveMessage" | "onArtifactMessage" | "initialSetting" | "initialConversation" | "scheduleAfter" | "deadlineAt"> & {
  initialSourceMessage?: TalentMessageRow;
  /** An owner-scoped server read, never supplied by the browser. */
  initialInvocation?: ExternalOperation;
};

export async function processCareerInvocation(scope: WorkScope, invocationId: string, delivery: CareerInvocationDelivery = {}) {
  const deadlineAt = Math.min(delivery.deadlineAt ?? Infinity, Date.now() + 430_000);
  let currentId: string | false | void = invocationId;
  do {
    currentId = await processInvocation(scope, currentId, deadlineAt, delivery);
    delivery = { ...delivery, initialSetting: undefined, initialConversation: undefined, initialSourceMessage: undefined, initialInvocation: undefined };
  } while (typeof currentId === "string" && Date.now() < deadlineAt);
  if (typeof currentId === "string") {
    // The next inbox already exists durably, including the completion/admission race.
    await publishCareerInvocations(scope);
    return false;
  }
  return currentId;
}

async function processInvocation(scope: WorkScope, invocationId: string, deadlineAt: number, delivery: CareerInvocationDelivery): Promise<string | false | void> {
  const db = scope.admin.from.bind(scope.admin) as any;
  const initial = delivery.initialInvocation;
  const found = initial?.id === invocationId && initial.user_id === scope.userId && initial.conversation_id === scope.conversationId && initial.kind === "career_invocation"
    ? { data: initial, error: null }
    : await db("talent_external_operations").select("*").eq("id", invocationId)
    .eq("user_id", scope.userId).eq("conversation_id", scope.conversationId).eq("kind", "career_invocation").maybeSingle();
  if (found.error) throw found.error;
  const invocation = found.data;
  if (!invocation || invocation.status === "completed" || !ownsCareerExecution(invocation.request.execution_environment)) return;
  const workId = invocation.parent_id as string | undefined;
  const inboxId = !workId && Array.isArray(invocation.request.input_message_ids) ? invocationId : undefined;
  const replyId = `invocation:${invocation.id}`;
  const browserReturns = invocation.request.browser_control_returns ?? [];
  const complete = async (cancelled = false, observed = browserReturns) => {
    const { data, error } = await (scope.admin.rpc as any)("finish_career_invocation", {
      p_user_id: scope.userId, p_conversation_id: scope.conversationId, p_invocation_id: invocationId,
      p_cancelled: cancelled, p_observed_browser_returns: observed,
    });
    if (error) throw error;
    // The loop starts a successor immediately. Publishing it here would race
    // that executor and could unnecessarily move its output off the live stream.
    return (data ?? undefined) as string | undefined;
  };
  if (Array.isArray(invocation.request.cancel_reply_ids)) {
    for (const id of invocation.request.cancel_reply_ids) {
      await cancelCareerTurnWork({ ...scope, replyId: id });
    }
    return await complete();
  }
  if (typeof invocation.request.cleanup_browser_session === "string") {
    const { executeUseBrowser } = await import("../browser/tool");
    const result = await executeUseBrowser({ action: "close", session_id: invocation.request.cleanup_browser_session },
      { ...scope, requestId: `cleanup:${invocationId}`, deadlineAt: Date.now() });
    if (result.session?.status !== "closed") throw new Error("Browser cleanup is not yet confirmed");
    return await complete();
  }
  const work = workId ? await readWork(scope, workId) : undefined;
  if (work && ["completed", "cancelled"].includes(work.status)) {
    const { releaseWorkBrowsers } = await import("./resources");
    await releaseWorkBrowsers(scope, work.id, work.status === "cancelled");
    return await complete();
  }
  if (work && invocation.request.cleanup === true) {
    const { releaseWorkBrowsers } = await import("./resources");
    await releaseWorkBrowsers(scope, work.id);
    return await complete();
  }
  const sourceId = Number(invocation.request.source_message_id);
  const initialSource = delivery.initialSourceMessage;
  const sourceResult = initialSource?.id === sourceId && initialSource.user_id === scope.userId && initialSource.conversation_id === scope.conversationId && initialSource.role === "user"
    ? { data: initialSource, error: null }
    : await scope.admin.from("talent_messages").select("*").eq("id", sourceId)
    .eq("user_id", scope.userId).eq("conversation_id", scope.conversationId).eq("role", "user").maybeSingle();
  if (sourceResult.error) throw sourceResult.error;
  if (!sourceResult.data) {
    if (inboxId) throw new Error("Conversation input source unavailable");
    return await complete();
  }
  const source = sourceResult.data as TalentMessageRow;
  let claimedInbox: RunCareerChatTurnArgs["claimedInbox"];
  let completionCommitted = false;
  let nextInvocationId: string | undefined;
  if (inboxId) {
    const claimId = crypto.randomUUID();
    const { data, error } = await (scope.admin.rpc as any)("claim_career_inbox", {
      p_user_id: scope.userId, p_conversation_id: scope.conversationId,
      p_invocation_id: inboxId, p_claim_id: claimId,
    });
    if (error) throw error;
    if (!data?.accepted) return data?.completed ? await complete(false, null) : false;
    claimedInbox = { claimId, state: data.state };
  }
  try {
    const saved = claimedInbox ? { data: { state: claimedInbox.state }, error: null } : await db(workId ? "talent_agent_work_runtime" : "talent_agent_runtime").select("state")
      .eq(workId ? "work_id" : "conversation_id", workId ?? scope.conversationId).eq("user_id", scope.userId).maybeSingle();
    if (saved.error) throw saved.error;
    if (saved.data?.state?.completedReplyIds?.[replyId] !== undefined) return await complete(false, null);
    const checkpoint = (claimedInbox?.state.checkpoint ?? saved.data?.state?.checkpoints?.[replyId]) as CareerReplyCheckpoint | undefined;
    const resumeDependenciesPending = Boolean(checkpoint && !await careerCheckpointIsReady(scope.admin, scope.userId, checkpoint));
    if (resumeDependenciesPending) {
      if (checkpoint?.waitFor?.some(work => ["browser_run", "browser_control", "external_capacity"].includes(work.kind))) return false;
      const input = inboxId ? await readCareerInbox(scope, inboxId) : undefined;
      if (!input || (!input.messages.length && !input.events?.length)) return false;
    }
    const { readBrowserControlReturns } = await import("../browser/control");
    const browserReturnContext = await readBrowserControlReturns(scope, browserReturns);
    const { executeCareerChatTurn } = await import("../chatTurn");
    const prepared = inboxId ? await readCareerInboxContext(scope, inboxId) : undefined;
    const inputSnapshot = prepared?.inbox;
    const activity = createCareerInvocationActivity(scope, invocationId, browserReturns);
    let executionClaim = claimedInbox?.claimId;
    if (executionClaim) void activity.start(executionClaim);
    try {
      await executeCareerChatTurn({ ...scope, ...delivery, existingSourceMessage: source, userMessage: null, agentReplyId: replyId,
        workId, workRevision: work?.revision,
        ...(workId ? { adapter: createDelegatedTurnAdapter(scope, invocationId, source, () => activity.flush(), () => executionClaim) } : {}),
        inboxId, claimedInbox, resumeDependenciesPending, initialInboxSnapshot: inputSnapshot, hasCheckpoint: Boolean(checkpoint),
        ...(prepared ? { initialChatInputs: prepared.context, initialSetting: prepared.context.setting,
          initialConversation: prepared.context.conversation } : {}),
        invocationBrowserReturns: browserReturns,
        onInvocationCompleted: next => { completionCommitted = true; nextInvocationId = next ?? undefined; },
        previousTurn: saved.data?.state?.previous ? { offeredCapabilities: saved.data.state.previous.offered, toolResults: saved.data.state.previous.toolResults, handbooks: saved.data.state.previous.handbooks } : undefined,
        previousHandbooks: saved.data?.state?.handbooks,
        pendingInputMessageId: inputSnapshot?.historyBeforeMessageId,
        applicationEvent: browserReturnContext || undefined,
        ...(workId ? { assistantMessagePayload: { careerWorkId: workId } } : {}),
        deadlineAt,
        // The invocation itself is the outbox; checkpoint-first crash is recoverable.
        onAgentCheckpoint: checkpoint => activity.checkpoint(checkpoint),
        onAgentTurnStarted: async claimId => {
          if (executionClaim === claimId) return;
          executionClaim = claimId;
          return activity.start(claimId);
        },
        onThinkingLog: (_status, logs) => activity.record(logs),
      });
      await activity.flush();
      return completionCommitted ? nextInvocationId : await complete();
    } catch (error) {
      await activity.flush();
      if (error instanceof CareerReplyContinuation) {
        if (!inboxId) return false;
        if (error.checkpoint.waitFor?.length) return false;
        const input = await readCareerInbox(scope, inboxId);
        return input.messages.length || input.events?.length ? inboxId : false;
      }
      if (error instanceof CareerTurnCancelled) return await complete(true);
      if (error instanceof CareerAgentReplyUnavailable) return error.completed ? await complete(false, null) : false;
      if (!(error instanceof CareerAgentReplyUnavailable)) {
        await (scope.admin.rpc as any)("record_career_invocation_progress", {
          p_user_id: scope.userId, p_conversation_id: scope.conversationId, p_invocation_id: invocationId,
          p_claim_id: executionClaim, p_patch: { last_error: error instanceof Error ? error.message : "Execution interrupted", failed_at: new Date().toISOString() },
        });
      }
      throw error;
    }
  } finally {
    if (claimedInbox && !completionCommitted) {
      await (scope.admin.rpc as any)("release_career_agent_turn", {
        p_user_id: scope.userId, p_conversation_id: scope.conversationId,
        p_reply_id: replyId, p_claim_id: claimedInbox.claimId,
      });
    }
  }

}
