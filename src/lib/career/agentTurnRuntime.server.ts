import { CareerAgentReplyUnavailable } from "./agentReplyError";
export { CareerAgentReplyUnavailable } from "./agentReplyError";
import { createCareerCapabilityTurn } from "./capabilities/server";
import type { CareerAgentRuntimeState, CareerReplyCheckpoint } from "./capabilities/runtime";
import { formatTalentMessageContentForLlmPrompt } from "./opportunityFeedbackNote";
import { formatLlmDateTime, PROMPT_TIME_ZONE } from "@/lib/llm/promptDateTime";
import { normalizeCareerHandbookLeases } from "./handbooks/registry";
import { readCareerMatchingIndex } from "./matching/store";
import { readUpcomingTalentScheduleContext } from "./meetings/server";
import { readCareerScheduleFollowIndex } from "./schedules/server";
import { careerTurnIsStopped, cancelCareerTurnWork, watchCareerTurnCancellation } from "./turnCancellation.server";
import { CAREER_TURN_STOP_FACT, isCareerTurnStopped } from "./turnCancellation";

export type PrepareCareerAgentTurnArgs = Omit<
  Parameters<typeof createCareerCapabilityTurn>[0],
  "agentState" | "persistCompletion" | "resume" | "checkpoint"
> & {
  agentReplyId?: string;
  backgroundRunId?: string;
  sourceMessageCursor?: number;
  /** Called after the exact provider transcript has been durably saved. */
  onCheckpoint?: (checkpoint: CareerReplyCheckpoint) => Promise<void>;
};

export async function readCareerContinuationUserContext(args: Pick<PrepareCareerAgentTurnArgs, "admin" | "userId" | "conversationId" | "sourceMessage" | "sourceMessageCursor" | "promptArgs">) {
  const cursor = args.sourceMessage?.id ?? args.sourceMessageCursor;
  if (cursor === undefined) return "";
  const { data, error } = await args.admin.from("talent_messages")
    .select("id,content,created_at,message_type,payload")
    .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
    .eq("role", "user").gt("id", cursor)
    .or("payload->>hidden.is.null,payload->>hidden.neq.true")
    .order("id", { ascending: false }).limit(17);
  if (error) throw error;
  const rows = (data ?? []).slice(0, 16).reverse();
  if (!rows.length) return "";
  return [
    `User messages after invocation cursor ${cursor}, received while this work was unfinished. Times use ${PROMPT_TIME_ZONE}. Read changes or cancellations relevant to the original work together with its saved execution results; separate requests retain their own message identities.`,
    ...rows.map(row => {
      // Ordinary user prose is immutable evidence. Artifact clicks use the
      // shared projection, which preserves the exact selected action and values.
      const content = row.message_type === "chat" || row.message_type === "mail"
        ? [row.content ?? "", ...(isCareerTurnStopped(row.payload) ? [CAREER_TURN_STOP_FACT] : [])].join("\n")
        : formatTalentMessageContentForLlmPrompt(row, {
            includeCreatedAt: false, timeZone: args.promptArgs.timeZone,
            preferredLocale: args.promptArgs.currentPreferences?.preferredLocale,
          });
      return `User message ${row.id} (${formatLlmDateTime(row.created_at)}):\n${content}`;
    }),
    ...((data?.length ?? 0) > rows.length ? [`Additional user messages after the original source precede this window (before message ${rows[0].id}).`] : []),
  ].join("\n\n");
}

/** A compact index; full form contents and browser evidence remain read-tool data. */
export async function readCareerAgentResourceContext(args: Pick<PrepareCareerAgentTurnArgs, "admin" | "userId" | "conversationId">) {
  const [operations, forms, matching, schedules, profiles, appointments] = await Promise.allSettled([
    (args.admin.from as any)("talent_external_operations")
      .select("id,kind,status,parent_id,request,result,current_execution_id:provider_refs->>current_execution_id")
      .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
      .eq("kind", "browser_session").neq("status", "closed")
      .order("updated_at", { ascending: false }).limit(21),
    args.admin.from("talent_messages")
      .select("id,formId:payload->>formId,revision:payload->>revision,title:payload->>title,hidden:payload->>hidden")
      .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
      .eq("message_type", "career_form").order("id", { ascending: false }).limit(21),
    readCareerMatchingIndex(args),
    readCareerScheduleFollowIndex(args),
    (args.admin.from as any)("talent_profiles").select("id,title,current_revision,is_default")
      .eq("talent_id", args.userId).eq("is_archived", false).order("is_default", { ascending: false }).limit(6),
    readUpcomingTalentScheduleContext(args),
  ]);
  const lines: string[] = [];
  lines.push(appointments.status === "fulfilled"
    ? appointments.value
    : "Upcoming appointments could not be read; their absence is unknown.");
  for (const index of [matching, schedules]) if (index.status === "fulfilled" && index.value) lines.push(String(index.value));
  if (profiles.status === "fulfilled" && !profiles.value.error && profiles.value.data?.length) {
    lines.push("Profile index (read_profile retrieves exact content/history):", ...profiles.value.data.slice(0, 5).map((row: any) =>
      `- profile ${row.id}, revision ${row.current_revision}; ${row.title}; ${row.is_default ? "default" : "private version"}`));
    if (profiles.value.data.length > 5) lines.push("More versions exist; list_profiles retrieves the next page.");
  }
  if (operations.status === "fulfilled" && !operations.value.error) {
    const rows = operations.value.data ?? [];
    if (rows.length) {
      const sessions = rows.slice(0, 20);
      const executionIds = [...new Set(sessions.map((row: any) => row.current_execution_id).filter((id: unknown) => typeof id === "string"))];
      const executions = executionIds.length
        ? await (args.admin.from as any)("talent_external_operations")
            .select("id,parent_id,status,revision,request,result,updated_at")
            .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
            .eq("kind", "browser_run").in("id", executionIds)
        : { data: [], error: null };
      const latest = new Map<string, any>((executions.error ? [] : executions.data ?? []).map((row: any) => [row.id, row]));
      lines.push(`Browser session index (times ${PROMPT_TIME_ZONE}; each entry belongs to its listed page and role. use_browser reads that session's current observation):`);
      for (const row of sessions) {
        lines.push(`- session_id ${row.id}; status ${row.status}${row.result?.browser_availability ? `; live browser ${row.result.browser_availability}` : ""}`);
        const execution = latest.get(row.current_execution_id);
        if (!execution || execution.parent_id !== row.id) {
          if (row.current_execution_id) lines.push(`  Latest execution_id: ${row.current_execution_id}; observation unavailable in this index.`);
          continue;
        }
        lines.push(`  execution_id ${execution.id}; status ${execution.status}; revision ${execution.revision}; observed ${formatLlmDateTime(execution.updated_at)}`);
        if (execution.request?.url) lines.push(`  Requested page: ${execution.request.url}`);
        if (execution.result?.url) lines.push(`  Observed page: ${execution.result.url}`);
        if (Array.isArray(execution.request?.role_refs) && execution.request.role_refs.length)
          lines.push(`  Role references: ${execution.request.role_refs.join(", ")}`);
        if (typeof execution.result?.needsUser === "boolean") lines.push(`  Browser reports further input/action needed: ${execution.result.needsUser ? "yes" : "no"}`);
      }
      if (rows.length > 20) lines.push("More open sessions exist; use_browser list can retrieve them.");
    }
  }
  if (forms.status === "fulfilled" && !forms.value.error) {
    const rows = forms.value.data ?? [];
    const seen = new Set<string>();
    const entries: string[] = [];
    for (const row of rows.slice(0, 20)) {
      const id = String(row.formId ?? row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      if (row.hidden === "true") continue;
      entries.push(`- formId ${id}, revision ${row.revision}${row.title ? `: ${row.title}` : ""}`);
    }
    if (entries.length) lines.push("Recently saved forms (use suggest_form read for exact contents and responses):", ...entries);
    if (rows.length > 20) lines.push("Earlier form revisions are outside this index; use suggest_form list/read when needed.");
  }
  return lines.join("\n");
}

/** One claim covers a logical delivered reply, including any request continuations. */
export async function prepareCareerAgentTurn(args: PrepareCareerAgentTurnArgs) {
  const replyId = args.agentReplyId ?? args.replyId ??
    (args.sourceMessage ? `message:${args.sourceMessage.id}` : crypto.randomUUID());
  const claimId = crypto.randomUUID();
  const identity = {
    p_user_id: args.userId,
    p_conversation_id: args.conversationId,
    p_reply_id: replyId,
    p_claim_id: claimId,
  };
  // These RPCs are server-only and perform ownership and claim CAS checks.
  const rpc = async (name: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await (args.admin.rpc as any)(name, { ...identity, ...extra });
    if (error) throw error;
    return data;
  };
  const claim = await rpc("claim_career_agent_turn") as {
    accepted: boolean; completed?: boolean; state: CareerAgentRuntimeState;
  };
  if (!claim?.accepted) throw new CareerAgentReplyUnavailable(replyId, claim?.completed === true);

  const scope = { admin: args.admin, userId: args.userId, conversationId: args.conversationId,
    sourceMessageId: args.sourceMessage?.id, replyId };
  const cancellation = watchCareerTurnCancellation(scope, args.abortSignal);
  args = { ...args, abortSignal: cancellation.signal, checkCancellation: cancellation.check };
  let finished = false;
  let released = false;
  let executionRecord: (() => unknown) | undefined;
  const release = async () => {
    cancellation.dispose();
    if (finished || released) return;
    if (await careerTurnIsStopped(scope)) {
      await cancelCareerTurnWork(scope);
      const record = executionRecord?.() ?? { version: 2, mode: args.mode, activated: [], used: [], offered: [] };
      const result = await rpc("finish_career_agent_turn", {
        p_record: { ...record as object, replyId, status: "cancelled", injectedHandbooks: [], loadedHandbooks: [] },
        p_handbooks: claim.state.handbooks ?? [],
      });
      if (result === true) released = true;
      return;
    }
    const result = await rpc("release_career_agent_turn");
    // A newer owner must not be released by this request.
    if (result === true) released = true;
  };
  try {
    await cancellation.check();
    const previous = claim.state.previous;
    const saved = claim.state.checkpoint?.replyId === replyId ? claim.state.checkpoint : undefined;
    // Carried guide counters may have advanced while this transcript was queued.
    // Only loads authored inside this unfinished reply retain their own lease.
    const resumedBooks = new Map(normalizeCareerHandbookLeases(args.backgroundRunId ? saved?.handbooks : claim.state.handbooks).map(book => [book.id, book]));
    for (const book of normalizeCareerHandbookLeases(saved?.handbooks)) {
      if (saved?.record.loadedHandbooks?.includes(book.id)) resumedBooks.set(book.id, book);
    }
    const resume = saved ? { ...saved, handbooks: [...resumedBooks.values()] } : undefined;
    const [resourceIndex, laterUserMessages] = await Promise.all([
      readCareerAgentResourceContext(args),
      resume || args.agentReplyId
        ? readCareerContinuationUserContext(args) : Promise.resolve(""),
    ]);
    const resources = [resourceIndex, laterUserMessages].filter(Boolean).join("\n\n");
    const appendResources = (instruction?: string | null) => [instruction, resources].filter(Boolean).join("\n\n");
    const turn = await createCareerCapabilityTurn({
      ...args,
      replyId,
      agentState: args.backgroundRunId ? { ...claim.state, handbooks: [] } : claim.state,
      resume,
      continuation: args.continuation ?? resume?.continuation ?? {
        channel: "career",
        ...(args.sourceMessage ? { sourceMessageId: args.sourceMessage.id } : {}),
        ...(args.promptArgs.runtimeInstruction ? { runtimeInstruction: args.promptArgs.runtimeInstruction } : {}),
      },
      promptArgs: { ...args.promptArgs, runtimeInstruction: appendResources(args.promptArgs.runtimeInstruction) },
      getPromptArgs: args.getPromptArgs ? () => {
        const current = args.getPromptArgs!();
        return { ...current, runtimeInstruction: appendResources(current.runtimeInstruction) };
      } : undefined,
      selectorInput: {
        messages: args.selectorInput?.messages ?? (args.sourceMessage
          ? [{ role: "user", content: args.sourceMessage.content }] : []),
        currentContext: appendResources(args.selectorInput?.currentContext),
        previous: args.selectorInput?.previous ?? (previous ? {
          offeredCapabilities: previous.offered,
          toolResults: previous.toolResults,
          handbooks: previous.handbooks,
        } : undefined),
      },
      checkpoint: async (checkpoint) => {
        await cancellation.check();
        if (await rpc("checkpoint_career_agent_turn", { p_checkpoint: checkpoint }) !== true)
          throw new Error("Career reply claim lost before checkpoint");
        await args.onCheckpoint?.(checkpoint);
      },
      persistCompletion: async (record, handbooks) => {
        await cancellation.check();
        if (await (args.backgroundRunId
          ? rpc("finish_career_background_reply", { p_run_id: args.backgroundRunId })
          : rpc("finish_career_agent_turn", { p_record: record, p_handbooks: handbooks })) !== true)
          throw new Error("Career reply claim lost before completion");
        finished = true;
        cancellation.dispose();
      },
    });
    executionRecord = () => turn.runtime.completedRecord();
    const getCompletionPayload = () => ({
      replyId,
      record: turn.runtime.completedRecord(),
      handbooks: turn.runtime.handbooks.afterDeliveredReply(),
    });
    return { ...turn, release, replyId, claimId, getCompletionPayload };
  } catch (error) {
    await release().catch(releaseError => console.warn("[career-agent] release failed", { replyId, error: String(releaseError) }));
    throw error;
  }
}
