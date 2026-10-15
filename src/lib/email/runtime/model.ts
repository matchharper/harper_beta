import { resolveCareerTextChatModel } from "@/lib/career/textChatModelConfig";
import { CLAUDE_HAIKU_MODEL } from "@/lib/llm/modelConfig";

export const EMAIL_ASSISTANT_MODEL = CLAUDE_HAIKU_MODEL;

export function emailAssistantModel() {
  const config = resolveCareerTextChatModel(EMAIL_ASSISTANT_MODEL);
  return {
    primaryModel: config.model,
    chatCompletionReasoningEffort: config.chatCompletionReasoningEffort,
    openAIResponsesReasoningEffort: config.openAIResponsesReasoningEffort,
  };
}
