import { careerExecutionEnvironment } from "../executionEnvironment";
import { captureCareerExecution } from "../executionHistory";
import { captureCareerResearch } from "../researchHistory";
import { reportToolDiagnostic } from "@/lib/llm/toolExecution";
import { formatToolError, throwIfToolControlError, TOOL_RUNTIME_CONTROL } from "@/lib/llm/toolError";
import type { TalentChatTool } from "@/lib/talentOnboarding/llm";
import { buildCareerConversationPromptPlan } from "../prompts/conversationPlan";
import {
  CAREER_CAPABILITIES,
  CAREER_CAPABILITY_LOADER,
  type CareerCapabilityId,
  type CareerCapabilityMode,
} from "./registry";
import {
  resolveCareerCapabilities,
  type ResolvedCareerCapabilities,
} from "./resolver";
import type { CareerCapabilityTurnRecord } from "./lease";
import { CareerHandbookRuntime } from "../handbooks/runtime";
import { CAREER_HANDBOOK_LOADER, findCareerHandbook, isCareerHandbookAvailable, careerHandbookLoaderToolFor, renderCareerHandbookCatalog, type CareerHandbookId, type CareerHandbookLease } from "../handbooks/registry";
import { orderCareerPromptBlocksForCaching } from "../prompts/promptCaching";
import { careerPromptText } from "../prompts/promptExperiment";
import type { CareerPreloadSelection, CareerToolUseFact } from "./decisions";
import { withCareerGmailConnectionDescription } from "../gmailToolSelection";
import {
  setCareerCapabilityUsageStep,
  withLlmUsageContext,
  type LlmUsageContext,
} from "@/lib/llm/usageContext";

export type CareerCapabilityPromptArgs = Parameters<
  typeof buildCareerConversationPromptPlan
>[0];
export type CareerCapabilityStep = ResolvedCareerCapabilities & {
  systemBlocks: ReturnType<
    typeof buildCareerConversationPromptPlan
  >["promptBlocks"];
  handbooks: CareerHandbookLease[];
};

export type CareerAgentRuntimeState = {
  version: 1;
  completedSequence: number;
  activeReply?: { replyId: string; claimId: string; expiresAt: string } | null;
  handbooks: CareerHandbookLease[];
  previous?: CareerCapabilityTurnRecord;
  checkpoint?: CareerReplyCheckpoint;
  completedReplyIds?: Record<string, number>;
};
export type CareerReplyCheckpoint = {
  executionEnvironment?: string;
  version: 1;
  checkpointId: string;
  replyId: string;
  transport: "anthropic" | "chat";
  model?: string;
  messages: unknown[];
  systemBlocks: Array<{ key?: string; text: string; cacheable?: boolean }>;
  tools: TalentChatTool[];
  capabilityIds: CareerCapabilityId[];
  handbooks: CareerHandbookLease[];
  record: CareerCapabilityTurnRecord;
  waitFor?: CareerDeferredWork[];
  /** Authenticated input rows included in this exact provider transcript. */
  inputMessageIds?: number[];
  inputEventIds?: string[];
  /** Delivery ownership and original context required to recover an unpublished continuation. */
  continuation?: {
    assistantModel?: string;
    textChatModel?: import("../textChatModelConfig").CareerTextChatModelId;
    channel: "career" | "adapter" | "background";
    sourceMessageId?: number;
    backgroundRunId?: string;
    sourceMessageCursor?: number;
    emailReplyJobId?: string;
    runtimeInstruction?: string;
    noMessageMarker?: string;
  };
};
export type CareerInputInbox = {
  append(messages: unknown[]): Promise<boolean>;
  messageIds(): number[];
  eventIds?(): string[];
  hasPending?(): Promise<boolean>;
  save(checkpoint: CareerReplyCheckpoint): Promise<void>;
};
/** Executor receipts, never a model's interpretation of the conversation. */
export type CareerDeferredWork = { kind: "external_evaluation" | "internal_evaluation" | "email_delivery" | "browser_run" | "browser_control" | "career_input" | "external_capacity"; id: string; toolCallId?: string };
export class CareerReplyContinuation extends Error {
  readonly [TOOL_RUNTIME_CONTROL] = true;
  constructor(readonly checkpoint: CareerReplyCheckpoint) { super("Career reply saved for continuation"); this.name = "CareerReplyContinuation"; }
}
export function isCareerReplyContinuation(error: unknown): error is CareerReplyContinuation {
  return error instanceof CareerReplyContinuation;
}

export function isSuccessfulCareerToolResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result.ok === false || result.error || result.success === false)
    return false;
  if (
    typeof result.status === "string" &&
    [
      "error",
      "failed",
      "conflict",
      "unavailable",
      "not_connected",
      "reauth_required",
      "connection_required",
      "connection_expired",
      "temporarily_unavailable",
      "forbidden",
    ].includes(result.status)
  )
    return false;
  // Older read tools return a payload/modelOutput without an explicit ok flag.
  // Reaching this hook means the executor returned normally; thrown calls never refresh.
  return true;
}

/** Per-request execution facts only. No intent, consent, or semantic routing state. */
export class CareerCapabilityRuntime {
  readonly loaded: Set<CareerCapabilityId>;
  readonly activated = new Set<CareerCapabilityId>();
  readonly used = new Set<CareerCapabilityId>();
  readonly toolResults: CareerToolUseFact[] = [];
  readonly handbooks: CareerHandbookRuntime;
  readonly replyId: string;
  readonly maxToolCalls: number;
  readonly maxToolLoops: number;
  private domainCalls = 0;
  private loaderCalls = 0;
  private stepCount = 0;
  private completionCount = 0;
  private readonly requestId: string;
  private gmailConnectionAvailable: boolean | undefined;
  private readonly deferredWork = new Map<string, CareerDeferredWork>();
  constructor(
    readonly options: {
      mode: CareerCapabilityMode;
      eligibleTools: readonly TalentChatTool[];
      getEligibleTools?: () => readonly TalentChatTool[];
      promptArgs: () => CareerCapabilityPromptArgs;
      adaptPromptBlocks?: (blocks: CareerCapabilityStep["systemBlocks"]) => CareerCapabilityStep["systemBlocks"];
      remembered?: ReadonlySet<CareerCapabilityId>;
      preloads?: readonly CareerCapabilityId[];
      domainLimit?: number;
      allowLoaders?: boolean;
      replyId?: string;
      requestId?: string;
      handbooks?: readonly CareerHandbookLease[];
      selection?: CareerPreloadSelection;
      abortSignal?: AbortSignal;
      checkCancellation?: () => Promise<void>;
      deadlineAt?: number;
      resume?: CareerReplyCheckpoint;
      continuation?: CareerReplyCheckpoint["continuation"];
      checkpoint?: (checkpoint: CareerReplyCheckpoint) => Promise<void>;
      inputInbox?: CareerInputInbox;
      resumeDependenciesPending?: boolean;
      delegated?: boolean;
      observePendingWork?: (work: CareerDeferredWork) => Promise<void>;
      usageContext?: Omit<LlmUsageContext, "requestId">;
      refreshAfterTool?: (name: string, result: unknown) => Promise<void>;
      onStep?: (data: Record<string, unknown>) => void;
      onModelTurn?: (turn: number, phase: "started" | "returned" | "failed", model?: string) => void;
      onEvent?: (data: Record<string, unknown>) => void;
    }
  ) {
    this.requestId = options.requestId ?? crypto.randomUUID();
    const loadableIds = new Set(
      resolveCareerCapabilities({
        eligibleTools: options.eligibleTools,
        mode: options.mode,
        loaded: new Set(),
      }).loadableIds
    );
    this.replyId = options.replyId ?? crypto.randomUUID();
    const background = Boolean(options.promptArgs().backgroundInvocation);
    this.handbooks = new CareerHandbookRuntime((options.resume?.handbooks ?? options.handbooks ?? []).filter(book => isCareerHandbookAvailable(book.id, background, options.promptArgs().scheduledWork)));
    this.handbooks.load((options.selection?.handbookIds ?? []).filter(id => isCareerHandbookAvailable(id, background, options.promptArgs().scheduledWork)), "selector");
    this.loaded = new Set((options.resume?.capabilityIds ?? []).filter(id => loadableIds.has(id)));
    if (options.delegated) this.loaded.add("delegation");
    for (const id of [...(options.preloads ?? []), ...(options.selection?.capabilityIds ?? [])]) {
      if (!loadableIds.has(id) || CAREER_CAPABILITIES.some(c => c.id === id && "manualOnly" in c && c.manualOnly)) continue;
      this.loaded.add(id);
      this.activated.add(id);
    }
    for (const id of options.resume?.record.activated ?? []) this.activated.add(id);
    for (const id of options.resume?.record.used ?? []) this.used.add(id);
    this.toolResults.push(...(options.resume?.record.toolResults ?? []));
    for (const id of options.resume?.record.loadedHandbooks ?? []) {
      const book = findCareerHandbook(id);
      if (book) this.handbooks.loaded.add(book.id);
    }
    for (const id of options.resume?.record.injectedHandbooks ?? []) {
      const lease = this.handbooks.snapshot().find(book => book.id === id);
      if (lease) this.handbooks.markInjected([lease]);
    }
    // Execution duration and cancellation belong to the actual request/worker;
    // an arbitrary count cannot define whether delegated work is complete.
    this.maxToolCalls = Number.POSITIVE_INFINITY;
    this.maxToolLoops = Number.POSITIVE_INFINITY;
  }
  runWithUsageContext<T>(work: () => T): T {
    return withLlmUsageContext(
      { ...this.options.usageContext, requestId: this.requestId },
      work
    );
  }
  isInternalTool(name: string) {
    return name === CAREER_CAPABILITY_LOADER || name === CAREER_HANDBOOK_LOADER;
  }
  get abortSignal() { return this.options.abortSignal; }
  get deadlineAt() { return this.options.deadlineAt; }
  get resumedModel() { return this.options.resume?.model; }
  get resumedTransport() { return this.options.resume?.transport; }
  resumedMessages(transport: CareerReplyCheckpoint["transport"]) {
    const resume = this.options.resume;
    if (resume && resume.transport !== transport) throw new Error("Career continuation transport must match its saved transcript");
    return resume?.messages;
  }
  async shouldDeferToolCall() {
    await this.options.checkCancellation?.();
    return this.deferredWork.size > 0 || (await this.options.inputInbox?.hasPending?.() ?? false);
  }
  deferredToolMessage() {
    return this.deferredWork.size
      ? "Not executed: an earlier tool is still running. Continue choosing actions after its result arrives."
      : "Not executed: new conversation input arrived. Read that input before choosing the next action.";
  }
  async beforeCompletion(step: CareerCapabilityStep, input: { transport: CareerReplyCheckpoint["transport"]; model?: string; messages: unknown[]; systemBlocks?: CareerReplyCheckpoint["systemBlocks"] }) {
    await this.options.checkCancellation?.();
    this.options.abortSignal?.throwIfAborted();
    // Accept new input without losing an unfinished tool's ownership or transcript.
    await this.options.inputInbox?.append(input.messages);
    const shouldYield = this.deferredWork.size > 0 || (this.options.deadlineAt !== undefined && Date.now() >= this.options.deadlineAt);
    if (shouldYield || this.options.inputInbox) {
      const checkpoint: CareerReplyCheckpoint = { executionEnvironment: careerExecutionEnvironment(), version: 1, checkpointId: crypto.randomUUID(), replyId: this.replyId, ...input, systemBlocks: input.systemBlocks ?? step.systemBlocks,
        tools: step.tools, capabilityIds: [...this.loaded], handbooks: this.handbooks.snapshot(), record: { ...this.completedRecord(), status: "in_progress" },
        continuation: this.options.continuation ?? this.options.resume?.continuation,
        ...(this.options.inputInbox ? { inputMessageIds: this.options.inputInbox.messageIds(), inputEventIds: this.options.inputInbox.eventIds?.() ?? [] } : {}),
        ...(this.deferredWork.size ? { waitFor: [...this.deferredWork.values()] } : {}) };
      if (shouldYield) {
        if (!this.options.checkpoint) throw new Error("Career reply deadline reached without a continuation store");
        await this.options.checkpoint(checkpoint);
        throw new CareerReplyContinuation(checkpoint);
      }
      // Persist before the provider call, including completed tool results.
      // This does not publish a continuation while the executor still owns it.
      await this.options.inputInbox!.save(checkpoint);
    }
    this.handbooks.markInjected(step.handbooks);
  }
  async runCompletion<T>(
    step: CareerCapabilityStep,
    input: Parameters<CareerCapabilityRuntime["beforeCompletion"]>[1],
    work: (signal?: AbortSignal) => Promise<T>,
  ): Promise<T> {
    await this.beforeCompletion(step, input);
    const deadlineSignal = this.options.deadlineAt === undefined ? undefined
      : AbortSignal.timeout(Math.max(1, this.options.deadlineAt - Date.now()));
    const signals = [this.options.abortSignal, deadlineSignal].filter((signal): signal is AbortSignal => Boolean(signal));
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    const turn = ++this.completionCount;
    this.options.onModelTurn?.(turn, "started", input.model);
    try {
      const result = await work(signal);
      this.options.onModelTurn?.(turn, "returned", input.model);
      return result;
    } catch (error) {
      this.options.onModelTurn?.(turn, "failed", input.model);
      // A user cancellation never schedules more work. A request deadline only
      // interrupts the provider; the transcript contains all completed effects.
      this.options.abortSignal?.throwIfAborted();
      if (deadlineSignal?.aborted) await this.beforeCompletion(step, input);
      throw error;
    }
  }
  resolveStep(record = true): CareerCapabilityStep {
    const promptArgs = this.options.promptArgs();
    const experiment = promptArgs.channel === "chat" && promptArgs.isOnboardingDone && !promptArgs.backgroundInvocation
      ? promptArgs.promptExperiment : undefined;
    const eligibleTools = this.options.getEligibleTools?.() ?? this.options.eligibleTools;
    const resolved = resolveCareerCapabilities({
      eligibleTools: this.gmailConnectionAvailable !== undefined
        ? eligibleTools.map(tool => withCareerGmailConnectionDescription(tool, this.gmailConnectionAvailable))
        : eligibleTools,
      mode: this.options.mode,
      loaded: this.loaded,
      allowLoaders: this.options.allowLoaders,
      promptExperiment: experiment,
    });
    const baseBlocks = buildCareerConversationPromptPlan({
      ...promptArgs,
      ...(this.gmailConnectionAvailable !== undefined
        ? {
            gmailCapability: !this.gmailConnectionAvailable
              ? "not_connected" as const
              : resolved.eligibleNames.has("search_connected_gmail")
                ? "available" as const
                : "connected_but_unavailable_this_turn" as const,
          }
        : {}),
      capabilities: resolved,
    }).promptBlocks;
    // Resume authoring guidance is part of the document capability's input contract.
    // Supply it before the first writer call, including mid-turn capability loads.
    if (resolved.activeIds.includes("documents")) this.handbooks.load(["resume"], "selector");
    const handbooks = this.handbooks.snapshot();
    const assembledBlocks = orderCareerPromptBlocksForCaching([
      ...baseBlocks,
      ...(this.options.resume?.waitFor?.length ? [{
        key: "resumed_work", cacheable: false,
        text: [
          this.options.resumeDependenciesPending
            ? "New user input resumed this conversation while one or more recorded dependencies were still pending. Their earlier running receipts do not establish completion:"
            : baseBlocks.some(block => block.key === "career_main")
            ? "The original turn resumed. These recorded dependencies no longer block this invocation:"
            : "This is the resumed original turn after its recorded dependency stopped blocking it. The earlier queued/running tool receipt in the transcript is historical, not evidence that the work is still running now. Its outcome may be completed, partial, failed or cancelled. Read the current result through its ordinary read tool and continue the authorized work from that outcome; do not leave a completed dependency described as ongoing work. Resumption alone does not prove success.",
          ...this.options.resume.waitFor.map(work => `${work.kind}: ${work.id}`),
        ].join("\n"),
      }] : []),
      ...(resolved.offeredNames.has(CAREER_HANDBOOK_LOADER) ? [{ key: "handbook_catalog", text: renderCareerHandbookCatalog(Boolean(promptArgs.backgroundInvocation), promptArgs.scheduledWork), cacheable: false }] : []),
      ...this.handbooks.blocks().map(block => ({ ...block,
        text: careerPromptText(experiment, block.key, block.text),
      })).filter(block => block.text.trim()),
    ]);
    const systemBlocks = this.options.adaptPromptBlocks?.(assembledBlocks) ?? assembledBlocks;
    const tools = resolved.tools.map(tool => tool.function.name === CAREER_HANDBOOK_LOADER
      ? careerHandbookLoaderToolFor(Boolean(promptArgs.backgroundInvocation), promptArgs.scheduledWork) : tool);
    const step = { ...resolved, tools, systemBlocks, handbooks };
    if (record) {
      const metrics = {
        step: this.stepCount++,
        version: 1,
        isOnboardingDone: true,
        mode: this.options.mode,
        capabilities: resolved.activeIds,
        tools: resolved.tools.map((t) => t.function.name),
        systemChars: systemBlocks.reduce((n, b) => n + b.text.length, 0),
        schemaChars: JSON.stringify(resolved.tools).length,
        domainCalls: this.domainCalls,
        loaderCalls: this.loaderCalls,
        handbooks: handbooks.map(book => ({ id: book.id, version: book.version, remainingReplies: book.remainingReplies })),
        ...(experiment ? { promptExperiment: {
          variant: experiment.variant, sha256: experiment.sha256,
        } } : {}),
      };
      setCareerCapabilityUsageStep(metrics);
      this.options.onStep?.(metrics);
    }
    return step;
  }
  claimCall(name: string, step: CareerCapabilityStep): string | null {
    this.options.abortSignal?.throwIfAborted();
    const loader = this.isInternalTool(name);
    if (loader) this.loaderCalls++;
    else this.domainCalls++;
    const error = !step.offeredNames.has(name) ? "tool_not_offered" : null;
    if (error)
      this.options.onEvent?.({ event: "call_rejected", tool: name, error });
    return error;
  }
  load(input: Record<string, unknown>, step: CareerCapabilityStep, name = CAREER_CAPABILITY_LOADER) {
    if (name === CAREER_HANDBOOK_LOADER) {
      const ids = input.handbook_ids;
      if (!Array.isArray(ids) || !ids.every(id => isCareerHandbookAvailable(id, Boolean(this.options.promptArgs().backgroundInvocation), this.options.promptArgs().scheduledWork)))
        return { ok: false, error: "invalid_handbook_ids", modelOutput: "Handbook loading failed: choose the exact handbook IDs from the catalog." };
      this.handbooks.load([...new Set(ids)] as CareerHandbookId[], "manual");
      return { ok: true, loaded: ids, availableFrom: "next_response", modelOutput: this.handbooks.snapshot().filter(book => ids.includes(book.id)).map(book => {
        const body = findCareerHandbook(book.id)!.body;
        return `Loaded handbook ${book.id}, version ${book.version}, ${Array.from(body).length} characters. Available from the next model completion; ${book.remainingReplies} delivered replies remaining.`;
      }).join("\n") || "No handbook requested." };
    }
    const ids = input.capabilityIds;
    if (
      !Array.isArray(ids) ||
      !ids.every((id) => step.loadableIds.includes(id))
    ) {
      this.options.onEvent?.({
        event: "load_rejected",
        error: "invalid_capability_ids",
      });
      return {
        ok: false,
        error: "invalid_capability_ids",
        available: step.loadableIds,
      };
    }
    const unique = [...new Set(ids)] as CareerCapabilityId[];
    const alreadyLoaded = unique.filter((id) => step.activeIds.includes(id));
    for (const id of unique) {
      this.loaded.add(id);
      this.activated.add(id);
    }
    this.options.onEvent?.({ event: "loaded", loaded: unique, alreadyLoaded });
    return {
      ok: true,
      loaded: unique,
      alreadyLoaded,
      availableFrom: "next_response",
      modelOutput: `Loaded capabilities: ${unique.join(", ") || "none"}. Their tools and policies are available from the next model completion. Loading performs no external action and grants no user permission.`,
    };
  }
  shouldFinishAfterTool(name: string, input: Record<string, unknown>, result: unknown) {
    if (!this.options.promptArgs().scheduledWork || !result || typeof result !== "object" || !("status" in result) || result.status !== "sent") return false;
    return (name === "deliver_career_email" && ["deliver", "retry"].includes(String(input.action ?? "deliver"))) ||
      (name === "contact_user" && input.channel === "email");
  }
  async recordResult(
    name: string,
    result: unknown,
    step: CareerCapabilityStep,
    input: Record<string, unknown> = {},
    callId?: string,
  ) {
    if (this.options.promptArgs().scheduledWork && isSuccessfulCareerToolResult(result)) {
      // These are source facts returned by the role readers, not a classification
      // of the model's intended message. The same leases survive a suspended turn.
      const value = result as any;
      const sources = new Set([
        ...(name === "get_role_context" ? (value.roles ?? []).map((item: any) => item.role?.sourceType) : []),
        ...(name === "read_recommended_opportunities" ? (value.opportunities ?? []).map((item: any) => item.sourceType) : []),
        ...(["read_matching", "search_opportunities"].includes(name) ? [value.source, ...(value.memberships ?? []).map((item: any) => item.role?.source_type)] : []),
      ]);
      if (sources.has("internal")) this.handbooks.load(["internal_recommendation_writing"], "selector");
      if (sources.has("external")) this.handbooks.load(["external_recommendation_writing"], "selector");
    }
    const pending = result && typeof result === "object" && "careerContinuation" in result
      ? result.careerContinuation as CareerDeferredWork | undefined : undefined;
    if (pending && ["external_evaluation", "email_delivery", "browser_run", "career_input", "external_capacity"].includes(pending.kind) && typeof pending.id === "string") {
      if (this.options.observePendingWork && !["browser_run", "external_capacity"].includes(pending.kind)) await this.options.observePendingWork(pending);
      else this.deferredWork.set(`${pending.kind}:${pending.id}`, { ...pending, ...(callId ? { toolCallId: callId } : {}) });
    }
    // Connection failures remain visible facts; the executor checks access on
    // each call instead of removing Gmail abilities from the next model input.
    const status =
      result && typeof result === "object" && "status" in result
        ? result.status
        : null;
    if (["search_connected_gmail", "write_email"].includes(name)) {
      if (status === "connection_required" || status === "connection_expired")
        this.gmailConnectionAvailable = false;
      else if (["ok", "read", "succeeded", "permissions_required", "permissions_unknown"].includes(String(status)))
        this.gmailConnectionAvailable = true;
    }
    this.options.onEvent?.({
      event: "tool_result",
      tool: name,
      successful: isSuccessfulCareerToolResult(result),
    });
    const research = captureCareerResearch(name, input, result);
    this.toolResults.push({ ...(callId ? { callId } : {}), execution: captureCareerExecution(input, result), ...(research ? { research } : {}), name, successful: isSuccessfulCareerToolResult(result), ...(typeof status === "string" ? { status } : {}) });
    if (
      isSuccessfulCareerToolResult(result) &&
      this.options.mode === "progressive"
    ) {
      for (const c of CAREER_CAPABILITIES) {
        if (
          step.loadableIds.includes(c.id) &&
          step.activeIds.includes(c.id) &&
          c.tools.some(([tool]) => tool === name)
        )
          this.used.add(c.id);
      }
    }
    // Refresh actual state even for a revision conflict, before the next completion.
    try {
      await this.options.refreshAfterTool?.(name, result);
    } catch (error) {
      throwIfToolControlError(error);
      reportToolDiagnostic({ error, source: "context_refresh" });
      console.warn("[career-capabilities] context refresh failed", {
        diagnostic: formatToolError(error),
        tool: name,
      });
    }
  }
  completedRecord(): CareerCapabilityTurnRecord {
    return {
      version: 2,
      status: "completed",
      mode: this.options.mode,
      activated: this.options.mode === "full" ? [] : [...this.activated],
      used: this.options.mode === "full" ? [] : [...this.used],
      replyId: this.replyId,
      offered: this.resolveStep(false).activeIds,
      toolResults: [...this.toolResults],
      handbooks: this.handbooks.snapshot(),
      loadedHandbooks: [...this.handbooks.loaded],
      injectedHandbooks: [...this.handbooks.injected],
    };
  }
}
