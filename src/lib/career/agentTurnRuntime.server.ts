import { workContext } from "./work/store";
import { CareerAgentReplyUnavailable } from "./agentReplyError";
export { CareerAgentReplyUnavailable } from "./agentReplyError";
import { createCareerCapabilityTurn } from "./capabilities/server";
import { CareerReplyContinuation, type CareerAgentRuntimeState, type CareerReplyCheckpoint } from "./capabilities/runtime";
import { careerCheckpointIsReady } from "./agentContinuation";
import { formatTalentMessageContentForLlmPrompt } from "./opportunityFeedbackNote";
import { formatLlmDateTime, PROMPT_TIME_ZONE } from "@/lib/llm/promptDateTime";
import { normalizeCareerHandbookLeases } from "./handbooks/registry";
import { readCareerMatchingIndex } from "./matching/store";
import { readUpcomingTalentScheduleContext } from "./meetings/server";
import { readCareerScheduleFollowIndex } from "./schedules/server";
import { careerTurnIsStopped, cancelCareerTurnWork, watchCareerTurnCancellation } from "./turnCancellation.server";
import { CAREER_TURN_STOP_FACT, isCareerTurnStopped } from "./turnCancellation";
import { createCareerInputInbox, formatCareerInboxMessages, readCareerInbox } from "./work/inbox";

export type PrepareCareerAgentTurnArgs = Omit<
  Parameters<typeof createCareerCapabilityTurn>[0],
  "agentState" | "persistCompletion" | "resume" | "checkpoint"
> & {
  agentReplyId?: string;
  workId?: string;
  workRevision?: number;
  inboxId?: string;
  backgroundRunId?: string;
  sourceMessageCursor?: number;
  /** Called after the exact provider transcript has been durably saved. */
  onCheckpoint?: (checkpoint: CareerReplyCheckpoint) => Promise<void>;
};

export async function readCareerContinuationUserContext(args: Pick<PrepareCareerAgentTurnArgs, "admin" | "userId" | "conversationId" | "sourceMessage" | "sourceMessageCursor" | "promptArgs">) {
  const cursor = args.sourceMessage?.id ?? args.sourceMessageCursor;
  if (cursor === undefined) return "";
  const rows: Array<{ id: number; content: string; created_at: string; message_type: string; payload: any }> = [];
  let after = cursor;
  // Page below the Data API row limit, without dropping older unconsumed input.
  while (true) {
    const { data, error } = await args.admin.from("talent_messages")
      .select("id,content,created_at,message_type,payload")
      .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
      .eq("role", "user").gt("id", after)
      .or("payload->>hidden.is.null,payload->>hidden.neq.true")
      .order("id", { ascending: true }).limit(500);
    if (error) throw error;
    rows.push(...(data ?? []) as typeof rows);
    if (!data || data.length < 500) break;
    after = data[data.length - 1].id;
  }
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
  ].join("\n\n");
}

/** A compact index; full form contents and browser evidence remain read-tool data. */
export async function readCareerAgentResourceContext(args: Pick<PrepareCareerAgentTurnArgs, "admin" | "userId" | "conversationId" | "workId">) {
  let browserQuery = (args.admin.from as any)("talent_external_operations")
    .select("id,kind,status,parent_id,request,result,current_execution_id:provider_refs->>current_execution_id")
    .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
    .eq("kind", "browser_session").neq("status", "closed");
  if (args.workId) browserQuery = browserQuery.eq("request->>work_id", args.workId);
  const [operations, forms, matching, schedules, profiles, appointments] = await Promise.allSettled([
    browserQuery.order("updated_at", { ascending: false }).limit(21),
    (args.admin.rpc as any)("read_open_career_forms", { p_user_id: args.userId, p_conversation_id: args.conversationId }),
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
    const all = (forms.value.data ?? []).map((row: any) => ({ id: row.id, ...row.payload }));
    const belongs = (row: any) => row.relatedRefs?.some((ref: any) => ref.type === "work" && ref.id === args.workId);
    const rows = args.workId ? [...all.filter(belongs), ...all.filter((row: any) => !belongs(row))] : all;
    const seen = new Set<string>();
    const entries: string[] = [];
    for (const row of rows.slice(0, 20)) {
      const id = String(row.formId ?? row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      if (row.hidden === "true") continue;
      entries.push(`- formId ${id}, revision ${row.revision}${row.title ? `: ${row.title}` : ""}`);
    }
    if (entries.length) lines.push("Unresolved forms (use suggest_form read for exact contents and responses; resolve when no further input is needed):", ...entries);
    if (rows.length > 20) lines.push("More unresolved forms exist; use suggest_form list/read when needed.");
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
    const { data, error } = await (args.admin.rpc as any)(args.workId ? "career_work_runtime" : name, args.workId ? {
      ...identity, p_work_id: args.workId, p_action: name.split("_")[0], p_value: extra,
    } : { ...identity, ...extra });
    if (error) throw error;
    return data;
  };
  const claim = await (args.inboxId ? (async () => {
    const { data, error } = await (args.admin.rpc as any)("claim_career_inbox", {
      p_user_id: args.userId, p_conversation_id: args.conversationId,
      p_invocation_id: args.inboxId, p_claim_id: claimId,
    });
    if (error) throw error;
    return data;
  })() : rpc("claim_career_agent_turn")) as {
    accepted: boolean; completed?: boolean; state: CareerAgentRuntimeState;
  };
  if (!claim?.accepted) throw new CareerAgentReplyUnavailable(replyId, claim?.completed === true);

  const scope = { admin: args.admin, userId: args.userId, conversationId: args.conversationId,
    sourceMessageId: args.sourceMessage?.id, replyId, workId: args.workId, workRevision: args.workRevision };
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
    const [resourceIndex, laterUserMessages, delegatedContext, inboxSnapshot] = await Promise.all([
      // Context is rebuilt from the source of truth on every resume.
      readCareerAgentResourceContext(args),
      !args.inboxId && (resume || args.agentReplyId)
        ? readCareerContinuationUserContext(args) : Promise.resolve(""),
      workContext(args, args.workId),
      args.inboxId ? readCareerInbox(args, args.inboxId) : Promise.resolve(undefined),
    ]);
    // The checkpoint may have advanced between the worker's preflight and its
    // claim. Only the claimed transcript can establish whether it may resume.
    const resumeDependenciesPending = args.inboxId && resume
      ? !await careerCheckpointIsReady(args.admin, args.userId, resume)
      : args.resumeDependenciesPending;
    if (resumeDependenciesPending && inboxSnapshot && !inboxSnapshot.messages.length)
      throw new CareerReplyContinuation(resume!);
    const saveCheckpoint = async (checkpoint: CareerReplyCheckpoint) => {
      await cancellation.check();
      if (args.inboxId) {
        const { data, error } = await (args.admin.rpc as any)("checkpoint_career_inbox", {
          p_user_id: args.userId, p_conversation_id: args.conversationId,
          p_invocation_id: args.inboxId, p_claim_id: claimId, p_checkpoint: checkpoint,
        });
        if (error) throw error;
        if (data !== true) throw new Error("Career input claim lost before checkpoint");
      } else if (await rpc("checkpoint_career_agent_turn", { p_checkpoint: checkpoint }) !== true) {
        throw new Error("Career reply claim lost before checkpoint");
      }
    };
    const inputInbox = args.inboxId && inboxSnapshot ? createCareerInputInbox({
      read: () => readCareerInbox(args, args.inboxId!), save: saveCheckpoint,
      deliveredIds: inboxSnapshot.deliveredIds,
      timeZone: args.promptArgs.timeZone, preferredLocale: args.promptArgs.currentPreferences?.preferredLocale,
    }) : undefined;
    const resources = [delegatedContext, resourceIndex, laterUserMessages].filter(Boolean).join("\n\n");
    const appendResources = (instruction?: string | null) => [instruction, resources].filter(Boolean).join("\n\n");
    const turn = await createCareerCapabilityTurn({
      ...args,
      replyId,
      agentState: args.backgroundRunId ? { ...claim.state, handbooks: [] } : claim.state,
      inputInbox,
      resume,
      resumeDependenciesPending,
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
        messages: inboxSnapshot ? [
          ...(args.selectorInput?.messages ?? []),
          ...(inboxSnapshot.messages.length ? [{ role: "user" as const, content: formatCareerInboxMessages(inboxSnapshot.messages, {
            timeZone: args.promptArgs.timeZone, preferredLocale: args.promptArgs.currentPreferences?.preferredLocale,
          }) }] : []),
        ] : args.selectorInput?.messages ?? (args.sourceMessage ? [{ role: "user", content: args.sourceMessage.content }] : []),
        currentContext: appendResources(args.selectorInput?.currentContext),
        previous: args.selectorInput?.previous ?? (previous ? {
          offeredCapabilities: previous.offered,
          toolResults: previous.toolResults,
          handbooks: previous.handbooks,
        } : undefined),
      },
      checkpoint: async (checkpoint) => {
        await saveCheckpoint(checkpoint);
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
