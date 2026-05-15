import { OpportunityType } from "@/lib/opportunityType";
import { runCareerChatTurn } from "@/lib/career/chatTurn";
import { runCareerHistoryActionReply } from "@/lib/career/llm";
import {
  buildCareerHistoryActionReplySystemPrompt,
  buildCareerHistoryActionReplyUserPrompt,
  buildCareerOpportunityFeedbackFollowUpTurnInstruction,
  type CareerHistoryActionReplyAction,
  type CareerOpportunityFeedbackFollowUpResponseMode,
  type CareerOpportunityFeedbackFollowUpTrigger,
} from "@/lib/career/prompts";
import {
  fetchPendingOpportunityFeedbackActivityItems,
  formatOpportunityFeedbackPromptContext,
  type TalentOpportunityFeedbackActivityItem,
} from "@/lib/talentOnboarding/activityEvents";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import {
  buildTalentProfileContext,
  fetchRecentMessages,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  type TalentAdminClient,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import type { TalentOpportunityHistoryItem } from "@/lib/talentOpportunity";

export type TalentOpportunityActionReplyAction = CareerHistoryActionReplyAction;

export type TalentOpportunityFeedbackReplyTrigger =
  CareerOpportunityFeedbackFollowUpTrigger;

const MAX_TEXT = 2200;

const truncate = (value: string | null | undefined, max = MAX_TEXT) => {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trim()}...`;
};

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

const toResponseMessage = (item: TalentMessageRow) => ({
  id: item.id,
  role: item.role,
  content: item.content,
  messageType: item.message_type ?? "chat",
  createdAt: item.created_at,
});

const buildRecentConversationContext = (messages: TalentMessageRow[]) =>
  messages
    .map((message) => {
      const speaker = message.role === "assistant" ? "Harper" : "User";
      const content = formatTalentMessageContentForLlmPrompt(message).replace(
        /\s+/g,
        " "
      );
      return `${speaker}: ${truncate(content, 500)}`;
    })
    .join("\n\n");

const getFeedbackFollowUpResponseMode = (args: {
  items: readonly TalentOpportunityFeedbackActivityItem[];
  trigger: TalentOpportunityFeedbackReplyTrigger;
}): CareerOpportunityFeedbackFollowUpResponseMode => {
  if (args.trigger === "immediate_internal_feedback") return "use_judgment";
  if (args.items.length === 0) return "wrap_up_preferred";

  const signature = [
    args.trigger,
    ...args.items.map((item) =>
      [
        item.eventId,
        item.opportunityId,
        item.action,
        item.companyName,
        item.title,
        item.feedbackReason,
      ].join(":")
    ),
  ].join("|");
  let hash = 0;
  for (let index = 0; index < signature.length; index += 1) {
    hash = (hash * 31 + signature.charCodeAt(index)) >>> 0;
  }

  return hash % 2 === 0 ? "question_preferred" : "wrap_up_preferred";
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

export async function createTalentOpportunityActionReply(args: {
  action: TalentOpportunityActionReplyAction;
  admin: TalentAdminClient;
  conversationId: string | null;
  feedbackReason?: string | null;
  opportunity: TalentOpportunityHistoryItem | null;
  userId: string;
  userQuestion?: string | null;
}) {
  const conversationId = String(args.conversationId ?? "").trim();
  const opportunity = args.opportunity;

  if (
    !conversationId ||
    !opportunity ||
    opportunity.opportunityType !== OpportunityType.InternalRecommendation
  ) {
    return null;
  }

  await assertConversationAccess({
    admin: args.admin,
    conversationId,
    userId: args.userId,
  });

  const [profile, talentSetting, talentInsights, recentMessages] =
    await Promise.all([
      fetchTalentUserProfile({ admin: args.admin, userId: args.userId }),
      fetchTalentSetting({ admin: args.admin, userId: args.userId }),
      fetchTalentInsights({ admin: args.admin, userId: args.userId }),
      fetchRecentMessages({
        admin: args.admin,
        conversationId,
        limit: 10,
      }),
    ]);
  const structuredProfile = await fetchTalentStructuredProfile({
    admin: args.admin,
    userId: args.userId,
    talentUser: profile,
  });
  const profileContext = buildTalentProfileContext({
    profile,
    structuredProfile,
    setting: talentSetting,
    maxResumeChars: 2000,
  });
  const assistantContent = (
    await runCareerHistoryActionReply({
      messages: [
        {
          role: "system",
          content: buildCareerHistoryActionReplySystemPrompt(),
        },
        {
          role: "user",
          content: buildCareerHistoryActionReplyUserPrompt({
            action: args.action,
            feedbackReason: parseFeedbackReason(
              args.feedbackReason ?? opportunity.feedbackReason
            ),
            opportunity,
            profileContext,
            recentConversationContext:
              buildRecentConversationContext(recentMessages),
            talentInsights: talentInsights?.content ?? null,
            userQuestion: args.userQuestion ?? null,
          }),
        },
      ],
    })
  ).trim();

  if (!assistantContent) {
    return null;
  }

  const { data: insertedMessage, error: insertError } = await args.admin
    .from("talent_messages")
    .insert({
      conversation_id: conversationId,
      user_id: args.userId,
      role: "assistant",
      content: assistantContent,
      message_type: "chat",
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(insertError.message ?? "Failed to insert assistant reply");
  }

  return toResponseMessage(insertedMessage as TalentMessageRow);
}

function toFeedbackActivityItem(args: {
  action: TalentOpportunityActionReplyAction;
  feedbackReason?: string | null;
  opportunity: TalentOpportunityHistoryItem;
}): TalentOpportunityFeedbackActivityItem | null {
  if (args.action !== "positive" && args.action !== "negative") return null;

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
  action?: TalentOpportunityActionReplyAction | null;
  admin: TalentAdminClient;
  conversationId: string | null;
  feedbackReason?: string | null;
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

  const pendingItems = await fetchPendingOpportunityFeedbackActivityItems({
    admin: args.admin,
    conversationId,
    limit: 10,
    userId: args.userId,
  });
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
  const responseMode = getFeedbackFollowUpResponseMode({
    items,
    trigger: args.trigger,
  });
  const result = await runCareerChatTurn({
    admin: args.admin,
    conversationId,
    pendingOpportunityFeedbackContext: feedbackContext,
    proactiveContext: buildCareerOpportunityFeedbackFollowUpTurnInstruction({
      responseMode,
      trigger: args.trigger,
    }),
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
