import {
  CLAUDE_MODEL,
  GPT_56_LUNA_MODEL,
  OPENROUTER_GLM_53_FLASH_MODEL,
} from "@/lib/llm/modelConfig";
import type { ChatCompletionReasoningEffort } from "@/lib/llm/llm";
import type { OpenAIResponsesReasoningEffort } from "@/lib/llm/responsesChatAdapter";

export const CAREER_TEXT_CHAT_MODEL_IDS = [
  CLAUDE_MODEL,
  OPENROUTER_GLM_53_FLASH_MODEL,
  GPT_56_LUNA_MODEL,
] as const;

export type CareerTextChatModelId = (typeof CAREER_TEXT_CHAT_MODEL_IDS)[number];

export const DEFAULT_CAREER_TEXT_CHAT_MODEL: CareerTextChatModelId =
  CLAUDE_MODEL;

export function isCareerTextChatModelId(
  value: unknown
): value is CareerTextChatModelId {
  return (
    typeof value === "string" &&
    CAREER_TEXT_CHAT_MODEL_IDS.includes(value as CareerTextChatModelId)
  );
}

export function resolveCareerTextChatModel(value: unknown): {
  chatCompletionReasoningEffort?: ChatCompletionReasoningEffort;
  model: CareerTextChatModelId;
  openAIResponsesReasoningEffort?: OpenAIResponsesReasoningEffort;
} {
  const model = isCareerTextChatModelId(value)
    ? value
    : DEFAULT_CAREER_TEXT_CHAT_MODEL;

  if (model === OPENROUTER_GLM_53_FLASH_MODEL) {
    return {
      chatCompletionReasoningEffort: "high",
      model,
    };
  }
  if (model === GPT_56_LUNA_MODEL) {
    return {
      model,
      openAIResponsesReasoningEffort: "xhigh",
    };
  }
  return { model };
}

export function resolveCareerTextChatModelForRequest(
  value: unknown,
  canOverride: boolean
) {
  return resolveCareerTextChatModel(canOverride ? value : null);
}
