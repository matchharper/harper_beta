import {
  buildCareerTextChatPromptBlocks,
  type CareerPromptPreferences,
} from "@/lib/career/prompts";
import { runCareerChatAssistant } from "@/lib/career/llm";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import {
  buildTalentProfileContext,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  normalizeTalentInsightContent,
  type TalentAdminClient,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
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
].join("\n");

const FALLBACK_NEXT_STEPS_CONTENT = [
  "말씀해주신 조건들을 Harper의 검색 기준에 반영했어요. 이제 대화에서 확인한 역할, 산업, 지역, 근무 형태 기준을 중심으로 새로운 기회를 찾기 시작할게요. 결과는 포지션 탭과 이메일로 준비되는 대로 보내드릴 거예요. 최대 1시간 정도 걸릴 수 있어요.",
  "",
  "확인하신 뒤에는 각 기회에 대해 좋아요/싫어요를 눌러주세요. 마음에 드는 회사가 있으면 회사명을 눌러 자세히 보고, 계속 지켜보고 싶은 회사는 track 해두시면 관련 소식이나 채용 업데이트가 있을 때 챙겨드릴게요.",
  "",
  "앞으로 좋아하실 만한 채용 공고나 회사 소식을 주기적으로 드릴 수도 있고, 내부 추천처럼 꼭 중요한 기회가 있을 때만 연락드릴 수도 있어요. 어떤 종류의 연락을 어느 정도 자주 받는 게 편하실까요?",
].join("\n\n");

const ONBOARDING_COMPLETION_WRAPUP_THINKING_LOGS = [
  "온보딩이 종료되었습니다.",
  "대화 내용을 바탕으로 프로필 업데이트가 필요한지 확인했습니다.",
  "대화 요약을 작성했습니다.",
];

function stripNextStepsSection(content: string) {
  return content
    .replace(
      /\n{0,2}(?:#{1,6}\s*)?(?:\*\*)?Next steps(?:\*\*)?\s*\n[\s\S]*$/i,
      ""
    )
    .trim();
}

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

  return stripNextStepsSection(
    withoutTitle.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  );
}

function normalizeNextStepsContent(content: string) {
  const lines = content
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

  return withoutTitle.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
    "Language: match the user's conversation language. If mixed or unclear, write in polite Korean.",
    "Keep it specific, useful, and grounded in the conversation. Do not invent companies, investors, locations, compensation details, or preferences that were not discussed.",
    "Do not include a `Next steps` section or any instruction about how Harper will contact the user. That belongs in the separate assistant message.",
  ].join("\n");
}

function buildNextStepsInstruction() {
  return [
    "## Onboarding completion next message task",
    "The user's career onboarding conversation has just completed. Write the normal Harper assistant message that appears immediately below the summary card.",
    "",
    "This message is NOT part of the summary card. It should explain what happens next and ask the user about contact preferences.",
    "",
    "Required content:",
    "- Say Harper reflected the user's stated criteria into the search 기준. Mention the most important role/domain/location/company-stage/work-style criteria from the conversation, but only when grounded in the conversation or saved profile.",
    "- Say Harper is starting a fresh search now. Explain that results will appear in the position tab and by email as soon as they are ready, and that it can take up to 1 hour.",
    "- Explain what the user should do after seeing opportunities: use 좋아요/싫어요, open company details, and track/follow companies they want Harper to monitor for company news or hiring updates.",
    "- End with a clear question asking what kind of contact Harper should send and how often. Offer examples such as regular new postings/company news versus only high-signal internal referral opportunities.",
    "",
    "Style:",
    "- Use warm, clear Korean unless the conversation is clearly in another language.",
    "- Markdown is allowed. Prefer 2-4 short paragraphs or compact bullets.",
    "- Be concrete and more detailed than a generic status message.",
    "- Do not include a title like `Next steps`.",
    "- Do not claim a search has already found specific companies or roles unless those appeared in the conversation.",
    "- The final sentence must be a question about contact frequency or contact type.",
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

  const wrapupToolSelection = resolveCareerChatTools({
    allowedToolNames: [TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE],
    isOnboardingDone: true,
  });
  const wrapupTools = wrapupToolSelection.tools;
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

export async function generateOnboardingCompletionNextStepsContent(args: {
  admin: TalentAdminClient;
  conversationId: string;
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
    sessionStartInstruction: buildNextStepsInstruction(),
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
    stopAfterToolNames: [],
    systemBlocks: promptPlan.promptBlocks,
    tools: [],
  });

  return normalizeNextStepsContent(generated);
}

export async function regenerateOnboardingCompletionNextStepsMessage(args: {
  admin: TalentAdminClient;
  conversationId: string;
  isMobile?: boolean | null;
  userId: string;
}) {
  let content = FALLBACK_NEXT_STEPS_CONTENT;

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
    console.error("[onboarding-completion-next-steps] Failed to read existing", {
      conversationId: args.conversationId,
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
  }

  let content = FALLBACK_NEXT_STEPS_CONTENT;

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
      isMobile: args.isMobile,
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
      isMobile: args.isMobile,
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
  const nextStepsMessage = await regenerateOnboardingCompletionNextStepsMessage({
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
