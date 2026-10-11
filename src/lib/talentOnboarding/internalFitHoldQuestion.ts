import type { TalentAdminClient } from "./admin";
import type { InternalFitReevaluationTopic } from "./internalFitQuestionTopics";

// Compatibility for old task references. Questions now originate in candidate
// contact selection; an old fit row is never a live question or an answer target.
export type ActiveInternalFitHoldQuestion = {
  fitId: string;
  fitIds: string[];
  summary: string;
  topic: InternalFitReevaluationTopic;
};

export async function fetchActiveInternalFitHoldQuestion(_args: {
  admin: TalentAdminClient;
  locale?: string | null;
  userId: string;
}): Promise<ActiveInternalFitHoldQuestion | null> {
  return null;
}

// A stale client may still invoke the retired tool. Do not fan an answer out to
// role-specific criteria or call a hidden classifier. The conversation model
// saves only confirmed facts, with their scope, using the common context tool.
export async function recordInternalFitReevaluationInformation(_args: {
  admin: TalentAdminClient;
  conversationId?: string | null;
  fitId: string;
  newInformation: string;
  source: string;
  userId: string;
  userMessageId?: number | string | null;
}) {
  return {
    ok: false,
    reason: "retired_tool",
    assistantInstruction: "Use the actual conversation and, if needed, read_talent_activity_events(scope=contacts) to resolve which question was answered. Save confirmed facts through write_talent_context, preserving any role-specific scope. No information was saved by this call.",
  };
}
