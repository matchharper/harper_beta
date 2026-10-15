import { simpleReviewSchema } from "./simpleReview";
import {
  runTalentAssistantCompletion,
  type TalentCompletionMetadata,
} from "@/lib/talentOnboarding/llm";
import { GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";
import { simulationSchemaForInput } from "./structured";
import type { SimulationStepKey } from "./types";

// Reasoning and visible JSON share the provider's completion-token allowance.
// Review includes preparation items plus per-requirement coverage.
export const SIMULATION_TIMEOUT_MS = 420_000;
export function simulationCompletionBudget(
  key: SimulationStepKey,
  attempt: number
) {
  const base = key === "review" ? 18_000 : 12_000;
  return attempt > 1 ? base + 6_000 : base;
}
export async function completeSimulationStage(args: {
  key: SimulationStepKey;
  attempt: number;
  system: string;
  input: string;
  signal?: AbortSignal;
}) {
  let metadata: TalentCompletionMetadata | undefined;
  const startedAt = Date.now();
  const maxTokens = simulationCompletionBudget(args.key, args.attempt);
  const timeout = AbortSignal.timeout(150_000);
  const signal = args.signal
    ? AbortSignal.any([args.signal, timeout])
    : timeout;
  const text = await runTalentAssistantCompletion({
    primaryModel: GPT_6_LUNA_MODEL,
    abortSignal: signal,
    openAIResponsesReasoningEffort: "medium",
    temperature: 0.2,
    maxTokens,
    jsonMode: true,
    jsonSchema: {
      name: "application_simulation_stage",
      strict: true,
      schema:
        args.key === "review" && JSON.parse(args.input).workflowVersion >= 5
          ? simpleReviewSchema()
          : simulationSchemaForInput(args.key, JSON.parse(args.input)),
    },
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.input },
    ],
    usageLabel: `career_tool:simulate_application:${args.key}`,
    onCompletionMetadata: (value) => {
      metadata = value;
    },
  }).catch((error) => {
    if (signal.aborted) throw signal.reason;
    throw error;
  });
  console.info("[application-simulation] completion", {
    key: args.key,
    attempt: args.attempt,
    durationMs: Date.now() - startedAt,
    maxTokens,
    ...metadata,
    outputCharacters: text.length,
  });
  return {
    text,
    finishReason: metadata?.finishReason,
    completionTokens: metadata?.completionTokens,
  };
}
