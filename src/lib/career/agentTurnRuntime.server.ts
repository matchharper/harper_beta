import { listCoverage } from "@/lib/career/listCoverage";
import { appendCareerExecutionObservation } from "./executionHistory";
import { observeCareerDependency, readCareerEventContext } from "./work/events";
import { readWorkContext } from "./work/store";
import { formatCareerActionItemResponse } from "./actionItems";
import { CareerAgentReplyUnavailable } from "./agentReplyError";
import { scheduledEmailWasSent } from "./background/emailCompletion";
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
import { createCareerInputInbox, formatCareerInboxMessages, readCareerInbox, type CareerInboxSnapshot } from "./work/inbox";
import { readTalentDocumentMetadataPage } from "@/lib/talentOnboarding/documentTool";
import type { ExternalOperation } from "./externalOperations/store";
import { readSelectedOpportunityContext } from "./selectedOpportunityContext.server";
import { readInternalProposalContext } from "./internalSelections";
import { readCareerResourceValue } from "./promptReadCache.server";

export type PrepareCareerAgentTurnArgs = Omit<
  Parameters<typeof createCareerCapabilityTurn>[0],
  "agentState" | "persistCompletion" | "resume" | "checkpoint"
> & {
  resourceContextRead?: Promise<string>;
  workContextRead?: ReturnType<typeof readWorkContext>;
  claimedInbox?: { claimId: string; state: CareerAgentRuntimeState };
  initialInboxSnapshot?: CareerInboxSnapshot;
  agentReplyId?: string;
  workId?: string;
  workRevision?: number;
  inboxId?: string;
  onInvocationCompleted?: (nextInvocationId: string | null) => void;
  invocationBrowserReturns?: unknown[];
  updateConversationOnComplete?: boolean;
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
        ? [row.content ?? "", formatCareerActionItemResponse(row.payload), ...(isCareerTurnStopped(row.payload) ? [CAREER_TURN_STOP_FACT] : [])].filter(Boolean).join("\n")
        : formatTalentMessageContentForLlmPrompt(row, {
            includeCreatedAt: false, timeZone: args.promptArgs.timeZone,
            preferredLocale: args.promptArgs.currentPreferences?.preferredLocale,
          });
      return `User message ${row.id} (${formatLlmDateTime(row.created_at)}):\n${content}`;
    }),
  ].join("\n\n");
}

/** Existing resource references and their last recorded state, without document bodies. */
export async function readCareerAgentResourceContext(args: Pick<PrepareCareerAgentTurnArgs, "admin" | "userId" | "conversationId" | "workId">) {
  const [forms, matching, schedules, profiles, appointments, documents, internalProposals] = await Promise.allSettled([
    readCareerResourceValue(args.userId, `forms:${args.conversationId}`, async () => {
      const result = await (args.admin.rpc as any)("read_open_career_forms", { p_user_id: args.userId, p_conversation_id: args.conversationId });
      if (result.error) throw result.error;
      return result;
    }),
    readCareerResourceValue(args.userId, "matching-index", () => readCareerMatchingIndex(args)),
    readCareerScheduleFollowIndex(args),
    readCareerResourceValue(args.userId, "profile-index", async () => {
      const result = await (args.admin.from as any)("talent_profiles").select("id,title,current_revision,is_default")
        .eq("talent_id", args.userId).eq("is_archived", false).order("is_default", { ascending: false }).limit(6);
      if (result.error) throw result.error;
      return result;
    }),
    readUpcomingTalentScheduleContext(args),
    readCareerResourceValue(args.userId, "document-index", () => readTalentDocumentMetadataPage({ ...args, input: {} })),
    readInternalProposalContext(args),
  ]);
  const lines: string[] = [];
  lines.push(internalProposals.status === "fulfilled" ? internalProposals.value
    : "Selected Harper-connected proposals could not be read; availability is unknown. read_recommended_opportunities can read them.");
  lines.push(appointments.status === "fulfilled"
    ? appointments.value
    : "Upcoming appointments could not be read; their absence is unknown.");
  for (const index of [matching, schedules]) if (index.status === "fulfilled" && index.value) lines.push(String(index.value));
  if (documents.status === "fulfilled") {
    lines.push(`Saved documents (${listCoverage(documents.value.rows.length, documents.value.hasMore)}; primary resume first; read_document for content):`,
      ...documents.value.rows.map(row => `- document_id ${row.id}; ${row.file_name}; ${row.kind}${row.revision != null ? `; revision ${row.revision}` : ""}${row.is_primary ? "; primary" : ""}`));
    if (documents.value.hasMore) lines.push(`More documents; list_documents offset ${documents.value.nextOffset}.`);
  } else lines.push("Saved document index could not be read; document availability is unknown.");
  if (profiles.status === "fulfilled" && !profiles.value.error) {
    lines.push(`Profiles (${listCoverage(Math.min(profiles.value.data?.length ?? 0, 5), (profiles.value.data?.length ?? 0) > 5)}):`, ...(profiles.value.data ?? []).slice(0, 5).map((row: any) =>
      `- profile ${row.id}, revision ${row.current_revision}; ${row.title}; ${row.is_default ? "default" : "private version"}`));
    if ((profiles.value.data?.length ?? 0) > 5) lines.push("More versions exist; list_profiles retrieves the next page.");
  }
  if (forms.status === "fulfilled" && !forms.value.error) {
    const all = (forms.value.data ?? []).map((row: any) => ({ id: row.id, ...row.payload }));
    const belongs = (row: any) => row.relatedRefs?.some((ref: any) => ref.type === "work" && ref.id === args.workId);
    const rows = args.workId ? all.filter(belongs) : all;
    const seen = new Set<string>();
    const entries: string[] = [];
    for (const row of rows) {
      const id = String(row.formId ?? row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      if (row.hidden === "true" || row.hidden === true) continue;
      entries.push(`- formId ${id}, revision ${row.revision}${row.title ? `: ${row.title}` : ""}`);
    }
    lines.push(`Unresolved forms${args.workId ? " for this work" : " in this conversation"} (${listCoverage(Math.min(entries.length, 20), entries.length > 20)}):`, ...entries.slice(0, 20));
    if (entries.length > 20) lines.push("More unresolved forms exist; use suggest_form list/read when needed.");
  }
  return lines.join("\n");
}

/** Deliver the finished receipt for the exact run this transcript was waiting on.
 * Append an observation; never rewrite the original running tool result.
 */
async function appendBrowserContinuationResults(args: Pick<PrepareCareerAgentTurnArgs, "admin" | "userId" | "conversationId" | "workId">, resume: CareerReplyCheckpoint) {
  const pending = (resume.waitFor ?? []).filter(work => ["browser_run", "browser_control"].includes(work.kind));
  if (!pending.length) return resume;
  const { formatBrowserToolResult, formatBrowserSessionResult } = await import("./browser/tool");
  const { readOperation } = await import("./externalOperations/store");
  const consumed = new Set<string>();
  for (const kind of ["browser_run", "browser_control"] as const) {
    const waits = pending.filter(work => work.kind === kind);
    if (!waits.length) continue;
    let query = (args.admin.from as any)("talent_external_operations").select("*")
      .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
      .eq("kind", kind === "browser_run" ? kind : "browser_session").in("id", waits.map(work => work.id));
    if (args.workId) query = query.eq("request->>work_id", args.workId);
    const { data, error } = await query;
    if (error) throw error;
    for (const wait of waits) {
      const operation = (data as ExternalOperation[] | null)?.find(row => row.id === wait.id);
      if (operation && kind === "browser_run" && ["reserved", "preparing", "dispatching", "capacity_wait", "running", "cancelling"].includes(operation.status)) continue;
      const currentId = kind === "browser_control" ? operation?.provider_refs?.current_execution_id : undefined;
      const current = typeof currentId === "string" ? await readOperation(args, currentId) : null;
      const observation = !operation ? `Browser execution ${wait.id} is unavailable. Completion has not been established.`
        : kind === "browser_control" ? formatBrowserSessionResult(operation, current?.parent_id === operation.id ? [current] : []) : formatBrowserToolResult([operation]);
      resume = appendCareerExecutionObservation(resume, wait.toolCallId, observation);
      consumed.add(wait.id);
    }
  }
  return { ...resume, waitFor: resume.waitFor?.filter(work => !consumed.has(work.id)) };
}

/** One claim covers a logical delivered reply, including any request continuations. */
export async function prepareCareerAgentTurn(args: PrepareCareerAgentTurnArgs) {
  const replyId = args.agentReplyId ?? args.replyId ??
    (args.sourceMessage ? `message:${args.sourceMessage.id}` : crypto.randomUUID());
  const claimId = args.claimedInbox?.claimId ?? crypto.randomUUID();
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
  const claim = args.claimedInbox ? { accepted: true, state: args.claimedInbox.state } : await (args.inboxId ? (async () => {
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
    if (args.promptArgs.scheduledWork && args.backgroundRunId && await scheduledEmailWasSent({
      admin: args.admin, userId: args.userId, runId: args.backgroundRunId, checkpoint: saved,
    })) {
      await cancellation.check();
      if (await rpc("finish_career_background_reply", { p_run_id: args.backgroundRunId }) !== true)
        throw new Error("Career reply claim lost after email delivery");
      finished = true;
      cancellation.dispose();
      throw new CareerAgentReplyUnavailable(replyId, true);
    }
    if (saved?.waitFor?.some(work => work.kind === "internal_evaluation")) {
      // Never replay a transcript from the removed model-visible scoring API.
      const done = await rpc("finish_career_agent_turn", {
        p_record: { ...saved.record, replyId, status: "cancelled", injectedHandbooks: [], loadedHandbooks: [] },
        p_handbooks: claim.state.handbooks ?? [],
      });
      if (done !== true) throw new Error("Career reply claim lost during contract retirement");
      finished = true;
      cancellation.dispose();
      throw new CareerAgentReplyUnavailable(replyId, true);
    }
    args = { ...args, sourceMessageCursor: args.sourceMessageCursor ?? saved?.continuation?.sourceMessageCursor };
    // Carried guide counters may have advanced while this transcript was queued.
    // Only loads authored inside this unfinished reply retain their own lease.
    const resumedBooks = new Map(normalizeCareerHandbookLeases(args.backgroundRunId ? saved?.handbooks : claim.state.handbooks).map(book => [book.id, book]));
    for (const book of normalizeCareerHandbookLeases(saved?.handbooks)) {
      if (saved?.record.loadedHandbooks?.includes(book.id)) resumedBooks.set(book.id, book);
    }
    let resume = saved ? { ...saved, handbooks: [...resumedBooks.values()] } : undefined;
    // The claimed checkpoint owns readiness. Observe its exact dependency
    // before resuming the saved transcript.
    const dependencyState = resume
      ? careerCheckpointIsReady(args.admin, args.userId, resume).then(ready => !ready)
      : Promise.resolve(args.resumeDependenciesPending);
    const [resourceIndex, laterUserMessages, delegatedContext, inboxSnapshot, resumeDependenciesPending] = await Promise.all([
      args.resourceContextRead ?? dependencyState.then(() => readCareerAgentResourceContext(args)),
      !args.inboxId && (resume || args.agentReplyId)
        ? readCareerContinuationUserContext(args) : Promise.resolve(""),
      args.workContextRead ?? readWorkContext(args, args.workId),
      args.inboxId ? (args.initialInboxSnapshot ?? readCareerInbox(args, args.inboxId)) : Promise.resolve(undefined),
      dependencyState,
    ]);
    if (resumeDependenciesPending && (resume?.waitFor?.some(work => ["browser_run", "browser_control", "external_capacity"].includes(work.kind)) || (inboxSnapshot && !inboxSnapshot.messages.length && !inboxSnapshot.events?.length)))
      throw new CareerReplyContinuation(resume!);
    if (resume) resume = await appendBrowserContinuationResults(args, resume);
    const knownWorkRevisions = new Map(delegatedContext.works.map(work => [work.id, work.revision]));
    const selectedOpportunityContext = !args.inboxId && args.sourceMessage
      ? await readSelectedOpportunityContext({ ...args, messages: [args.sourceMessage], knownWorkRevisions }) : "";
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
      readContext: messages => readSelectedOpportunityContext({ ...args, messages, knownWorkRevisions }),
      deliveredIds: inboxSnapshot.deliveredIds,
      deliveredEventIds: inboxSnapshot.deliveredEventIds,
      readEvents: events => readCareerEventContext(args, events),
      timeZone: args.promptArgs.timeZone, preferredLocale: args.promptArgs.currentPreferences?.preferredLocale,
    }) : undefined;
    const resources = [delegatedContext.text, resourceIndex, laterUserMessages, selectedOpportunityContext].filter(Boolean).join("\n\n");
    const appendResources = (instruction?: string | null) => [instruction, resources].filter(Boolean).join("\n\n");
    const turn = await createCareerCapabilityTurn({
      ...args,
      replyId,
      agentState: args.backgroundRunId ? { ...claim.state, handbooks: [] } : claim.state,
      inputInbox,
      observePendingWork: args.inboxId && args.sourceMessage ? dependency => observeCareerDependency({
        ...args, sourceMessageId: args.sourceMessage!.id, replyId,
      }, dependency) : undefined,
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
        currentContext: args.selectorInput?.currentContext,
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
        const completionStartedAt = Date.now();
        await cancellation.check();
        if (args.inboxId && args.onInvocationCompleted && !args.backgroundRunId) {
          const { data, error } = await (args.admin.rpc as any)("finish_career_chat_execution", {
            p_user_id: args.userId, p_conversation_id: args.conversationId, p_invocation_id: args.inboxId,
            p_claim_id: claimId, p_record: record, p_handbooks: handbooks,
            p_update_conversation: args.updateConversationOnComplete ?? false,
            p_observed_browser_returns: args.invocationBrowserReturns ?? [],
          });
          if (error) throw error;
          finished = true;
          args.onInvocationCompleted(data.nextInvocationId);
          console.info("[career-completion]", JSON.stringify({ replyId, elapsedMs: Date.now() - completionStartedAt }));
        } else {
          if (await (args.backgroundRunId
            ? rpc("finish_career_background_reply", { p_run_id: args.backgroundRunId })
            : rpc("finish_career_agent_turn", { p_record: record, p_handbooks: handbooks })) !== true)
            throw new Error("Career reply claim lost before completion");
          finished = true;
        }
        cancellation.dispose();
        return args.inboxId && args.onInvocationCompleted && !args.backgroundRunId ? true : undefined;
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
