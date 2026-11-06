import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { enqueueCareerAgentReply, type CareerAgentReplyJob } from "./agentReplyQueue";
import type { CareerReplyCheckpoint } from "./capabilities/runtime";

export async function careerCheckpointIsReady(admin: TalentAdminClient, userId: string, checkpoint: CareerReplyCheckpoint) {
  // These legacy transcripts contain a retired private tool contract. Let the
  // claimed runtime retire them without waiting for or replaying that transcript.
  if (checkpoint.waitFor?.some(work => work.kind === "internal_evaluation")) return true;
  for (const work of checkpoint.waitFor ?? []) {
    if (work.kind === "external_capacity") {
      const { readOperation } = await import("./externalOperations/store");
      const operation = await readOperation({ admin, userId }, work.id);
      if (operation && Date.parse(String(operation.provider_refs.retry_after)) > Date.now()) return false;
      continue;
    }
    if (work.kind === "career_input") {
      const { data, error } = await (admin.from as any)("talent_external_operations").select("status").eq("id", work.id).eq("user_id", userId).eq("kind", "career_invocation").maybeSingle();
      if (error) throw error;
      if (data && data.status !== "completed") return false;
      continue;
    }
    if (work.kind === "browser_control") {
      const { readOperation } = await import("./externalOperations/store");
      const { browserHasHumanControl } = await import("./browser/tool");
      const session = await readOperation({ admin, userId }, work.id);
      if (session && browserHasHumanControl(session)) return false;
      continue;
    }
    if (work.kind === "browser_run") {
      const { readOperation } = await import("./externalOperations/store");
      const { refreshBrowserExecution, browserHasHumanControl } = await import("./browser/tool");
      const current = await readOperation({ admin, userId }, work.id);
      if (current) {
        const observed = await refreshBrowserExecution({ admin, userId }, current);
        const session = observed.parent_id ? await readOperation({ admin, userId }, observed.parent_id) : null;
        if (session && browserHasHumanControl(session)) return false;
        if (["reserved", "preparing", "dispatching", "running", "cancelling"].includes(observed.status)) return false;
      }
      continue;
    }
    const table = work.kind === "external_evaluation" ? "external_recommendation_runs"
      : work.kind === "email_delivery" ? "talent_opportunity_delivery" : "opportunity_discovery_run";
    const { data, error } = await (admin.from as any)(table).select("status")
      .eq("id", work.id).eq("talent_id", userId).maybeSingle();
    if (error) throw error;
    // A missing/deleted run is also a completed wait. The agent reads that fact
    // and decides what to do; silently waiting forever would lose the request.
    if (data && ["queued", "running", "pending", "retry", "handed_off", "sending"].includes(data.status)) return false;
  }
  return true;
}

export async function dispatchCareerCheckpoint(args: {
  admin: TalentAdminClient; userId: string; conversationId: string; checkpoint: CareerReplyCheckpoint;
  publish?: (job: CareerAgentReplyJob) => Promise<unknown>;
}) {
  if (!await careerCheckpointIsReady(args.admin, args.userId, args.checkpoint)) return { waiting: true };
  if (args.checkpoint.replyId.startsWith("invocation:")) {
    await (args.publish ?? enqueueCareerAgentReply)({ userId: args.userId, conversationId: args.conversationId,
      replyId: args.checkpoint.replyId, invocationId: args.checkpoint.replyId.slice("invocation:".length), checkpointKey: args.checkpoint.checkpointId });
    return { waiting: false };
  }
  const source = args.checkpoint.continuation;
  if (source?.emailReplyJobId) {
    const { data, error } = await args.admin.from("email_reply_jobs").update({ status: "queued", queue_dispatched_at: null })
      .eq("id", source.emailReplyJobId).eq("talent_id", args.userId).eq("conversation_id", args.conversationId)
      .eq("status", "waiting_career").select("id").maybeSingle();
    if (error) throw error;
    if (data) {
      const { publishEmailRuntimeJob } = await import("@/lib/email/runtime/queue");
      await publishEmailRuntimeJob({ version: 1, kind: "reply", jobId: data.id }, args.checkpoint.checkpointId);
    }
    return { waiting: false };
  }
  const job: CareerAgentReplyJob = {
    userId: args.userId, conversationId: args.conversationId, replyId: args.checkpoint.replyId,
    checkpointKey: args.checkpoint.checkpointId,
    ...(source?.assistantModel ? { assistantModel: source.assistantModel } : {}),
    ...(source?.textChatModel ? { textChatModel: source.textChatModel } : {}),
    ...(source?.sourceMessageId ? { sourceMessageId: source.sourceMessageId } : {}),
    ...(source?.sourceMessageCursor !== undefined ? { sourceMessageCursor: source.sourceMessageCursor } : {}),
    ...(source?.backgroundRunId ? { backgroundRunId: source.backgroundRunId } : {}),
    ...(source?.runtimeInstruction ? { proactiveContext: source.runtimeInstruction } : {}),
    ...(source?.noMessageMarker ? { noMessageMarker: source.noMessageMarker } : {}),
  };
  await (args.publish ?? enqueueCareerAgentReply)(job);
  return { waiting: false };
}

/** Called after durable child completion; checkpoint-first and child-first are both safe. */
export async function resumeCareerAgentAfterWork(args: {
  admin: TalentAdminClient; userId: string; conversationId: string; replyId: string;
}) {
  const { publishCareerInvocations } = await import("./work/invocations");
  const { reconcileCareerDependencies } = await import("./work/events");
  await reconcileCareerDependencies(args);
  await publishCareerInvocations(args);
  const { data, error } = await (args.admin.from as any)("talent_agent_runtime").select("state")
    .eq("conversation_id", args.conversationId).eq("user_id", args.userId).maybeSingle();
  if (error) throw error;
  const checkpoint = data?.state?.checkpoints?.[args.replyId] as CareerReplyCheckpoint | undefined;
  if (!checkpoint || data.state.completedReplyIds?.[args.replyId] !== undefined) return;
  await dispatchCareerCheckpoint({ ...args, checkpoint });
}
