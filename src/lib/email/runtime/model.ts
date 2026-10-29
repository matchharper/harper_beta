import {
  isCareerTextChatModelId,
  resolveCareerTextChatModel,
} from "@/lib/career/textChatModelConfig";
import { CLAUDE_HAIKU_MODEL } from "@/lib/llm/modelConfig";
import { isOpsEmailTest } from "./opsTest";
import { asObject, type EmailRow } from "./types";

export const EMAIL_ASSISTANT_MODEL = CLAUDE_HAIKU_MODEL;

export function emailAssistantModel(job?: EmailRow) {
  const override = job && isOpsEmailTest(job)
    ? asObject(asObject(job.metadata).opsEmailTest).model
    : undefined;
  const model = typeof override === "string" && override.trim()
    ? override.trim()
    : EMAIL_ASSISTANT_MODEL;
  // Keep known reasoning defaults, but forward custom IDs to the existing
  // provider router without the Career model selector's default substitution.
  const config = isCareerTextChatModelId(model)
    ? resolveCareerTextChatModel(model)
    : undefined;
  return {
    primaryModel: model,
    chatCompletionReasoningEffort: config?.chatCompletionReasoningEffort,
    openAIResponsesReasoningEffort: config?.openAIResponsesReasoningEffort,
  };
}
