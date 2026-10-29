import type { InternalCallVoiceContext } from "./liveSessionUpdates";
import "server-only";
import { getCareerLiveSessionConfig } from "./llm";
import { buildLiveFrontendInstructions } from "./voiceSessionInstructions";
import type { resolveCareerRealtimeTools } from "./llmTools";

/** WebRTC and phone transports share the identical model, prompts and tools. */
export function buildCareerLiveSessionConfig(args: {
  openingInstruction: string;
  responseLocale?: string | null;
  isMockInterview: boolean;
  onboardingContext?: string | null;
  internalCallContext?: InternalCallVoiceContext | null;
  backendInstructions: string;
  tools: ReturnType<typeof resolveCareerRealtimeTools>["tools"];
}) {
  const config = getCareerLiveSessionConfig();
  return {
    model: config.model,
    audio: { output: { voice: config.voice } },
    instructions: buildLiveFrontendInstructions({
      initialResponseInstruction: args.openingInstruction,
      responseLocale: args.responseLocale,
      isMockInterview: args.isMockInterview,
      onboardingContext: args.onboardingContext,
      internalCallContext: args.internalCallContext?.text,
    }),
    delegation: {
      type: "responses" as const,
      responses: {
        model: config.delegationModel,
        instructions: args.backendInstructions,
        tools: args.tools,
        tool_choice: "auto" as const,
        parallel_tool_calls: false,
        reasoning: { effort: config.delegationReasoningEffort },
        text: { verbosity: "low" as const },
      },
    },
    store: false,
  };
}
