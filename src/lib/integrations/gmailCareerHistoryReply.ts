import "server-only";

import { runCareerChatTurn } from "@/lib/career/chatTurn";
import { CAREER_LLM_CONFIG } from "@/lib/career/llm";
import { buildGmailCareerHistoryFollowUpInstruction } from "@/lib/integrations/gmailCareerHistoryReplyCore";
import type { GmailCareerMemoryEntry } from "@/lib/integrations/gmailCareerHistoryCore";
import {
  toTalentMessageResponse,
  type TalentAdminClient,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";

export const GMAIL_CAREER_HISTORY_FOLLOW_UP_MESSAGE_TYPE =
  "gmail_career_history_followup";

async function fetchExistingFollowUp(args: {
  admin: TalentAdminClient;
  conversationId: string;
  runStartedAt: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_messages")
    .select("*")
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .eq("message_type", GMAIL_CAREER_HISTORY_FOLLOW_UP_MESSAGE_TYPE)
    .gte("created_at", args.runStartedAt)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to inspect Gmail follow-up");
  }
  return data ? (data as TalentMessageRow) : null;
}

export async function createGmailCareerHistoryFollowUpReply(args: {
  admin: TalentAdminClient;
  entries: GmailCareerMemoryEntry[];
  runStartedAt: string;
  userId: string;
}) {
  const { data: conversation, error: conversationError } = await args.admin
    .from("talent_conversations")
    .select("id")
    .eq("user_id", args.userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conversationError) {
    throw new Error(
      conversationError.message ?? "Failed to read latest conversation"
    );
  }
  if (!conversation) return null;

  const existing = await fetchExistingFollowUp({
    admin: args.admin,
    conversationId: conversation.id,
    runStartedAt: args.runStartedAt,
    userId: args.userId,
  });
  if (existing) return toTalentMessageResponse(existing);

  const result = await runCareerChatTurn({
    admin: args.admin,
    allowedToolNames: [],
    assistantMessageType: GMAIL_CAREER_HISTORY_FOLLOW_UP_MESSAGE_TYPE,
    assistantModel: CAREER_LLM_CONFIG.chat.gmailCareerHistoryFollowUp.model,
    assistantOpenAIResponsesReasoningEffort:
      CAREER_LLM_CONFIG.chat.gmailCareerHistoryFollowUp.reasoningEffort,
    assistantTemperature: 0.3,
    conversationId: conversation.id,
    pendingOpportunityFeedbackContext: "",
    proactiveContext: buildGmailCareerHistoryFollowUpInstruction(args.entries),
    shouldInsertAssistantMessage: async () =>
      !(await fetchExistingFollowUp({
        admin: args.admin,
        conversationId: conversation.id,
        runStartedAt: args.runStartedAt,
        userId: args.userId,
      })),
    skipConversationWrites: true,
    suppressOnboarding: true,
    usageLabel: "career/chat:gmail_career_history_followup",
    userId: args.userId,
  });

  return result.assistantMessage;
}
