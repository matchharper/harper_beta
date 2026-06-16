import { runCareerChatTurn } from "@/lib/career/chatTurn";
import {
  buildCareerOpportunityFeedbackFollowUpTurnInstruction,
  type CareerOpportunityFeedbackFollowUpTrigger,
} from "@/lib/career/prompts";
import {
  attachInternalOpportunityCallRequestToMessage,
  buildInternalOpportunityCallProactiveInstruction,
  type InternalOpportunityCallRequest,
} from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import {
  fetchPendingOpportunityFeedbackActivityItems,
  formatOpportunityFeedbackPromptContext,
  type TalentOpportunityFeedbackActivityItem,
} from "@/lib/talentOnboarding/activityEvents";
import {
  fetchTalentSetting,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/server";
import type { TalentOpportunityHistoryItem } from "@/lib/talentOpportunity";

type TalentOpportunityFeedbackAction = "negative" | "positive";

export type TalentOpportunityFeedbackReplyTrigger =
  CareerOpportunityFeedbackFollowUpTrigger;

const parseFeedbackReason = (value: string | null) => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as {
      customReason?: unknown;
      selectedOptions?: unknown;
    };
    const selectedOptions = Array.isArray(parsed.selectedOptions)
      ? parsed.selectedOptions
          .map((item) => String(item).trim())
          .filter(Boolean)
      : [];
    const customReason =
      typeof parsed.customReason === "string" ? parsed.customReason.trim() : "";

    return [...selectedOptions, customReason].filter(Boolean).join(" / ");
  } catch {
    return value.trim() || null;
  }
};

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
  return {
    action: args.action,
    companyName: args.opportunity.companyName,
    eventId: `current:${args.opportunity.id}`,
    feedbackReason: parseFeedbackReason(args.feedbackReason ?? null),
    href: args.opportunity.href,
    location: args.opportunity.location,
    occurredAt: new Date().toISOString(),
    opportunityId: args.opportunity.id,
    opportunityType: args.opportunity.opportunityType,
    recommendationConcerns: args.opportunity.recommendationConcerns,
    recommendationReasons: args.opportunity.recommendationReasons,
    recommendationSummary: args.opportunity.recommendationSummary,
    roleId: args.opportunity.roleId,
    sourceType: args.opportunity.sourceType,
    title: args.opportunity.title,
    workMode: args.opportunity.workMode,
  };
}

export async function createTalentOpportunityFeedbackFollowUpReply(args: {
  action?: TalentOpportunityFeedbackAction | null;
  admin: TalentAdminClient;
  allowedToolNames?: readonly string[] | null;
  conversationId: string | null;
  feedbackReason?: string | null;
  internalCallRequest?: InternalOpportunityCallRequest | null;
  isMobile?: boolean | null;
  opportunity?: TalentOpportunityHistoryItem | null;
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
  const fallbackItem =
    args.opportunity && args.action
      ? toFeedbackActivityItem({
          action: args.action,
          feedbackReason: args.feedbackReason,
          opportunity: args.opportunity,
        })
      : null;
  const hasFallbackInPending =
    fallbackItem?.opportunityId &&
    pendingItems.some(
      (item) => item.opportunityId === fallbackItem.opportunityId
    );
  const usingFallbackOnly = pendingItems.length === 0 && Boolean(fallbackItem);
  const items =
    pendingItems.length > 0
      ? fallbackItem && !hasFallbackInPending
        ? [...pendingItems, fallbackItem]
        : pendingItems
      : fallbackItem
        ? [fallbackItem]
        : [];
  if (items.length === 0) return null;

  const feedbackContext = formatOpportunityFeedbackPromptContext(items);
  const proactiveContext = [
    buildCareerOpportunityFeedbackFollowUpTurnInstruction({
      preferredLocale: talentSetting?.preferred_locale ?? null,
      trigger: args.trigger,
    }),
    buildInternalOpportunityCallProactiveInstruction(
      args.internalCallRequest ?? null
    ),
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
  const result = await runCareerChatTurn({
    allowedToolNames: args.allowedToolNames,
    admin: args.admin,
    conversationId,
    isMobile: args.isMobile,
    pendingOpportunityFeedbackContext: feedbackContext,
    proactiveContext,
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

  if (result.assistantMessage && args.internalCallRequest) {
    try {
      const content = await attachInternalOpportunityCallRequestToMessage({
        admin: args.admin,
        callRequest: args.internalCallRequest,
        content: result.assistantMessage.content,
        conversationId,
        messageId: result.assistantMessage.id,
        userId: args.userId,
      });
      return {
        ...result.assistantMessage,
        content,
      };
    } catch (error) {
      console.error("[career-history:internal-call-request-marker]", {
        error: error instanceof Error ? error.message : String(error),
        callRequestId: args.internalCallRequest.id,
        conversationId,
        userId: args.userId,
      });
    }
  }

  return result.assistantMessage;
}
