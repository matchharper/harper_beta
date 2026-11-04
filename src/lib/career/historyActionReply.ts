import { runCareerChatTurn } from "@/lib/career/chatTurn";
import { CLAUDE_HAIKU_MODEL } from "@/lib/llm/modelConfig";
import type { CareerTextChatModelId } from "./textChatModelConfig";
import {
  buildCareerOpportunityFeedbackFollowUpTurnInstruction,
  CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER,
  type CareerOpportunityFeedbackFollowUpTrigger,
} from "@/lib/career/prompts";
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
import { CAREER_FEEDBACK_SILENT, careerFeedbackReplyId, formatSavedOpportunityDecision } from "./opportunityFeedbackEvent";
import { dispatchCareerCheckpoint } from "./agentContinuation";
import { deferBusyCareerAgentReply } from "./agentReplyQueue";
import { CareerAgentReplyUnavailable } from "./agentReplyError";
import { CareerReplyContinuation } from "./capabilities/runtime";
import {
  fetchLatestUserAuthoredChatMessageId,
  hasUserAuthoredChatMessageAfter,
} from "@/lib/career/opportunityFeedbackFollowUpGuard";

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
  return {
    action: args.action,
    createdAt: args.opportunity.feedbackAt ?? new Date().toISOString(),
    eventId: `current:${args.opportunity.id}`,
    fitSummary: args.opportunity.recommendationSummary,
    hasFeedbackReason: Boolean(args.feedbackReason),
    summary: buildOpportunityFeedbackActivitySummary({
      action: args.action,
      feedbackReason: args.feedbackReason,
      opportunity: args.opportunity,
    }),
  };
}

const feedbackDependencies = {
  pending: fetchPendingOpportunityFeedbackActivityItems,
  setting: fetchTalentSetting,
  opportunities: fetchTalentOpportunityHistoryByIds,
  latestUser: fetchLatestUserAuthoredChatMessageId,
  userAfter: hasUserAuthoredChatMessageAfter,
  run: runCareerChatTurn,
  dispatch: dispatchCareerCheckpoint,
  defer: deferBusyCareerAgentReply,
};

export async function createTalentOpportunityFeedbackFollowUpReply(args: {
  textChatModel?: CareerTextChatModelId;
  action?: TalentOpportunityFeedbackAction | null;
  admin: TalentAdminClient;
  conversationId: string | null;
  feedbackReason?: string | null;
  isMobile?: boolean | null;
  opportunity?: TalentOpportunityHistoryItem | null;
  opportunityId?: string | null;
  trigger: TalentOpportunityFeedbackReplyTrigger;
  userId: string;
}, dependencies: Partial<typeof feedbackDependencies> = {}) {
  const deps = { ...feedbackDependencies, ...dependencies };
  const conversationId = String(args.conversationId ?? "").trim();
  if (!conversationId) return null;

  await assertConversationAccess({
    admin: args.admin,
    conversationId,
    userId: args.userId,
  });

  const [pendingItems, talentSetting] = await Promise.all([
    deps.pending({
      admin: args.admin,
      conversationId,
      limit: 10,
      userId: args.userId,
    }),
    deps.setting({
      admin: args.admin,
      userId: args.userId,
    }),
  ]);
  const requestedOpportunityId = String(args.opportunityId ?? "").trim();
  const opportunity =
    args.opportunity ??
    (requestedOpportunityId
      ? ((
          await deps.opportunities({
            admin: args.admin,
            ids: [requestedOpportunityId],
            locale: talentSetting?.preferred_locale ?? null,
            userId: args.userId,
          })
        )[0] ?? null)
      : null);
  const fallbackItem =
    opportunity && (opportunity.feedback === "positive" || opportunity.feedback === "negative")
      ? toFeedbackActivityItem({
          action: opportunity.feedback as TalentOpportunityFeedbackAction,
          feedbackReason: opportunity.feedbackReason,
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

  const latestFeedbackCreatedAt = items.reduce(
    (latest, item) =>
      !latest || item.createdAt > latest ? item.createdAt : latest,
    ""
  );
  const latestUserMessageIdBeforeGeneration =
    await deps.latestUser({
      admin: args.admin,
      conversationId,
      userId: args.userId,
    });
  if (
    latestFeedbackCreatedAt &&
    (await deps.userAfter({
      admin: args.admin,
      after: latestFeedbackCreatedAt,
      conversationId,
      userId: args.userId,
    }))
  ) {
    return null;
  }

  const feedbackContext = [formatOpportunityFeedbackPromptContext(items), formatSavedOpportunityDecision(opportunity)].filter(Boolean).join("\n\n");
  // The complete event context travels with a checkpoint; a child completion
  // resumes this same original agent rather than another feedback writer.
  const proactiveContext = [buildCareerOpportunityFeedbackFollowUpTurnInstruction({
    preferredLocale: talentSetting?.preferred_locale ?? null, trigger: args.trigger,
  }), feedbackContext].join("\n\n");
  const agentReplyId = careerFeedbackReplyId(conversationId, opportunity, items);
  const assistantModel = opportunity?.sourceType === "external" ||
    (!opportunity && args.trigger === CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER.DelayedExternalFeedback)
    ? CLAUDE_HAIKU_MODEL : undefined;
  const job = { userId: args.userId, conversationId, replyId: agentReplyId, proactiveContext, noMessageMarker: CAREER_FEEDBACK_SILENT, textChatModel: args.textChatModel, assistantModel };
  try {
  const result = await deps.run({
    assistantModel,
    textChatModel: args.textChatModel,
    admin: args.admin,
    conversationId,
    isMobile: args.isMobile,
    agentReplyId,
    pendingOpportunityFeedbackContext: "",
    proactiveContext,
    noMessageMarker: CAREER_FEEDBACK_SILENT,
    suppressOnboarding: true,
    onAgentCheckpoint: async checkpoint => {
      await deps.dispatch({ admin: args.admin, userId: args.userId, conversationId, checkpoint });
    },
    usageLabel: "career/chat:opportunity_feedback",
    shouldInsertAssistantMessage: async () => {
      const [latestPendingItems, latestUserMessageId] = await Promise.all([
        usingFallbackOnly
          ? Promise.resolve(items)
          : deps.pending({
              admin: args.admin,
              conversationId,
              limit: 10,
              userId: args.userId,
            }),
        deps.latestUser({
          admin: args.admin,
          conversationId,
          userId: args.userId,
        }),
      ]);
      return (
        latestPendingItems.length > 0 &&
        latestUserMessageId === latestUserMessageIdBeforeGeneration
      );
    },
    userId: args.userId,
  });

  return result.assistantMessage;
  } catch (error) {
    if (error instanceof CareerReplyContinuation || (error instanceof CareerAgentReplyUnavailable && error.completed)) return null;
    if (await deps.defer(error, job)) return null;
    throw error;
  }
}
