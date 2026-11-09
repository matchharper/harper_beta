import {
  SOL_CHAT_PRESETS,
  getSolChatPreset,
  CLAUDE_HAIKU_MODEL,
  CLAUDE_MODEL,
  GPT_6_LUNA_MODEL,
  GPT_61_TERRA_MODEL,
  OPENROUTER_GLM_53_FLASH_MODEL,
  OPENROUTER_MUSE_SPARK_13_MODEL,
} from "@/lib/llm/modelConfig";
import type { ChatCompletionReasoningEffort } from "@/lib/llm/llm";
import type { OpenAIResponsesReasoningEffort } from "@/lib/llm/responsesChatAdapter";

export const CAREER_TEXT_CHAT_MODEL_IDS = [
  CLAUDE_MODEL,
  CLAUDE_HAIKU_MODEL,
  OPENROUTER_GLM_53_FLASH_MODEL,
  OPENROUTER_MUSE_SPARK_13_MODEL,
  GPT_6_LUNA_MODEL,
  ...SOL_CHAT_PRESETS.map((preset) => preset.id),
  GPT_61_TERRA_MODEL,
] as const;

export type CareerTextChatModelId = (typeof CAREER_TEXT_CHAT_MODEL_IDS)[number];

export const CAREER_TEXT_CHAT_MODEL_HEADER = "x-career-text-chat-model";

export const DEFAULT_CAREER_TEXT_CHAT_MODEL: CareerTextChatModelId =
  GPT_61_TERRA_MODEL;

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
  if (model === OPENROUTER_MUSE_SPARK_13_MODEL) {
    return {
      chatCompletionReasoningEffort: "xhigh",
      model,
    };
  }
  if (model === GPT_6_LUNA_MODEL) {
    return {
      model,
      openAIResponsesReasoningEffort: "xhigh",
    };
  }
  const preset = getSolChatPreset(model);
  if (preset) return { model, openAIResponsesReasoningEffort: preset.effort };
  if (model === GPT_61_TERRA_MODEL) {
    return {
      model,
      openAIResponsesReasoningEffort: "high",
    };
  }
  return { model };
}

export function resolveCareerTextChatModelForRequest(
  value: unknown,
  canOverride: boolean
) {
  return resolveCareerTextChatModel(
    canOverride && isCareerTextChatModelId(value)
      ? value
      : DEFAULT_CAREER_TEXT_CHAT_MODEL
  );
}

export function careerTextAssistantModelOptions(value: unknown) {
  const { model, ...reasoning } = resolveCareerTextChatModel(value);
  return { primaryModel: model, ...reasoning };
}

/** Read only the server-resolved model saved with the original user turn. */
export function readCareerSourceTextChatModel(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const model = (payload as Record<string, unknown>).careerTextChatModel;
  return isCareerTextChatModelId(model) ? resolveCareerTextChatModel(model) : undefined;
}
