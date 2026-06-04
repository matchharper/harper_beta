import { CAREER_LLM_CONFIG } from "@/lib/career/llm";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import {
  buildTalentProfileContext,
  countAdditionalOnboardingQuestionSelections,
  fetchRecentMessages,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
} from "@/lib/talentOnboarding/server";
import {
  TALENT_MESSAGE_TYPE_ONBOARDING_ADDITIONAL_QUESTION_SELECTION,
  TALENT_ONBOARDING_ADDITIONAL_QUESTION_MAX,
} from "./onboarding";
import { runTalentAssistantCompletion, type TalentChatMessage } from "./llm";
import { withIsMobile } from "@/lib/requestDevice";

const TALENT_ONBOARDING_ADDITIONAL_QUESTION_MIN = 2;

type AdditionalQuestionSelection = {
  assistantMessage: string;
  gapType: string;
  rationale: string;
  shouldAsk: boolean;
};

const ALLOWED_GAP_TYPES = new Set([
  "experience_description_missing",
  "direct_contribution_unclear",
  "career_transition_or_timeline",
  "profile_preference_mismatch",
  "role_specific_depth",
  "role_specific_preference",
  "fallback",
]);

function stripJsonFence(value: string) {
  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function clamp(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function parseSelection(raw: string): Partial<AdditionalQuestionSelection> {
  const cleaned = stripJsonFence(raw);
  try {
    return JSON.parse(cleaned) as Partial<AdditionalQuestionSelection>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]) as Partial<AdditionalQuestionSelection>;
    } catch {
      return {};
    }
  }
}

function normalizeSelection(
  value: Partial<AdditionalQuestionSelection>
): AdditionalQuestionSelection {
  const assistantMessage =
    typeof value.assistantMessage === "string" && value.assistantMessage.trim()
      ? value.assistantMessage.trim()
      : "좋은 기회를 찾을 때는 실제로 맡았던 범위를 아는 게 중요해서요. 최근 역할이나 대표 경험 중에서, 밖에서 보기보다 실제로 본인이 더 많이 맡았던 부분은 어디였어요?";
  const gapType =
    typeof value.gapType === "string" && ALLOWED_GAP_TYPES.has(value.gapType)
      ? value.gapType
      : "fallback";

  return {
    assistantMessage: clamp(assistantMessage, 500),
    gapType,
    rationale:
      typeof value.rationale === "string" && value.rationale.trim()
        ? clamp(value.rationale.trim(), 500)
        : "프로필 기반 추가 확인 질문이 필요합니다.",
    shouldAsk: value.shouldAsk !== false,
  };
}

function buildFinalPriorityConfirmationMessage() {
  return "여기까지 들은 내용이면 기회 매칭에 필요한 핵심 정보는 어느 정도 잡힌 것 같아요. 마지막으로, 앞으로 기회를 볼 때 제가 꼭 놓치지 말아야 할 우선순위나 지금까지 빠진 조건이 있을까요?";
}

function countFilledInsights(content: Record<string, unknown> | null) {
  return Object.values(content ?? {}).filter(
    (value) => typeof value === "string" && value.trim().length > 0
  ).length;
}

export async function selectAdditionalOnboardingQuestion(args: {
  admin: any;
  conversationId: string;
  isMobile?: boolean | null;
  latestUserMessage?: string | null;
  userId: string;
}) {
  const { admin, conversationId, latestUserMessage, userId } = args;
  const askedCount = await countAdditionalOnboardingQuestionSelections({
    admin,
    conversationId,
  });

  if (askedCount >= TALENT_ONBOARDING_ADDITIONAL_QUESTION_MAX) {
    return {
      assistantInstruction:
        "The additional onboarding question limit has already been reached. Do not ask another additional onboarding question. Move to the final priority confirmation or close onboarding only if the final confirmation has already been answered.",
      assistantMessage: "",
      gapType: "fallback",
      ok: true,
      rationale: `Additional onboarding question limit reached (${askedCount}/${TALENT_ONBOARDING_ADDITIONAL_QUESTION_MAX}).`,
      shouldAsk: false,
    };
  }

  const [profile, setting, insights, recentMessages] = await Promise.all([
    fetchTalentUserProfile({ admin, userId }),
    fetchTalentSetting({ admin, userId }),
    fetchTalentInsights({ admin, userId }),
    fetchRecentMessages({ admin, conversationId, limit: 18 }),
  ]);
  const structuredProfile = await fetchTalentStructuredProfile({
    admin,
    userId,
    talentUser: profile,
  });
  const profileContext = buildTalentProfileContext({
    profile,
    structuredProfile,
    setting,
    maxResumeChars: 4000,
  });
  const currentInsightContent = (insights?.content ?? {}) as Record<
    string,
    unknown
  >;
  const filledInsightCount = countFilledInsights(currentInsightContent);
  const recentConversation = recentMessages
    .map((message) => {
      const role = message.role === "assistant" ? "Harper" : "User";
      const content = formatTalentMessageContentForLlmPrompt(message)
        .replace(/\s+/g, " ")
        .trim();
      return `${role}: ${clamp(content, 700)}`;
    })
    .join("\n");

  const messages: TalentChatMessage[] = [
    {
      role: "system",
      content: [
        "You select the next additional onboarding question for Harper.",
        "Return JSON only. Do not write markdown.",
        "The question can be a profile gap question OR a role-specific depth/preference question.",
        "Prefer the question that would most improve future opportunity matching.",
        "Do not repeat questions already asked in the recent conversation.",
        "Ask exactly one question. Korean 존댓말 only.",
        `This selector is for the Additional questions phase. It should be used after the main onboarding insights are reasonably covered, normally when at least 6 insights are already filled.`,
        `At least ${TALENT_ONBOARDING_ADDITIONAL_QUESTION_MIN} additional questions are required before final priority confirmation or closing.`,
        "The Structured profile omits `Description` when an experience description is empty. If an experience has a role/company/date range/months but no Description and no Memo, treat that as a missing experience-description gap.",
        "",
        "Selection priority:",
        "1. Substantial experience exists but its description is empty, especially around 6+ months or roughly a year. Ask what they actually did in that period once, using the company/role/date context.",
        "2. Recent/important experience exists but direct contribution is unclear.",
        "3. Short tenure, career transition, gap, or role change needs interpretation.",
        "4. The profile strengths and the desired next opportunity have a mismatch or unresolved gap.",
        "5. Role-specific depth is unclear.",
        "6. Role-specific preference would improve matching, such as paid channel depth, B2C vs B2B product preference, or AI application layer vs foundation/infrastructure direction.",
        "7. Use fallback only if no profile-specific or role-specific question is clearly better.",
        "",
        "Role/preference restraint:",
        "- Do not ask broad desired job/role/tech-stack questions repeatedly.",
        "- If a desired role, role scope, domain, or tech-stack preference has already been asked or answered in recent conversation, do not choose role_specific_preference again.",
        "- Prefer one concrete profile-gap question over another generic role/tech-stack preference question.",
        "- If no concrete profile gap remains and role/preference was already covered, return shouldAsk=false.",
        "",
        "JSON schema:",
        JSON.stringify({
          shouldAsk: true,
          gapType:
            "experience_description_missing | direct_contribution_unclear | career_transition_or_timeline | profile_preference_mismatch | role_specific_depth | role_specific_preference | fallback",
          rationale: "short Korean reason why this is the best next question",
          assistantMessage:
            "natural Korean message Harper should say; include a short reason then the question",
        }),
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "## Structured profile",
        profileContext || "(none)",
        "",
        "## Additional question state",
        `Already selected: ${askedCount}/${TALENT_ONBOARDING_ADDITIONAL_QUESTION_MAX}`,
        `Minimum required before final priority confirmation or closing: ${TALENT_ONBOARDING_ADDITIONAL_QUESTION_MIN}`,
        "",
        "## Current insights",
        `Filled insight count: ${filledInsightCount}`,
        JSON.stringify(currentInsightContent, null, 2),
        "",
        "## Latest user message from the current turn, if available",
        latestUserMessage?.trim() || "(not provided)",
        "",
        "## Recent conversation",
        recentConversation || "(none)",
      ].join("\n"),
    },
  ];

  const raw = await runTalentAssistantCompletion({
    fallbackModel: CAREER_LLM_CONFIG.assistant.fallbackModel,
    jsonMode: true,
    messages,
    primaryModel: CAREER_LLM_CONFIG.assistant.primaryModel,
    temperature: 0.2,
    usageLabel: "career/onboarding:additional_question_selector",
  });

  const normalizedSelection = normalizeSelection(parseSelection(raw));
  const selection =
    !normalizedSelection.shouldAsk &&
    askedCount < TALENT_ONBOARDING_ADDITIONAL_QUESTION_MIN
      ? {
          ...normalizedSelection,
          rationale:
            normalizedSelection.rationale +
            ` 필수 additional 질문 ${TALENT_ONBOARDING_ADDITIONAL_QUESTION_MIN}개를 아직 채우지 못해 fallback additional 질문으로 보정했습니다.`,
          shouldAsk: true,
        }
      : normalizedSelection;
  const assistantMessage = selection.shouldAsk
    ? selection.assistantMessage
    : buildFinalPriorityConfirmationMessage();

  if (selection.shouldAsk) {
    const { error: markerError } = await admin
      .from("talent_messages")
      .insert(
        withIsMobile(
          {
            conversation_id: conversationId,
            user_id: userId,
            role: "assistant",
            content: assistantMessage,
            message_type:
              TALENT_MESSAGE_TYPE_ONBOARDING_ADDITIONAL_QUESTION_SELECTION,
          },
          args.isMobile
        )
      );

    if (markerError) {
      throw new Error(
        markerError.message ??
          "Failed to record additional onboarding question selection"
      );
    }
  }

  return {
    ...selection,
    assistantMessage,
    assistantInstruction: selection.shouldAsk
      ? "Ask the user the `assistantMessage` naturally now. Do not mention this tool, JSON, or internal selection. Do not ask any other question in the same response. Do not close onboarding in this same response."
      : "Do not ask another additional onboarding question. Use `assistantMessage` as the final priority confirmation naturally now. Do not close onboarding in this same response; wait for the user's answer.",
    ok: true,
  };
}
