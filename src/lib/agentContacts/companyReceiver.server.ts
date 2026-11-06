import "server-only";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { buildOrgAgentPromptContext } from "@/lib/org/agent/context";
import { runOrgAgentToolLoop } from "@/lib/org/agent/chat";
import { resolveOrgAgentModel } from "@/lib/org/agent/modelConfig";
import { withCompanyAgentScope, companyAgentCorrespondenceTools } from "./companyScope";
import {
  agentContactDatabase,
  assertAgentContactSource,
  assertAgentContactPair,
  AgentContactSupersededError,
} from "./store";
import { readAgentCorrespondence } from "./read";
import { scheduleRunDestination, scheduleRunMessages, scheduleRunText, scheduleRunTools } from "./scheduleRun";
import { companyAgentEventPrompt, type AgentContactSource } from "./contracts";

/**
 * Harper's own schedules (not tied to an introduction) get only the tools of
 * their effect tier (D15), and contact_user only when ORG_AGENT_SCHEDULE_MESSAGES
 * allows it (scheduleRun.ts).
 */
const scheduleTierTools = (tier: number) => scheduleRunTools(tier, scheduleRunMessages());

/** Executes the original company-side LLM with a lease-bound, single-Role service principal. */
export async function runCompanyAgentEvent(job: any) {
  const { reserveAgentExecution, settleAgentExecution, remainingRunSeconds } =
    await import("./executionBudget");
  const anchor = job.action_context.agentContactBudgetAnchor;
  const key = `company:${job.id}:${job.attempt_count}:${job.locked_by}`;
  const seconds = anchor
    ? await reserveAgentExecution(anchor, key, 25 * 60)
    : remainingRunSeconds(job.usage);
  try {
    return await executeCompanyAgentEvent(job, seconds);
  } finally {
    if (anchor) await settleAgentExecution(anchor, key);
  }
}
async function executeCompanyAgentEvent(job: any, seconds: number) {
  const db = agentContactDatabase();
  const model = resolveOrgAgentModel(undefined).model;
  const source: Extract<AgentContactSource, { kind: "company_event" }> = {
    kind: "company_event",
    workspaceId: job.company_workspace_id,
    roleId: job.role_id,
    jobId: job.id,
    leaseOwner: job.locked_by,
  };
  const assertCurrent = async () => {
    await assertAgentContactSource(db.query, source, source.roleId);
    if (job.action_name === "agent_contact_received") {
      const [message] = await db.query(
        `SELECT m.*,root.cancelled_at FROM public.agent_contact_messages m
        JOIN public.agent_contact_messages root ON root.id=m.root_id JOIN public.talent_opportunity_recommendation r ON r.id=m.recommendation_id
        WHERE m.id=$1::uuid AND m.receiver_job_id=$2::uuid AND r.agent_introduction_root_id=m.root_id`,
        [job.action_context.messageId, job.id]
      );
      if (!message || message.cancelled_at)
        throw new AgentContactSupersededError(
          "Agent correspondence is withdrawn or superseded"
        );
      await assertAgentContactPair(db.query, message as any);
    } else {
      const [schedule] = await db.query(
        "SELECT * FROM public.company_agent_schedules WHERE id=$1::uuid AND company_workspace_id=$2::uuid AND role_id=$3::uuid AND (status='active' OR source->>'jobId'=$5) AND directive_revision=$4",
        [
          job.action_context.scheduleId,
          source.workspaceId,
          source.roleId,
          job.action_context.scheduleRevision,
          source.jobId,
        ]
      );
      if (!schedule)
        throw new AgentContactSupersededError("Company schedule changed");
      if (schedule.target_refs?.introductionRootId) {
        const [root] = await db.query(
          "SELECT * FROM public.agent_contact_messages WHERE id=$1::uuid AND cancelled_at IS NULL",
          [schedule.target_refs.introductionRootId]
        );
        if (!root)
          throw new AgentContactSupersededError(
            "Scheduled introduction withdrawn"
          );
        await assertAgentContactPair(db.query, root as any);
      }
    }
  };
  await assertCurrent();
  const admin = withCompanyAgentScope(getSupabaseAdmin(), {
    ...source,
    assertCurrent,
  });
  const { getOrgWorkspaceLocale } =
    await import("@/lib/org/workspaceLocale.server");
  const responseLocale = await getOrgWorkspaceLocale(source.workspaceId, admin);
  // This value carries no membership. All access comes from the server-created scope.
  const user = {
    id: job.id,
    app_metadata: {},
    user_metadata: {},
    aud: "service",
    created_at: job.created_at,
  } as User;
  const { data: conversation, error } = await (admin.from as any)(
    "company_conversations"
  )
    .select("*")
    .eq("id", job.conversation_id)
    .eq("company_workspace_id", source.workspaceId)
    .eq("role_id", source.roleId)
    .single();
  if (error) throw error;
  const context = await buildOrgAgentPromptContext({
    admin,
    user,
    conversation,
    beforeMessageId: job.anchor_message_id,
    currentUserMessageId: job.anchor_message_id,
    includeSharedConversation: true,
    readAudience: "company_safe",
    scopeKey: `agent-event:${job.id}`,
  });
  let eventText: string;
  let scheduleTier: number | null = null;
  if (job.action_name === "agent_contact_received") {
    const correspondence = await readAgentCorrespondence(source, {
      contextMessageId: job.action_context.messageId,
    });
    eventText = `Incoming message reference: ${job.action_context.messageId}\n${correspondence.modelOutput}`;
  } else {
    const [schedule] = await db.query(
      "SELECT * FROM public.company_agent_schedules WHERE id=$1::uuid",
      [job.action_context.scheduleId]
    );
    const tier = schedule.target_refs?.introductionRootId ? null : Number(schedule.effect_tier ?? 0);
    scheduleTier = tier;
    const tierLine =
      tier === null
        ? ""
        : `\n${scheduleRunText(schedule, await scheduleRunDestination(db.query, source.workspaceId, schedule, scheduleRunMessages()))}`;
    eventText = `Scheduled company work ${schedule.id}; revision ${schedule.revision}\n${schedule.title}\n${schedule.instruction}${schedule.target_refs?.introductionRootId ? `\nIntroduction ${schedule.target_refs.introductionRootId}` : tierLine}`;
  }
  // An earlier execution may have committed its body before a delivery timeout.
  const pending = await db.query(
    "SELECT metadata FROM public.company_messages WHERE company_workspace_id=$1::uuid AND metadata->>'webActionJobId'=$2 AND metadata ? 'companyMessageBatch' AND NOT metadata ? 'companyMessageReceipt'",
    [source.workspaceId, job.id]
  );
  const { deliverCompanyMessageBatch } =
    await import("@/lib/org/agent/companyMessageDelivery.server");
  for (const row of pending)
    await deliverCompanyMessageBatch({
      batchId: row.metadata.companyMessageBatch.batchId,
      workspaceId: source.workspaceId,
      assertCanStart: assertCurrent,
    });
  const result = await runOrgAgentToolLoop({
    admin,
    user,
    conversation,
    context,
    actorId: job.id,
    actorLabel: "Harper company agent",
    currentUserMessageId: Number(job.anchor_message_id),
    model: model,
    responseLocale,
    allowSilentCompletion: true,
    throwOnToolExecutionError: true,
    harperInitiated: true,
    capabilityMode: scheduleTier === null ? "progressive" : "full",
    initialCapabilities:
      scheduleTier === null
        ? ["agent_correspondence"]
        : ["company_messaging", "harper_schedule", ...(scheduleTier >= 2 ? (["candidate_search", "candidate_contact"] as const) : [])],
    allowedToolNames: scheduleTier === null ? companyAgentCorrespondenceTools() : scheduleTierTools(scheduleTier),
    source: "chat",
    readAudience: "company_safe",
    scopeKey: `agent-event:${job.id}`,
    slackThreadId: null,
    mentions: [],
    assertCanContinue: assertCurrent,
    signal: AbortSignal.timeout(Math.max(1, Math.floor(seconds * 1000))),
    userMessage: companyAgentEventPrompt(eventText),
  });
  await assertCurrent();
  const saved = await db.query(
    "SELECT id FROM public.company_messages WHERE company_workspace_id=$1::uuid AND role='assistant' AND metadata->>'webActionJobId'=$2 ORDER BY id",
    [source.workspaceId, job.id]
  );
  await db.query(
    "UPDATE public.company_agent_web_action_jobs SET action_context=action_context||$3::jsonb WHERE id=$1::uuid AND locked_by=$2 AND status='processing'",
    [
      job.id,
      job.locked_by,
      JSON.stringify({
        agentExecution: { completed: true, model: model, usage: result.usage },
      }),
    ]
  );
  return {
    outcome: saved.length
      ? ("completed_message" as const)
      : ("completed_silent" as const),
    progressMessageId: null,
    terminalMessageId: saved.at(-1)?.id ?? null,
  };
}
