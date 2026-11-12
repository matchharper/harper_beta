import { listCoverage } from "@/lib/career/listCoverage";
import { prepareCareerInboxContext } from "./inbox";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { ensureEmailConversation } from "@/lib/email/runtime/store";
import { runCareerChatTurn } from "../chatTurn";
import { enqueueCareerAgentReply } from "../agentReplyQueue";
import { dispatchCareerCheckpoint, resumeCareerAgentAfterWork } from "../agentContinuation";
import { CareerAgentReplyUnavailable } from "../agentTurnRuntime.server";
import { CareerReplyContinuation } from "../capabilities/runtime";
import { assertCareerSourceEventsCurrent, finishCareerSourceEvents, CareerSourceChangedError } from "../schedules/server";
import { renderCareerBackgroundInvocation } from "./prompt";
import type { CareerBackgroundRun } from "./types";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { runToolCall, unwrapToolCall } from "@/lib/llm/toolExecution";
import { prepareFollowedCompanies, readPreparedFollowContext, shouldPrepareFollowedCompanies } from "../companies/preparation";
import { withCareerBackgroundToolTrace } from "./toolTrace.server";
import { readCompanyIntroContext } from "./companyIntro";
import { getScheduledCareerModelOptions, isScheduledCareerRun } from "./scheduledModel";

export async function readCareerBackgroundRun(admin: TalentAdminClient, runId: string) {
  const { data, error } = await (admin.from as any)("opportunity_discovery_run").select("*").eq("id", runId).single();
  if (error) throw error;
  if (data.trigger_payload?.runContract !== "career_agent_v1") throw new Error("Not a Career agent invocation");
  return data as CareerBackgroundRun;
}

export async function acceptCareerBackgroundRun(args: { admin: TalentAdminClient; discoveryRunId: string; leaseToken: string }) {
  const run = await readCareerBackgroundRun(args.admin, args.discoveryRunId);
  const conversationId = await ensureEmailConversation(args.admin, run.talent_id, run.conversation_id);
  const { data: accepted, error } = await (args.admin.rpc as any)("accept_career_agent_run", {
    p_run_id: run.id, p_lease_token: args.leaseToken, p_conversation_id: conversationId,
  });
  if (error) throw error;
  if (accepted.status === "handed_off") {
    // The durable ledger already owns recovery if the queue response is lost.
    await enqueueCareerAgentReply({ userId: run.talent_id, conversationId, replyId: accepted.trigger_payload.agentInvocation.replyId,
      backgroundRunId: run.id, checkpointKey: `accepted:${run.id}` });
  }
  return { accepted: true, status: accepted.status, discoveryRunId: run.id };
}

export async function processCareerBackgroundRun(args: { admin: TalentAdminClient; userId: string; conversationId: string; runId: string }) {
  let deadlineAt = Date.now() + 430_000;
  let run = await readCareerBackgroundRun(args.admin, args.runId);
  if (run.talent_id !== args.userId || run.conversation_id !== args.conversationId) throw new Error("Background invocation owner mismatch");
  if (run.status === "completed") {
    await finishCareerSourceEvents({ admin: args.admin, run });
    return;
  }
  if (run.status !== "handed_off") return;
  try { await assertCareerSourceEventsCurrent({ admin: args.admin, run }); }
  catch (error) {
    if (error instanceof CareerSourceChangedError) {
      const result = await (args.admin.rpc as any)("cancel_career_background_run", { p_run_id: run.id, p_reason: error.message });
      if (result.error) throw result.error;
      return;
    }
    throw error;
  }
  const invocation = run.trigger_payload.agentInvocation;
  if (!invocation?.replyId) throw new Error("Background invocation has not been accepted");
  const prepare = async () => unwrapToolCall(await runToolCall(
    () => prepareFollowedCompanies({ admin: args.admin, run }),
    { name: "prepare_followed_companies", input: { runId: run.id } },
  ));
  const preparation = run.trigger_payload.createdBy === "career_dev_controls"
    ? await withCareerBackgroundToolTrace(args, prepare) : await prepare();
  if (!preparation.ready) return; // Existing recovery resumes this same invocation.
  const followedContext = shouldPrepareFollowedCompanies(run)
    ? await readPreparedFollowContext(args.admin, args.userId, preparation.state) : "";
  // User instructions or consent may have changed while preparation ran.
  try { await assertCareerSourceEventsCurrent({ admin: args.admin, run }); }
  catch (error) {
    if (!(error instanceof CareerSourceChangedError)) throw error;
    const result = await (args.admin.rpc as any)("cancel_career_background_run", { p_run_id: run.id, p_reason: error.message });
    if (result.error) throw result.error;
    return;
  }
  const { data: history, error: historyError } = await args.admin.from("career_email_messages")
    .select("id,subject,body_text,occurred_at").eq("talent_id", args.userId).eq("direction", "outbound").eq("status", "sent")
    .order("occurred_at", { ascending: false }).limit(6);
  if (historyError) throw historyError;
  const inboxContext = await prepareCareerInboxContext({
    admin: args.admin, userId: args.userId, run,
  });
  const { readAgentCorrespondence } = await import("@/lib/agentContacts/read");
  const correspondence: string[] = [];
  for (const event of run.trigger_payload.sourceEvents ?? []) {
    if (event.sourceKind !== "agent_contact") continue;
    const result = await readAgentCorrespondence({
      kind: "career", talentId: args.userId, conversationId: args.conversationId,
      backgroundRunId: run.id,
    }, { contextMessageId: event.sourceId });
    correspondence.push(result.modelOutput);
  }
  const historyText = (history ?? []).slice(0, 5).map(row => `Sent email ${row.id}, ${formatLlmDateTime(row.occurred_at)} Asia/Seoul\nSubject: ${row.subject}\n${row.body_text}`).join("\n\n");
  const companyIntroContext = await readCompanyIntroContext(args.admin, run);
  const {reserveAgentExecution,settleAgentExecution,AgentContactBudgetExhaustedError}=await import('@/lib/agentContacts/executionBudget');
  const budgetAnchor=String(run.trigger_payload.agentContactBudgetAnchor ?? '');
  const budgetKey=`career:${run.id}:${crypto.randomUUID()}`;
  if(budgetAnchor) {
    try {deadlineAt=Math.min(deadlineAt,Date.now()+1000*await reserveAgentExecution(budgetAnchor,budgetKey,430));}
    catch(error) {
      if(!(error instanceof AgentContactBudgetExhaustedError)) throw error;
      const result=await (args.admin.rpc as any)('cancel_career_background_run',{p_run_id:run.id,p_reason:error.message});
      if(result.error) throw result.error;
      return;
    }
  }
  try {
    const execute = () => runCareerChatTurn({
      admin: args.admin, userId: args.userId, conversationId: args.conversationId, userMessage: null,
      agentReplyId: invocation.replyId,
      ...(isScheduledCareerRun(run) ? getScheduledCareerModelOptions() : {}),
      backgroundInvocation: {
        runId: run.id,
        trigger: run.trigger,
        scheduledWork: isScheduledCareerRun(run),
        ...(run.trigger === "conversation_completed" ? { replyChannel: "chat" as const } : {}),
        meetingScheduleVersions: inboxContext.meetingScheduleVersions,
        sourceMessageCursor: Number(invocation.sourceMessageCursor ?? 0),
      },
      proactiveContext: [renderCareerBackgroundInvocation(run), companyIntroContext, ...correspondence, followedContext, inboxContext.text, `Sent email history (${listCoverage(Math.min(history?.length ?? 0, 5), (history?.length ?? 0) > 5)}):\n${historyText}`].join("\n\n"),
      suppressOnboarding: true, skipConversationWrites: true,
      usageLabel: "career:background-agent", deadlineAt,
      onAgentCheckpoint: checkpoint => dispatchCareerCheckpoint({ ...args, checkpoint }).then(() => undefined),
    });
    if (run.trigger_payload.createdBy === "career_dev_controls")
      await withCareerBackgroundToolTrace(args, execute);
    else await execute();
  } catch (error) {
    if (error instanceof CareerReplyContinuation) return;
    if (!(error instanceof CareerAgentReplyUnavailable && error.completed)) throw error;
  } finally {
    if(budgetAnchor) await settleAgentExecution(budgetAnchor,budgetKey);
  }
  run = await readCareerBackgroundRun(args.admin, args.runId);
  if (run.status === "completed") await finishCareerSourceEvents({ admin: args.admin, run });
}

export async function recoverCareerBackgroundRuns(admin: TalentAdminClient) {
  const { data, error } = await (admin.from as any)("opportunity_discovery_run").select("id,talent_id,conversation_id,status,trigger_payload")
    .eq("trigger_payload->>runContract", "career_agent_v1").in("status", ["handed_off", "completed"])
    .is("coverage->>sourceEventsFinishedAt", null).order("updated_at").limit(20);
  if (error) throw error;
  // The scan is already bounded to 20 durable runs. Each run has independent
  // ownership, so a slow receipt must not consume the HTTP budget of the rest.
  const results = await Promise.allSettled((data ?? []).map(async (run: any) => {
    // Advance the recovery scan even while a child is still running, so a
    // waiting first page cannot starve later candidates.
    const touched = await (admin.from as any)("opportunity_discovery_run").update({ updated_at: new Date().toISOString() }).eq("id", run.id).eq("status", run.status);
    if (touched.error) throw touched.error;
    if (run.status === "completed") { await finishCareerSourceEvents({ admin, run }); return; }
    const replyId = run.trigger_payload.agentInvocation?.replyId;
    if (!replyId || !run.conversation_id) return;
    const state = await (admin.from as any)("talent_agent_runtime").select("state").eq("user_id", run.talent_id).eq("conversation_id", run.conversation_id).maybeSingle();
    if (state.error) throw state.error;
    if (state.data?.state?.checkpoints?.[replyId]) {
      await resumeCareerAgentAfterWork({ admin, userId: run.talent_id, conversationId: run.conversation_id, replyId });
    } else if (state.data?.state?.completedReplyIds?.[replyId] === undefined) {
      await enqueueCareerAgentReply({ userId: run.talent_id, conversationId: run.conversation_id, replyId, backgroundRunId: run.id,
        checkpointKey: `recover:${Math.floor(Date.now() / 120000)}` });
    }
  }));
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return { inspected: data?.length ?? 0 };
}
