import { OpportunityType } from "@/lib/opportunityType";
import { runCareerHistoryActionReply } from "@/lib/career/llm";
import {
  fetchPendingOpportunityFeedbackActivityItems,
  formatOpportunityFeedbackPromptContext,
  type TalentOpportunityFeedbackActivityItem,
} from "@/lib/talentOnboarding/activityEvents";
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

export type TalentOpportunityActionReplyAction =
  | "negative"
  | "positive"
  | "question";

export type TalentOpportunityFeedbackReplyTrigger =
  | "all_visible_feedback_submitted"
  | "delayed_external_feedback"
  | "immediate_internal_feedback";

type FeedbackFollowUpResponseMode =
  | "question_preferred"
  | "wrap_up_preferred"
  | "use_judgment";

const MAX_TEXT = 2200;

const truncate = (value: string | null | undefined, max = MAX_TEXT) => {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trim()}...`;
};

const stripHtml = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

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

const buildOpportunityContext = (item: TalentOpportunityHistoryItem) =>
  JSON.stringify(
    {
      companyName: item.companyName,
      companyDescription: truncate(item.companyDescription, 900),
      concerns: item.recommendationConcerns.map(stripHtml),
      location: item.location,
      recommendationReasons: item.recommendationReasons.map(stripHtml),
      recommendationSummary: truncate(item.recommendationSummary, 900),
      roleDescription: truncate(item.description, 1800),
      roleTitle: item.title,
      workMode: item.workMode,
    },
    null,
    2
  );

const buildRecentConversationContext = (messages: TalentMessageRow[]) =>
  messages
    .map((message) => {
      const speaker = message.role === "assistant" ? "Harper" : "User";
      return `${speaker}: ${truncate(message.content, 500)}`;
    })
    .join("\n\n");

const buildSystemPrompt = () =>
  [
    "You are Harper, an AI-native headhunter speaking to a Korean talent in a career chat.",
    "Write exactly one assistant chat message after the user takes an action on an internal company role recommendation.",
    "The message must be generated from the provided opportunity, talent profile, user action, and recent conversation context.",
    "",
    "Style rules:",
    "- Korean only. Natural, concise, not salesy.",
    "- 2-4 short sentences. No markdown headings. No bullet lists.",
    "- Use light inline markdown when helpful, especially **company**, **role**, or **direction** names.",
    "- Do not say you are an LLM. Do not mention prompts or internal data.",
    "- Do not copy a fixed template. Vary wording based on the role and candidate context.",
    "",
    "Action-specific rules:",
    "- positive: Acknowledge that the user accepted the connection. Say Harper will introduce the user as a relevant candidate to the company and help them receive contact. Ask one narrow follow-up question only if a concrete missing detail would materially help Harper represent the user better; otherwise close without a question.",
    "- negative: Acknowledge the rejection and say Harper will not proceed with this role. Ask at most one narrow calibration question. If possible, make it answerable with a short choice or one concrete condition.",
    "- question: Acknowledge that Harper will ask the company the user's exact question and report back. Do not ask another question unless a crucial clarification is needed; if clarification is needed, ask exactly one concrete clarification.",
    "",
    "Follow-up question quality:",
    "- The question must be specific to this role/company and, when possible, one specific candidate experience or preference.",
    "- Avoid broad questions like '어떤 역할 범위가 좋으세요?', '최근 성과를 알려주세요', '이 점은 어떠신가요?', or '어떤 조건이면 검토하시겠어요?'.",
    "- Prefer questions that can be answered in one sentence.",
    "- Do not invent facts that are not supported by the context.",
  ].join("\n");

const buildFeedbackFollowUpSystemPrompt = () =>
  [
    "You are Harper, an AI-native headhunter speaking to a Korean talent in a career chat.",
    "Write exactly one assistant chat message after the user clicked like/dislike on one or more recommended opportunities.",
    "Use the opportunity feedback context, talent profile, and recent conversation. The feedback context contains role/company details; do not reduce it to only counts.",
    "",
    "Style rules:",
    "- Korean only. Natural, concise, not salesy.",
    "- 1-3 short sentences. No markdown headings. No bullet lists.",
    "- Use light inline markdown when helpful, especially **company**, **role**, or **direction** names.",
    "- Do not say you are an LLM. Do not mention logs, timers, events, prompts, or internal data.",
    "- Do not overreact to one click. For multiple clicks, summarize the pattern once.",
    "- Questions are optional. Ask at most one concrete calibration question.",
    "- The user does not want every feedback reply to become an interview, but also does not want Harper to always close without asking. Balance between asking and wrapping up.",
    "- A question can be useful even when Harper can already act, if one specific answer would noticeably improve future matching.",
    "",
    "Response mode guidance:",
    "- If RESPONSE_MODE is `question_preferred`, ask one short, concrete calibration question when there is a useful non-repetitive question available. Still close without a question if any question would be generic, broad, or already answered.",
    "- If RESPONSE_MODE is `wrap_up_preferred`, acknowledge the signal and explain how Harper will adjust. Do not ask a question unless a missing detail is critical.",
    "- If RESPONSE_MODE is `use_judgment`, decide from the context.",
    "- Across delayed external feedback follow-ups, aim for a roughly even mix: about half should ask one good calibration question, about half should wrap up.",
    "",
    "Feedback-specific rules:",
    "- If several opportunities were disliked and no reasons were provided, acknowledge the count and ask what did not fit. Offer concrete choices such as role scope, company/domain, team style, seniority, location/work mode, or timing.",
    "- If the disliked opportunities share a visible company/domain/role/work-mode pattern, mention that pattern carefully as a hypothesis, not a fact.",
    '- If exactly one external opportunity was liked and there is no explicit user message asking for refinement, do not ask a question. Briefly acknowledge the saved interest, infer the visible direction if supported, and say Harper will keep sending similar matches. Example tone: "이 방향이 잘 맞으시는 것 같네요. 비슷한 분위기 매칭 계속 보내드릴게요."',
    "- If multiple external opportunities were liked, summarize the shared visible pattern and continue without a question unless the pattern is unclear or contradictory.",
    "- If internal connection/request opportunities were liked, acknowledge that Harper will proceed with the connection. Ask one narrow follow-up only if a concrete missing detail would materially help represent the talent better; otherwise close without a question.",
    "- If internal opportunities were rejected, say Harper will not proceed with those roles and ask one narrow calibration question.",
    "- If external opportunities were liked, treat them as saved interest and ask what similar opportunities Harper should keep finding only when the feedback set is mixed, unclear, or too broad to act on.",
    "- Do not invent facts beyond the provided context.",
  ].join("\n");

const buildUserPrompt = (args: {
  action: TalentOpportunityActionReplyAction;
  feedbackReason?: string | null;
  opportunity: TalentOpportunityHistoryItem;
  profileContext: string;
  recentConversationContext: string;
  talentInsights: unknown;
  userQuestion?: string | null;
}) =>
  [
    `USER_ACTION: ${args.action}`,
    args.userQuestion ? `USER_QUESTION: ${args.userQuestion}` : null,
    args.feedbackReason
      ? `FEEDBACK_REASON: ${parseFeedbackReason(args.feedbackReason)}`
      : null,
    "",
    "OPPORTUNITY:",
    buildOpportunityContext(args.opportunity),
    "",
    "TALENT_PROFILE:",
    truncate(args.profileContext, 3600),
    "",
    "TALENT_INSIGHTS:",
    truncate(JSON.stringify(args.talentInsights ?? {}, null, 2), 2200),
    "",
    "RECENT_CONVERSATION:",
    truncate(args.recentConversationContext, 2400),
    "",
    "Now write the assistant chat message only.",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");

const buildFeedbackFollowUpUserPrompt = (args: {
  feedbackContext: string;
  profileContext: string;
  recentConversationContext: string;
  responseMode: FeedbackFollowUpResponseMode;
  talentInsights: unknown;
  trigger: TalentOpportunityFeedbackReplyTrigger;
}) =>
  [
    `TRIGGER: ${args.trigger}`,
    `RESPONSE_MODE: ${args.responseMode}`,
    "",
    args.feedbackContext,
    "",
    "TALENT_PROFILE:",
    truncate(args.profileContext, 3600),
    "",
    "TALENT_INSIGHTS:",
    truncate(JSON.stringify(args.talentInsights ?? {}, null, 2), 2200),
    "",
    "RECENT_CONVERSATION:",
    truncate(args.recentConversationContext, 2400),
    "",
    "Now write the assistant chat message only.",
  ].join("\n");

const getFeedbackFollowUpResponseMode = (args: {
  items: readonly TalentOpportunityFeedbackActivityItem[];
  trigger: TalentOpportunityFeedbackReplyTrigger;
}): FeedbackFollowUpResponseMode => {
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
          content: buildSystemPrompt(),
        },
        {
          role: "user",
          content: buildUserPrompt({
            action: args.action,
            feedbackReason: args.feedbackReason ?? opportunity.feedbackReason,
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
  const feedbackContext = formatOpportunityFeedbackPromptContext(items);
  const responseMode = getFeedbackFollowUpResponseMode({
    items,
    trigger: args.trigger,
  });
  const assistantContent = (
    await runCareerHistoryActionReply({
      messages: [
        {
          role: "system",
          content: buildFeedbackFollowUpSystemPrompt(),
        },
        {
          role: "user",
          content: buildFeedbackFollowUpUserPrompt({
            feedbackContext,
            profileContext,
            recentConversationContext:
              buildRecentConversationContext(recentMessages),
            responseMode,
            talentInsights: talentInsights?.content ?? null,
            trigger: args.trigger,
          }),
        },
      ],
    })
  ).trim();

  if (!assistantContent) {
    return null;
  }

  if (!usingFallbackOnly) {
    const latestPendingItems = await fetchPendingOpportunityFeedbackActivityItems(
      {
        admin: args.admin,
        conversationId,
        limit: 10,
        userId: args.userId,
      }
    );
    if (latestPendingItems.length === 0) {
      return null;
    }
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
