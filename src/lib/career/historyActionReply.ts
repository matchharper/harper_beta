import { runCareerChatTurn } from "@/lib/career/chatTurn";
import { CAREER_LLM_CONFIG } from "@/lib/career/llm";
import {
  buildCareerOpportunityFeedbackFollowUpTurnInstruction,
  CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER,
  type CareerOpportunityFeedbackFollowUpTrigger,
} from "@/lib/career/prompts";
import { partitionOpportunityFeedbackReasons } from "@/lib/career/opportunityFeedbackSignals";
import {
  buildOpportunityFeedbackActivitySummary,
  fetchPendingOpportunityFeedbackActivityItems,
  formatOpportunityFeedbackPromptContext,
  type TalentOpportunityFeedbackActivityItem,
} from "@/lib/talentOnboarding/activityEvents";
import {
  fetchTalentSetting,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/server";
import {
  fetchTalentOpportunityHistoryByIds,
  type TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";

type TalentOpportunityFeedbackAction = "negative" | "positive";

export type TalentOpportunityFeedbackReplyTrigger =
  CareerOpportunityFeedbackFollowUpTrigger;

async function assertConversationAccess(args: {
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_conversations")
    .select("id")
    .eq("id", args.conversationId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read conversation");
  }
  if (!data) {
    throw new Error("Conversation not found");
  }
}

function toFeedbackActivityItem(args: {
  action: TalentOpportunityFeedbackAction;
  feedbackReason?: string | null;
  opportunity: TalentOpportunityHistoryItem;
}): TalentOpportunityFeedbackActivityItem {
  const reasonSignals = partitionOpportunityFeedbackReasons(
    args.feedbackReason
  );
  return {
    action: args.action,
    createdAt: new Date().toISOString(),
    eventId: `current:${args.opportunity.id}`,
    fitSummary: reasonSignals.isOperationalOnly
      ? null
      : args.opportunity.recommendationSummary,
    hasFeedbackReason: reasonSignals.hasReason,
    operationalFeedbackKinds: reasonSignals.operationalKinds,
    summary: buildOpportunityFeedbackActivitySummary({
      action: args.action,
      feedbackReason: args.feedbackReason,
      opportunity: args.opportunity,
    }),
  };
}

export async function createTalentOpportunityFeedbackFollowUpReply(args: {
  action?: TalentOpportunityFeedbackAction | null;
  admin: TalentAdminClient;
  allowedToolNames?: readonly string[] | null;
  conversationId: string | null;
  feedbackReason?: string | null;
  isMobile?: boolean | null;
  opportunity?: TalentOpportunityHistoryItem | null;
  opportunityId?: string | null;
  trigger: TalentOpportunityFeedbackReplyTrigger;
  userId: string;
}) {
  const conversationId = String(args.conversationId ?? "").trim();
  if (!conversationId) return null;

  await assertConversationAccess({
    admin: args.admin,
    conversationId,
    userId: args.userId,
  });

  const [pendingItems, talentSetting] = await Promise.all([
    fetchPendingOpportunityFeedbackActivityItems({
      admin: args.admin,
      conversationId,
      limit: 10,
      userId: args.userId,
    }),
    fetchTalentSetting({
      admin: args.admin,
      userId: args.userId,
    }),
  ]);
  const requestedOpportunityId = String(args.opportunityId ?? "").trim();
  const opportunity =
    args.opportunity ??
    (requestedOpportunityId
      ? ((
          await fetchTalentOpportunityHistoryByIds({
            admin: args.admin,
            ids: [requestedOpportunityId],
            locale: talentSetting?.preferred_locale ?? null,
            userId: args.userId,
          })
        )[0] ?? null)
      : null);
  const fallbackItem =
    opportunity && args.action
      ? toFeedbackActivityItem({
          action: args.action,
          feedbackReason: args.feedbackReason,
          opportunity,
        })
      : null;
  let fallbackPendingIndex = -1;
  if (fallbackItem) {
    for (let index = pendingItems.length - 1; index >= 0; index -= 1) {
      if (pendingItems[index]?.summary === fallbackItem.summary) {
        fallbackPendingIndex = index;
        break;
      }
    }
  }
  const usingFallbackOnly = pendingItems.length === 0 && Boolean(fallbackItem);
  const items =
    pendingItems.length > 0
      ? fallbackItem && fallbackPendingIndex < 0
        ? [...pendingItems, fallbackItem]
        : fallbackItem
          ? pendingItems.map((item, index) =>
              index === fallbackPendingIndex ? fallbackItem : item
            )
          : pendingItems
      : fallbackItem
        ? [fallbackItem]
        : [];
  if (items.length === 0) return null;

  const feedbackContext = formatOpportunityFeedbackPromptContext(items);
  const proactiveContext =
    buildCareerOpportunityFeedbackFollowUpTurnInstruction({
      preferredLocale: talentSetting?.preferred_locale ?? null,
      trigger: args.trigger,
    });

  const result = await runCareerChatTurn({
    allowedToolNames: args.allowedToolNames,
    admin: args.admin,
    conversationId,
    isMobile: args.isMobile,
    pendingOpportunityFeedbackContext: feedbackContext,
    proactiveContext,
    ...(args.trigger ===
      CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER.DelayedExternalFeedback ||
    args.trigger ===
      CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER.AllRecommendedOpportunitiesCleared
      ? {
          assistantModel:
            CAREER_LLM_CONFIG.chat.opportunityFeedbackFollowUp.model,
          assistantOpenAIResponsesReasoningEffort:
            CAREER_LLM_CONFIG.chat.opportunityFeedbackFollowUp.reasoningEffort,
        }
      : {}),
    usageLabel: "career/chat:opportunity_feedback_followup",
    shouldInsertAssistantMessage: usingFallbackOnly
      ? undefined
      : async () => {
          const latestPendingItems =
            await fetchPendingOpportunityFeedbackActivityItems({
              admin: args.admin,
              conversationId,
              limit: 10,
              userId: args.userId,
            });
          return latestPendingItems.length > 0;
        },
    userId: args.userId,
  });

  return result.assistantMessage;
}
