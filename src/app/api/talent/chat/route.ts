import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  buildTalentProfileContext,
  countUserChatTurns,
  fetchRecentMessages,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  TalentConversationRow,
  TalentMessageRow,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";
import { warmCache } from "@/lib/talentOnboarding/prompts/promptCache";
import {
  getUncoveredChecklistItems,
  INSIGHT_CHECKLIST,
} from "@/lib/talentOnboarding/insightChecklist";
import {
  buildCareerChatPromptBlocks,
  buildCareerInsightExtractionPrompt,
} from "@/lib/career/prompts";
import { runCareerChatAssistant } from "@/lib/career/llm";
import {
  buildTalentToolPolicy,
  executeTalentTool,
  getOpenAIChatTools,
  getStopAfterTalentToolNames,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";
import { extractAndPersistChatInsights } from "@/lib/talentOnboarding/chatInsights";
import {
  resolveTalentOnboardingCompletion,
  stripTalentOnboardingCompletionMarker,
} from "@/lib/talentOnboarding/completion";
import {
  completeOnboardingAndQueueInitialOpportunityRun,
  getActiveOpportunityRun,
  serializeOpportunityRun,
} from "@/lib/opportunityDiscovery/store";
import {
  buildMockInterviewReply,
  fetchActiveMockInterviewSession,
  MOCK_INTERVIEW_MESSAGE_TYPE,
  prepareMockInterview,
  serializeMockInterviewSession,
} from "@/lib/mockInterview/server";
import { prepareCompanySnapshot } from "@/lib/career/companySnapshot";

type Body = {
  conversationId?: string;
  message?: string;
  link?: string;
};

type PreparedMockInterviewResult = Awaited<
  ReturnType<typeof prepareMockInterview>
>;
type PreparedCompanySnapshotResult = Awaited<
  ReturnType<typeof prepareCompanySnapshot>
>;

const toResponseMessage = (item: TalentMessageRow) => ({
  id: item.id,
  role: item.role,
  content: item.content,
  messageType: item.message_type ?? "chat",
  createdAt: item.created_at,
});

function startOpportunityDiscoveryInBackground(runId: string) {
  console.info("[opportunity-discovery] queued for harper_worker", {
    runId,
  });
}

const optionalToolString = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

function countPromptChars(value: string | null | undefined) {
  return typeof value === "string" ? value.length : 0;
}

function countMessageContentChars(
  messages: Array<{ content: string | null | undefined }>
) {
  return messages.reduce(
    (sum, message) => sum + countPromptChars(message.content),
    0
  );
}

function countSerializedChars(value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    return serialized ? serialized.length : 0;
  } catch {
    return 0;
  }
}

function countPromptBlockChars(
  blocks: Array<{ text: string | null | undefined }>
) {
  return blocks.reduce((sum, block) => sum + countPromptChars(block.text), 0);
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await warmCache();

    const body = (await req.json()) as Body;
    const conversationId = body.conversationId?.trim();
    const message = body.message?.trim();
    const link = body.link?.trim();

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }
    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const { data: conversation, error: conversationError } = await admin
      .from("talent_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json(
        { error: conversationError.message ?? "Failed to read conversation" },
        { status: 500 }
      );
    }
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const activeRun = await getActiveOpportunityRun({
      admin,
      conversationId,
      userId: user.id,
    });
    if (activeRun) {
      return NextResponse.json(
        {
          error:
            "기회를 찾는 중입니다. 검색이 끝나면 바로 이어서 대화할 수 있습니다.",
          opportunityRun: serializeOpportunityRun(activeRun),
        },
        { status: 423 }
      );
    }

    const [profile, currentInsights, talentSetting] = await Promise.all([
      fetchTalentUserProfile({ admin, userId: user.id }),
      fetchTalentInsights({ admin, userId: user.id }),
      fetchTalentSetting({ admin, userId: user.id }),
    ]);
    const structuredProfile = await fetchTalentStructuredProfile({
      admin,
      userId: user.id,
      talentUser: profile,
    });
    const structuredProfileText = buildTalentProfileContext({
      profile,
      structuredProfile,
      setting: talentSetting,
      maxResumeChars: 3000,
    });

    const currentInsightContent = (currentInsights?.content ?? null) as Record<
      string,
      string
    > | null;
    const uncoveredItems = getUncoveredChecklistItems(currentInsightContent);
    const coveredCount = INSIGHT_CHECKLIST.length - uncoveredItems.length;
    const extractTurnInsights = (assistantContent: string) =>
      extractAndPersistChatInsights({
        admin,
        assistantContent,
        buildPrompt: (promptArgs) =>
          buildCareerInsightExtractionPrompt({
            coveredCount: promptArgs.coveredCount,
            currentInsightContent: promptArgs.currentInsightContent,
            totalCount: promptArgs.totalCount,
            uncoveredItems: promptArgs.uncoveredItems,
          }),
        conversationId,
        coveredCount,
        currentInsightContent,
        logPrefix: "TalentChat",
        totalCount: INSIGHT_CHECKLIST.length,
        uncoveredItems,
        userId: user.id,
      });

    const normalizedContent = link
      ? `${message}\n\n참고 링크: ${link}`
      : message;

    const activeMockInterview = await fetchActiveMockInterviewSession({
      admin,
      conversationId,
      statuses: ["in_progress"],
      userId: user.id,
    });
    if (activeMockInterview) {
      const assistantText = await buildMockInterviewReply({
        admin,
        conversationId,
        userId: user.id,
        userMessage: normalizedContent,
      });
      const safeAssistantText =
        assistantText ||
        "좋습니다. 실제 인터뷰처럼 이어가겠습니다. 방금 답변을 조금 더 구체적으로 설명해 주세요.";

      const { data: insertedUserMessage, error: userMessageError } = await admin
        .from("talent_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "user",
          content: normalizedContent,
          message_type: MOCK_INTERVIEW_MESSAGE_TYPE,
        })
        .select("*")
        .single();

      if (userMessageError) {
        return NextResponse.json(
          {
            error: userMessageError.message ?? "Failed to insert user message",
          },
          { status: 500 }
        );
      }

      const { data: insertedAssistantMessage, error: assistantError } =
        await admin
          .from("talent_messages")
          .insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: safeAssistantText,
            message_type: MOCK_INTERVIEW_MESSAGE_TYPE,
          })
          .select("*")
          .single();

      if (assistantError) {
        return NextResponse.json(
          {
            error:
              assistantError.message ?? "Failed to insert assistant message",
          },
          { status: 500 }
        );
      }

      const newKeysCount = await extractTurnInsights(safeAssistantText);

      return NextResponse.json({
        ok: true,
        assistantMessage: toResponseMessage(
          insertedAssistantMessage as TalentMessageRow
        ),
        mockInterviewSession:
          serializeMockInterviewSession(activeMockInterview),
        progress: {
          answeredCount: 0,
          completed: false,
          currentStep: coveredCount + newKeysCount,
          targetCount: TALENT_INTERVIEW_FINAL_STEP,
        },
        userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      });
    }

    const { data: insertedUserMessage, error: userMessageError } = await admin
      .from("talent_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: normalizedContent,
        message_type: "chat",
      })
      .select("*")
      .single();

    if (userMessageError) {
      return NextResponse.json(
        { error: userMessageError.message ?? "Failed to insert user message" },
        { status: 500 }
      );
    }

    const userTurnCount = await countUserChatTurns({ admin, conversationId });
    const recentMessages = await fetchRecentMessages({
      admin,
      conversationId,
      limit: 24,
    });

    const llmMessages = recentMessages
      .map((item) => ({
        role: item.role as "user" | "assistant",
        content: item.content,
      }))
      .filter((item) => item.content.trim().length > 0);

    const { isOnboardingActive, promptBlocks } = buildCareerChatPromptBlocks({
      coveredCount,
      currentInsightContent,
      isOnboardingDone: talentSetting?.is_onboarding_done,
      profile,
      structuredProfileText,
      totalInsightCount: INSIGHT_CHECKLIST.length,
      uncoveredItems,
      userTurnCount,
    });
    const toolDefinitions = isOnboardingActive
      ? []
      : getOpenAIChatTools("chat");
    const toolPolicy = isOnboardingActive ? "" : buildTalentToolPolicy("chat");
    const dynamicSystemBlock = promptBlocks[promptBlocks.length - 1];
    const cacheablePromptBlocks = promptBlocks.slice(0, -1);
    const profileContextBlock =
      cacheablePromptBlocks.length > 0
        ? cacheablePromptBlocks[cacheablePromptBlocks.length - 1]
        : null;
    const leadingStableBlocks =
      profileContextBlock && cacheablePromptBlocks.length > 1
        ? cacheablePromptBlocks.slice(0, -1)
        : cacheablePromptBlocks;
    const systemBlocks = toolPolicy
      ? [
          ...leadingStableBlocks,
          {
            key: "tool_policy",
            text: toolPolicy,
            cacheable: true,
          },
          ...(profileContextBlock &&
          profileContextBlock !==
            leadingStableBlocks[leadingStableBlocks.length - 1]
            ? [profileContextBlock]
            : []),
          dynamicSystemBlock,
        ]
      : promptBlocks;

    console.info("[career-chat:prompt-breakdown]", {
      cacheableSystemBlockKeys: systemBlocks
        .filter((block) => block.cacheable)
        .map((block) => block.key),
      label: "career/chat:assistant",
      conversationId,
      historyChars: countMessageContentChars(llmMessages),
      historyMessageCount: llmMessages.length,
      isOnboardingActive,
      profileChars: countPromptChars(structuredProfileText),
      systemBlockChars: countPromptBlockChars(systemBlocks),
      systemBlockCount: systemBlocks.length,
      toolPolicyChars: countPromptChars(toolPolicy),
      toolSchemaChars: countSerializedChars(toolDefinitions),
      userId: user.id,
    });

    // logger.log("\n\n [toolPolicy] : ", toolPolicy);

    // --- Conversation LLM call (natural language, no JSON mode) ---
    const preparedMockInterviewRef: {
      current: PreparedMockInterviewResult | null;
    } = { current: null };
    const preparedCompanySnapshotRef: {
      current: PreparedCompanySnapshotResult | null;
    } = { current: null };
    const assistantText = await runCareerChatAssistant({
      messages: llmMessages,
      tools: toolDefinitions,
      stopAfterToolNames: getStopAfterTalentToolNames("chat"),
      systemBlocks,
      executeTool: async ({ name, input }) => {
        if (name === TALENT_TOOL_NAMES.PREPARE_MOCK_INTERVIEW) {
          const prepared = await prepareMockInterview({
            admin,
            companyName: optionalToolString(input.companyName),
            conversationId,
            roleTitle: optionalToolString(input.roleTitle),
            userId: user.id,
          });
          preparedMockInterviewRef.current = prepared;
          return {
            ok: true,
            result: "mock_interview_setup_ui_created",
            session: prepared.session,
          };
        }

        if (name === TALENT_TOOL_NAMES.PREPARE_COMPANY_SNAPSHOT) {
          const companyName = optionalToolString(input.companyName);
          if (!companyName) {
            throw new Error("prepare_company_snapshot requires companyName.");
          }

          const prepared = await prepareCompanySnapshot({
            admin,
            companyName,
            conversationId,
            reason: optionalToolString(input.reason),
            userId: user.id,
          });
          preparedCompanySnapshotRef.current = prepared;
          return {
            ok: true,
            result: "company_snapshot_setup_ui_created",
            setup: prepared.setup,
          };
        }

        return executeTalentTool({
          context: {
            admin,
            conversationId,
            userId: user.id,
          },
          name,
          input,
        });
      },
    });

    const preparedMockInterview = preparedMockInterviewRef.current;
    if (preparedMockInterview) {
      const preparedAssistantText =
        preparedMockInterview.messages[
          preparedMockInterview.messages.length - 1
        ]?.content ?? "";
      const newKeysCount = await extractTurnInsights(preparedAssistantText);

      return NextResponse.json({
        ok: true,
        assistantMessage:
          preparedMockInterview.messages[
            preparedMockInterview.messages.length - 1
          ],
        assistantMessages: preparedMockInterview.messages,
        mockInterviewSession: preparedMockInterview.session,
        progress: {
          answeredCount: 0,
          completed: false,
          currentStep: coveredCount + newKeysCount,
          targetCount: TALENT_INTERVIEW_FINAL_STEP,
        },
        userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      });
    }

    const preparedCompanySnapshot = preparedCompanySnapshotRef.current;
    if (preparedCompanySnapshot) {
      const preparedAssistantText =
        preparedCompanySnapshot.messages[
          preparedCompanySnapshot.messages.length - 1
        ]?.content ?? "";
      const newKeysCount = await extractTurnInsights(preparedAssistantText);

      return NextResponse.json({
        ok: true,
        assistantMessage:
          preparedCompanySnapshot.messages[
            preparedCompanySnapshot.messages.length - 1
          ],
        assistantMessages: preparedCompanySnapshot.messages,
        progress: {
          answeredCount: userTurnCount,
          completed: false,
          currentStep: coveredCount + newKeysCount,
          targetCount: TALENT_INTERVIEW_FINAL_STEP,
        },
        userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      });
    }

    const assistantTextWithMarkers =
      assistantText.trim() ||
      "좋은 정보 감사합니다. 이어서 가장 우선순위인 조건을 하나만 더 알려주세요.";
    const completion = resolveTalentOnboardingCompletion({
      assistantContent: assistantTextWithMarkers,
    });
    const safeAssistantText =
      stripTalentOnboardingCompletionMarker(assistantTextWithMarkers) ||
      "좋은 정보 감사합니다. 이어서 가장 우선순위인 조건을 하나만 더 알려주세요.";

    // --- Save assistant message ---
    const { data: insertedAssistantMessage, error: assistantError } =
      await admin
        .from("talent_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: safeAssistantText,
          message_type: "chat",
        })
        .select("*")
        .single();

    if (assistantError) {
      return NextResponse.json(
        {
          error: assistantError.message ?? "Failed to insert assistant message",
        },
        { status: 500 }
      );
    }

    const newKeysCount = await extractTurnInsights(safeAssistantText);

    // --- Completion check: explicit LLM onboarding-done marker only. ---
    const insightsCoveredAfter = coveredCount + newKeysCount;
    const isCompleted = completion.completed;

    const now = new Date().toISOString();
    await admin
      .from("talent_conversations")
      .update({
        stage: isCompleted ? "completed" : "chat",
        updated_at: now,
      })
      .eq("id", conversationId)
      .eq("user_id", user.id);

    const completedOpportunityRun =
      isCompleted && completion.reason
        ? await completeOnboardingAndQueueInitialOpportunityRun({
            admin,
            completionReason: completion.reason,
            conversationId,
            source: "career_chat_completion",
            userId: user.id,
          })
        : null;
    if (completedOpportunityRun) {
      startOpportunityDiscoveryInBackground(completedOpportunityRun.id);
    }

    return NextResponse.json({
      ok: true,
      userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      assistantMessage: toResponseMessage(
        insertedAssistantMessage as TalentMessageRow
      ),
      opportunityRun: serializeOpportunityRun(completedOpportunityRun),
      progress: {
        answeredCount: userTurnCount,
        targetCount: TALENT_INTERVIEW_FINAL_STEP,
        completed: isCompleted,
        currentStep: insightsCoveredAfter,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process talent chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
