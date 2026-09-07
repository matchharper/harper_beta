import {
  buildOnboardingCompletionHandoffInstruction,
  buildCareerConversationPromptPlan,
  type CareerPromptPreferences,
} from "@/lib/career/prompts";
import { runCareerChatAssistant } from "@/lib/career/llm";
import {
  getCareerPromptLanguageName,
  getCareerPromptToneRule,
  normalizeCareerPromptLocale,
} from "@/lib/career/promptLocale";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import {
  buildTalentProfileContext,
  fetchActiveTalentDocumentByOrigin,
  fetchTalentContextPromptSnapshot,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  renderTalentContextPrompt,
  type TalentAdminClient,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import { normalizeTalentRecommendationBatchSize } from "@/lib/talentOnboarding/recommendationSettings";
import { fetchRecentMessagesWithSummary } from "@/lib/talentOnboarding/conversationSummary";
import {
  fetchOnboardingCompletionNextStepsMessage,
  fetchOnboardingCompletionWrapupMessage,
  insertOnboardingCompletionNextStepsMessage,
  insertOnboardingCompletionWrapupMessage,
} from "@/lib/talentOnboarding/messageStore";
import {
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NEXT_STEPS,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP,
} from "@/lib/talentOnboarding/onboarding";
import {
  executeTalentTool,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";
import { resolveCareerChatTools } from "@/lib/career/llmTools";
import {
  fetchRecentRecommendedOpportunitiesForPrompt,
  formatRecentRecommendedOpportunitiesForPrompt,
} from "@/lib/talentOpportunity";
import { stripPostgresUnsafeChars } from "@/lib/textSanitization";
import { hasActiveConversationCompletedOpportunityRun } from "@/lib/opportunityDiscovery/store";
import { fetchActiveTalentGmailIntegration } from "@/lib/integrations/gmail";
import {
  GMAIL_CAREER_HISTORY_ORIGIN_ID,
  GMAIL_CAREER_HISTORY_ORIGIN_TYPE,
} from "@/lib/integrations/gmailCareerHistoryCore";
import { fetchCareerPostOnboardingContext } from "@/lib/career/postOnboardingContext";

const FALLBACK_WRAPUP_CONTENT_KO = [
  "좋은 대화였습니다. 말씀해주신 내용을 바탕으로 다음 기회 탐색 기준을 정리했습니다.",
  "",
  "**What we covered**",
  "- 지금 중요한 커리어 조건과 선호를 확인했습니다.",
  "- 다음 기회에서 보고 싶은 역할, 환경, 제약 조건을 정리했습니다.",
  "",
  "**Key insights**",
  "- 앞으로의 추천은 대화에서 확인한 우선순위를 먼저 반영합니다.",
  "- 명확히 맞는 기회만 추려서 보여드리는 방향으로 탐색합니다.",
].join("\n");

const FALLBACK_WRAPUP_CONTENT_EN = [
  "That was a helpful conversation. I summarized your next opportunity search criteria based on what you shared.",
  "",
  "**What we covered**",
  "- Your current career priorities and preferences.",
  "- The roles, environments, and constraints you want Harper to consider next.",
  "",
  "**Key insights**",
  "- Future recommendations will prioritize what came through in this conversation.",
  "- Harper will focus on filtering for clearly relevant opportunities instead of sending broad noise.",
].join("\n");

const FALLBACK_NEXT_STEPS_CONTENT_KO = [
  "말씀해주신 조건들을 Harper의 검색 기준에 반영했어요. 이제 대화에서 확인한 역할, 산업, 지역, 근무 형태 기준을 중심으로 새로운 기회를 찾기 시작할게요. 결과는 포지션 탭과 이메일로 준비되는 대로 보내드릴 거예요. 최대 1시간 정도 걸릴 수 있어요.",
  "",
  "확인하신 뒤에는 각 기회에 대해 좋아요/싫어요를 눌러주세요. 마음에 드는 회사가 있으면 회사명을 눌러 자세히 보고, 계속 지켜보고 싶은 회사는 track 해두시면 관련 소식이나 채용 업데이트가 있을 때 챙겨드릴게요.",
  "",
  "가장 먼저 확인해보고 싶은 회사나 기회, 혹은 Harper가 더 알아두면 좋을 내용이 있다면 편하게 말씀해주세요.",
].join("\n\n");

const FALLBACK_NEXT_STEPS_CONTENT_EN = [
  "I added what you shared to Harper's search criteria. Harper will start looking around the roles, industries, locations, and work styles we discussed. New opportunities will appear in the Positions tab and may also be sent by email when they are ready. This can take up to about an hour.",
  "",
  "After you review them, use like or dislike on each opportunity so Harper can calibrate future recommendations. If a company looks interesting, open the company name for more context. You can also track companies you want Harper to keep watching for relevant updates or new roles.",
  "",
  "If there is a company or opportunity you want Harper to look at first, or anything else Harper should know, feel free to tell me.",
].join("\n\n");

const ONBOARDING_COMPLETION_WRAPUP_THINKING_LOGS_KO = [
  "온보딩이 종료되었습니다.",
  "대화 내용을 바탕으로 프로필 업데이트가 필요한지 확인했습니다.",
  "대화 요약을 작성했습니다.",
];

const ONBOARDING_COMPLETION_WRAPUP_THINKING_LOGS_EN = [
  "Onboarding is complete.",
  "Checked whether the profile should be updated based on the conversation.",
  "Prepared the conversation summary.",
];

const resolveFallbackLocale = (
  preferredLocale?: string | null
): "ko" | "en" => {
  if (!preferredLocale) return "en";
  return normalizeCareerPromptLocale(preferredLocale);
};

async function getOnboardingCompletionFallbackLocale(args: {
  admin: TalentAdminClient;
  userId: string;
}): Promise<"ko" | "en"> {
  try {
    const setting = await fetchTalentSetting({
      admin: args.admin,
      userId: args.userId,
    });
    return resolveFallbackLocale(setting?.preferred_locale);
  } catch {
    return "en";
  }
}

const getFallbackWrapupContent = (locale: "ko" | "en") =>
  locale === "ko" ? FALLBACK_WRAPUP_CONTENT_KO : FALLBACK_WRAPUP_CONTENT_EN;

const getFallbackNextStepsContent = (locale: "ko" | "en") =>
  locale === "ko"
    ? FALLBACK_NEXT_STEPS_CONTENT_KO
    : FALLBACK_NEXT_STEPS_CONTENT_EN;

const getOnboardingCompletionWrapupThinkingLogs = (locale: "ko" | "en") =>
  locale === "ko"
    ? ONBOARDING_COMPLETION_WRAPUP_THINKING_LOGS_KO
    : ONBOARDING_COMPLETION_WRAPUP_THINKING_LOGS_EN;

function stripNextStepsSection(content: string) {
  return stripPostgresUnsafeChars(content)
    .replace(
      /\n{0,2}(?:#{1,6}\s*)?(?:\*\*)?Next steps(?:\*\*)?\s*\n[\s\S]*$/i,
      ""
    )
    .trim();
}

function normalizeWrapupContent(content: string) {
  const lines = stripPostgresUnsafeChars(content)
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

  return stripNextStepsSection(
    withoutTitle
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function normalizeNextStepsContent(content: string) {
  const lines = stripPostgresUnsafeChars(content)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  const withoutTitle =
    lines[0]
      ?.trim()
      .replace(/^#+\s*/, "")
      .toLowerCase() === "next steps"
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
    messageType !== TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NEXT_STEPS &&
    messageType !== TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP
  );
}

function buildCurrentPreferences(
  setting: Awaited<ReturnType<typeof fetchTalentSetting>>
): CareerPromptPreferences {
  return {
    getExternalRecommendation: setting?.get_external_recommendation ?? null,
    preferredLocale: setting?.preferred_locale ?? null,
    profileVisibility: setting?.profile_visibility ?? null,
    recommendationBatchSize: normalizeTalentRecommendationBatchSize(
      setting?.recommendation_batch_size
    ),
  };
}

function buildWrapupInstruction(preferredLocale?: string | null) {
  const outputLanguage = getCareerPromptLanguageName(preferredLocale);
  const toneRule = getCareerPromptToneRule(preferredLocale);

  return [
    "## Onboarding completion wrap-up task",
    "The user's career onboarding conversation has just completed. This is a persisted assistant-side finalization task, not a normal chat turn.",
    "",
    "First, inspect the onboarding conversation and current profile state.",
    "- If the user disclosed a clear recommendation/contact subscription action, you may call `update_setting` before writing the wrap-up: stop_external for external/public postings only, stop_all for all Harper matching contact, or resume for recommendation/contact restart.",
    "- If the user's wording is a generic stop/unsubscribe that could mean either external postings only or all Harper matching contact, do not call `update_setting`; leave the clarification for the normal assistant message.",
    "- If the user disclosed a clear recommendation batch-size change, use `update_talent_profile.recommendationBatchSize`, not `update_setting`.",
    "- If the user disclosed clear durable context that is missing from current state, use `write_talent_context` before writing the wrap-up. Put current user-visible search criteria in Brief and other context worth remembering in Memory.",
    "- Use `update_talent_profile` only for structured profile rows or recommendation batch size.",
    "- Tool calls are optional. Skip them when there is no clear new writable information or when the information is already saved.",
    "- For rowMemos, use only exact RowID values visible in the Structured Talent Profile. Do not guess row IDs or attach generic facts to a row.",
    "- For rowMemos, use operation=append for genuinely new detail. Use operation=update only to replace an existing memo with a complete corrected final memo; never send only the changed fragment, and never delete or clear a memo.",
    `- Brief labels and all saved content must be clear, complete ${outputLanguage} text. Do not duplicate one fact across Brief and Memory.`,
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
    `Language: write in ${outputLanguage}. ${toneRule}`,
    "Keep it specific, useful, and grounded in the conversation. Do not invent companies, investors, locations, compensation details, or preferences that were not discussed.",
    "Do not include a `Next steps` section or any instruction about how Harper will contact the user. That belongs in the separate assistant message.",
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
  const [
    profile,
    setting,
    talentContextSnapshot,
    structuredProfile,
    recentMessages,
    recentRecommendedOpportunities,
  ] = await Promise.all([
    fetchTalentUserProfile({ admin: args.admin, userId: args.userId }),
    fetchTalentSetting({ admin: args.admin, userId: args.userId }),
    fetchTalentContextPromptSnapshot({
      admin: args.admin,
      query: "onboarding completion wrap-up",
      userId: args.userId,
    }),
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
    fetchRecentRecommendedOpportunitiesForPrompt({
      admin: args.admin,
      limit: 10,
      userId: args.userId,
    }),
  ]);

  const responseLocale = setting?.preferred_locale ?? null;
  const wrapupToolSelection = resolveCareerChatTools({
    allowedToolNames: [
      TALENT_TOOL_NAMES.UPDATE_SETTING,
      TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
      TALENT_TOOL_NAMES.READ_TALENT_CONTEXT,
      TALENT_TOOL_NAMES.WRITE_TALENT_CONTEXT,
    ],
    isOnboardingDone: true,
    responseLocale,
  });
  const wrapupTools = wrapupToolSelection.tools;
  const structuredProfileText = buildTalentProfileContext({
    profile,
    setting,
    structuredProfile,
  });
  const recentRecommendedOpportunitiesText =
    formatRecentRecommendedOpportunitiesForPrompt(
      recentRecommendedOpportunities
    );
  const promptPlan = buildCareerConversationPromptPlan({
    channel: "chat",
    talentContextSection: renderTalentContextPrompt(talentContextSnapshot),
    currentPreferences: buildCurrentPreferences(setting),
    includePostOnboardingConversationGuide: false,
    isOnboardingDone: true,
    profile,
    recentRecommendedOpportunitiesText,
    runtimeInstruction: buildWrapupInstruction(responseLocale),
    structuredProfileText,
    toolNames: wrapupToolSelection.toolNames,
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
          responseLocale,
          userMessageId: args.latestUserMessageId ?? null,
          userId: args.userId,
        },
        input: stripUiStatusMessage(input),
        logging: false,
        name,
      }),
    messages: conversationMessages,
    responseLocale,
    stopAfterToolNames: [],
    systemBlocks: promptPlan.promptBlocks,
    tools: wrapupTools,
    usageLabel: "career/chat:onboarding_completion_wrapup",
  });

  return normalizeWrapupContent(generated);
}

export async function generateOnboardingCompletionNextStepsContent(args: {
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}) {
  const [
    profile,
    setting,
    talentContextSnapshot,
    structuredProfile,
    recentMessages,
    recentRecommendedOpportunities,
    isConversationCompletedOpportunityRunActive,
    postOnboardingContext,
    activeGmailIntegration,
    savedGmailCareerHistoryDocument,
  ] = await Promise.all([
    fetchTalentUserProfile({ admin: args.admin, userId: args.userId }),
    fetchTalentSetting({ admin: args.admin, userId: args.userId }),
    fetchTalentContextPromptSnapshot({
      admin: args.admin,
      query: "onboarding completion next steps",
      userId: args.userId,
    }),
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
    fetchRecentRecommendedOpportunitiesForPrompt({
      admin: args.admin,
      limit: 10,
      userId: args.userId,
    }),
    hasActiveConversationCompletedOpportunityRun({
      admin: args.admin,
      userId: args.userId,
    }),
    fetchCareerPostOnboardingContext({
      admin: args.admin,
      conversationId: args.conversationId,
      userId: args.userId,
    }),
    fetchActiveTalentGmailIntegration({
      admin: args.admin,
      talentId: args.userId,
    }),
    fetchActiveTalentDocumentByOrigin({
      admin: args.admin,
      originId: GMAIL_CAREER_HISTORY_ORIGIN_ID,
      originType: GMAIL_CAREER_HISTORY_ORIGIN_TYPE,
      userId: args.userId,
    }).catch((error) => {
      console.warn("[OnboardingCompletion] Gmail history context unavailable", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }),
  ]);

  const structuredProfileText = buildTalentProfileContext({
    profile,
    setting,
    structuredProfile,
  });
  const recentRecommendedOpportunitiesText =
    formatRecentRecommendedOpportunitiesForPrompt(
      recentRecommendedOpportunities
    );
  const responseLocale = setting?.preferred_locale ?? null;
  const promptPlan = buildCareerConversationPromptPlan({
    channel: "chat",
    talentContextSection: renderTalentContextPrompt(talentContextSnapshot),
    currentPreferences: buildCurrentPreferences(setting),
    gmailCapability: activeGmailIntegration
      ? "connected_but_unavailable_this_turn"
      : "not_connected",
    hasSavedGmailCareerHistory: Boolean(savedGmailCareerHistoryDocument),
    isConversationCompletedOpportunityRunActive,
    isOnboardingDone: true,
    postOnboardingContext,
    profile,
    recentRecommendedOpportunitiesText,
    runtimeInstruction:
      buildOnboardingCompletionHandoffInstruction(responseLocale),
    structuredProfileText,
    toolNames: [],
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
      "[System task] Onboarding is complete. Generate the normal Harper next-steps assistant message now.",
  });

  const generated = await runCareerChatAssistant({
    executeTool: async () => null,
    messages: conversationMessages,
    responseLocale,
    stopAfterToolNames: [],
    systemBlocks: promptPlan.promptBlocks,
    tools: [],
    usageLabel: "career/chat:onboarding_completion_next_steps",
  });

  return normalizeNextStepsContent(generated);
}

export async function regenerateOnboardingCompletionNextStepsMessage(args: {
  admin: TalentAdminClient;
  conversationId: string;
  isMobile?: boolean | null;
  userId: string;
}) {
  const fallbackLocale = await getOnboardingCompletionFallbackLocale(args);
  let content = getFallbackNextStepsContent(fallbackLocale);

  try {
    const generated = await generateOnboardingCompletionNextStepsContent(args);
    if (generated) {
      content = generated;
    }
  } catch (error) {
    console.error(
      "[onboarding-completion-next-steps] Failed to regenerate content",
      {
        conversationId: args.conversationId,
        error: error instanceof Error ? error.message : String(error),
        userId: args.userId,
      }
    );
  }

  const existing = await fetchOnboardingCompletionNextStepsMessage({
    admin: args.admin,
    conversationId: args.conversationId,
    userId: args.userId,
  });

  if (!existing) {
    return insertOnboardingCompletionNextStepsMessage({
      admin: args.admin,
      content,
      conversationId: args.conversationId,
      isMobile: args.isMobile,
      userId: args.userId,
    });
  }

  const { data, error } = await args.admin
    .from("talent_messages")
    .update({ content })
    .eq("id", existing.id)
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? "Failed to update onboarding completion next steps"
    );
  }

  return data as TalentMessageRow;
}

export async function createOnboardingCompletionNextStepsMessage(args: {
  admin: TalentAdminClient;
  conversationId: string;
  isMobile?: boolean | null;
  userId: string;
}) {
  try {
    const existing = await fetchOnboardingCompletionNextStepsMessage({
      admin: args.admin,
      conversationId: args.conversationId,
      userId: args.userId,
    });
    if (existing) return existing;
  } catch (error) {
    console.error(
      "[onboarding-completion-next-steps] Failed to read existing",
      {
        conversationId: args.conversationId,
        error: error instanceof Error ? error.message : String(error),
        userId: args.userId,
      }
    );
  }

  const fallbackLocale = await getOnboardingCompletionFallbackLocale(args);
  let content = getFallbackNextStepsContent(fallbackLocale);

  try {
    const generated = await generateOnboardingCompletionNextStepsContent(args);
    if (generated) {
      content = generated;
    }
  } catch (error) {
    console.error("[onboarding-completion-next-steps] Failed to generate", {
      conversationId: args.conversationId,
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
  }

  try {
    return await insertOnboardingCompletionNextStepsMessage({
      admin: args.admin,
      content,
      conversationId: args.conversationId,
      isMobile: args.isMobile,
      userId: args.userId,
    });
  } catch (error) {
    console.error("[onboarding-completion-next-steps] Failed to save message", {
      conversationId: args.conversationId,
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
    return null;
  }
}

export async function regenerateOnboardingCompletionWrapupMessage(args: {
  admin: TalentAdminClient;
  conversationId: string;
  isMobile?: boolean | null;
  latestUserMessageId?: number | string | null;
  userId: string;
}) {
  const fallbackLocale = await getOnboardingCompletionFallbackLocale(args);
  const thinkingLogs =
    getOnboardingCompletionWrapupThinkingLogs(fallbackLocale);
  let content = getFallbackWrapupContent(fallbackLocale);

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
      isMobile: args.isMobile,
      thinkingLogs,
      userId: args.userId,
    });
  }

  const { data, error } = await args.admin
    .from("talent_messages")
    .update({
      content,
      thinking_logs: thinkingLogs,
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
  isMobile?: boolean | null;
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

  const fallbackLocale = await getOnboardingCompletionFallbackLocale(args);
  const thinkingLogs =
    getOnboardingCompletionWrapupThinkingLogs(fallbackLocale);
  let content = getFallbackWrapupContent(fallbackLocale);

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
      isMobile: args.isMobile,
      thinkingLogs,
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

export async function createOnboardingCompletionMessages(args: {
  admin: TalentAdminClient;
  conversationId: string;
  isMobile?: boolean | null;
  latestUserMessageId?: number | string | null;
  userId: string;
}) {
  const wrapupMessage = await createOnboardingCompletionWrapupMessage(args);
  const nextStepsMessage = await createOnboardingCompletionNextStepsMessage({
    admin: args.admin,
    conversationId: args.conversationId,
    isMobile: args.isMobile,
    userId: args.userId,
  });

  return {
    nextStepsMessage,
    wrapupMessage,
  };
}

export async function regenerateOnboardingCompletionMessages(args: {
  admin: TalentAdminClient;
  conversationId: string;
  isMobile?: boolean | null;
  latestUserMessageId?: number | string | null;
  userId: string;
}) {
  const wrapupMessage = await regenerateOnboardingCompletionWrapupMessage(args);
  const nextStepsMessage = await regenerateOnboardingCompletionNextStepsMessage(
    {
      admin: args.admin,
      conversationId: args.conversationId,
      isMobile: args.isMobile,
      userId: args.userId,
    }
  );

  return {
    nextStepsMessage,
    wrapupMessage,
  };
}
