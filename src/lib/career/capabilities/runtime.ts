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
};

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
  readonly maxToolCalls: number;
  readonly maxToolLoops: number;
  private domainCalls = 0;
  private loaderCalls = 0;
  private stepCount = 0;
  private readonly requestId = crypto.randomUUID();
  private readonly revokedTools = new Set<string>();
  constructor(
    readonly options: {
      mode: CareerCapabilityMode;
      eligibleTools: readonly TalentChatTool[];
      promptArgs: () => CareerCapabilityPromptArgs;
      remembered?: ReadonlySet<CareerCapabilityId>;
      preloads?: readonly CareerCapabilityId[];
      domainLimit?: number;
      usageContext?: Omit<LlmUsageContext, "requestId">;
      refreshAfterTool?: (name: string, result: unknown) => Promise<void>;
      onStep?: (data: Record<string, unknown>) => void;
      onEvent?: (data: Record<string, unknown>) => void;
    }
  ) {
    const loadableIds = new Set(
      resolveCareerCapabilities({
        eligibleTools: options.eligibleTools,
        mode: options.mode,
        loaded: new Set(),
      }).loadableIds
    );
    this.loaded = new Set(
      [...(options.remembered ?? [])].filter((id) => loadableIds.has(id))
    );
    for (const id of options.preloads ?? []) {
      if (!loadableIds.has(id)) continue;
      this.loaded.add(id);
      this.activated.add(id);
    }
    const domainLimit =
      options.domainLimit ??
      (options.eligibleTools.some((t) => t.function.name === "generate_resume")
        ? 8
        : 4);
    this.maxToolCalls = domainLimit + (options.mode === "progressive" ? 2 : 0);
    this.maxToolLoops = this.maxToolCalls;
  }
  runWithUsageContext<T>(work: () => T): T {
    return withLlmUsageContext(
      { ...this.options.usageContext, requestId: this.requestId },
      work
    );
  }
  isInternalTool(name: string) {
    return name === CAREER_CAPABILITY_LOADER;
  }
  resolveStep(record = true): CareerCapabilityStep {
    const promptArgs = this.options.promptArgs();
    if (promptArgs.careerCoachingActivity?.status === "active")
      this.loaded.add("career_coaching");
    const resolved = resolveCareerCapabilities({
      eligibleTools: this.options.eligibleTools.filter(
        (tool) => !this.revokedTools.has(tool.function.name)
      ),
      mode: this.options.mode,
      loaded: this.loaded,
    });
    const systemBlocks = buildCareerConversationPromptPlan({
      ...promptArgs,
      ...(this.revokedTools.has("search_connected_gmail")
        ? { gmailCapability: "not_connected" as const }
        : {}),
      capabilities: resolved,
    }).promptBlocks;
    const step = { ...resolved, systemBlocks };
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
      };
      setCareerCapabilityUsageStep(metrics);
      this.options.onStep?.(metrics);
    }
    return step;
  }
  claimCall(name: string, step: CareerCapabilityStep): string | null {
    const loader = this.isInternalTool(name);
    if (loader) this.loaderCalls++;
    else this.domainCalls++;
    const domainLimit =
      this.maxToolCalls - (this.options.mode === "progressive" ? 2 : 0);
    const error =
      (loader && this.loaderCalls > 2) ||
      (!loader && this.domainCalls > domainLimit)
        ? "tool_budget_exhausted"
        : !step.offeredNames.has(name) || this.revokedTools.has(name)
          ? "tool_not_offered"
          : null;
    if (error)
      this.options.onEvent?.({ event: "call_rejected", tool: name, error });
    return error;
  }
  load(input: Record<string, unknown>, step: CareerCapabilityStep) {
    const ids = input.capabilityIds;
    if (
      Object.keys(input).length !== 1 ||
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > step.loadableIds.length ||
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
    };
  }
  async recordResult(
    name: string,
    result: unknown,
    step: CareerCapabilityStep
  ) {
    // These are executor-owned authorization states, not conversational routing.
    const status =
      result && typeof result === "object" && "status" in result
        ? result.status
        : null;
    if (
      name === "search_connected_gmail" &&
      (status === "connection_required" || status === "connection_expired")
    )
      this.revokedTools.add(name);
    this.options.onEvent?.({
      event: "tool_result",
      tool: name,
      successful: isSuccessfulCareerToolResult(result),
    });
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
    } catch {
      console.warn("[career-capabilities] context refresh failed", {
        tool: name,
      });
    }
  }
  completedRecord(): CareerCapabilityTurnRecord {
    return {
      version: 1,
      status: "completed",
      mode: this.options.mode,
      activated: this.options.mode === "full" ? [] : [...this.activated],
      used: this.options.mode === "full" ? [] : [...this.used],
    };
  }
}
