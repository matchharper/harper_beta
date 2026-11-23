import { formatTalentMessageContentForLlmPrompt } from "./opportunityFeedbackNote";
import { fitCareerInputForModel } from "./modelInputFit";

/**
 * Server-side model projection of a saved message. Same as the shared
 * formatter, except that a message larger than one model input (a pasted
 * page, a long email) is reduced to what fits, with that fact stated. The
 * saved row is unchanged. Kept separate from the shared formatter because
 * that module is also bundled into the chat UI, which must not load the
 * tokenizer.
 */
export function formatTalentMessageContentForModel(
  ...args: Parameters<typeof formatTalentMessageContentForLlmPrompt>
) {
  return fitCareerInputForModel(formatTalentMessageContentForLlmPrompt(...args));
}
