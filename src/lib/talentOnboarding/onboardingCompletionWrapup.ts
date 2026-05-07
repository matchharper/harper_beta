import {
  buildCareerTextChatPromptBlocks,
  type CareerPromptPreferences,
} from "@/lib/career/prompts";
import { runCareerChatAssistant } from "@/lib/career/llm";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import { getTalentCareerMoveIntentLabel } from "@/lib/talentNetworkOptions";
import {
  buildTalentProfileContext,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
  normalizeTalentPreferredLocations,
  sanitizeTalentCareerMoveIntent,
  type TalentAdminClient,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
import { fetchRecentMessagesWithSummary } from "@/lib/talentOnboarding/conversationSummary";
import {
  fetchOnboardingCompletionWrapupMessage,
  insertOnboardingCompletionWrapupMessage,
} from "@/lib/talentOnboarding/messageStore";
import {
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP,
} from "@/lib/talentOnboarding/onboarding";
import {
  executeTalentTool,
  getOpenAIChatTools,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";

const FALLBACK_WRAPUP_CONTENT = [
  "좋은 대화였습니다. 말씀해주신 내용을 바탕으로 다음 기회 탐색 기준을 정리했습니다.",
  "",
  "**What we covered**",
  "- 지금 중요한 커리어 조건과 선호를 확인했습니다.",
  "- 다음 기회에서 보고 싶은 역할, 환경, 제약 조건을 정리했습니다.",
  "",
  "**Key insights**",
  "- 앞으로의 추천은 대화에서 확인한 우선순위를 먼저 반영합니다.",
  "- 명확히 맞는 기회만 추려서 보여드리는 방향으로 탐색합니다.",
  "",
  "**Next steps**",
  "말씀해주신 기준으로 새로운 기회를 찾기 시작했습니다. 결과가 준비되면 대시보드와 이메일로 안내드릴게요. 최대 1시간 정도 걸릴 수 있습니다.",
].join("\n");

const ONBOARDING_COMPLETION_WRAPUP_THINKING_LOGS = [
  "온보딩이 종료되었습니다.",
  "대화 내용을 바탕으로 프로필 업데이트가 필요한지 확인했습니다.",
  "대화 요약을 작성했습니다.",
];

function normalizeWrapupContent(content: string) {
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  const withoutTitle =
    lines[0]
      ?.trim()
      .replace(/^#+\s*/, "")
      .toLowerCase() === "call wrap-up"
      ? lines.slice(1)
      : lines;

  return withoutTitle
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isWrapupInputMessage(message: TalentMessageRow) {
  const messageType = message.message_type ?? "chat";
  return (
    messageType !== "call_wrapup" &&
    messageType !== TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE &&
    messageType !== TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP
  );
}

function buildCurrentPreferences(
  setting: Awaited<ReturnType<typeof fetchTalentSetting>>
): CareerPromptPreferences {
  const careerMoveIntent = sanitizeTalentCareerMoveIntent(
    setting?.career_move_intent
  );

  return {
    careerMoveIntent,
    careerMoveIntentLabel: getTalentCareerMoveIntentLabel(careerMoveIntent),
    engagementTypes: normalizeTalentEngagementTypes(
      setting?.engagement_types ?? []
    ),
    preferredLocations: normalizeTalentPreferredLocations(
      setting?.preferred_locations ?? []
    ),
    periodicIntervalDays: normalizeTalentPeriodicIntervalDays(
      setting?.periodic_interval_days
    ),
    recommendationBatchSize: normalizeTalentRecommendationBatchSize(
      setting?.recommendation_batch_size
    ),
  };
}

function buildWrapupInstruction() {
  return [
    "## Onboarding completion wrap-up task",
    "The user's career onboarding conversation has just completed. This is a persisted assistant-side finalization task, not a normal chat turn.",
    "",
    "First, inspect the onboarding conversation and current profile state.",
    "- If the user disclosed clear durable facts, preferences, constraints, or role-specific details that are missing from current state, you may call `update_talent_profile` once before writing the wrap-up.",
    "- The tool call is optional. Skip it when there is no clear new writable information or when the information is already saved.",
    "- For rowMemos, use only exact RowID/Title values visible in the Structured Talent Profile. Do not guess row IDs or attach generic facts to a row.",
    "- For talentInsights, prefer existing checklist-style insight keys/current insight keys when they fit. Use a new free-form English snake_case key only when the fact is important for future matching and does not reasonably fit an existing key.",
    "- Do not put profile-row facts into talentInsights. Specific experience, education, project, responsibility, or achievement details should go to rowMemos when one visible row matches; if no row matches, do not work around it with a profile-like insight key.",
    "- talentInsights values must be complete Korean sentences, not fragments such as `규모 선호.`.",
    "- Do not call any search or recommendation tool from this task.",
    "",
    "Then write ONLY the markdown body for a UI card. The UI will render the title `Call Wrap-up`, so do not include that title.",
    "Required format:",
    "Opening sentence: write exactly one natural sentence tailored to the conversation.",
    "Do not add a meta preface such as `오늘 나눈 대화를 바탕으로...`, `아래는 대화 요약 카드예요`, or any sentence that only explains that this is a summary card.",
    "Do not use horizontal rules, separators, or `---` anywhere.",
    "",
    "**What we covered**",
    "- 2-4 concise bullets about the main topics and facts covered.",
    "",
    "**Key insights**",
    "- 2-4 concise bullets about recommendation-relevant signals.",
    "",
    "**Next steps**",
    "A short paragraph saying Harper updated the 검색 기준 and is starting a fresh search. Mention that results will appear in the position tab and by email when ready, and that it can take up to 1 hour.",
    "",
    "Language: match the user's conversation language. If mixed or unclear, write in polite Korean.",
    "Keep it specific, useful, and grounded in the conversation. Do not invent companies, investors, locations, compensation details, or preferences that were not discussed.",
  ].join("\n");
}

function stripUiStatusMessage(input: Record<string, unknown>) {
  const { _uiStatusMessage, ...toolInput } = input;
  void _uiStatusMessage;
  return toolInput;
}

export async function generateOnboardingCompletionWrapupContent(args: {
  admin: TalentAdminClient;
  conversationId: string;
  latestUserMessageId?: number | string | null;
  userId: string;
}) {
  const [profile, setting, insights, structuredProfile, recentMessages] =
    await Promise.all([
      fetchTalentUserProfile({ admin: args.admin, userId: args.userId }),
      fetchTalentSetting({ admin: args.admin, userId: args.userId }),
      fetchTalentInsights({ admin: args.admin, userId: args.userId }),
      fetchTalentStructuredProfile({
        admin: args.admin,
        userId: args.userId,
      }),
      fetchRecentMessagesWithSummary({
        admin: args.admin,
        conversationId: args.conversationId,
        fallbackLimit: 80,
        recentLimit: 40,
        userId: args.userId,
      }),
    ]);

  const wrapupTools = getOpenAIChatTools("chat").filter(
    (tool) => tool.function.name === TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE
  );
  const structuredProfileText = buildTalentProfileContext({
    profile,
    setting,
    structuredProfile,
  });
  const promptPlan = buildCareerTextChatPromptBlocks({
    currentInsightContent: normalizeTalentInsightContent(
      insights?.content ?? null
    ),
    currentPreferences: buildCurrentPreferences(setting),
    isOnboardingDone: true,
    profile,
    sessionStartInstruction: buildWrapupInstruction(),
    structuredProfileText,
    toolNames: wrapupTools.map((tool) => tool.function.name),
  });
  const conversationMessages = recentMessages
    .filter(isWrapupInputMessage)
    .map((message) => ({
      content: formatTalentMessageContentForLlmPrompt(message),
      role: message.role as "user" | "assistant",
    }))
    .filter((message) => message.content.trim().length > 0);

  conversationMessages.push({
    role: "user",
    content:
      "[System task] Onboarding is complete. Perform the optional profile update if needed, then generate the persisted Call Wrap-up card body now.",
  });

  const generated = await runCareerChatAssistant({
    executeTool: ({ input, name }) =>
      executeTalentTool({
        context: {
          admin: args.admin,
          conversationId: args.conversationId,
          userMessageId: args.latestUserMessageId ?? null,
          userId: args.userId,
        },
        input: stripUiStatusMessage(input),
        logging: false,
        name,
      }),
    messages: conversationMessages,
    stopAfterToolNames: [],
    systemBlocks: promptPlan.promptBlocks,
    tools: wrapupTools,
  });

  return normalizeWrapupContent(generated);
}

export async function regenerateOnboardingCompletionWrapupMessage(args: {
  admin: TalentAdminClient;
  conversationId: string;
  latestUserMessageId?: number | string | null;
  userId: string;
}) {
  let content = FALLBACK_WRAPUP_CONTENT;

  try {
    const generated = await generateOnboardingCompletionWrapupContent(args);
    if (generated) {
      content = generated;
    }
  } catch (error) {
    console.error(
      "[onboarding-completion-wrapup] Failed to regenerate content",
      {
        conversationId: args.conversationId,
        error: error instanceof Error ? error.message : String(error),
        userId: args.userId,
      }
    );
  }

  const existing = await fetchOnboardingCompletionWrapupMessage({
    admin: args.admin,
    conversationId: args.conversationId,
    userId: args.userId,
  });

  if (!existing) {
    return insertOnboardingCompletionWrapupMessage({
      admin: args.admin,
      content,
      conversationId: args.conversationId,
      thinkingLogs: ONBOARDING_COMPLETION_WRAPUP_THINKING_LOGS,
      userId: args.userId,
    });
  }

  const { data, error } = await args.admin
    .from("talent_messages")
    .update({
      content,
      thinking_logs: ONBOARDING_COMPLETION_WRAPUP_THINKING_LOGS,
    })
    .eq("id", existing.id)
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? "Failed to update onboarding completion wrap-up"
    );
  }

  return data as TalentMessageRow;
}

export async function createOnboardingCompletionWrapupMessage(args: {
  admin: TalentAdminClient;
  conversationId: string;
  latestUserMessageId?: number | string | null;
  userId: string;
}) {
  try {
    const existing = await fetchOnboardingCompletionWrapupMessage({
      admin: args.admin,
      conversationId: args.conversationId,
      userId: args.userId,
    });
    if (existing) return existing;
  } catch (error) {
    console.error("[onboarding-completion-wrapup] Failed to read existing", {
      conversationId: args.conversationId,
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
  }

  let content = FALLBACK_WRAPUP_CONTENT;

  try {
    const generated = await generateOnboardingCompletionWrapupContent(args);
    if (generated) {
      content = generated;
    }
  } catch (error) {
    console.error("[onboarding-completion-wrapup] Failed to generate content", {
      conversationId: args.conversationId,
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
  }

  try {
    return await insertOnboardingCompletionWrapupMessage({
      admin: args.admin,
      content,
      conversationId: args.conversationId,
      thinkingLogs: ONBOARDING_COMPLETION_WRAPUP_THINKING_LOGS,
      userId: args.userId,
    });
  } catch (error) {
    console.error("[onboarding-completion-wrapup] Failed to save message", {
      conversationId: args.conversationId,
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
    return null;
  }
}
