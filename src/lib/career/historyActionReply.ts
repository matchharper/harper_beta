import { OpportunityType } from "@/lib/opportunityType";
import { runCareerHistoryActionReply } from "@/lib/career/llm";
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
    "- Do not say you are an LLM. Do not mention prompts or internal data.",
    "- Do not copy a fixed template. Vary wording based on the role and candidate context.",
    "",
    "Action-specific rules:",
    "- positive: Acknowledge interest. Say Harper will introduce the user as a relevant candidate to the company and help them receive contact. Then ask exactly one narrow follow-up question that helps Harper represent the user better.",
    "- negative: Acknowledge the rejection and say Harper will not proceed with this role. Ask at most one narrow calibration question. If possible, make it answerable with a short choice or one concrete condition.",
    "- question: Acknowledge that Harper will ask the company the user's exact question and report back. Do not ask another question unless a crucial clarification is needed; if clarification is needed, ask exactly one concrete clarification.",
    "",
    "Follow-up question quality:",
    "- The question must be specific to this role/company and, when possible, one specific candidate experience or preference.",
    "- Avoid broad questions like '어떤 역할 범위가 좋으세요?', '최근 성과를 알려주세요', '이 점은 어떠신가요?', or '어떤 조건이면 검토하시겠어요?'.",
    "- Prefer questions that can be answered in one sentence.",
    "- Do not invent facts that are not supported by the context.",
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
